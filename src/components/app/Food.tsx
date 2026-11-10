"use client";

// Food: today's calories and macros, the four planned meals, anything off-plan and the recipe book.
// Weight lives on Insights, where the trend belongs; logging it stays on Today, where it closes the day.
// The plans, recipes and quick snacks are David's own, generated from the Macros repo (src/lib/food-data.ts).
// Follows the prototype's viewFood, with one deliberate difference: carbs and fat are real sums (the prototype
// faked them from calories). Off-plan items are typed in plain words: Dayhub answers from what it already knows
// (food-match.ts) and asks the estimator (routes/food.js) only for something new.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type Extra } from "@/lib/api";
import { matchFood, type Known } from "@/lib/food-match";
import { applySaid, knownFromDays, saidLine, type Said } from "@/lib/food-say";
import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { BOWL_VARIANTS, MEAL_PLANS, RECIPES, type Recipe } from "@/lib/food-data";
import { MEALS, type Meal, type PlannedMeal } from "@/lib/settings";
import { cap, dayStatus } from "@/lib/today";
import { Button, ButtonLink, Card, Chip, Icon, Input, Row, Sheet, Toast } from "@/components/ui";
import { DayBanner } from "./DayBanner";
import { FoodSay } from "./FoodSay";
import { useDays } from "./Days";
import { useSession } from "./Session";
import a from "./app.module.css";
import sc from "./screens.module.css";

