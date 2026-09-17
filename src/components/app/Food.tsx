"use client";

// Food: today's calories and macros, the four planned meals, anything off-plan, and weight.
// Follows the prototype's viewFood. Two deliberate differences: carbs and fat are real sums (the prototype
// faked them from calories), and off-plan items are entered by hand until the Claude estimator has a key.

import { useCallback, useEffect, useState } from "react";
import { api, type Extra } from "@/lib/api";
import { MEALS, STARTER_RECIPES, type Meal, type PlannedMeal } from "@/lib/settings";
import { addDays, cap, dayKey, dayStatus } from "@/lib/today";
import { Bar, Button, Card, Chip, Input, ProgressRing, Row, Sheet, Toast } from "@/components/ui";
import { useDays } from "./Days";
import { useSession } from "./Session";
import a from "./app.module.css";

const fmt = (n: number) => n.toLocaleString("en-US");
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const digits = (v: string, max = 5) => v.replace(/\D/g, "").slice(0, max);

export function Food() {
  const { settings, saveSettings } = useSession();
  const { map, error, reload, unsaved, retry, change, today, todayKey: k } = useDays();
  const [swap, setSwap] = useState<Meal | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 1800); }, []);
  const closeSwap = useCallback(() => setSwap(null), []);

  if (error) return <div className={a.page}><span className="d" style={{ fontSize: 28 }}>Couldn&apos;t load food</span><p className="muted">{error}</p><div><Button onClick={reload}>Try again</Button></div></div>;
  if (!map) return <div className={a.page}><span className="eb">Loading</span></div>;

  const st = dayStatus(map[k], settings);
  const eaten = map[k]?.log?.meals || {};
  const extras = map[k]?.log?.extras || [];
  const g = settings.goals;

  const addExtra = (x: Extra) => { change("day-logs", k, (d) => { d.log.extras = [...d.log.extras, x]; }); say(`Added · ${x.kcal} kcal`); };

  async function pick(meal: Meal, recipe: PlannedMeal) {
    setSwap(null);
    try {
      await saveSettings({ plan: { ...settings.plan, [meal]: recipe } });
      // If that meal was already eaten today, what was eaten does not change: the snapshot stays.
      say(`Planned: ${recipe.name}`);
    } catch { say("Couldn't save the plan"); }
  }

  return (
    <div className={a.page}>
      <div className={a.pageHead}>
        <div>
          <div className="eb">{WEEKDAY[today.getDay()]} · {MONTH[today.getMonth()]} {today.getDate()}</div>
          <div className={`d ${a.pageTitle}`}>Food</div>
        </div>
      </div>

      {unsaved && <div className={a.unsaved} role="alert"><span>Some changes are not saved yet.</span><Button size="sm" variant="secondary" onClick={retry}>Retry</Button></div>}

      <Card className={a.summary}>
        <div className={a.summaryRing}>
          <div className={a.ringWrap96}>
            <ProgressRing label="Calories" value={st.kcal} max={g.kcal} color="var(--food)" />
            <div className={a.ringLabel}><span className="d" style={{ fontSize: st.kcal >= 1000 ? 20 : 24 }}>{fmt(st.kcal)}</span></div>
          </div>
          <span className="m muted" style={{ fontSize: 10.5 }}>of {fmt(g.kcal)} kcal</span>
        </div>
        <div className={a.summaryBars}>
          <Bar label="Protein" value={st.protein} max={g.protein} domain="food" />
          <Bar label="Carbs" value={st.carbs} max={g.carbs} color="var(--food-bar)" />
          <Bar label="Fat" value={st.fat} max={g.fat} color="var(--food-bar)" />
        </div>
      </Card>

      {MEALS.map((m) => {
        const slot = eaten[m];
        const done = Boolean(slot);
        // Show what was actually eaten if it differs from today's plan.
        const shown: PlannedMeal = typeof slot === "object" ? slot : settings.plan[m];
        return (
          <Card key={m}>
            <div className={a.entryHead}>
              <span className="eb" style={{ color: "var(--ink)" }}>{cap(m)}</span>
              <span className="m" style={{ fontSize: 12, color: done ? "var(--food)" : "var(--muted)" }}>{shown.kcal} kcal · {done ? "eaten" : "planned"}</span>
            </div>
            <Row name={shown.name} sub={`${shown.protein} g protein`} value={<span style={{ color: done ? "var(--ink)" : "var(--muted)" }}>{shown.kcal}</span>} />
            <div className={a.rowButtons}>
              <Button size="sm" variant={done ? "secondary" : "food"} onClick={() => change("day-logs", k, (d) => { d.log.meals[m] = d.log.meals[m] ? false : { ...settings.plan[m] }; })}>{done ? "Undo" : "Mark eaten"}</Button>
              {!done && <Button size="sm" variant="secondary" onClick={() => setSwap(m)}>Swap meal</Button>}
            </div>
          </Card>
        );
      })}

      <Card>
        <div className={a.entryHead}>
          <span className="eb" style={{ color: "var(--ink)" }}>Something else</span>
          <span className="m muted" style={{ fontSize: 12 }}>{extras.length ? `${extras.reduce((n, x) => n + x.kcal, 0)} kcal` : "off-plan items"}</span>
        </div>
        {extras.map((x, i) => (
          <Row key={i} name={x.name} sub={x.protein ? `${x.protein} g protein` : undefined} value={x.kcal}
            trail={<button type="button" className={a.lnk} onClick={() => change("day-logs", k, (d) => { d.log.extras = d.log.extras.filter((_, j) => j !== i); })}>Remove</button>} />
        ))}
        {settings.snacks.length > 0 && (
          <div className={a.chips}>
            {settings.snacks.map((s) => <Chip key={s.name} kind="habit" label={s.name} onClick={() => addExtra({ name: s.name, kcal: s.kcal, protein: s.protein })} />)}
          </div>
        )}
        <ExtraForm onAdd={addExtra} />
      </Card>

      <Weight days={Array.from({ length: 30 }, (_, i) => dayKey(addDays(today, i - 29))).map((d) => map[d]?.weight)} current={map[k]?.weight}
        onLog={(v) => { change("weight", k, (d) => { d.weight.value = v; }); say("Weight logged"); }} />

      <Sheet open={swap !== null} title={swap ? `Swap ${swap}` : ""} onClose={closeSwap}>
        {swap && <RecipePicker current={settings.plan[swap].name} onPick={(r) => void pick(swap, r)} />}
      </Sheet>
      <Toast message={toast} />
    </div>
  );
}

