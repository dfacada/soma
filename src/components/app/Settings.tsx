"use client";

// Settings (docs/HANDOFF.md §6). Every control saves on change; nothing has a Save button.
// Sections still to come with their features: exports and import, rounds, passphrase change.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { isDevIdentity } from "@/lib/catalyst";
import { report } from "@/lib/log";
import { prepareChallenge } from "@/lib/vault-passkey";
import { PALETTES, type ThemeMode } from "@/lib/look";
import { NOTE_MAX, PHRASE_MAX, PHRASES_MAX } from "@/lib/opening";
import { BOWL_VARIANTS, MEAL_PLANS, type BowlId, type MealPlanId } from "@/lib/food-data";
import { planMeals, type Habit, type Settings } from "@/lib/settings";
import { Button, Card, Chip, Field, Input, Pill, Segmented, Switch, Toast } from "@/components/ui";
import { Admin } from "./Admin";
import { useHealth } from "./Health";
import { NudgeCard } from "./Nudge";
import { useJournal } from "./Journal";
import { useSession } from "./Session";
import a from "./app.module.css";

const digits = (v: string, max = 5) => v.replace(/\D/g, "").slice(0, max);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x" + Date.now();
// Defaults from HANDOFF §6: kcal, protein, carbs, fat.
const KCAL_PRESETS = [1800, 2000, 2100, 2200, 2400, 2600];

