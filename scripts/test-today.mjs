// What closes a day.  node --import ./scripts/ts-resolve.mjs scripts/test-today.mjs
import { dayStatus, headline, streak } from "../src/lib/today.ts";
import { DEFAULT_SETTINGS } from "../src/lib/settings.ts";

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

console.log("streak");
const today = new Date(2026, 8, 17, 12);
const key = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const map = { [key(0)]: full(key(0), 181), [key(1)]: full(key(1), 181.4), [key(2)]: full(key(2), undefined), [key(3)]: full(key(3), 182) };
check("a day without weight breaks the streak when it is required", streak(map, required, today, 60).now, 2);
check("…and does not when it is optional", streak(map, optional, today, 60).now, 4);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
