// Settings defaults and merging: David's Macros setup is the default, and the old sample data is replaced.
//   node --import ./scripts/ts-resolve.mjs scripts/test-settings.mjs
import { DEFAULT_SETTINGS, NEWCOMER_FOOD, OWN_PLAN, mergeSettings, planMeals } from "../src/lib/settings.ts";
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
check("tomorrow's brief: off, at 21:00, not to Telegram, unless chosen", mergeSettings({}).brief, { on: false, time: "21:00", telegram: false, sent: "" });
check("tomorrow's brief: choices are kept, a bad time or sent day falls back", mergeSettings({ brief: { on: true, time: "9pm", telegram: true, sent: "yesterday" } }).brief, { on: true, time: "21:00", telegram: true, sent: "" });
check("tomorrow's brief: the day it was last sent is kept", mergeSettings({ brief: { sent: "2026-11-03" } }).brief.sent, "2026-11-03");

console.log("a newcomer's own food (2026-11-11: nobody new starts on David's plan)");
const mine = mergeSettings(JSON.parse(JSON.stringify(NEWCOMER_FOOD)));
check("their own meals, none of them David's", [mine.mealPlan, Object.values(mine.plan)], ["own", [null, null, null, null]]);
check("…with no targets", [mine.goals.kcal, mine.goals.protein, mine.goals.carbs, mine.goals.fat], [0, 0, 0, 0]);
check("…the steps goal everyone starts with", mine.goals.steps, DEFAULT_SETTINGS.goals.steps);
check("…and no quick snacks", mine.snacks, []);
const learned = mergeSettings({ ...NEWCOMER_FOOD, plan: { ...OWN_PLAN, lunch: { name: "Chicken salad", kcal: 520, protein: 38 } } });
check("a usual meal they made is kept beside the empty ones", [learned.plan.breakfast, learned.plan.lunch?.name], [null, "Chicken salad"]);
check("own meals with a slot missing read as empty, never as David's", mergeSettings({ mealPlan: "own", plan: { lunch: { name: "Soup", kcal: 300, protein: 12 } } }).plan.breakfast, null);
check("nothing stored is still David's plan", [mergeSettings({}).mealPlan, mergeSettings({}).plan.breakfast?.name], ["standard", "Post-Workout Shake"]);
check("a target set to none stays none", mergeSettings({ goals: { kcal: 2000, protein: 0 } }).goals, { kcal: 2000, protein: 0, carbs: 150, fat: 75, steps: 8000 });
check("a plan chosen later replaces the empty meals", Object.values(mergeSettings({ ...NEWCOMER_FOOD, mealPlan: "keto", plan: planMeals("keto", "beef-rice") }).plan).every((m) => m && m.kcal > 0), true);

console.log("what closes the day (2026-11-11: each person chooses)");
check("nothing stored: all five, all four meals, not chosen yet", mergeSettings({}).closes, { checkin: true, journal: true, food: true, activity: true, meals: ["breakfast", "lunch", "snack", "dinner"], chosen: false });
check("a choice is kept, meals in card order, unknown ones dropped", mergeSettings({ closes: { journal: false, meals: ["dinner", "brunch", "breakfast"], chosen: true } }).closes, { checkin: true, journal: false, food: true, activity: true, meals: ["breakfast", "dinner"], chosen: true });
check("no meal left counts all four", mergeSettings({ closes: { meals: [] } }).closes.meals.length, 4);
check("nothing counting at all reads as the check-in (as the server reads it)", mergeSettings({ requireWeight: false, closes: { checkin: false, journal: false, food: false, activity: false } }).closes.checkin, true);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
