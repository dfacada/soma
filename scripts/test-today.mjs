// What closes a day.  node --import ./scripts/ts-resolve.mjs scripts/test-today.mjs
import { createRequire } from "node:module";
import { dayStatus, headline, mealsWord, since, streak } from "../src/lib/today.ts";
import { DEFAULT_SETTINGS, NEWCOMER_FOOD, mergeSettings } from "../src/lib/settings.ts";

let passed = 0; const failures = [];
const check = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, "\n       got ", JSON.stringify(got), "\n       want", JSON.stringify(want)); } };

const meal = { name: "x", kcal: 500, protein: 40 };
const full = (day, weight) => ({
  checkin: { day, mood: "Focused", habits: {}, counts: {} },
  log: { day, meals: { breakfast: meal, lunch: meal, snack: meal, dinner: meal }, extras: [] },
  activity: { day, pushups: 100, types: {} },
  entries: 1,
  ...(weight === undefined ? {} : { weight }),
});
const required = DEFAULT_SETTINGS;
const optional = { ...DEFAULT_SETTINGS, requireWeight: false };

console.log("weight as a closing task");
check("weight is required by default", required.requireWeight, true);
let st = dayStatus(full("d", undefined), required);
check("everything but weight: four of five, not closed", [st.doneCount, st.taskCount, st.closed, st.weightDone], [4, 5, false, false]);
check("…and the ring has five segments, weight first, as the cards are ordered", st.ring.map((r) => [r.key, r.value]), [["weight", 0], ["checkin", 1], ["journal", 1], ["food", 1], ["activity", 1]]);
// One logged activity fills the whole segment: with weight missing that is four of five.
check("…one activity fills its segment whole", Math.round(st.progress * 100), 80);
check("…and the headline asks for it", [headline(st, 0, 9).big, headline(st, 0, 9).todos.map((t) => t.label)], ["One to go", ["Weight"]]);
st = dayStatus(full("d", 182.4), required);
check("with weight logged the day closes at five of five", [st.doneCount, st.taskCount, st.closed, st.weight], [5, 5, true, 182.4]);
st = dayStatus(full("d", undefined), optional);
check("switched off: four tasks, closed without weight, four segments", [st.doneCount, st.taskCount, st.closed, st.ring.length], [4, 4, true, 4]);
st = dayStatus(full("d", 182.4), optional);
check("switched off: a logged weight is kept but does not count", [st.doneCount, st.taskCount, st.weightDone], [4, 4, true]);
check("a fresh day says how many things close it", [headline(dayStatus(undefined, required), 0, 9).sub, headline(dayStatus(undefined, optional), 0, 9).sub], ["Good morning. Five things close it.", "Good morning. Four things close it."]);

console.log("their own meals, and meals with no numbers");
const own = mergeSettings(NEWCOMER_FOOD);
const ticked = { name: "", kcal: 0, protein: 0 };
st = dayStatus({ log: { day: "d", meals: { breakfast: ticked, lunch: meal, snack: true, dinner: false }, extras: [] }, entries: 0 }, own);
check("a meal ticked with no numbers is eaten; a bare tick with no usual meal adds nothing", [st.meals, st.kcal, st.protein, st.leftMeals], [3, 500, 40, ["dinner"]]);
st = dayStatus({ log: { day: "d", meals: { breakfast: ticked, lunch: ticked, snack: ticked, dinner: ticked }, extras: [] }, entries: 0 }, own);
check("four ticked meals close food, with nothing counted", [st.foodDone, st.kcal], [true, 0]);