function ExtraForm({ onAdd }: { onAdd: (x: Extra) => void }) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const ok = name.trim() && kcal !== "";
  return (
    <form className={a.extraForm} onSubmit={(e) => { e.preventDefault(); if (!ok) return; onAdd({ name: name.trim().slice(0, 80), kcal: Number(kcal) }); setName(""); setKcal(""); }}>
      <Input placeholder="What did you eat?" aria-label="What did you eat" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      <Input className={a.kcalInput} placeholder="kcal" aria-label="Calories" inputMode="numeric" pattern="[0-9]*" value={kcal} onChange={(e) => setKcal(digits(e.target.value, 4))} />
      <Button type="submit" disabled={!ok}>Add</Button>
    </form>
  );
}

function Weight({ days, current, onLog }: { days: (number | undefined)[]; current: number | undefined; onLog: (v: number) => void }) {
  const [value, setValue] = useState("");
  const logged = days.filter((v): v is number => v !== undefined);
  const min = Math.min(...logged), max = Math.max(...logged), span = Math.max(1, max - min);
  const points = days.map((v, i) => (v === undefined ? null : `${((i / 29) * 326).toFixed(1)},${(48 - ((v - min) / span) * 40).toFixed(1)}`)).filter(Boolean).join(" ");
  const first = logged[0];
  const n = parseFloat(value);
  const valid = Number.isFinite(n) && n >= 1 && n <= 2000;

  return (
    <Card>
      <div className={a.entryHead}>
        <span className="eb" style={{ color: "var(--ink)" }}>Weight · 30 days</span>
        <span className="m" style={{ fontSize: 13 }}>
          {current !== undefined
            ? <><span style={{ fontWeight: 500 }}>{current} lb</span>{first !== undefined && logged.length > 1 && <span className="muted"> · {current - first <= 0 ? "↓" : "↑"}{Math.abs(current - first).toFixed(1)}</span>}</>
            : <span className="muted">not logged today</span>}
        </span>
      </div>
      {logged.length > 1 ? (
        <svg viewBox="0 0 326 56" style={{ width: "100%", height: 56 }} role="img" aria-label={`Weight over 30 days, from ${first} to ${logged[logged.length - 1]} pounds`}>
          <path d="M0 48 L326 48" stroke="var(--surface-2)" /><path d="M0 8 L326 8" stroke="var(--surface-2)" />
          <polyline fill="none" stroke="var(--food)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={points} />
        </svg>
      ) : <p className="muted" style={{ fontSize: 13 }}>Log a couple of days and the trend shows up here.</p>}
      <form className={a.extraForm} onSubmit={(e) => { e.preventDefault(); if (!valid) return; onLog(Math.round(n * 10) / 10); setValue(""); }}>
        <Input placeholder={current !== undefined ? String(current) : "182.0"} aria-label="Weight in pounds" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} />
        <Button type="submit" disabled={!valid}>Log weight</Button>
      </form>
    </Card>
  );
}

