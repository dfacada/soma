// Matching what you type against food Soma already knows: your plan, the recipe book, your quick snacks, and
// every off-plan item you have logged in the days already loaded. A hit fills the macros instantly, offline and
// free; only a miss goes to the estimator (routes/food.js). No React and no imports beyond the food data, so
// scripts/test-food-match.mjs runs this file as it is.

import { BOWL_VARIANTS, RECIPES, SNACK_PRESETS } from "./food-data";

export type Macros = { name: string; kcal: number; protein?: number; carbs?: number; fat?: number };
/** Where a match came from, for the line under the form. */
export type MatchSource = "logged" | "snack" | "plan" | "recipe";
export type Known = Macros & { source: MatchSource };
export type Match = { item: Known; exact: boolean };

const STOP = new Set(["a", "an", "the", "of", "with", "and", "some", "my", "one", "1"]);

/** Lower case, no punctuation, no plural s, stop words dropped. "2 Large Eggs!" → ["2", "large", "egg"] */
export function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}
const normal = (text: string) => tokens(text).join(" ");

/**
 * Everything Soma can answer without asking. Later entries win ties, so what you logged yourself comes first:
 * your own numbers beat the book's.
 */
export function knownFoods(input: {
  /** Off-plan items from the days already loaded, oldest first. */
  logged?: Macros[];
  /** settings.snacks. */
  snacks?: Macros[];
  /** The four planned meals. */
  plan?: Macros[];
}): Known[] {
  const out: Known[] = [];
  for (const r of RECIPES) out.push({ source: "recipe", name: r.name, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat });
  for (const b of Object.values(BOWL_VARIANTS)) out.push({ source: "recipe", name: b.name, kcal: b.kcal, protein: b.protein, carbs: b.carbs, fat: b.fat });
  for (const s of SNACK_PRESETS) out.push({ source: "snack", name: s.name, kcal: s.kcal, protein: s.protein, carbs: s.carbs, fat: s.fat });
  for (const m of input.plan || []) out.push({ source: "plan", ...m });
  for (const s of input.snacks || []) out.push({ source: "snack", ...s });
  for (const l of input.logged || []) out.push({ source: "logged", ...l });
  return out;
}

/**
 * The best thing Soma already knows for this text, or null. `exact` means the words matched, not merely overlapped;
 * an inexact match is offered as a suggestion, never used on its own.
 */
export function matchFood(text: string, known: Known[]): Match | null {
  const q = normal(text);
  if (!q) return null;
  const qt = tokens(text);
  let best: { item: Known; score: number; exact: boolean } | null = null;

  for (const item of known) {
    const n = normal(item.name);
    if (!n) continue;
    const nt = tokens(item.name);
    let score = 0;
    let exact = false;
    if (n === q) { score = 100; exact = true; }
    else if (n.startsWith(q + " ") || q.startsWith(n + " ")) { score = 80; exact = true; }
    else {
      const hit = qt.filter((w) => nt.includes(w)).length;
      if (!hit) continue;
      // How much of what you typed the candidate covers, and how little else it carries.
      score = (hit / qt.length) * 50 + (hit / nt.length) * 10;
      if (score < 35) continue;
    }
    // Ties go to the later source (logged beats the book), so use >= on an equal score.
    if (!best || score >= best.score) best = { item, score, exact };
  }
  return best ? { item: best.item, exact: best.exact } : null;
}
