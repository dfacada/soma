// The week maths behind the week in review: which week, when it is due, and what the numbers add up to.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-review.mjs

import { asSpeech, asText, lastWeek, reviewDue, weekDays, weekLabel, weekNumbers, weekStart } from "../src/lib/review.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };
const at = (iso) => new Date(iso);

console.log("which week");
check("a Wednesday belongs to its Monday", weekStart(at("2026-10-07T10:00:00")) === "2026-10-05");
check("a Monday is its own week start", weekStart(at("2026-10-05T00:30:00")) === "2026-10-05");
check("a Sunday belongs to the Monday before it", weekStart(at("2026-10-11T23:00:00")) === "2026-10-05");
check("last week is the one before this one", lastWeek(at("2026-10-07T10:00:00")) === "2026-09-28");
check("seven days, Monday first", weekDays("2026-09-28").join() === "2026-09-28,2026-09-29,2026-09-30,2026-10-01,2026-10-02,2026-10-03,2026-10-04");
check("a label inside one month", weekLabel("2026-09-07") === "7 to 13 September", weekLabel("2026-09-07"));
check("a label across two", weekLabel("2026-09-28") === "28 September to 4 October", weekLabel("2026-09-28"));

console.log("when it is due");
const sunday = { on: true, dayOfWeek: 0, time: "19:00" };     // Sunday evening
const monday = { on: true, dayOfWeek: 1, time: "08:00" };     // Monday morning
// Sunday the 4th, before 19:00: the moment that has passed is last Sunday, for the week before.
check("before the hour, the week on offer is the one before", reviewDue(at("2026-10-04T18:30:00"), [], sunday) === "2026-09-21", reviewDue(at("2026-10-04T18:30:00"), [], sunday));
check("…and nothing when that one is already written", reviewDue(at("2026-10-04T18:30:00"), ["2026-09-21"], sunday) === null);
check("Sunday evening covers the week ending that evening", reviewDue(at("2026-10-04T19:30:00"), ["2026-09-21"], sunday) === "2026-09-28", reviewDue(at("2026-10-04T19:30:00"), ["2026-09-21"], sunday));
check("still there on the Tuesday after, if it was missed", reviewDue(at("2026-10-06T09:00:00"), ["2026-09-21"], sunday) === "2026-09-28");
check("not written twice", reviewDue(at("2026-10-06T09:00:00"), ["2026-09-28"], sunday) === null);
check("off means never", reviewDue(at("2026-10-06T09:00:00"), [], { ...sunday, on: false }) === null);
check("Monday morning covers the week that ended the night before", reviewDue(at("2026-10-05T08:05:00"), [], monday) === "2026-09-28", reviewDue(at("2026-10-05T08:05:00"), [], monday));
check("Sunday night with a Monday setting still waits", reviewDue(at("2026-10-04T20:00:00"), ["2026-09-21"], monday) === null, reviewDue(at("2026-10-04T20:00:00"), ["2026-09-21"], monday));
check("weeks missed for a month give last week only, not a backlog", reviewDue(at("2026-10-27T09:00:00"), [], sunday) === "2026-10-19", reviewDue(at("2026-10-27T09:00:00"), [], sunday));

console.log("the numbers");
const days = [
  { day: "2026-09-28", closed: true, weight: 183.4, kcal: 2100, protein: 190, pushups: 100, activity: true, entries: 1 },
  { day: "2026-09-29", closed: false, kcal: 1900, protein: 150, pushups: 0, activity: false, entries: 2 },
  { day: "2026-09-30", closed: true, weight: 182.0, kcal: 2000, protein: 170, pushups: 100, activity: true, entries: 0 },
];
const n = weekNumbers(days);
check("closed days", n.daysClosed === 2 && n.of === 3, n);
check("weight change is first to last logged", n.weightChange === -1.4, n.weightChange);
check("averages count only days with food", n.avgKcal === 2000 && n.avgProtein === 170, n);
check("push-ups and active days add up", n.pushups === 200 && n.activeDays === 2, n);
check("entries add up", n.entries === 3, n.entries);
check("a week with nothing logged does not divide by zero", weekNumbers([]).avgKcal === null && weekNumbers([]).daysClosed === 0);

console.log("how it reads");
const review = { weekStart: "2026-09-28", synopsis: "A steady week.", remember: ["Call the dentist"], threads: ["Walking helped"], noticed: ["4 of 7 closed"], numbers: n, writtenMs: 0, entries: 3 };
const text = asText(review);
check("the text leads with the week", text.startsWith("Week in review · 28 September to 4 October"), text.slice(0, 60));
check("every part is in the text", ["A steady week.", "Call the dentist", "Walking helped", "4 of 7 closed"].every((x) => text.includes(x)));
check("the spoken version drops the bullets", !asSpeech(review).includes("·"), asSpeech(review));
check("the spoken version keeps the synopsis and what to remember", asSpeech(review).includes("A steady week.") && asSpeech(review).includes("Call the dentist"));
check("an empty section is left out, not left blank", !asText({ ...review, remember: [], threads: [], noticed: [] }).includes("Worth remembering"));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
