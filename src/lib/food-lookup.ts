// One food named in words, and its numbers to check before anything is logged: Food's own field, and the meal sheet
// for a meal with no usual yet (MealSheet.tsx). What you logged or planned answers at once and offline; only something
// new goes to the estimator (routes/food.js), and only with estimates switched on.

import { api, ApiError } from "./api";
import { matchFood, type Known } from "./food-match";
import { report } from "./log";

/** The numbers as typed in the four fields: strings, so a field can be empty while it is being changed. */
export type FoodDraft = { name: string; kcal: string; protein: string; carbs: string; fat: string; from: string };

export const FROM: Record<Known["source"], string> = { logged: "from what you logged before", snack: "from your quick snacks", plan: "from your plan", recipe: "from the recipe book" };

export const draftOf = (item: { name: string; kcal: number; protein?: number; carbs?: number; fat?: number }, from: string): FoodDraft =>
  ({ name: item.name, kcal: String(item.kcal), protein: String(item.protein ?? ""), carbs: String(item.carbs ?? ""), fat: String(item.fat ?? ""), from });

/** What was said, as a draft: known food exactly, else the estimate, else something close or blank fields to fill.
 *  `error` is a sentence for the screen when the estimate failed (the failure is reported here). */
export async function lookUp(said: string, known: Known[], estimateOn: boolean): Promise<{ draft: FoodDraft; error: string | null }> {
  const hit = matchFood(said, known);
  if (hit?.exact) return { draft: draftOf(hit.item, FROM[hit.item.source]), error: null };
  const own: FoodDraft = hit ? draftOf(hit.item, `close to ${hit.item.name}`) : { name: said.slice(0, 80), kcal: "", protein: "", carbs: "", fat: "", from: "your numbers" };
  if (!estimateOn) return { draft: own, error: null };
  try {
    const got = await api<{ name: string; kcal: number; protein: number; carbs: number; fat: number; note: string }>("POST", "/food/estimate", { text: said });
    return { draft: draftOf(got, got.note || "estimated"), error: null };
  } catch (err) {
    report("food", "estimate_failed", err, undefined, err instanceof ApiError && err.status < 500 ? "warn" : "error");
    return { draft: own, error: err instanceof ApiError ? err.message : "Couldn't estimate that. Type the numbers instead." };
  }
}

/** A finished draft as a meal: the name it was given (or what was said) and whole numbers. */
export function mealOf(draft: FoodDraft, said = "") {
  return {
    name: draft.name.trim().slice(0, 80) || said.trim().slice(0, 80),
    kcal: Number(draft.kcal) || 0, protein: Number(draft.protein) || 0, carbs: Number(draft.carbs) || 0, fat: Number(draft.fat) || 0,
  };
}
