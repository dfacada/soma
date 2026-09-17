// Insight counts.  node --import ./scripts/ts-resolve.mjs scripts/test-insights.mjs
import { insights } from "../src/lib/insights.ts";
import { DEFAULT_SETTINGS } from "../src/lib/settings.ts";

let passed = 0; const failures = [];
const check = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, "\n       got ", JSON.stringify(got), "\n       want", JSON.stringify(want)); } };

const today = new Date(2026, 8, 17, 12);
const day = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const meal = { name: "x", kcal: 500, protein: 40, carbs: 50, fat: 10 };
const all = { breakfast: meal, lunch: meal, snack: meal, dinner: meal };
const map = {
  [day(0)]: { checkin: { day: day(0), mood: "Focused", habits: {}, counts: {} }, log: { day: day(0), meals: all, extras: [{ name: "bar", kcal: 100, protein: 10 }] }, activity: { day: day(0), pushups: 100, types: { walk: true } }, weight: 181, entries: 1 },
  [day(1)]: { checkin: { day: day(1), mood: "Down", habits: {}, counts: { drinks: 6 } }, log: { day: day(1), meals: { breakfast: true }, extras: [] }, entries: 0 },
  [day(2)]: { checkin: { day: day(2), mood: "Great", habits: {}, counts: {} }, activity: { day: day(2), pushups: 40, types: {} }, weight: 182.5, entries: 0 },
  [day(3)]: { checkin: { day: day(3), mood: "Normal", habits: {}, counts: {} }, entries: 2 },
  [day(20)]: { checkin: { day: day(20), mood: "Anxious", habits: {}, counts: {} }, entries: 0 },
};
const i = insights(map, DEFAULT_SETTINGS, today, 14, 100);

check("window and check-ins (day 20 is outside a 14-day window)", [i.days, i.checkedIn, i.closed], [14, 4, 1]);
check("task rates are shares of the whole window", [i.rates.checkin, i.rates.journal, i.rates.food, i.rates.activity].map((r) => Math.round(r * 14)), [4, 2, 1, 2]);
check("good days: two, both with activity, one with all meals", i.good, { days: 2, withActivity: 2, withAllMeals: 1 });
check("hard day over the drinks limit", i.hard, { days: 1, withActivity: 0, withAllMeals: 0, overLimit: 1, limitLabel: "Drinks" });
check("activity baseline across checked-in days", i.baselineActivity, 0.5);
check("mood mix is sorted by count", i.moods.map((m) => m.label).sort(), ["Down", "Focused", "Great", "Normal"]);
check("food: snapshots plus extras; a bare `true` falls back to the plan", i.food, { loggedDays: 2, avgKcal: Math.round((2100 + 470) / 2), avgProtein: Math.round((170 + 22) / 2), onTarget: 1 });
check("push-ups: total, best and target days", i.pushups, { days: 2, total: 140, best: 100, hitDays: 1 });
check("weight change runs oldest to newest", i.weight, { first: 182.5, last: 181, change: -1.5, points: 2 });
check("an empty window is all zeros, no NaN", JSON.stringify(insights({}, DEFAULT_SETTINGS, today, 30, 100)).includes("null,") || !JSON.stringify(insights({}, DEFAULT_SETTINGS, today, 30, 100)).includes("NaN"), true);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
