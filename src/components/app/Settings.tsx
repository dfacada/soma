"use client";

// Settings (docs/HANDOFF.md §6). Every control saves on change; nothing has a Save button.
// Sections still to come with their features: import, rounds.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { isDevIdentity } from "@/lib/catalyst";
import { haptic } from "@/lib/haptics";
import { hm } from "@/lib/sleep";
import { report } from "@/lib/log";
import { prepareChallenge } from "@/lib/vault-passkey";
import { PALETTES, type MotionMode, type ThemeMode } from "@/lib/look";
import { NOTE_MAX, PHRASE_MAX, PHRASES_MAX, type OpeningSource } from "@/lib/opening";
import { mainOf, movesOf } from "@/lib/moves";
import { MOOD_LABEL_MAX, MOODS_MAX, moodId, moodTone, type Mood, type MoodTone } from "@/lib/moods";
import { MoodFace } from "./MoodFace";
import { MovesChooser } from "./MovesChooser";
import { SOMA_PHRASES } from "@/lib/opening-words";
import { BOWL_VARIANTS, MEAL_PLANS, type BowlId, type MealPlanId } from "@/lib/food-data";
import { planMeals, type Habit, type Settings } from "@/lib/settings";
import { Button, ButtonLink, Chip, Field, Icon, Input, Pill, Segmented, Select, Sheet, Switch, Toast, useTabVisible } from "@/components/ui";
import { Admin } from "./Admin";
import { DataSettings } from "./AccountData";
import { useHealth } from "./Health";
import { NudgeSettings } from "./Nudge";
import { useJournal } from "./Journal";
import { ReleaseList } from "./WhatsNew";
import { TelegramCard } from "./Telegram";
import { TomorrowSettings } from "./Tomorrow";
import { CHANGES, releaseDate } from "@/lib/changelog";
import { useSession } from "./Session";
import a from "./app.module.css";

const digits = (v: string, max = 5) => v.replace(/\D/g, "").slice(0, max);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x" + Date.now();
// Defaults from HANDOFF §6: kcal, protein, carbs, fat.
const KCAL_PRESETS = [1800, 2000, 2100, 2200, 2400, 2600];
const THEME_NAME: Record<ThemeMode, string> = { dark: "Night", light: "Light", system: "System" };
/** Sleep goals to choose from: 6 to 10 hours by the half hour. */
const SLEEP_GOALS = [360, 390, 420, 450, 480, 510, 540, 570, 600];
const HEALTH_SHORT = { loading: "Checking…", unconfigured: "Not available yet", off: "Not connected", connected: "Connected", reconnect: "Needs reconnecting" } as const;
/** The sections a link can open as /settings/#id: Activity's Fitbit link, Tomorrow's Open Settings, the return from Google. */
const SECTIONS = ["account", "appearance", "opening", "checkin", "food", "weight", "activity", "nudge", "brief", "fitbit", "journal", "review", "data", "whats-new", "feedback", "admin"];
/** What the Opening words row says it is set to. */
const openingSummary = (source: OpeningSource, mine: number) =>
  source === "soma" || mine === 0 ? "Soma's words" : source === "mine" ? `${mine} of yours` : `Soma's and ${mine} of yours`;
const OPENING_HELP: Record<OpeningSource, string> = {
  soma: `A different line each day from Soma's own ${SOMA_PHRASES.length}. Your own phrases are kept for when you choose Mine or Both.`,
  mine: "Only the phrases you add below, taking turns.",
  both: "Yours and Soma's take turns, a day each.",
};
/** What the Your moves row says: the main move first, then the others. */
function movesSummary(s: Settings) {
  const all = movesOf(s);
  const main = mainOf(s);
  if (!main) return "Not chosen yet";
  const rest = all.filter((x) => x.key !== main.key).map((x) => x.name.toLowerCase());
  return `${main.name} is your main${rest.length ? ` · ${rest.join(", ")}` : ""}`;
}
const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "calm";
/** "20:30" as "8:30 pm". */
const clockOf = (hm: string) => { const [h, m] = hm.split(":").map(Number); return new Date(2000, 0, 1, h || 0, m || 0).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase(); };