export function SettingsScreen() {
  const { me, displayName, settings, saveSettings, saveDisplayName, signOut } = useSession();
  const journal = useJournal();
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const say = useCallback((m: string) => { setToast(m); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(null), 1800); }, []);
  const save = useCallback((patch: Partial<Settings>, done?: string) => saveSettings(patch).then(() => { if (done) say(done); }, () => say("Couldn't save that")), [saveSettings, say]);

  const g = settings.goals;
  // Which plan the four targets currently match, if any.
  const active = MEAL_PLANS[settings.mealPlan];
  const t = active.targets;
  const onPlanTargets = t.kcal === g.kcal && t.protein === g.protein && t.carbs === g.carbs && t.fat === g.fat;
  const moodsOn = settings.moods.filter((m) => m.on).length;

  return (
    <div className={a.page}>
      <div className={a.pageHead}><span className={`d ${a.pageTitle}`}>Settings</span></div>

      <Card>
        <span className="eb">Account</span>
        <Field name="Display name">
          <Commit value={displayName} label="Display name" onCommit={(v) => (v.trim() ? saveDisplayName(v).then(() => say("Name saved"), () => say("Couldn't save the name")) : undefined)} />
        </Field>
        <Field name="Email" help={me.profile.role === "admin" ? "Admin" : "Member"}><span className="m muted" style={{ fontSize: 12, wordBreak: "break-all", textAlign: "right" }}>{me.email}</span></Field>
        {!isDevIdentity && <Button variant="secondary" onClick={signOut}>Sign out</Button>}
      </Card>

      <Card>
        <span className="eb">Appearance</span>
        <Field name="Theme" help="System follows your phone or computer, so Soma goes dark when it does.">
          <Segmented label="Theme" value={settings.theme} onChange={(v) => void save({ theme: v as ThemeMode })}
            options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" }]} />
        </Field>
        <span className="eb" style={{ paddingTop: 6 }}>Accent palette</span>
        <div className={a.palettes} role="radiogroup" aria-label="Accent palette">
          {PALETTES.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={settings.palette === p.id} className={`${a.palette} ${settings.palette === p.id ? a.paletteOn : ""}`} onClick={() => void save({ palette: p.id })}>
              <span className={a.paletteDots}>{p.hues.map((h) => <i key={h} style={{ background: h }} />)}</span>
              <span className={a.pickName}><span style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</span><span className="muted" style={{ fontSize: 11 }}>{p.note}</span></span>
            </button>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12 }}>A palette changes the three colours for journal, food and activity. The page, the cards and the type stay as they are.</p>
      </Card>

      <Card>
        <span className="eb">Opening words</span>
        <Field name="Show when Soma opens" help="The first time you open Soma each day, one of these fills the screen before anything else. They take turns. A tap goes on.">
          <Switch checked={settings.opening.on} label="Show opening words" onChange={(v) => void save({ opening: { ...settings.opening, on: v } }, v ? "Opening words on" : "Opening words off")} />
        </Field>
        {settings.opening.phrases.map((p, i) => (
          <div key={p.text + i} className={a.habitRow}>
            <div className={a.habitTop}>
              <span style={{ fontWeight: 500 }}>{p.text}</span>
              <button type="button" className={a.lnk} onClick={() => void save({ opening: { ...settings.opening, phrases: settings.opening.phrases.filter((_, j) => j !== i) } }, "Removed")}>Remove</button>
            </div>
            {p.note && <span className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>{p.note}</span>}
          </div>
        ))}
        {settings.opening.phrases.length < PHRASES_MAX
          ? <PhraseForm onAdd={(text, note) => void save({ opening: { ...settings.opening, phrases: [...settings.opening.phrases, note ? { text, note } : { text }] } }, "Added")} />
          : <p className="muted" style={{ fontSize: 12 }}>Twelve is the limit. Keep the ones that still land.</p>}
      </Card>

      <Card>
        <span className="eb">Check-in · moods</span>
        <div className={a.chips}>
          {settings.moods.map((m) => (
            <Chip key={m.id} kind="habit" label={m.label} on={m.on}
              onClick={() => (m.on && moodsOn <= 1 ? say("Keep at least one mood") : void save({ moods: settings.moods.map((x) => (x.id === m.id ? { ...x, on: !x.on } : x)) }))} />
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12 }}>The moods that are on are the ones offered on Today.</p>
      </Card>

      <Card>
        <span className="eb">Check-in · habits</span>
        {settings.habits.map((h, i) => <HabitRow key={h.id} habit={h} canRemove={settings.habits.length > 1}
          onChange={(next) => void save({ habits: settings.habits.map((x, j) => (j === i ? next : x)) })}
          onRemove={() => void save({ habits: settings.habits.filter((_, j) => j !== i) }, `Removed ${h.label}`)} />)}
        <AddRow placeholder="Add a habit" disabled={settings.habits.length >= 12} note={settings.habits.length >= 12 ? "Twelve is the limit. Keep it focused." : undefined}
          onAdd={(label) => { if (settings.habits.some((h) => h.label.toLowerCase() === label.toLowerCase())) return say("That habit is already there"); void save({ habits: [...settings.habits, { id: slug(label) + "-" + Date.now().toString(36), label, type: "daily" }] }, `Added ${label}`); }} />
      </Card>

      <Card>
        <span className="eb">Food · targets</span>
        <Field name="Meal plan" help={`${active.badge}. Sets the four planned meals; your targets stay as they are.`}>
          <Segmented label="Meal plan" value={settings.mealPlan} onChange={(p) => void save({ mealPlan: p as MealPlanId, plan: planMeals(p as MealPlanId, settings.bowl) }, `${MEAL_PLANS[p as MealPlanId].name} plan`)}
            options={(Object.keys(MEAL_PLANS) as MealPlanId[]).map((id) => ({ value: id, label: MEAL_PLANS[id].name }))} />
        </Field>
        {settings.mealPlan === "standard" && (
          <Field name="Bowl build" help={BOWL_VARIANTS[settings.bowl].desc}>
            <Segmented label="Bowl build" value={settings.bowl} onChange={(v) => void save({ bowl: v as BowlId, plan: planMeals("standard", v as BowlId) }, BOWL_VARIANTS[v as BowlId].name)}
              options={(Object.keys(BOWL_VARIANTS) as BowlId[]).map((id) => ({ value: id, label: BOWL_VARIANTS[id].short }))} />
          </Field>
        )}
        {!onPlanTargets && <div><button type="button" className={a.lnk} style={{ minHeight: 44 }} onClick={() => void save({ goals: { ...g, ...t } }, `Targets set to the ${active.name} plan`)}>Use the {active.name} plan&apos;s targets: {t.kcal.toLocaleString("en-US")} kcal · {t.protein} P · {t.carbs} C · {t.fat} F</button></div>}
        <div className={a.chips}>
          {KCAL_PRESETS.map((n) => (
            <Chip key={n} kind="habit" label={n.toLocaleString("en-US")} on={g.kcal === n}
              onClick={() => { const r = n / (g.kcal || 2100); void save({ goals: { ...g, kcal: n, protein: Math.round(g.protein * r), carbs: Math.round(g.carbs * r), fat: Math.round(g.fat * r) } }, `${n} kcal · macros rescaled`); }} />
          ))}
        </div>
        {(["kcal", "protein", "carbs", "fat"] as const).map((f) => (
          <Field key={f} name={f === "kcal" ? "Calories" : f[0].toUpperCase() + f.slice(1)} help={f === "kcal" ? "kcal a day" : "grams a day"}>
            <Commit numeric value={String(g[f])} label={f} onCommit={(v) => { const n = Number(v); if (n >= 1 && n <= 20000 && n !== g[f]) void save({ goals: { ...g, [f]: n } }); }} />
          </Field>
        ))}
      </Card>

      <Card>
        <span className="eb">Weight</span>
        <Field name="Weight closes the day" help="On: logging your weight is one of the five things that close a day and keep the streak. Off: four things, and the weight card is still there.">
          <Switch checked={settings.requireWeight} label="Weight closes the day" onChange={(v) => void save({ requireWeight: v }, v ? "Weight is required to close the day" : "Weight is optional")} />
        </Field>
      </Card>

      <Card>
        <span className="eb">Food · quick snacks</span>
        <div className={a.chips}>
          {settings.snacks.map((s, i) => <Pill key={s.name + i} label={`${s.name} · ${s.kcal}${s.protein ? ` · ${s.protein}P` : ""}`} onRemove={() => void save({ snacks: settings.snacks.filter((_, j) => j !== i) })} />)}
        </div>
        <SnackForm onAdd={(name, kcal) => void save({ snacks: [...settings.snacks, { name, kcal }] }, `Added ${name}`)} />
        <Field name="Estimate what I type" help="On: type an off-plan item in plain words and Claude fills the calories and macros for you to check. Your plan, recipes, quick snacks and anything you logged before are matched on this device first and never sent. Off: you type the numbers.">
          <Switch checked={settings.foodEstimate} label="Estimate food I type" onChange={(v) => void save({ foodEstimate: v }, v ? "Estimates on" : "Estimates off")} />
        </Field>
      </Card>

      <Card>
        <span className="eb">Activity</span>
        <Field name="Daily push-up target" help="Yours alone. Flat, every day, no ramp.">
          <Commit numeric value={String(settings.pushupTarget)} label="Daily push-up target" onCommit={(v) => { const n = Number(v); if (n >= 1 && n <= 10000 && n !== settings.pushupTarget) void save({ pushupTarget: n }, `Target set to ${n}`); }} />
        </Field>
        <span className="eb" style={{ paddingTop: 6 }}>Activity types</span>
        <div className={a.chips}>
          {settings.activityTypes.map((t, i) => <Pill key={t.key} label={t.name} onRemove={settings.activityTypes.length > 1 ? () => void save({ activityTypes: settings.activityTypes.filter((_, j) => j !== i) }) : undefined} />)}
        </div>
        <AddRow placeholder="Add an activity" disabled={settings.activityTypes.length >= 8}
          onAdd={(name) => { if (settings.activityTypes.some((t) => t.name.toLowerCase() === name.toLowerCase())) return say("That one is already there"); void save({ activityTypes: [...settings.activityTypes, { key: slug(name), name }] }, `Added ${name}`); }} />
      </Card>

      <NudgeCard say={say} />

      <HealthCard steps={g.steps} onSteps={(n) => void save({ goals: { ...g, steps: n } }, `Steps goal set to ${n.toLocaleString("en-US")}`)} />

      <Card>
        <span className="eb">Journal &amp; vault</span>
        <Field name="Vault" help={journal.vault === "open" ? "Open on this device until the tab closes." : journal.vault === "none" ? "Not created yet." : "Locked."}>
          {journal.vault === "open" ? <Button size="sm" variant="secondary" onClick={() => { journal.lock(); say("Vault locked"); }}>Lock</Button> : <Button size="sm" variant="journal" onClick={journal.openVault}>{journal.vault === "none" ? "Create" : "Unlock"}</Button>}
        </Field>
        <PasskeyField say={say} />
        <Field name="Ask when Soma opens" help="On: Soma asks for your passphrase once each time you open it, so your journal, sleep and Fitbit sync are ready. You can always tap Not now.">
          <Switch checked={settings.unlockOnOpen} label="Ask for the vault when Soma opens" onChange={(v) => void save({ unlockOnOpen: v }, v ? "Soma will ask when it opens" : "Soma will not ask on opening")} />
        </Field>
        <Field name="Cloud transcription" help="Off by default. When on, each recording is sent to Groq to be transcribed, then blanked and deleted from the server; the transcript is encrypted into the entry on this device.">
          <Switch checked={settings.cloudTranscription} label="Cloud transcription" onChange={(v) => void save({ cloudTranscription: v }, v ? "Cloud transcription on" : "Cloud transcription off")} />
        </Field>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Entries and audio are encrypted on this device with AES-256-GCM before upload; the key comes from your passphrase and never leaves the browser. Food, activity and check-ins are readable by the server so leaderboards and admin fixes work.</p>
      </Card>

      <Feedback say={say} />

      <p className={a.legal}><Link href="/privacy/">Privacy policy</Link><Link href="/terms/">Terms of service</Link></p>

      {me.profile.role === "admin" && <><div className={a.pageHead} style={{ paddingTop: 12 }}><span className="d" style={{ fontSize: 24 }}>Admin</span></div><Admin say={say} /></>}

      <Toast message={toast} />
    </div>
  );
}

