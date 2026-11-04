// The Journal's rhythm (src/lib/journal-days.ts) and the question of the day (src/lib/prompts.ts).
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-journal-days.mjs

import { journalRun, lookBack, recentDays } from "../src/lib/journal-days.ts";
import { PROMPTS, promptFor } from "../src/lib/prompts.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };

const today = new Date(2026, 10, 3, 21, 0); // Tuesday 3 November 2026, 9 pm
const at = (daysAgo, hour = 20) => { const d = new Date(2026, 10, 3 - daysAgo, hour, 0); return d.getTime(); };
const entry = (daysAgo, hour) => ({ id: `e${daysAgo}-${hour ?? 20}`, createdMs: at(daysAgo, hour) });

console.log("the dots");
const dots = recentDays([entry(0), entry(2), entry(13), entry(14)], today);
check("fourteen days, oldest first, ending today", dots.length === 14 && dots[13].key === "2026-11-03" && dots[0].key === "2026-10-21", dots.map((d) => d.key));
check("a day with an entry is on, one without is off", dots[13].on && !dots[12].on && dots[11].on);
check("fifteen days ago is outside the strip", dots[0].on && dots.filter((d) => d.on).length === 3);

console.log("days in a row");
check("nothing: no run", journalRun([], today) === 0);
check("today, yesterday and the day before: three", journalRun([entry(0), entry(1), entry(2), entry(4)], today) === 3);
check("nothing yet today still counts the run up to yesterday", journalRun([entry(1), entry(2)], today) === 2);
check("a gap two days back ends it", journalRun([entry(2), entry(3)], today) === 0);
check("two entries on one day count once", journalRun([entry(0, 8), entry(0, 21), entry(1)], today) === 2);
check("just after midnight counts as that day", journalRun([{ id: "x", createdMs: new Date(2026, 10, 3, 0, 5).getTime() }], today) === 1);

console.log("looking back");
check("nothing near a month or a week: nothing", lookBack([entry(0), entry(3), entry(15)], today) === null);
const week = lookBack([entry(0), entry(7)], today);
check("a week ago to the day", week?.item.id === "e7-20" && week.label === "A week ago" && week.days === 7, week);
check("a day either side of the week still counts", lookBack([entry(8)], today)?.label === "8 days ago");
check("two days off the week does not", lookBack([entry(9)], today) === null);
const month = lookBack([entry(7), entry(30)], today);
check("a month ago comes before a week ago", month?.item.id === "e30-20" && month.label === "A month ago", month);
check("the closest to the mark wins", lookBack([entry(32), entry(29)], today)?.item.id === "e29-20");
check("on the same day, the earlier entry", lookBack([entry(7, 22), entry(7, 7)], today)?.item.id === "e7-7");

console.log("the question of the day");
check("every question ends with a question mark", PROMPTS.every((p) => p.endsWith("?")));
check("no question repeats", new Set(PROMPTS).size === PROMPTS.length);
check("the same all day", promptFor(new Date(2026, 10, 3, 0, 1)) === promptFor(new Date(2026, 10, 3, 23, 59)));
check("a new one tomorrow", promptFor(new Date(2026, 10, 3, 12)) !== promptFor(new Date(2026, 10, 4, 12)));
const fortnight = Array.from({ length: PROMPTS.length }, (_, i) => promptFor(new Date(2026, 10, 3 + i, 12)));
check("two weeks ask every question once", new Set(fortnight).size === PROMPTS.length);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