export function SettingsScreen() {
  const { me, displayName, settings, saveSettings, saveDisplayName, signOut } = useSession();
  const journal = useJournal();
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const say = useCallback((m: string) => { setToast(m); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(null), 1800); }, []);
  const save = useCallback((patch: Partial<Settings>, done?: string) => saveSettings(patch).then(() => { if (done) say(done); }, () => say("Couldn't save that")), [saveSettings, say]);
  const [editMoods, setEditMoods] = useState(false);

  const g = settings.goals;
  // Which plan the four targets currently match, if any.
  const active = MEAL_PLANS[settings.mealPlan];
  const t = active.targets;
  const onPlanTargets = t.kcal === g.kcal && t.protein === g.protein && t.carbs === g.carbs && t.fat === g.fat;
  const moodsOn = settings.moods.filter((m) => m.on).length;
  const health = useHealth();

  // Settings is a list of groups whose sections open in place, each row saying what it is set to now (David,
  // 2026-11-03: efficient). Several can be open; Settings stays mounted between visits, so they stay as left.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = useCallback((id: string) => { haptic(); setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }, []);
  const sec = (id: string) => ({ id, open: open.has(id), onToggle: toggle });
  // A link to /settings/#id opens that section and brings it into view: on arrival, and whenever the address changes.
  const visible = useTabVisible();
  useEffect(() => {
    if (!visible) return;
    const go = () => {
      const id = window.location.hash.slice(1);
      if (!SECTIONS.includes(id)) return;
      setOpen((s) => (s.has(id) ? s : new Set(s).add(id)));
      window.setTimeout(() => document.getElementById("set-" + id)?.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" }), 80);
    };
    const t = window.setTimeout(go, 0);
    window.addEventListener("hashchange", go);
    return () => { window.clearTimeout(t); window.removeEventListener("hashchange", go); };
  }, [visible]);

  return (
    <div className={a.page}>
      <div className={a.pageHead}><span className={`d ${a.pageTitle}`}>Settings</span></div>

      <Group label="You">
        <Section {...sec("account")} title="Account" summary={`${displayName} · ${me.profile.role === "admin" ? "Admin" : "Member"}`}>
          <Field name="Display name">
            <Commit value={displayName} label="Display name" onCommit={(v) => (v.trim() ? saveDisplayName(v).then(() => say("Name saved"), () => say("Couldn't save the name")) : undefined)} />
          </Field>
          <Field name="Email" help={me.profile.role === "admin" ? "Admin" : "Member"}><span className="m muted" style={{ fontSize: 12, wordBreak: "break-all", textAlign: "right" }}>{me.email}</span></Field>
          {!isDevIdentity && <Button variant="secondary" onClick={signOut}>Sign out</Button>}
        </Section>

        <Section {...sec("appearance")} title="Appearance" summary={`${THEME_NAME[settings.theme]} · ${settings.motion === "calm" ? "Calm" : "Lively"} · ${PALETTES.find((p) => p.id === settings.palette)?.name || "Soma"}`}>
          <Field name="Theme" help="System follows your phone: Night when it is dark, Light when it is not.">
            <Segmented block label="Theme" value={settings.theme} onChange={(v) => void save({ theme: v as ThemeMode })}
              options={[{ value: "dark", label: "Night" }, { value: "light", label: "Light" }, { value: "system", label: "System" }]} />
          </Field>
          <Field name="Motion" help="Calm drops the bounce and anything that keeps moving on its own.">
            <Segmented block label="Motion" value={settings.motion} onChange={(v) => void save({ motion: v as MotionMode })}
              options={[{ value: "lively", label: "Lively" }, { value: "calm", label: "Calm" }]} />
          </Field>
          <span className="eb" style={{ paddingTop: 6 }}>Accent palette</span>
          <div className={a.palettes} role="radiogroup" aria-label="Accent palette">
            {PALETTES.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={settings.palette === p.id} className={`${a.palette} ${settings.palette === p.id ? a.paletteOn : ""}`} onClick={() => void save({ palette: p.id })}>
                <span className={a.paletteDots}>{p.hues.map((h, i) => <i key={h} style={{ "--dot": h, "--dot-night": "night" in p ? p.night[i] : undefined } as CSSProperties} />)}</span>
                <span className={a.pickName}><span style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</span><span className="muted" style={{ fontSize: 12 }}>{p.note}</span></span>
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>A palette changes the three colours for journal, food and activity. The page, the cards and the type stay as they are.</p>
        </Section>

        <Section {...sec("opening")} title="Opening words" summary={settings.opening.on ? `On · ${openingSummary(settings.opening.source, settings.opening.phrases.length)}` : "Off"}>
          <Field name="Show when Soma opens" help="The first time you open Soma each day, one line fills the screen before anything else, a different one each day. A tap goes on.">
            <Switch checked={settings.opening.on} label="Show opening words" onChange={(v) => void save({ opening: { ...settings.opening, on: v } }, v ? "Opening words on" : "Opening words off")} />
          </Field>
          <Field name="Words from" help={OPENING_HELP[settings.opening.source]}>
            <Segmented label="Where the opening words come from" value={settings.opening.source}
              onChange={(v) => void save({ opening: { ...settings.opening, source: v as OpeningSource } }, v === "soma" ? "Soma's words" : v === "mine" ? "Only your phrases" : "Yours and Soma's, taking turns")}
              options={[{ value: "soma", label: "Soma's" }, { value: "mine", label: "Mine" }, { value: "both", label: "Both" }]} />
          </Field>
          {settings.opening.source !== "soma" && <span className="eb" style={{ paddingTop: 6 }}>Your phrases</span>}
          {settings.opening.source !== "soma" && settings.opening.phrases.length === 0 && (
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>None yet. Add one below{settings.opening.source === "mine" ? "; until then Soma's own words show." : "."}</p>
          )}
          {settings.opening.source !== "soma" && settings.opening.phrases.map((p, i) => (
            <div key={p.text + i} className={a.habitRow}>
              <div className={a.habitTop}>
                <span style={{ fontWeight: 500 }}>{p.text}</span>
                <button type="button" className={a.lnk} onClick={() => void save({ opening: { ...settings.opening, phrases: settings.opening.phrases.filter((_, j) => j !== i) } }, "Removed")}>Remove</button>
              </div>
              {p.note && <span className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>{p.note}</span>}
            </div>
          ))}
          {settings.opening.source !== "soma" && (settings.opening.phrases.length < PHRASES_MAX
            ? <PhraseForm onAdd={(text, note) => void save({ opening: { ...settings.opening, phrases: [...settings.opening.phrases, note ? { text, note } : { text }] } }, "Added")} />
            : <p className="muted" style={{ fontSize: 12 }}>Twelve is the limit. Keep the ones that still land.</p>)}
        </Section>
      </Group>

      <Group label="Your day">
        <Section {...sec("checkin")} title="Check-in" summary={`${moodsOn} ${moodsOn === 1 ? "mood" : "moods"} · ${settings.habits.length} ${settings.habits.length === 1 ? "habit" : "habits"}`}>
          <span className="eb">Moods</span>
          <div className={a.chips}>
            {settings.moods.map((m) => (
              <Chip key={m.id} kind="habit" label={m.label} on={m.on}
                onClick={() => (m.on && moodsOn <= 1 ? say("Keep at least one mood") : void save({ moods: settings.moods.map((x) => (x.id === m.id ? { ...x, on: !x.on } : x)) }))} />
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>The moods that are on are the ones offered on Today.</p>
          <button type="button" className={a.lnk} style={{ alignSelf: "flex-start", minHeight: 44 }} aria-expanded={editMoods} onClick={() => setEditMoods(!editMoods)}>
            {editMoods ? "Done changing moods" : "Rename, remove or add moods"}
          </button>
          {editMoods && <>
            {/* A mood's words are what a check-in keeps, so a rename only changes what is offered from now on. Good,
                okay or hard is how Insights reads a day: renamed moods and moods of your own count the way you say. */}
            {settings.moods.map((m, i) => (
              <MoodRow key={m.id} mood={m} canRemove={settings.moods.length > 1 && !(m.on && moodsOn <= 1)}
                taken={(label) => settings.moods.some((x, j) => j !== i && x.label.toLowerCase() === label.toLowerCase())}
                onChange={(next) => void save({ moods: settings.moods.map((x, j) => (j === i ? next : x)) })}
                onRemove={() => void save({ moods: settings.moods.filter((_, j) => j !== i) }, `Removed ${m.label}`)} say={say} />
            ))}
            <AddRow placeholder="Add a mood" max={MOOD_LABEL_MAX} disabled={settings.moods.length >= MOODS_MAX} note={`${MOODS_MAX} is the limit. Take one out to add another.`}
              onAdd={(label) => {
                if (settings.moods.some((x) => x.label.toLowerCase() === label.toLowerCase())) return say("That mood is already there");
                void save({ moods: [...settings.moods, { id: moodId(label, settings.moods.map((x) => x.id)), label, on: true }] }, `Added ${label}`);
              }} />
          </>}
          <span className="eb" style={{ paddingTop: 6 }}>Habits</span>
          {settings.habits.map((h, i) => <HabitRow key={h.id} habit={h} canRemove={settings.habits.length > 1}
            onChange={(next) => void save({ habits: settings.habits.map((x, j) => (j === i ? next : x)) })}
            onRemove={() => void save({ habits: settings.habits.filter((_, j) => j !== i) }, `Removed ${h.label}`)} />)}
          <AddRow placeholder="Add a habit" disabled={settings.habits.length >= 12} note={settings.habits.length >= 12 ? "Twelve is the limit. Keep it focused." : undefined}
            onAdd={(label) => { if (settings.habits.some((h) => h.label.toLowerCase() === label.toLowerCase())) return say("That habit is already there"); void save({ habits: [...settings.habits, { id: slug(label) + "-" + Date.now().toString(36), label, type: "daily" }] }, `Added ${label}`); }} />
        </Section>

        <Section {...sec("food")} title="Food" summary={`${active.name} plan · ${g.kcal.toLocaleString("en-US")} kcal · ${g.protein} g protein`}>
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
          <span className="eb" style={{ paddingTop: 6 }}>Quick snacks</span>
          <div className={a.chips}>
            {settings.snacks.map((s, i) => <Pill key={s.name + i} label={`${s.name} · ${s.kcal}${s.protein ? ` · ${s.protein}P` : ""}`} onRemove={() => void save({ snacks: settings.snacks.filter((_, j) => j !== i) })} />)}
          </div>
          <SnackForm onAdd={(name, kcal) => void save({ snacks: [...settings.snacks, { name, kcal }] }, `Added ${name}`)} />
          <Field name="Estimate what I type" help="On: type an off-plan item in plain words and Claude fills the calories and macros for you to check. Your plan, recipes, quick snacks and anything you logged before are matched on this device first and never sent. Off: you type the numbers.">
            <Switch checked={settings.foodEstimate} label="Estimate food I type" onChange={(v) => void save({ foodEstimate: v }, v ? "Estimates on" : "Estimates off")} />
          </Field>
        </Section>

        <Section {...sec("weight")} title="Weight" summary={settings.requireWeight ? "One of the things that close the day" : "Optional"}>
          <Field name="Weight closes the day" help="On: logging your weight is one of the five things that close a day and keep the streak. Off: four things, and the weight card is still there.">
            <Switch checked={settings.requireWeight} label="Weight closes the day" onChange={(v) => void save({ requireWeight: v }, v ? "Weight is required to close the day" : "Weight is optional")} />
          </Field>
        </Section>

        <Section {...sec("activity")} title="Your moves" summary={movesSummary(settings)}>
          <MovesChooser say={say} />
        </Section>
      </Group>

      <Group label="Reminders">
        <Section {...sec("nudge")} title="Evening nudge" summary={settings.nudge.on ? `On at ${clockOf(settings.nudge.time)}` : "Off"}>
          <NudgeSettings say={say} />
        </Section>
        <Section {...sec("brief")} title="Tomorrow's brief" summary={`${settings.brief.on ? `Ready at ${clockOf(settings.brief.time)}` : "On Today from 6 pm"}${settings.brief.telegram ? " · Telegram" : ""}`}>
          <TomorrowSettings say={say} />
        </Section>
      </Group>

      <Group label="Connections and privacy">
        <Section {...sec("fitbit")} title="Fitbit · Google Health" summary={`${HEALTH_SHORT[health.status]} · ${g.steps.toLocaleString("en-US")} steps · ${hm(settings.sleepGoal)} sleep`}>
          <HealthSettings steps={g.steps} onSteps={(n) => void save({ goals: { ...g, steps: n } }, `Steps goal set to ${n.toLocaleString("en-US")}`)}
            sleep={settings.sleepGoal} onSleep={(n) => void save({ sleepGoal: n }, `Sleep goal set to ${hm(n)}`)} />
        </Section>
        <Section {...sec("journal")} title="Journal and vault" summary={`${journal.vault === "open" ? "Unlocked" : journal.vault === "none" ? "No vault yet" : "Locked"} · Insights ${settings.journalInsights === "claude" ? "with Claude" : "on this phone"}`}>
          <Field name="Vault" help={journal.vault === "open" ? "Open on this device until the tab closes." : journal.vault === "none" ? "Not created yet." : "Locked."}>
            {journal.vault === "open" ? <Button size="sm" variant="secondary" onClick={() => { journal.lock(); say("Vault locked"); }}>Lock</Button> : <Button size="sm" variant="journal" onClick={journal.openVault}>{journal.vault === "none" ? "Create" : "Unlock"}</Button>}
          </Field>
          <PasskeyField say={say} />
          {journal.vault !== "none" && journal.vault !== "checking" && (
            <Field name="Recovery code"
              help={journal.recovery.made
                ? `Made ${journal.recovery.madeMs ? new Date(journal.recovery.madeMs).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "earlier"}. If you forget your passphrase, it opens your journal and lets you choose a new one. Making a new code replaces this one.`
                : "Not made yet. Without one, nobody can open your journal if you forget your passphrase, David included."}>
              <Button size="sm" variant={journal.recovery.made ? "secondary" : "journal"} onClick={() => { haptic(); if (journal.vault !== "open") journal.openVault(); else void journal.makeRecoveryCode(); }}>
                {journal.vault !== "open" ? "Unlock" : journal.recovery.made ? "New code" : "Make one"}
              </Button>
            </Field>
          )}
          <Field name="Ask when Soma opens" help="On: Soma asks for your passphrase once each time you open it, so your journal, sleep and Fitbit sync are ready. You can always tap Not now.">
            <Switch checked={settings.unlockOnOpen} label="Ask for the vault when Soma opens" onChange={(v) => void save({ unlockOnOpen: v }, v ? "Soma will ask when it opens" : "Soma will not ask on opening")} />
          </Field>
          <Field name="Cloud transcription" help="Off by default. When on, each recording is sent to Groq to be transcribed, then blanked and deleted from the server; the transcript is encrypted into the entry on this device.">
            <Switch checked={settings.cloudTranscription} label="Cloud transcription" onChange={(v) => void save({ cloudTranscription: v }, v ? "Cloud transcription on" : "Cloud transcription off")} />
          </Field>
          <Field name="Read my journal for Insights"
            help={settings.journalInsights === "claude"
              ? "With Claude: before anything leaves this phone, names, places, emails, phone numbers, addresses and links are taken out, and the days go out shuffled with no dates. Soma sends them under its own key with nothing about your account; only a tone and a few general themes come back, kept encrypted on this phone. Nothing is stored on the server. Taking names out is careful but not perfect."
              : "On this phone: a word list reads the tone of each day's entries. Nothing leaves your phone. With Claude reads tone and themes far better, with names and details taken out first."}>
            <Segmented label="Read my journal for Insights" value={settings.journalInsights}
              onChange={(v) => void save({ journalInsights: v as "phone" | "claude" }, v === "claude" ? "Insights will ask Claude, without your name" : "Insights reads your journal on this phone")}
              options={[{ value: "phone", label: "On this phone" }, { value: "claude", label: "With Claude" }]} />
          </Field>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Entries and audio are encrypted on this device with AES-256-GCM before upload; the key comes from your passphrase and never leaves the browser. Food, activity and check-ins are readable by the server so leaderboards and admin fixes work.</p>
        </Section>
        <Section {...sec("review")} title="Week in review" summary={settings.weeklyReview.on ? `${WEEKDAY_NAMES[settings.weeklyReview.dayOfWeek]}s at ${clockOf(settings.weeklyReview.time)}${settings.weeklyReview.telegram ? " · Telegram" : ""}` : "Off"}>
          <ReviewSettings say={say} />
        </Section>
        <Section {...sec("data")} title="Your data" summary="Download all of it, or delete your account">
          <DataSettings say={say} />
        </Section>
      </Group>

      <Group label="Soma">
        <Section {...sec("whats-new")} title="What's new" summary={`${CHANGES[0].title} · ${releaseDate(CHANGES[0].date)}`}>
          <ChangesSettings />
        </Section>
        <Section {...sec("feedback")} title="Feedback" summary="Something broken or missing? Tell David.">
          <Feedback say={say} />
        </Section>
        {me.profile.role === "admin" && <Section {...sec("admin")} title="Admin" summary="Approvals, users, the log and feedback" />}
      </Group>
      {me.profile.role === "admin" && open.has("admin") && <Admin say={say} />}

      {/* The legal links close the page, for everyone. */}
      <p className={a.legal}><Link href="/privacy/">Privacy policy</Link><Link href="/terms/">Terms of service</Link></p>

      <Toast message={toast} />
    </div>
  );
}

/** A labelled group of sections in one card, like a phone's own settings. */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={a.group} aria-label={label}>
      <span className="eb">{label}</span>
      <div className={a.groupCard}>{children}</div>
    </section>
  );
}

/** One setting's row: its name and what it is set to now; a tap opens the controls under it (several can be open).
 *  Its element id is "set-" + id, so the address can open it as /settings/#id. */
function Section({ id, title, summary, open, onToggle, children }: { id: string; title: string; summary: ReactNode; open: boolean; onToggle: (id: string) => void; children?: ReactNode }) {
  return (
    <div id={"set-" + id} className={`${a.sect} ${open ? a.sectOpen : ""}`}>
      <button type="button" className={a.sectHead} aria-expanded={open} aria-controls={open && children ? `set-${id}-body` : undefined} onClick={() => onToggle(id)}>
        <span className={a.sectText}><span className={a.sectTitle}>{title}</span><span className={a.sectSum}>{summary}</span></span>
        <span className={a.sectChev} aria-hidden><Icon name="chevron" size={14} /></span>
      </button>
      {open && children && <div id={`set-${id}-body`} className={a.sectBody}>{children}</div>}
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
function HealthSettings({ steps, onSteps, sleep, onSleep }: { steps: number; onSteps: (n: number) => void; sleep: number; onSleep: (n: number) => void }) {
  const health = useHealth();
  const s = health.status;
  const linked = s === "connected" || s === "reconnect";
  const when = health.lastSyncMs ? new Date(health.lastSyncMs).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  return (
    <>
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
      <Field name="Steps goal" help="The steps pills on Today and Activity fill toward this.">
        <Commit numeric value={String(steps)} label="Steps goal" onCommit={(v) => { const n = Number(v); if (n >= 1000 && n <= 40000 && n !== steps) onSteps(n); }} />
      </Field>
      <Field name="Sleep goal" help="Last night's pill on Today fills toward this, and the week counts the nights that reached it.">
        <Select aria-label="Sleep goal" value={String(sleep)} onChange={(e) => onSleep(Number(e.target.value))}>
          {SLEEP_GOALS.includes(sleep) ? null : <option value={sleep}>{hm(sleep)}</option>}
          {SLEEP_GOALS.map((n) => <option key={n} value={n}>{hm(n)}</option>)}
        </Select>
      </Field>
      {linked && <div><button type="button" className={a.lnk} style={{ minHeight: 44 }} onClick={() => void health.disconnect()}>Disconnect</button></div>}
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Fitbit moved to Google Health in 2026, so you sign in with the Google account your Fitbit uses. Soma asks to read two things, activity and sleep, and keeps daily step totals and one line per night (time asleep, stages, bed and wake times). There is no sleep score: Google does not share Fitbit’s. Sleep and the connection itself are encrypted with your vault key, so the server cannot read either.</p>
    </>
  );
}

/** A text field that saves when you leave it or press Enter, and snaps back if the value is rejected. */
function Commit({ value, label, numeric, max = 100, onCommit }: { value: string; label: string; numeric?: boolean; max?: number; onCommit: (v: string) => unknown }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input compact aria-label={label} value={draft ?? value} maxLength={max} inputMode={numeric ? "numeric" : undefined} pattern={numeric ? "[0-9]*" : undefined}
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

/** One mood to rename, mark good, okay or hard, or take out. The face is the one the check-in shows. */
function MoodRow({ mood, canRemove, taken, onChange, onRemove, say }: {
  mood: Mood; canRemove: boolean; taken: (label: string) => boolean; onChange: (m: Mood) => void; onRemove: () => void; say: (m: string) => void;
}) {
  return (
    <div className={a.habitRow}>
      <div className={a.habitTop}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <span className="muted" style={{ display: "inline-flex" }}><MoodFace id={mood.id} size={26} /></span>
          <Commit value={mood.label} label={`Rename ${mood.label}`} max={MOOD_LABEL_MAX} onCommit={(v) => {
            const t = String(v).trim().slice(0, MOOD_LABEL_MAX);
            if (!t || t === mood.label) return;
            if (taken(t)) return say("That mood is already there");
            onChange({ ...mood, label: t });
          }} />
        </span>
        {canRemove && <button type="button" className={a.lnk} style={{ minHeight: 44 }} onClick={onRemove}>Remove</button>}
      </div>
      <div className={a.habitControls}>
        <Segmented label={`What a day of ${mood.label} is`} value={moodTone(mood)} onChange={(tone) => onChange({ ...mood, tone: tone as MoodTone })}
          options={[{ value: "good", label: "Good day" }, { value: "okay", label: "Okay" }, { value: "hard", label: "Hard day" }]} />
      </div>
    </div>
  );
}

function AddRow({ placeholder, onAdd, disabled, note, max = 40 }: { placeholder: string; onAdd: (v: string) => void; disabled?: boolean; note?: string; max?: number }) {
  const [v, setV] = useState("");
  if (disabled) return note ? <p className="muted" style={{ fontSize: 12 }}>{note}</p> : null;
  return (
    <form className={a.extraForm} onSubmit={(e) => { e.preventDefault(); const t = v.trim().slice(0, max); if (!t) return; onAdd(t); setV(""); }}>
      <Input placeholder={placeholder} aria-label={placeholder} value={v} maxLength={max} onChange={(e) => setV(e.target.value)} />
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
    <>
      <form className={a.vaultForm} onSubmit={send}>
        <textarea className={a.note} rows={3} maxLength={4000} value={body} aria-label="Feedback" placeholder="Something broken, confusing or missing? It goes straight to David." onChange={(e) => setBody(e.target.value)} />
        <div><Button type="submit" variant="secondary" disabled={busy || !body.trim()}>{busy ? "Sending…" : "Send feedback"}</Button></div>
      </form>
    </>
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

/** Every change ever made to Soma, newest first (src/lib/changelog.ts). What's new shows the unseen ones on opening. */
function ChangesSettings() {
  const [open, setOpen] = useState(false);
  // The latest release's title and date are on the row above; this field is named for what its button opens.
  return (
    <>
      <Field name="Every change" help={`${CHANGES.length} ${CHANGES.length === 1 ? "update" : "updates"} so far, newest first.`}>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>See all changes</Button>
      </Field>
      <Field name="Soma on your Home Screen" help="An icon, full screen, and the evening reminder. The steps for your phone, and a link you can send to someone else.">
        {/* The same small secondary pill as See all changes, so the two fields end alike. Still a link to the page. */}
        <ButtonLink href="/install/" variant="secondary" size="sm">How to install</ButtonLink>
      </Field>
      <Sheet open={open} title="Every change" onClose={() => setOpen(false)}>
        <ReleaseList releases={CHANGES} />
      </Sheet>
    </>
  );
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The week in review: when it arrives, and the consent it needs. Telegram sits inside it, since that is what it is for. */
function ReviewSettings({ say }: { say: (m: string) => void }) {
  const { settings, saveSettings } = useSession();
  const r = settings.weeklyReview;
  const set = (patch: Partial<typeof r>, done?: string) =>
    saveSettings({ weeklyReview: { ...r, ...patch } }).then(() => { if (done) say(done); }, () => say("Couldn't save that"));

  return (
    <>
      <Field name="Write one each week" help="Once a week Soma reads back what your journal said: a synopsis, the things worth remembering, and what came up more than once.">
        <Switch checked={r.on} label="Write a weekly review" onChange={(v) => void set({ on: v }, v ? "Weekly review on" : "Weekly review off")} />
      </Field>
      {r.on && <>
        <Field name="When" help="The week runs Monday to Sunday. Picking Sunday evening covers the week ending that evening; Monday covers the one that ended the night before.">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Select aria-label="Day" value={String(r.dayOfWeek)} onChange={(e) => void set({ dayOfWeek: Number(e.target.value) }, "Day saved")}>
              {WEEKDAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Select>
            <Input type="time" aria-label="Time" value={r.time} style={{ width: 120 }} onChange={(e) => void set({ time: e.target.value }, "Time saved")} />
          </div>
        </Field>
        <Field name="Read my journal to write it" help="Off, nothing happens: this is the one feature where journal text leaves your phone. On, Soma decrypts that week's entries here and sends the text through its own server to Claude, which writes the review. Neither Soma nor Claude keeps it; what comes back is encrypted again before it is stored.">
          <Switch checked={r.consent} label="Let Claude read that week's entries" onChange={(v) => void set({ consent: v }, v ? "Thank you. Reviews will be written." : "Off. No journal text will be sent.")} />
        </Field>
        <Field name="Send it to Telegram" help="The whole review as a message when it is written. Telegram keeps whatever is sent to it, so this is a copy of your journal's summary outside Soma.">
          <Switch checked={r.telegram} label="Send the review to Telegram" onChange={(v) => void set({ telegram: v }, v ? "It will be sent to Telegram" : "It will stay in the app")} />
        </Field>
        {r.telegram && (
          <Field name="With the audio" help="Also send the spoken version as an audio file.">
            <Switch checked={r.speak} label="Send the audio too" onChange={(v) => void set({ speak: v })} />
          </Field>
        )}
      </>}
      <TelegramCard say={say} />
    </>
  );
}