const fmt = (n: number) => n.toLocaleString("en-US");
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
    // A plain focus: the browser brings the field into view itself, above the keyboard on a phone. Scrolling it to
    // the centre first put it under the keyboard on iOS.
    field.current?.focus();
  }, []);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const closeRecipe = useCallback(() => setRecipe(null), []);
  // The one meal row showing its macros and the rest of its actions.
  const [openMeal, setOpenMeal] = useState<Meal | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 1800); }, []);
  const closeSwap = useCallback(() => setSwap(null), []);

  const known = useMemo(() => knownFromDays(map, settings), [map, settings]);

  if (error) return <div className={a.page}><span className="d" style={{ fontSize: 28 }}>Couldn&apos;t load food</span><p className="muted">{error}</p><div><Button onClick={reload}>Try again</Button></div></div>;
  if (!map) return <div className={a.page}><span className="eb">Loading</span></div>;

  const st = dayStatus(map[k], settings);
  const eaten = map[k]?.log?.meals || {};
  const extras = map[k]?.log?.extras || [];
  const g = settings.goals;
  // A plain function, not a hook: it sits below the early returns above.
  const markFoodSetUp = () => {
    void saveSettings({ foodSetUp: true }).catch((e) => report("food", "food_setup_save_failed", e, undefined, "warn"));
  };
  const left = g.kcal - st.kcal;
  const mealsEaten = MEALS.filter((m) => eaten[m]).length;

  const addExtra = (x: Extra) => { change("day-logs", k, (d) => { d.log.extras = [...d.log.extras, x]; }); say(`Added · ${x.kcal} kcal`); };
  // What you ate in place of the plan: the slot holds a snapshot, so the plan itself is untouched and the meal counts.
  const setMeal = (m: Meal, x: PlannedMeal) => {
    const had = eaten[m];
    change("day-logs", k, (d) => { d.log.meals[m] = { ...x }; });
    say(had ? `${cap(m)} replaced · ${x.kcal} kcal` : `${cap(m)} · ${x.kcal} kcal`);
  };

  // A day said in one go, in one save.
  const logSaid = (items: Said[]) => { change("day-logs", k, (d) => applySaid(d.log, items)); say(saidLine(items)); };

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
          {/* The date as Today's header writes it, "Friday 6 Nov", so one day reads one way on every tab. */}
          <div className="eb">{view.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}</div>
          <div className={`d ${a.pageTitle}`}>Food</div>
        </div>
      </div>

      {!isToday && <DayBanner view={view} onBack={() => setView(null)} />}
      {unsaved && <div className={a.unsaved} role="alert"><span>Some changes are not saved yet.</span><Button size="sm" variant="secondary" onClick={retry}>Retry</Button></div>}

      {/* A newcomer starts on Dayhub's standard plan and targets, which were made for one particular person. Until they
          say otherwise, say so plainly, once: set their own, or keep these (settings.foodSetUp). */}
      {isToday && settings.joined !== "" && !settings.foodSetUp && (
        <Card>
          <span className="eb">Your plan</span>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
            Everyone starts on the same plan and targets: <span className="m">{g.kcal.toLocaleString("en-US")}</span> kcal
            and <span className="m">{g.protein}</span> g protein a day. Make them yours in Settings, or keep these.
          </p>
          <div className={a.rowButtons}>
            <ButtonLink href="/settings/#food" size="sm" variant="food" onClick={() => { haptic(); markFoodSetUp(); }}>Set my targets</ButtonLink>
            <Button size="sm" variant="secondary" onClick={() => { haptic(); markFoodSetUp(); }}>Keep these</Button>
          </div>
        </Card>
      )}

      {/* The day's calories, the bar split by what was eaten (each meal, then anything else), and the macros. Every
          portion is the same green, notched apart, so the bar reads as one total and not as a key to the three macros. */}
      <Card>
        <span className="eb">{isToday ? "Eaten today" : "Eaten that day"}</span>
        <div className={sc.kcal}>
          <span key={st.kcal} className={`dc ${sc.roll}`}>{fmt(st.kcal)}</span><span className="m muted" style={{ fontSize: 13 }}>/ {fmt(g.kcal)} kcal</span>
          <span className={`m ${sc.left} ${left < 0 ? sc.over : ""}`}>{left < 0 ? `${fmt(-left)} over` : `${fmt(left)} left`}</span>
        </div>
        <div className={sc.split} role="img" aria-label={`${fmt(st.kcal)} of ${fmt(g.kcal)} kcal`}>
          {[...MEALS.filter((m) => eaten[m]).map((m) => (typeof eaten[m] === "object" ? (eaten[m] as PlannedMeal).kcal : settings.plan[m].kcal)), ...extras.map((x) => x.kcal)].map((kc, i) => (
            <i key={i} style={{ width: `${Math.min(100, (kc / Math.max(1, g.kcal)) * 100).toFixed(1)}%` }} />
          ))}
        </div>
        <div className={sc.macros}>
          {([["Protein", st.protein, g.protein], ["Carbs", st.carbs, g.carbs], ["Fat", st.fat, g.fat]] as const).map(([label, v, max]) => (
            <div key={label} role="progressbar" aria-label={label} aria-valuenow={v} aria-valuemin={0} aria-valuemax={max}>
              <div className="eb">{label}</div>
              <div className={`m ${sc.macroValue}`}>{v}<span className="muted" style={{ fontSize: 12 }}> / {max} g</span></div>
              <div className={sc.macroTrack}><i style={{ width: `${Math.min(100, (v / Math.max(1, max)) * 100).toFixed(1)}%` }} /></div>
            </div>
          ))}
        </div>
      </Card>

      {settings.foodEstimate && <FoodSay known={known} eaten={eaten} onLog={logSaid} />}

      {/* The four meals in one list: the round button ticks a meal off (or undoes it) in one tap; the rest of a row
          opens its macros and the other actions (David, 2026-11-03: efficient). */}
      <Card>
        <div className={a.entryHead}>
          <span className="eb">Meals</span>
          <span className="m muted" style={{ fontSize: 12 }}>{mealsEaten} of {MEALS.length} eaten</span>
        </div>
        <div className={sc.meals}>
          {MEALS.map((m) => {
            const slot = eaten[m];
            const done = Boolean(slot);
            // Show what was actually eaten if it differs from today's plan.
            const shown: PlannedMeal = typeof slot === "object" ? slot : settings.plan[m];
            const book = findRecipe(shown.name, settings.mealPlan);
            const open = openMeal === m;
            return (
              <div key={m} className={`${sc.meal} ${done ? sc.mealOn : ""}`}>
                <div className={sc.mealRow}>
                  <button type="button" className={sc.mealCheck} aria-pressed={done} aria-label={done ? `${cap(m)} eaten. Undo` : `Mark ${m} eaten`}
                    onClick={() => { haptic(done ? "tap" : "done"); change("day-logs", k, (d) => { d.log.meals[m] = d.log.meals[m] ? false : { ...settings.plan[m] }; }); }}>
                    <Icon name={done ? "check" : m} size={18} strokeWidth={done ? 2.6 : 1.75} />
                  </button>
                  <button type="button" className={sc.mealMain} aria-expanded={open} onClick={() => setOpenMeal(open ? null : m)}>
                    <span className={sc.mealText}><span className="eb">{cap(m)}</span><span className={sc.mealName}>{shown.name}</span></span>
                    <span className={`m ${sc.mealKcal}`}>{shown.kcal}</span>
                    <span className={sc.mealMore} aria-hidden><Icon name="chevron" size={14} /></span>
                  </button>
                </div>
                {open && (
                  <div className={sc.mealOpen}>
                    <span className="muted" style={{ fontSize: 13 }}>{shown.protein} g protein{shown.carbs !== undefined ? ` · ${shown.carbs} g carbs · ${shown.fat ?? 0} g fat` : ""}</span>
                    <div className={a.rowButtons}>
                      {!done && <Button size="sm" variant="secondary" onClick={() => setSwap(m)}>Swap meal</Button>}
                      <Button size="sm" variant="secondary" onClick={() => ateSomethingElse(m)}>Ate something else</Button>
                      {book && <Button size="sm" variant="secondary" onClick={() => setRecipe(book)}>Recipe</Button>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className={a.entryHead}>
          <span className="eb">Something else</span>
          {/* Mono for the number, the body face for the words, as the other cards' notes. */}
          <span className={extras.length ? "m muted" : "muted"} style={{ fontSize: 12 }}>{extras.length ? `${extras.reduce((n, x) => n + x.kcal, 0)} kcal` : "off-plan items"}</span>
        </div>
        {extras.map((x, i) => (
          <Row key={i} name={x.name} sub={x.protein ? `${x.protein} g protein` : undefined} value={x.kcal}
            trail={<button type="button" className={a.lnk} onClick={() => change("day-logs", k, (d) => { d.log.extras = d.log.extras.filter((_, j) => j !== i); })}>Remove</button>} />
        ))}
        {settings.snacks.length > 0 && (
          <div className={a.chips}>
            {settings.snacks.map((s) => <Chip key={s.name} kind="habit" label={s.name} value={s.kcal} onClick={() => { haptic(); addExtra({ name: s.name, kcal: s.kcal, protein: s.protein, carbs: s.carbs, fat: s.fat }); }} />)}
          </div>
        )}
        <ExtraForm onAdd={addExtra} onMeal={setMeal} eaten={eaten} known={known} estimateOn={settings.foodEstimate} slot={slot} onSlot={setSlot} fieldRef={field} />
      </Card>

      <Card>
        <div className={a.entryHead}>
          <span className="eb">Recipes</span>
          <span className="muted" style={{ fontSize: 12 }}>{MEAL_PLANS[settings.mealPlan].name} plan and any-plan dishes</span>
        </div>
        {RECIPES.filter((r) => r.group === settings.mealPlan || r.group === "general").map((r) => (
          <button key={r.id} type="button" className={`${a.pickRow} ${a.bookRow}`} onClick={() => setRecipe(r)}>
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
        {/* One item at a time, so the words don't echo the day box above it, which takes the whole day. */}
        <Input ref={fieldRef} placeholder="Name one item" aria-label="What did you eat" value={text} maxLength={200}
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
