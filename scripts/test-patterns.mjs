// Insights → Patterns maths (src/lib/patterns.ts), on David's real weigh-ins from 17 Sept – 21 Oct 2026.
//   node --import ./scripts/ts-resolve.mjs scripts/test-patterns.mjs

import { activityDays, byWeekday, heaviestWeekday, trailingAverage, weighIns } from "../src/lib/patterns.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };
const near = (a, b) => Math.abs(a - b) < 0.05;

const real = [["2026-09-17",203.4],["2026-09-18",203.3],["2026-09-19",201.7],["2026-09-20",203.4],["2026-09-21",206.5],["2026-09-22",204.8],["2026-09-23",202.6],["2026-09-24",203.1],["2026-09-25",203.1],["2026-09-27",202.3],["2026-09-28",202.8],["2026-09-29",205.1],["2026-09-30",204.3],["2026-10-01",201.7],["2026-10-02",202.3],["2026-10-03",203.5],["2026-10-04",203.2],["2026-10-05",207.4],["2026-10-06",203.7],["2026-10-07",203.1],["2026-10-08",203.7],["2026-10-09",203.5],["2026-10-10",203.2],["2026-10-12",203],["2026-10-13",204.9],["2026-10-14",204.3],["2026-10-15",202.1],["2026-10-16",201.7],["2026-10-17",203.3],["2026-10-18",207],["2026-10-19",205.2],["2026-10-20",202.8],["2026-10-21",201.8]];
const map = Object.fromEntries(real.map(([day, weight]) => [day, { weight, entries: 0 }]));
map["2026-10-14"].activity = { day: "2026-10-14", pushups: 0, types: { gym: true } };
map["2026-09-21"].activity = { day: "2026-09-21", pushups: 0, types: { walk: false } };
map["2026-09-17"].activity = { day: "2026-09-17", pushups: 30, types: {} };
const days = []; for (let d = new Date("2026-09-17T12:00:00"); d <= new Date("2026-10-21T12:00:00"); d.setDate(d.getDate() + 1)) days.push(d.toISOString().slice(0, 10));

console.log("reading the day map");
const points = weighIns(map, days);
check("every weigh-in, in order, missed days skipped", points.length === 33 && points[0].day === "2026-09-17" && points[32].day === "2026-10-21");
check("activity days: a ticked type or push-ups, not an unticked type", activityDays(map, days).join() === "2026-09-17,2026-10-14");

console.log("seven-day average");
const avg = trailingAverage(points);
check("the first average is the first weigh-in", near(avg[0].avg, 203.4));
check("a gap shortens the window instead of counting as zero (27 Sept: six weigh-ins)", near(avg.find((a) => a.day === "2026-09-27").avg, (206.5 + 204.8 + 202.6 + 203.1 + 203.1 + 202.3) / 6), avg.find((a) => a.day === "2026-09-27"));
check("the latest average is 15–21 Oct", near(avg[32].avg, (202.1 + 201.7 + 203.3 + 207 + 205.2 + 202.8 + 201.8) / 7), avg[32]);
check("five weeks hold within 203–204.5", avg.slice(7).every((a) => a.avg > 202.9 && a.avg < 204.5), avg.slice(7).map((a) => a.avg.toFixed(1)).join(" "));

console.log("by weekday");
const wd = byWeekday(points);
check("Monday first, five Mondays", wd[0].label === "Mon" && wd[0].weights.length === 5);
check("Monday averages 205.0", near(wd[0].mean, 205.0), wd[0].mean);
check("every weigh-in is counted once", wd.reduce((n, g) => n + g.weights.length, 0) === 33);
const top = heaviestWeekday(points);
check("Monday stands out, about 1.6 lb over the rest", top && top.label === "Mon" && top.over >= 1.4 && top.over <= 1.9, top);
check("too few weigh-ins say nothing", heaviestWeekday(points.slice(0, 7)) === null);
check("no weigh-ins, no crash", byWeekday([]).every((g) => g.mean === null) && trailingAverage([]).length === 0);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
