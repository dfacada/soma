"use client";

// Food: today's calories and macros, the four planned meals, anything off-plan and the recipe book.
// Weight lives on Insights, where the trend belongs; logging it stays on Today, where it closes the day.
// The plans, recipes and quick snacks are David's own, generated from the Macros repo (src/lib/food-data.ts).
// Follows the prototype's viewFood, with one deliberate difference: carbs and fat are real sums (the prototype
// faked them from calories). Off-plan items are typed in plain words: Soma answers from what it already knows
// (food-match.ts) and asks the estimator (routes/food.js) only for something new.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type Extra } from "@/lib/api";
import { knownFoods, matchFood, type Known } from "@/lib/food-match";
import { report } from "@/lib/log";
import { BOWL_VARIANTS, MEAL_PLANS, RECIPES, type Recipe } from "@/lib/food-data";
import { MEALS, type Meal, type PlannedMeal } from "@/lib/settings";
import { cap, dayStatus } from "@/lib/today";
import { Bar, Button, Card, Chip, Input, ProgressRing, Row, Sheet, Toast } from "@/components/ui";
import { DayBanner } from "./DayBanner";
import { useDays } from "./Days";
import { useSession } from "./Session";
import a from "./app.module.css";

const fmt = (n: number) => n.toLocaleString("en-US");
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const digits = (v: string, max = 5) => v.replace(/\D/g, "").slice(0, max);

export function Food() {
  const { settings, saveSettings } = useSession();
  // Follows the day picked on Today (backfill).
  const { map, error, reload, unsaved, retry, change, viewKey: k, view, isToday, setView } = useDays();
  const [swap, setSwap] = useState<Meal | null>(null);
  // Which slot the form below will fill: a meal, or null for an off-plan item. A meal card's "Ate something else"
  // sets it and sends you to the form.
  const [slot, setSlot] = useState<Meal | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const ateSomethingElse = useCallback((m: Meal) => {
    setSlot(m);
    field.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    field.current?.focus({ preventScroll: true });
  }, []);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const closeRecipe = useCallback(() => setRecipe(null), []);
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 1800); }, []);
  const closeSwap = useCallback(() => setSwap(null), []);

  // What Soma can answer without asking: the book, the plan, your snacks, and every off-plan item in the 60 days
  // already loaded. Same name twice keeps the newest, so a correction you made yesterday is what comes back today.
  const known = useMemo(() => {
    const seen = new Map<string, Extra>();
    for (const day of Object.keys(map || {}).sort()) for (const x of map![day]?.log?.extras || []) seen.set(x.name.toLowerCase(), x);
    return knownFoods({ logged: [...seen.values()], snacks: settings.snacks, plan: Object.values(settings.plan) });
  }, [map, settings.snacks, settings.plan]);

  if (error) return <div className={a.page}><span className="d" style={{ fontSize: 28 }}>Couldn&apos;t load food</span><p className="muted">{error}</p><div><Button onClick={reload}>Try again</Button></div></div>;
  if (!map) return <div className={a.page}><span className="eb">Loading</span></div>;

  const st = dayStatus(map[k], settings);
  const eaten = map[k]?.log?.meals || {};
  const extras = map[k]?.log?.extras || [];
  const g = settings.goals;

  const addExtra = (x: Extra) => { change("day-logs", k, (d) => { d.log.extras = [...d.log.extras, x]; }); say(`Added · ${x.kcal} kcal`); };
  // What you ate in place of the plan: the slot holds a snapshot, so the plan itself is untouched and the meal counts.
  const setMeal = (m: Meal, x: PlannedMeal) => {
    const had = eaten[m];
    change("day-logs", k, (d) => { d.log.meals[m] = { ...x }; });
    say(had ? `${cap(m)} replaced · ${x.kcal} kcal` : `${cap(m)} · ${x.kcal} kcal`);
  };

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
          <div className="eb">{WEEKDAY[view.getDay()]} · {MONTH[view.getMonth()]} {view.getDate()}</div>
          <div className={`d ${a.pageTitle}`}>Food</div>
        </div>
      </div>

      {!isToday && <DayBanner view={view} onBack={() => setView(null)} />}
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
            <Row name={shown.name} sub={`${shown.protein} g protein${shown.carbs !== undefined ? ` · ${shown.carbs} g carbs · ${shown.fat ?? 0} g fat` : ""}`} value={<span style={{ color: done ? "var(--ink)" : "var(--muted)" }}>{shown.kcal}</span>} />
            <div className={a.rowButtons}>
              <Button size="sm" variant={done ? "secondary" : "food"} onClick={() => change("day-logs", k, (d) => { d.log.meals[m] = d.log.meals[m] ? false : { ...settings.plan[m] }; })}>{done ? "Undo" : "Mark eaten"}</Button>
              {!done && <Button size="sm" variant="secondary" onClick={() => setSwap(m)}>Swap meal</Button>}
              <Button size="sm" variant="secondary" onClick={() => ateSomethingElse(m)}>Ate something else</Button>
              {findRecipe(shown.name, settings.mealPlan) && <Button size="sm" variant="secondary" onClick={() => setRecipe(findRecipe(shown.name, settings.mealPlan))}>Recipe</Button>}
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
            {settings.snacks.map((s) => <Chip key={s.name} kind="habit" label={s.name} onClick={() => addExtra({ name: s.name, kcal: s.kcal, protein: s.protein, carbs: s.carbs, fat: s.fat })} />)}
          </div>
        )}
        <ExtraForm onAdd={addExtra} onMeal={setMeal} eaten={eaten} known={known} estimateOn={settings.foodEstimate} slot={slot} onSlot={setSlot} fieldRef={field} />
      </Card>

      <Card>
        <div className={a.entryHead}>
          <span className="eb" style={{ color: "var(--ink)" }}>Recipes</span>
          <span className="muted" style={{ fontSize: 12 }}>{MEAL_PLANS[settings.mealPlan].name} plan and any-plan dishes</span>
        </div>
        {RECIPES.filter((r) => r.group === settings.mealPlan || r.group === "general").map((r) => (
          <button key={r.id} type="button" className={a.pickRow} onClick={() => setRecipe(r)}>
            <span className={a.pickName}><span style={{ fontWeight: 500 }}>{r.name}</span><span className="muted" style={{ fontSize: 12 }}>{r.isMealPrep ? `Meal prep · makes ${r.servings}` : r.servings > 1 ? `Makes ${r.servings}` : "Single serving"}{r.time ? ` · ${r.time}` : ""}</span></span>
            <span className="m" style={{ fontSize: 13 }}>{r.kcal}</span>
          </button>
        ))}
      </Card>

      <Sheet open={swap !== null} title={swap ? `Swap ${swap}` : ""} onClose={closeSwap}>
        {swap && <RecipePicker current={settings.plan[swap].name} onPick={(r) => void pick(swap, r)} />}
      </Sheet>
      <Sheet open={recipe !== null} title={recipe?.name || ""} onClose={closeRecipe}>
        {recipe && <RecipeBody r={recipe} />}
      </Sheet>
      <Toast message={toast} />
    </div>
  );
}