type Saved = { id: string; recipe: PlannedMeal };

/** The user's own recipes first, then the starter book. New recipes are saved to /recipes. */
function RecipePicker({ current, onPick }: { current: string; onPick: (r: PlannedMeal) => void }) {
  const [mine, setMine] = useState<Saved[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
  const [busy, setBusy] = useState(false);

  // Loaded when the sheet opens: this component only mounts then.
  useEffect(() => {
    let alive = true;
    void api<{ recipes: Saved[] }>("GET", "/recipes").then(
      (r) => { if (alive) setMine(r.recipes.filter((x) => x.recipe?.name)); },
      () => { if (alive) setMine([]); },
    );
    return () => { alive = false; };
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || form.kcal === "") return;
    setBusy(true);
    const recipe: PlannedMeal = { name: form.name.trim().slice(0, 80), kcal: Number(form.kcal), protein: Number(form.protein) || 0, carbs: Number(form.carbs) || 0, fat: Number(form.fat) || 0 };
    try { await api("POST", "/recipes", { recipe }); onPick(recipe); }
    catch { setBusy(false); }
  }

  const list: PlannedMeal[] = [...(mine || []).map((m) => m.recipe), ...STARTER_RECIPES.filter((s) => !(mine || []).some((m) => m.recipe.name === s.name))];

  return (
    <>
      <div className={a.pickList}>
        {list.map((r) => (
          <button key={r.name} type="button" className={a.pickRow} onClick={() => onPick(r)}>
            <span className={a.pickName}><span style={{ fontWeight: 500, color: r.name === current ? "var(--food)" : undefined }}>{r.name}</span><span className="muted" style={{ fontSize: 12 }}>{r.protein} g protein</span></span>
            <span className="m" style={{ fontSize: 13 }}>{r.kcal}</span>
          </button>
        ))}
      </div>
      {adding ? (
        <form className={a.vaultForm} onSubmit={add}>
          <Input placeholder="Recipe name" aria-label="Recipe name" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          <div className={a.macroRow}>
            {(["kcal", "protein", "carbs", "fat"] as const).map((f) => (
              <Input key={f} placeholder={f === "kcal" ? "kcal" : `${f} g`} aria-label={f} inputMode="numeric" pattern="[0-9]*" value={form[f]} onChange={(e) => setForm({ ...form, [f]: digits(e.target.value, 4) })} />
            ))}
          </div>
          <Button type="submit" variant="food" block disabled={busy || !form.name.trim() || form.kcal === ""}>{busy ? "Saving…" : "Save and plan it"}</Button>
        </form>
      ) : <Button variant="secondary" block onClick={() => setAdding(true)}>New recipe</Button>}
    </>
  );
}
