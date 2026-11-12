"use client";

// Your food (David, 2026-11-11: "their own meals"). How someone new says they want to log food: on Food until they are
// done, and from the first-day card. Their own meals are where everyone starts, with targets only if they want them.
// Or one of the three ready-made plans that came from Macros, chosen knowingly: its four meals show before it is used.

import { useState } from "react";
import { MEAL_PLANS, type MealPlanId } from "@/lib/food-data";
import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { MEALS, OWN_PLAN, planMeals, type Settings } from "@/lib/settings";
import { cap } from "@/lib/today";
import { Button, Chip, Row } from "@/components/ui";
import { useSession } from "./Session";
import a from "./app.module.css";

const KCAL = [1600, 1800, 2000, 2200, 2500];
const PROTEIN = [100, 130, 160];
const PLANS = Object.keys(MEAL_PLANS) as MealPlanId[];
const fmt = (n: number) => n.toLocaleString("en-US");

export function FoodSetUp({ say, onDone }: { say: (message: string) => void; onDone: () => void }) {
  const { settings, saveSettings } = useSession();
  const [peek, setPeek] = useState<MealPlanId | null>(null);
  const g = settings.goals;
  const own = settings.mealPlan === "own";
  /** Saves at once, as every setting does; true when it was saved. */
  const save = (patch: Partial<Settings>, done?: string) => saveSettings(patch).then(
    () => { if (done) say(done); return true; },
    (e) => { report("food", "setup_save_failed", e, undefined, "warn"); say("Couldn't save that. Try again."); return false; },
  );
  const target = (key: "kcal" | "protein", n: number) => { haptic(); void save({ goals: { ...g, [key]: n } }); };
  const use = (id: MealPlanId) => {
    haptic("done");
    void save({ mealPlan: id, plan: planMeals(id, settings.bowl), goals: { ...g, ...MEAL_PLANS[id].targets } }, `${MEAL_PLANS[id].name} plan`).then((ok) => { if (ok) onDone(); });
  };

  return (
    <div className={a.vaultForm}>
      <p style={{ fontSize: 14, lineHeight: 1.5 }}>
        {own
          ? "Log what you eat: say it, type it, or just tick a meal. What you have often becomes your usual, so it is one tap the next time."
          : `You're on the ${MEAL_PLANS[settings.mealPlan as MealPlanId].name} plan: four set meals, one tap each.`}
      </p>

      <span className="eb">Calories a day</span>
      <div className={a.chips} role="group" aria-label="Calories a day">
        {KCAL.map((n) => <Chip key={n} kind="habit" label={fmt(n)} on={g.kcal === n} onClick={() => target("kcal", n)} />)}
        <Chip kind="habit" label="No target" on={g.kcal <= 0} onClick={() => target("kcal", 0)} />
      </div>
      <span className="eb">Protein a day</span>
      <div className={a.chips} role="group" aria-label="Protein a day">
        {PROTEIN.map((n) => <Chip key={n} kind="habit" label={`${n} g`} on={g.protein === n} onClick={() => target("protein", n)} />)}
        <Chip kind="habit" label="No target" on={g.protein <= 0} onClick={() => target("protein", 0)} />
      </div>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>Optional. With none, Food shows what you ate and measures it against nothing. Change them any time in Settings → Food.</p>

      {own ? <>
        <span className="eb" style={{ paddingTop: 6 }}>Or follow a ready-made plan</span>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Four set meals a day, one tap each, with targets to match.</p>
        <div>
          {PLANS.map((id) => {
            const p = MEAL_PLANS[id], open = peek === id, meals = planMeals(id, settings.bowl);
            return (
              <div key={id}>
                <button type="button" className={a.pickRow} aria-expanded={open} onClick={() => { haptic(); setPeek(open ? null : id); }}>
                  <span className={a.pickName}><span style={{ fontWeight: 500 }}>{p.name}</span><span className="muted" style={{ fontSize: 12 }}>{p.badge}</span></span>
                  <span className="m" style={{ fontSize: 12 }}>{fmt(p.targets.kcal)} kcal · {p.targets.protein} g</span>
                </button>
                {open && (
                  <div className={a.draft}>
                    {MEALS.map((m) => <Row key={m} name={meals[m].name} sub={cap(m)} value={meals[m].kcal} />)}
                    <Button variant="food" block onClick={() => use(id)}>Use the {p.name} plan</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </> : (
        <button type="button" className={a.lnk} style={{ alignSelf: "flex-start", minHeight: 44 }}
          onClick={() => { haptic(); void save({ mealPlan: "own", plan: OWN_PLAN }, "Your own meals"); }}>Log my own meals instead</button>
      )}

      <Button block onClick={() => { haptic("done"); onDone(); }}>Done</Button>
    </div>
  );
}