const HEALTH_LINE = {
  loading: "Checking…",
  unconfigured: "Not available yet. David has to finish the Google setup first.",
  off: "Not connected.",
  connected: "Connected. Steps and sleep refresh every half hour while Soma is open and your vault is unlocked.",
  reconnect: "Google has ended the connection. Connect again to keep steps and sleep coming.",
} as const;

/** Fitbit now reports through Google Health. Read-only steps and sleep; the token and the sleep are vault ciphertext. */
function HealthCard({ steps, onSteps }: { steps: number; onSteps: (n: number) => void }) {
  const health = useHealth();
  const s = health.status;
  const linked = s === "connected" || s === "reconnect";
  const when = health.lastSyncMs ? new Date(health.lastSyncMs).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  return (
    <Card>
      <span className="eb">Fitbit · Google Health</span>
      <Field name="Steps and sleep from your tracker" help={HEALTH_LINE[s] + (s === "connected" && when ? ` Last synced ${when}.` : "")}>
        {s === "off" || s === "reconnect"
          ? <Button size="sm" variant="activity" onClick={health.connect}>{s === "off" ? "Connect" : "Reconnect"}</Button>
          : s === "connected" ? <Button size="sm" variant="secondary" disabled={health.syncing} onClick={health.syncNow}>{health.syncing ? "Syncing…" : "Sync now"}</Button> : null}
      </Field>
      {s === "connected" && health.sleepAllowed === false && (
        <Field name="Sleep is not included yet" help="This connection was made without the sleep permission. Reconnect and allow sleep on Google's screen; Insights then compares your days with the night before.">
          <Button size="sm" variant="journal" onClick={health.connect}>Reconnect</Button>
        </Field>
      )}
      <Field name="Steps goal" help="The bar on Activity fills toward this.">
        <Commit numeric value={String(steps)} label="Steps goal" onCommit={(v) => { const n = Number(v); if (n >= 1000 && n <= 40000 && n !== steps) onSteps(n); }} />
      </Field>
      {linked && <div><button type="button" className={a.lnk} style={{ minHeight: 44 }} onClick={() => void health.disconnect()}>Disconnect</button></div>}
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Fitbit moved to Google Health in 2026, so you sign in with the Google account your Fitbit uses. Soma asks to read two things, activity and sleep, and keeps daily step totals and one line per night (time asleep, stages, bed and wake times). There is no sleep score: Google does not share Fitbit’s. Sleep and the connection itself are encrypted with your vault key, so the server cannot read either.</p>
    </Card>
  );
}