/** The recipe behind a planned meal. Looked for in the active plan's recipes first, since two plans have a
 *  "Post-Workout Shake"; the plan names a bowl by the dish, the book by its full title. */
function findRecipe(name: string, plan: string): Recipe | null {
  const stem = name.replace(/ Bowl$/, "");
  for (const pool of [RECIPES.filter((r) => r.group === plan), RECIPES.filter((r) => r.group === "general"), RECIPES]) {
    const hit = pool.find((r) => r.name === name) || pool.find((r) => r.name.startsWith(stem) || r.name.endsWith(name));
    if (hit) return hit;
  }
  return null;
}

function RecipeBody({ r }: { r: Recipe }) {
  return (
    <div className={a.recipe}>
      <p className="m" style={{ fontSize: 13 }}>{r.kcal} kcal · {r.protein} P · {r.carbs} C · {r.fat} F <span className="muted">per serving{r.servings > 1 ? ` · makes ${r.servings}` : ""}{r.fixedPortion ? " · fixed portion" : ""}</span></p>
      <span className="eb">Ingredients</span>
      <ul>{r.ingredients.map((x) => <li key={x}>{x}</li>)}</ul>
      <span className="eb">Steps</span>
      <ol>{r.steps.map((x) => <li key={x}>{x}</li>)}</ol>
      {r.notes && <><span className="eb">Notes</span><p className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>{r.notes}</p></>}
    </div>
  );
}

type Draft = { name: string; kcal: string; protein: string; carbs: string; fat: string; from: string };

const FROM: Record<Known["source"], string> = { logged: "from what you logged before", snack: "from your quick snacks", plan: "from your plan", recipe: "from the recipe book" };
const draftOf = (item: { name: string; kcal: number; protein?: number; carbs?: number; fat?: number }, from: string): Draft =>
  ({ name: item.name, kcal: String(item.kcal), protein: String(item.protein ?? ""), carbs: String(item.carbs ?? ""), fat: String(item.fat ?? ""), from });

/**
 * Type what you ate; the four numbers come back filled and editable, and nothing is logged until you tap Add.
 * Known food answers instantly and offline; only something new goes to the estimator, and only with it switched on.
 *
 * What you typed can land in two places: as one of the four meals, in place of the plan (the slot keeps a snapshot,
 * so the meal counts towards closing the day and the plan itself is untouched), or as an off-plan item.
 */
