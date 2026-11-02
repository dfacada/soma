// A day's food said in one go (David, 2026-11-02), shared by the box on Food and the one-tap Food card on Today.
// No React: what goes to POST /food/describe, and how its items land in the day's log.

import { api, type DayLog, type Extra } from "./api";
import { knownFoods, type Known } from "./food-match";
import type { Meal, PlannedMeal, Settings } from "./settings";

export type Said = { meal: Meal | "extra"; name: string; kcal: number; protein: number; carbs: number; fat: number; note: string };

const KNOWN_MAX = 60;

/** What Soma can answer without asking: the book, the plan, your snacks, and every off-plan item in the days
 *  already loaded. Same name twice keeps the newest, so a correction you made yesterday is what comes back today. */
export function knownFromDays(map: Record<string, { log?: { extras?: Extra[] } } | undefined> | null, settings: Pick<Settings, "snacks" | "plan">): Known[] {
  const seen = new Map<string, Extra>();
  for (const day of Object.keys(map || {}).sort()) for (const x of map![day]?.log?.extras || []) seen.set(x.name.toLowerCase(), x);
  return knownFoods({ logged: [...seen.values()], snacks: settings.snacks, plan: Object.values(settings.plan) });
}

/** Splits the words into items with the meal each was for. Your own foods, newest logged first, go along so "my
 *  shake" comes back with your numbers; the recipe book stays home. */
export async function describeFood(text: string, known: Known[]): Promise<Said[]> {
  const mine = known.filter((k) => k.source !== "recipe").reverse().slice(0, KNOWN_MAX)
    .map(({ name, kcal, protein, carbs, fat }) => ({ name, kcal, protein, carbs, fat }));
  return (await api<{ items: Said[] }>("POST", "/food/describe", { text, known: mine })).items;
}

/** Writes the items into a day's log: items for the same meal become one snapshot (names joined, numbers summed)
 *  which replaces whatever that meal held; the rest are off-plan items. Use inside change("day-logs", …). */
export function applySaid(log: DayLog, items: Said[]) {
  const meals = new Map<Meal, PlannedMeal>();
  for (const x of items) {
    if (x.meal === "extra") continue;
    const had = meals.get(x.meal);
    meals.set(x.meal, had
      ? { name: `${had.name} + ${x.name}`.slice(0, 80), kcal: had.kcal + x.kcal, protein: had.protein + x.protein, carbs: (had.carbs ?? 0) + x.carbs, fat: (had.fat ?? 0) + x.fat }
      : { name: x.name, kcal: x.kcal, protein: x.protein, carbs: x.carbs, fat: x.fat });
  }
  for (const [m, x] of meals) log.meals[m] = x;
  log.extras = [...log.extras, ...items.filter((x) => x.meal === "extra").map(({ name, kcal, protein, carbs, fat }): Extra => ({ name, kcal, protein, carbs, fat }))];
}

/** "Logged 3 items · 1,580 kcal". */
export const saidLine = (items: Said[]) =>
  `Logged ${items.length} item${items.length === 1 ? "" : "s"} · ${items.reduce((n, x) => n + x.kcal, 0).toLocaleString("en-US")} kcal`;