/** A text field that saves when you leave it or press Enter, and snaps back if the value is rejected. */
function Commit({ value, label, numeric, onCommit }: { value: string; label: string; numeric?: boolean; onCommit: (v: string) => unknown }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input compact aria-label={label} value={draft ?? value} maxLength={100} inputMode={numeric ? "numeric" : undefined} pattern={numeric ? "[0-9]*" : undefined}
      onChange={(e) => setDraft(numeric ? digits(e.target.value) : e.target.value)}
      onBlur={() => { if (draft !== null && draft !== value) onCommit(draft); setDraft(null); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
}

function HabitRow({ habit, canRemove, onChange, onRemove }: { habit: Habit; canRemove: boolean; onChange: (h: Habit) => void; onRemove: () => void }) {
  const counter = habit.type === "counter";
  return (
    <div className={a.habitRow}>
      <div className={a.habitTop}>
        <span style={{ fontWeight: 500 }}>{habit.label}</span>
        {canRemove && <button type="button" className={a.lnk} onClick={onRemove}>Remove</button>}
      </div>
      <div className={a.habitControls}>
        <Segmented label={`${habit.label} type`} value={habit.type} onChange={(type) => onChange(type === "counter" ? { ...habit, type, dir: habit.dir || "at_least" } : { ...habit, type })}
          options={[{ value: "daily", label: "Daily" }, { value: "counter", label: "Counter" }]} />
        {counter && (
          <>
            <Segmented label={`${habit.label} direction`} value={habit.dir || "at_least"} onChange={(dir) => onChange({ ...habit, dir })} options={[{ value: "at_least", label: "≥" }, { value: "at_most", label: "≤" }]} />
            <Commit numeric value={habit.goal ? String(habit.goal) : ""} label={`${habit.label} goal`} onCommit={(v) => onChange({ ...habit, goal: Number(v) || undefined })} />
          </>
        )}
      </div>
    </div>
  );
}

function AddRow({ placeholder, onAdd, disabled, note }: { placeholder: string; onAdd: (v: string) => void; disabled?: boolean; note?: string }) {
  const [v, setV] = useState("");
  if (disabled) return note ? <p className="muted" style={{ fontSize: 12 }}>{note}</p> : null;
  return (
    <form className={a.extraForm} onSubmit={(e) => { e.preventDefault(); const t = v.trim().slice(0, 40); if (!t) return; onAdd(t); setV(""); }}>
      <Input placeholder={placeholder} aria-label={placeholder} value={v} maxLength={40} onChange={(e) => setV(e.target.value)} />
      <Button type="submit" disabled={!v.trim()}>Add</Button>
    </form>
  );
}

function PhraseForm({ onAdd }: { onAdd: (text: string, note: string) => void }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  return (
    <form className={a.vaultForm} onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; onAdd(text.trim(), note.trim()); setText(""); setNote(""); }}>
      <Input placeholder="A phrase to open with" aria-label="New phrase" value={text} maxLength={PHRASE_MAX} onChange={(e) => setText(e.target.value)} />
      <Input placeholder="Why it matters to you (optional)" aria-label="Note for the phrase" value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} />
      <div><Button type="submit" variant="secondary" disabled={!text.trim()}>Add phrase</Button></div>
    </form>
  );
}

