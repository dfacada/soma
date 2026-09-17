// Insight counts.  node --import ./scripts/ts-resolve.mjs scripts/test-insights.mjs
import { dayLog, insights } from "../src/lib/insights.ts";
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
check("task rates are shares of the whole window", [i.rates.checkin, i.rates.journal, i.rates.food, i.rates.weight, i.rates.activity].map((r) => Math.round(r * 14)), [4, 2, 1, 2, 2]);
check("good days: two, both with activity, one with all meals", i.good, { days: 2, withActivity: 2, withAllMeals: 1 });
check("hard day over the drinks limit", i.hard, { days: 1, withActivity: 0, withAllMeals: 0, overLimit: 1, limitLabel: "Drinks" });
check("activity baseline across checked-in days", i.baselineActivity, 0.5);
check("mood mix is sorted by count", i.moods.map((m) => m.label).sort(), ["Down", "Focused", "Great", "Normal"]);
check("food: snapshots plus extras; a bare `true` falls back to the plan", i.food, { loggedDays: 2, avgKcal: Math.round((2100 + DEFAULT_SETTINGS.plan.breakfast.kcal) / 2), avgProtein: Math.round((170 + DEFAULT_SETTINGS.plan.breakfast.protein) / 2), onTarget: 1 });
check("push-ups: total, best and target days", i.pushups, { days: 2, total: 140, best: 100, hitDays: 1 });
check("weight change runs oldest to newest", i.weight, { first: 182.5, last: 181, change: -1.5, points: 2 });
check("an empty window is all zeros, no NaN", JSON.stringify(insights({}, DEFAULT_SETTINGS, today, 30, 100)).includes("null,") || !JSON.stringify(insights({}, DEFAULT_SETTINGS, today, 30, 100)).includes("NaN"), true);

// ── Sleep and "what best days have in common": four good days, four others, eight known nights.
console.log("sleep and factors");
const ci = (n, mood, habits = {}) => ({ day: day(n), mood, habits, counts: {} });
const night = (asleep, start) => ({ asleep, awake: 30, inBed: asleep + 30, deep: 60, rem: 90, light: asleep - 150, start, end: "07:00" });
const walk = DEFAULT_SETTINGS.activityTypes[0];
const big = {}, nights = {};
[["Focused", 470, "22:50", true, 9000], ["Great", 455, "23:10", true, 8500], ["Peaceful", 430, "23:40", true, 4000], ["Focused", 380, "00:20", false, 8200],
 ["Down", 340, "01:10", false, 3000], ["Anxious", 350, "00:40", false, 2500], ["Normal", 400, "23:30", true, 5000], ["Tired", 300, "01:30", false, null]].forEach(([mood, asleep, start, walked, steps], n) => {
  big[day(n)] = { checkin: ci(n, mood), activity: { day: day(n), pushups: null, types: { [walk.key]: walked }, steps }, entries: 0 };
  nights[day(n)] = night(asleep, start);
});
const s = insights(big, DEFAULT_SETTINGS, today, 14, 100, nights);
check("sleep: nights, average, the night before good and hard days", [s.sleep.nights, s.sleep.avg, s.sleep.goodAvg, s.sleep.hardAvg], [8, 391, 434, 345]);
check("sleep buckets count checked-in nights and how many were good days", s.sleep.buckets.map((b) => [b.nights, b.good]), [[4, 1], [2, 1], [2, 2]]);
check("hard days after a night under six hours", [s.sleep.hardShort, s.sleep.hardNights], [2, 2]);
const f = (label) => s.factors.find((x) => x.label === label);
check("a factor is counted on both sides", f("Slept 7 hours or more"), { label: "Slept 7 hours or more", good: 3, goodDays: 4, rest: 0, restDays: 4, lift: 0.75 });
check("asleep before midnight reads the clock across midnight", [f("Asleep before midnight").good, f("Asleep before midnight").rest], [3, 1]);
check("the activity type is a factor under its own name", [f(walk.name).good, f(walk.name).rest], [3, 1]);
check("unknown steps are left out of both sides, not counted as a miss", [f("8,000 steps or more").goodDays, f("8,000 steps or more").restDays, f("8,000 steps or more").good], [4, 3, 3]);
check("factors are sorted, strongest on good days first", s.factors[0].label, "Slept 7 hours or more");
check("a factor with too few days on one side is not compared", f("Hit the push-up target"), undefined);
check("steps average skips unknown days", s.steps, { days: 7, avg: Math.round((9000 + 8500 + 4000 + 8200 + 3000 + 2500 + 5000) / 7) });
const bare = insights(big, DEFAULT_SETTINGS, today, 14, 100);
check("without nights there is no sleep insight and no sleep factor", [bare.sleep, bare.factors.some((x) => x.label.startsWith("Slept"))], [null, false]);

// ── The plain record: one row a day, newest first.
console.log("day log");
const log = dayLog(map, DEFAULT_SETTINGS, today, 14);
check("runs newest first and stops at the first day anything was logged", log.map((r) => r.day), [day(0), day(1), day(2), day(3)]);
check("a closed day: weight, five of five, nothing missed, what was done", log[0], { day: day(0), weight: 181, mood: "Focused", closed: true, done: 5, total: 5, missed: [], did: ["100 push-ups", "Walk"], empty: false });
check("an open day names what kept it open, in card order", [log[1].closed, log[1].done, log[1].missed, log[1].did], [false, 1, ["Weight", "Journal", "3 meals", "Activity"], []]);
check("no meals at all reads as Food, not 4 meals", log[2].missed, ["Journal", "Food"]);
check("steps show when known", dayLog(big, DEFAULT_SETTINGS, today, 14)[0].did, ["Walk", "9,000 steps"]);
check("a gap inside the record stays in as an empty day", dayLog({ [day(0)]: map[day(0)], [day(2)]: map[day(2)] }, DEFAULT_SETTINGS, today, 14).map((r) => r.empty), [false, true, false]);
check("weight not required: it is not listed as missed", dayLog(map, { ...DEFAULT_SETTINGS, requireWeight: false }, today, 14)[1].missed, ["Journal", "3 meals", "Activity"]);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
