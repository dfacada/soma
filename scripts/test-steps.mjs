// Steps as Soma shows them (src/lib/steps.ts): the short numbers, the days, the summary and the chart's scale.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-steps.mjs

import { kSteps, lastDays, scaleOf, summaryOf } from "../src/lib/steps.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };
const day = (steps) => ({ entries: 0, activity: { day: "", pushups: null, types: {}, steps } });

console.log("short numbers");
check("8,889 is 8.9k", kSteps(8889) === "8.9k", kSteps(8889));
check("12,345 is 12.3k", kSteps(12345) === "12.3k", kSteps(12345));
check("a round thousand drops the .0", kSteps(10000) === "10k" && kSteps(8000) === "8k");
check("2,500 is 2.5k", kSteps(2500) === "2.5k");
check("under a thousand as it is", kSteps(950) === "950" && kSteps(0) === "0");
check("never negative", kSteps(-20) === "0");

console.log("the days");
const map = { "2026-11-04": day(3200), "2026-11-03": day(8889), "2026-11-01": day(12345), "2026-10-31": day(0), "2026-10-29": day(6100) };
const week = lastDays(map, "2026-11-04");
check("seven days ending with the chosen one, oldest first", week.length === 7 && week[6].key === "2026-11-04" && week[0].key === "2026-10-29", week.map((d) => d.key));
check("a day with nothing reported is null, not skipped", week[5].steps === 8889 && week[4].steps === null);
check("zero stays zero in the days", week[2].steps === 0);
check("thirty days reach back across the month", lastDays(map, "2026-11-04", 30)[0].key === "2026-10-06");
check("no map: every day null", lastDays(null, "2026-11-04").every((d) => d.steps === null));

console.log("the summary");
const past = summaryOf(week, 8000);
check("days with steps; zero is not a day with steps", past.days === 4, past);
check("days at or over the goal", past.met === 2, past);
check("every day with steps is counted once the days are over", past.counted === 4, past);
check("the average of the days with steps", past.avg === Math.round((3200 + 8889 + 12345 + 6100) / 4), past);
check("the best day", past.best.key === "2026-11-01" && past.best.steps === 12345, past.best);
const open = summaryOf(week, 8000, "2026-11-04");
check("today under the goal is left out until it's over", open.counted === 3 && open.met === 2, open);
check("and never drags the average down", open.avg === Math.round((8889 + 12345 + 6100) / 3), open);
const done = summaryOf(lastDays({ ...map, "2026-11-04": day(9100) }, "2026-11-04"), 8000, "2026-11-04");
check("today over the goal counts as soon as it gets there", done.counted === 4 && done.met === 3, done);
check("but stays out of the average", done.avg === Math.round((8889 + 12345 + 6100) / 3), done);
check("nothing at all: zeros and no best", JSON.stringify(summaryOf(lastDays(null, "2026-11-04"), 8000)) === JSON.stringify({ days: 0, counted: 0, met: 0, avg: 0, best: null }));

console.log("the scale");
const a = scaleOf([3200, 8889, 12345, 6100], 8000);
check("a little room above the tallest day, not a whole gridline", a.top > 12345 && a.top < 12345 * 1.2, a);
check("round gridlines under the top", a.ticks.join() === "5000,10000", a);
const b = scaleOf([4000, 6000], 10000);
check("the goal sets the top when every day is under it", b.top > 10000 && b.top < 12000 && b.ticks.includes(10000), b);
const c = scaleOf([], 8000);
check("no days: the goal still fits", c.top > 8000 && c.ticks.length >= 1 && c.ticks.length <= 4, c);
const d = scaleOf([60000], 8000);
check("a huge day still gets four gridlines at most", d.top > 60000 && d.ticks.length <= 4, d);
check("every gridline sits inside the chart", [a, b, c, d].every((s) => s.ticks.every((t) => t > 0 && t <= s.top)));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