function ExtraForm({ onAdd, onMeal, eaten, known, estimateOn, slot, onSlot, fieldRef }: {
  onAdd: (x: Extra) => void;
  onMeal: (m: Meal, x: PlannedMeal) => void;
  eaten: Record<string, unknown>;
  known: Known[];
  estimateOn: boolean;
  /** Where what you type will land: a meal slot, or null for an off-plan item. Owned above, so a meal card can set it. */
  slot: Meal | null;
  onSlot: (m: Meal | null) => void;
  fieldRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function look(e: React.FormEvent) {
    e.preventDefault();
    const said = text.trim();
    if (!said || busy) return;
    setError(null);
    const hit = matchFood(said, known);
    if (hit?.exact) return setDraft(draftOf(hit.item, FROM[hit.item.source]));
    if (!estimateOn) return setDraft(hit ? draftOf(hit.item, `close to ${hit.item.name}`) : { name: said.slice(0, 80), kcal: "", protein: "", carbs: "", fat: "", from: "your numbers" });
    setBusy(true);
    try {
      const got = await api<{ name: string; kcal: number; protein: number; carbs: number; fat: number; note: string }>("POST", "/food/estimate", { text: said });
      setDraft(draftOf(got, got.note || "estimated"));
    } catch (err) {
      report("food", "estimate_failed", err, undefined, err instanceof ApiError && err.status < 500 ? "warn" : "error");
      setError(err instanceof ApiError ? err.message : "Couldn't estimate that. Type the numbers instead.");
      setDraft(hit ? draftOf(hit.item, `close to ${hit.item.name}`) : { name: said.slice(0, 80), kcal: "", protein: "", carbs: "", fat: "", from: "your numbers" });
    } finally { setBusy(false); }
  }

  function add() {
    if (!draft || draft.kcal === "") return;
    const n = (v: string) => (v === "" ? undefined : Number(v));
    const name = draft.name.trim().slice(0, 80) || text.trim().slice(0, 80);
    const kcal = Number(draft.kcal);
    if (slot) onMeal(slot, { name, kcal, protein: Number(draft.protein) || 0, carbs: Number(draft.carbs) || 0, fat: Number(draft.fat) || 0 });
    else onAdd({ name, kcal, protein: n(draft.protein), carbs: n(draft.carbs), fat: n(draft.fat) });
    setDraft(null); setText(""); setError(null); onSlot(null);
  }

  const macro = (key: "kcal" | "protein" | "carbs" | "fat", label: string) => (
    <label key={key} className={a.macroField}>
      <span className="eb">{label}</span>
      <Input aria-label={label} inputMode="numeric" pattern="[0-9]*" value={draft![key]}
        onChange={(e) => setDraft((d) => d && { ...d, [key]: digits(e.target.value, 4) })} />
    </label>
  );

  return (
    <div>
      <form className={a.extraForm} onSubmit={look}>
        <Input ref={fieldRef} placeholder="What did you eat?" aria-label="What did you eat" value={text} maxLength={200}
          onChange={(e) => { setText(e.target.value); if (draft) setDraft(null); }} />
        <Button type="submit" variant="food" disabled={!text.trim() || busy}>{busy ? "…" : draft ? "Redo" : "Look up"}</Button>
      </form>
      {error && <p role="alert" className={a.noteBad} style={{ fontSize: 13 }}>{error}</p>}
      {draft && (
        <div className={a.draft}>
          <div className={a.draftHead}>
            <Input aria-label="Name" value={draft.name} maxLength={80} onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })} />
            <span className="muted" style={{ fontSize: 12 }}>{draft.from}</span>
          </div>
          <div className={a.macroFields}>
            {macro("kcal", "kcal")}{macro("protein", "protein")}{macro("carbs", "carbs")}{macro("fat", "fat")}
          </div>
          <div>
            <span className="eb">Log it as</span>
            <div className={a.chips} style={{ marginTop: 6 }}>
              <Chip kind="habit" label="Something else" on={slot === null} onClick={() => onSlot(null)} />
              {MEALS.map((m) => <Chip key={m} kind="habit" label={cap(m)} on={slot === m} onClick={() => onSlot(m)} />)}
            </div>
          </div>
          <div className={a.extraForm}>
            <Button variant="food" block disabled={draft.kcal === ""} onClick={add}>
              {slot ? (eaten[slot] ? `Replace ${slot}` : `Log as ${slot}`) : "Add"}
            </Button>
            <Button variant="secondary" onClick={() => { setDraft(null); setError(null); onSlot(null); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}


type Saved = { id: string; recipe: PlannedMeal };

/** The user's own recipes first, then the Macros recipe book and the two bowl builds. New recipes are saved to /recipes. */
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

  const book: PlannedMeal[] = [...Object.values(BOWL_VARIANTS), ...RECIPES].map(({ name, kcal, protein, carbs, fat }) => ({ name, kcal, protein, carbs, fat }));
  const seen = new Set<string>();
  const list: PlannedMeal[] = [...(mine || []).map((m) => m.recipe), ...book].filter((r) => !seen.has(r.name) && seen.add(r.name));

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