function SnackForm({ onAdd }: { onAdd: (name: string, kcal: number) => void }) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const ok = name.trim() && kcal !== "";
  return (
    <form className={a.extraForm} onSubmit={(e) => { e.preventDefault(); if (!ok) return; onAdd(name.trim().slice(0, 40), Number(kcal)); setName(""); setKcal(""); }}>
      <Input placeholder="Snack" aria-label="Snack name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <Input className={a.kcalInput} placeholder="kcal" aria-label="Snack calories" inputMode="numeric" pattern="[0-9]*" value={kcal} onChange={(e) => setKcal(digits(e.target.value, 4))} />
      <Button type="submit" disabled={!ok}>Add</Button>
    </form>
  );
}

function Feedback({ say }: { say: (m: string) => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try { await api("POST", "/feedback", { body: body.trim() }); setBody(""); say("Sent. Thank you."); }
    catch { say("Couldn't send that"); }
    finally { setBusy(false); }
  }
  return (
    <Card>
      <span className="eb">Feedback</span>
      <form className={a.vaultForm} onSubmit={send}>
        <textarea className={a.note} rows={3} maxLength={4000} value={body} aria-label="Feedback" placeholder="Something broken, confusing or missing? It goes straight to David." onChange={(e) => setBody(e.target.value)} />
        <div><Button type="submit" variant="secondary" disabled={busy || !body.trim()}>{busy ? "Sending…" : "Send feedback"}</Button></div>
      </form>
    </Card>
  );
}