console.log("each person's own rule (settings.closes)");
const rule = (stored) => mergeSettings(stored);
st = dayStatus({ ...full("d", 180), entries: 0 }, rule({ closes: { journal: false } }));
check("a journal that doesn't count: closed without an entry, four things, no journal bead", [st.closed, st.taskCount, st.ring.map((r) => r.key).includes("journal"), st.counts.journal], [true, 4, false, false]);
const twoMeals = { ...full("d", 180), log: { day: "d", meals: { breakfast: meal, dinner: meal }, extras: [] } };
st = dayStatus(twoMeals, rule({ closes: { meals: ["breakfast", "dinner"] } }));
check("only the meals that count: breakfast and dinner close food", [st.foodDone, st.closed, st.leftMeals, st.meals, st.mealsNeeded], [true, true, [], 2, ["breakfast", "dinner"]]);
st = dayStatus({ ...twoMeals, log: { day: "d", meals: { breakfast: meal }, extras: [] } }, rule({ closes: { meals: ["breakfast", "dinner"] } }));
check("…the food bead fills by the meals that count", [st.ring.find((r) => r.key === "food").value, st.leftMeals], [0.5, ["dinner"]]);
check("…and the headline asks for the one left", headline(st, 0, 19).todos.map((t) => t.label), ["Dinner"]);
st = dayStatus({ entries: 0 }, rule({ requireWeight: false, closes: { checkin: false, journal: false, food: false, activity: false } }));
check("nothing at all counting reads as the check-in", [st.taskCount, st.counts.checkin, st.closed], [1, true, false]);
check("a fresh day says how many things close it, in words", [headline(dayStatus(undefined, rule({ closes: { journal: false, food: false } })), 0, 9).sub, headline(st, 0, 9).sub], ["Good morning. Three things close it.", "Good morning. One thing closes it."]);
check("what is not counted is still done or not", dayStatus({ entries: 2 }, rule({ closes: { journal: false } })).journalDone, true);
check("the meals in words", [mealsWord(["breakfast", "lunch", "snack", "dinner"]), mealsWord(["breakfast", "lunch", "dinner"]), mealsWord(["dinner"])], ["all four meals", "breakfast, lunch and dinner", "dinner"]);

console.log("the app and the server judge a day the same way, whatever closes it");
const server = createRequire(import.meta.url)("../catalyst/functions/soma_jobs/closing.js");
const choices = [{}, { requireWeight: false }, { closes: { journal: false } }, { closes: { food: false, activity: false } }, { closes: { meals: ["breakfast", "dinner"] } }, { requireWeight: false, closes: { meals: ["lunch"], checkin: false } }, { requireWeight: false, closes: { checkin: false, journal: false, food: false, activity: false } }];
const shapes = [full("d", 180), full("d", undefined), { entries: 0 }, twoMeals, { ...twoMeals, weight: undefined, entries: 0 }, { checkin: { day: "d", mood: "Down", habits: {}, counts: {} }, log: { day: "d", meals: { lunch: meal }, extras: [] }, entries: 0, weight: 179 }];
let agree = 0, cases = 0;
for (const c of choices) for (const d of shapes) {
  cases++;
  const r = server.closingRules(c);
  const facts = { weight: d.weight !== undefined, mood: d.checkin?.mood ?? null, entries: d.entries, meals: d.log?.meals || {}, pushups: d.activity?.pushups || 0, types: d.activity?.types || {}, steps: d.activity?.steps ?? null };
  if ((server.leftToday(facts, r.requireWeight, r.stepsGoal, r.counts).length === 0) === dayStatus(d, rule(c)).closed) agree++;
}
check(`all ${cases} cases agree`, agree, cases);

console.log("streak");
const today = new Date(2026, 8, 17, 12);
const key = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const map = { [key(0)]: full(key(0), 181), [key(1)]: full(key(1), 181.4), [key(2)]: full(key(2), undefined), [key(3)]: full(key(3), 182) };
check("a day without weight breaks the streak when it is required", streak(map, required, today, 60).now, 2);
check("…and does not when it is optional", streak(map, optional, today, 60).now, 4);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);

console.log("how long since");
const T = Date.parse("2026-09-22T12:00:00Z");
const ago = (mins) => since(T - mins * 60000, T);
check("a minute ago reads as just now", ago(1), "just now");
check("minutes", ago(14), "14 minutes ago");
check("one hour", ago(60), "1 hour ago");
check("hours", ago(300), "5 hours ago");
check("yesterday", ago(60 * 30), "yesterday");
check("days", ago(60 * 24 * 5), "5 days ago");
check("older than a fortnight falls back to the date", ago(60 * 24 * 40), "on 13 Aug");
check("never seen", since(null, T), "never");
check("a clock that ran ahead is not negative", since(T + 60000, T), "just now");
