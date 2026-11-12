// Someone's first days: when the first-day card and the week-one question show.
//   node --import ./scripts/ts-resolve.mjs scripts/test-first-days.mjs
import { daysIn, setUpItems, showFirstDay, showWeekOne, weekOneMessage, WEEK_ONE_QUESTION } from "../src/lib/first-days.ts";
import { mergeSettings } from "../src/lib/settings.ts";

let passed = 0; const failures = [];
const check = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, "\n       got ", JSON.stringify(got), "\n       want", JSON.stringify(want)); } };

const fresh = mergeSettings({ joined: "2026-11-11", moves: [] });
console.log("days in");
check("day one is 0, the next day 1, a week later 7", [daysIn("2026-11-11", "2026-11-11"), daysIn("2026-11-11", "2026-11-12"), daysIn("2026-11-11", "2026-11-18")], [0, 1, 7]);
check("across the end of daylight saving it is still whole days", daysIn("2026-10-31", "2026-11-02"), 2);
check("no joined day, no count", daysIn("", "2026-11-11"), null);

console.log("the first-day card");
check("asks what closes the day, then moves, food and the reminder, none done yet", setUpItems(fresh), [{ key: "closes", done: false }, { key: "moves", done: false }, { key: "food", done: false }, { key: "nudge", done: false }]);
check("shows on day one", showFirstDay(fresh, "2026-11-11"), true);
check("…and day two", showFirstDay(fresh, "2026-11-12"), true);
check("…not on day three", showFirstDay(fresh, "2026-11-13"), false);
check("never to someone who joined before it existed (David included)", showFirstDay(mergeSettings({ moves: [] }), "2026-11-11"), false);
check("put away, it stays away", showFirstDay({ ...fresh, firstDayAway: true }, "2026-11-11"), false);
const done = mergeSettings({ joined: "2026-11-11", closes: { chosen: true }, moves: [{ key: "walk", goal: 30 }], foodSetUp: true, nudge: { on: true, time: "20:30" } });
check("everything on it done, it goes", [setUpItems(done).every((x) => x.done), showFirstDay(done, "2026-11-11")], [true, false]);

console.log("the week-one question");
check("not before the seventh day", [5, 6].map((n) => showWeekOne(fresh, `2026-11-${11 + n}`, false)), [false, true]);
check("asked for a week, then dropped", [13, 14].map((n) => showWeekOne(fresh, `2026-11-${11 + n}`, false)), [true, false]);
check("once: answered or put away, never again", [showWeekOne({ ...fresh, weekOne: "sent" }, "2026-11-18", false), showWeekOne({ ...fresh, weekOne: "skipped" }, "2026-11-18", false)], [false, false]);
check("never to an admin", showWeekOne(fresh, "2026-11-18", true), false);
check("a stored answer reads as one of the two, anything else as not asked", [mergeSettings({ weekOne: "sent" }).weekOne, mergeSettings({ weekOne: "maybe" }).weekOne], ["sent", ""]);
check("the answer carries the question", weekOneMessage("  Remembering to weigh in.  "), `${WEEK_ONE_QUESTION}\n\nRemembering to weigh in.`);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