/** Face ID for the vault, on this device: works with any passkey provider (Keeper included). Hidden where the
 *  browser cannot do it. The outcome stays under the row: a toast is gone before Face ID's sheet has slid away. */
function PasskeyField({ say }: { say: (m: string) => void }) {
  const journal = useJournal();
  const { supported, name, here } = journal.passkey;
  const open = journal.vault === "open";
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  // iOS allows the passkey prompt only just after a tap, so the challenge is fetched before it.
  useEffect(() => { if (supported && open && !here) prepareChallenge("register"); }, [supported, open, here]);
  if (!supported || journal.vault === "none") return null;

  const add = async () => { setBusy(true); setNote(await journal.addPasskey()); setBusy(false); };
  const off = async () => {
    setBusy(true); setNote(null);
    try { await journal.removePasskeys(); say(`${name} turned off on this device`); }
    catch (e) { report("vault", "passkeys_remove_failed", e); setNote({ ok: false, message: "Could not turn it off. Try again." }); }
    finally { setBusy(false); }
  };
  const help = here
    ? `On for this device. Each phone or computer is set up on its own. Your passphrase still works everywhere.`
    : open ? `Unlock with ${name} instead of typing your passphrase. Works with Keeper or Apple Passwords. The passphrase still works and is still the only way back.`
      : `Unlock the vault first, then set up ${name}.`;
  return (
    <>
      <Field name={`Unlock with ${name}`} help={help}>
        {here
          ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => void off()}>Turn off</Button>
          : open && <Button size="sm" variant="journal" disabled={busy} onClick={() => void add()}>{busy ? "Setting up…" : "Set up"}</Button>}
      </Field>
      {note && <p role={note.ok ? "status" : "alert"} className={note.ok ? "muted" : a.noteBad} style={{ fontSize: 13, lineHeight: 1.5 }}>{note.message}</p>}
    </>
  );
}
