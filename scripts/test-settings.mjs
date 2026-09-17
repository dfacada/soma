// Settings defaults and merging: David's Macros setup is the default, and the old sample data is replaced.
//   node --import ./scripts/ts-resolve.mjs scripts/test-settings.mjs
import { DEFAULT_SETTINGS, mergeSettings, planMeals } from "../src/lib/settings.ts";
import { MEAL_PLANS, RECIPES, SNACK_PRESETS } from "../src/lib/food-data.ts";

let passed = 0; const failures = [];
const check = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, "\n       got ", JSON.stringify(got), "\n       want", JSON.stringify(want)); } };

console.log("defaults are the Macros setup");
check("the Standard plan's four meals", Object.values(DEFAULT_SETTINGS.plan).map((m) => [m.name, m.kcal, m.protein, m.carbs, m.fat]),
  [["Post-Workout Shake", 664, 69, 59, 25], ["Beef & Rice Bowl", 708, 53, 53, 28], ["Vanilla-Almond Protein Yogurt Bowl", 452, 49, 20, 22], ["Beef & Rice Bowl", 708, 53, 53, 28]]);
check("quick snacks are the Macros presets plus the plan's anytime whey", DEFAULT_SETTINGS.snacks.map((s) => [s.name, s.kcal, s.protein]), [["Beef Stick", 100, 9], ["Coffee Black", 5, 0], ["Coffee w/ Creamer", 40, 1], ["Spindrift", 10, 0], ["Whey in Water", 110, 25]]);
check("targets match the Standard plan", [DEFAULT_SETTINGS.goals.kcal, DEFAULT_SETTINGS.goals.protein, DEFAULT_SETTINGS.goals.carbs, DEFAULT_SETTINGS.goals.fat], Object.values(MEAL_PLANS.standard.targets));
check("the turkey build fills both bowl slots, and only those", Object.values(planMeals("standard", "turkey-cabbage")).map((m) => m.name), ["Post-Workout Shake", "Turkey & Cabbage Bowl", "Vanilla-Almond Protein Yogurt Bowl", "Turkey & Cabbage Bowl"]);
check("a bowl build does not leak into another plan", planMeals("keto", "turkey-cabbage").lunch.name, "Keto Beef & Cauliflower Bowl");
check("every recipe came across with its method", [RECIPES.length, RECIPES.every((r) => r.ingredients.length > 0 && r.steps.length > 0 && r.kcal > 0)], [11, true]);
check("preset count", SNACK_PRESETS.length, 5);

console.log("what an account already holds");
// Exactly what David's account held on 2026-09-17: three untouched samples and one sample he had swapped in.
const stored = { goals: { kcal: 1600, protein: 200, carbs: 150, fat: 75, steps: 12000 }, plan: { breakfast: { name: "Eggs & toast", kcal: 470, protein: 22 }, lunch: { name: "Chicken burrito bowl", kcal: 640, protein: 52 }, snack: { name: "Protein shake", kcal: 220, protein: 30 }, dinner: { name: "Salmon, rice & greens", kcal: 620, protein: 44 } } };
const merged = mergeSettings(stored);
check("sample meals are replaced by the real plan", Object.values(merged.plan).map((m) => m.name), ["Post-Workout Shake", "Beef & Rice Bowl", "Vanilla-Almond Protein Yogurt Bowl", "Beef & Rice Bowl"]);
check("…and his own targets are left exactly as he set them", merged.goals, stored.goals);
const own = mergeSettings({ plan: { ...stored.plan, lunch: { name: "Leftover chili", kcal: 550, protein: 40 } } });
check("a meal he typed himself survives, slot by slot", [own.plan.lunch.name, own.plan.breakfast.name], ["Leftover chili", "Post-Workout Shake"]);
check("sample snacks are replaced", mergeSettings({ snacks: [{ name: "Beef stick", kcal: 100 }, { name: "Spindrift", kcal: 10 }] }).snacks.length, 5);
check("his own snack list is kept, even next to a sample", mergeSettings({ snacks: [{ name: "Beef stick", kcal: 100 }, { name: "Jerky", kcal: 80 }] }).snacks.map((s) => s.name), ["Beef stick", "Jerky"]);
check("an emptied snack list stays empty", mergeSettings({ snacks: [] }).snacks, []);
check("an unknown plan or bowl falls back", [mergeSettings({ mealPlan: "carnivore", bowl: "x" }).mealPlan, mergeSettings({ mealPlan: "carnivore", bowl: "x" }).bowl], ["standard", "beef-rice"]);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
