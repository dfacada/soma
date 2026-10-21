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

console.log("mood split by condition (chart A), on David's check-ins");
const { moodSplit, MIN_SIDE } = await import("../src/lib/patterns.ts");
const { DEFAULT_SETTINGS } = await import("../src/lib/settings.ts");
// [day, mood, protein (null = no food logged), meals, steps, active, drinks]
const rowsIn = [["2026-10-21","Normal",28,2,null,0,0],["2026-10-20","Normal",167,3,null,0,0],["2026-10-19","Normal",167,3,null,0,0],["2026-10-16","Normal",216,3,null,1,0],["2026-10-15","Great",167,3,null,1,0],["2026-10-14","Normal",167,3,null,1,0],["2026-10-13","Normal",null,0,1699,0,0],["2026-10-12","Normal",28,1,6469,0,0],["2026-10-10","Normal",52,1,11630,1,0],["2026-10-09","Tired",69,1,7813,1,0],["2026-10-08","Normal",181,4,11345,1,0],["2026-10-07","Great",192,4,12315,1,0],["2026-10-06","Great",192,4,13688,1,0],["2026-10-05","Tired",109,3,12085,0,0],["2026-10-04","Normal",null,0,6760,0,0],["2026-10-02","Normal",77,2,10334,0,0],["2026-09-30","Normal",null,0,11308,0,0],["2026-09-29","Normal",96,2,5808,0,0],["2026-09-28","Tired",null,0,3282,0,0],["2026-09-27","Tired",null,0,7912,0,0],["2026-09-25","Great",118,2,3573,0,0],["2026-09-24","Normal",118,2,8737,0,0],["2026-09-23","Normal",163,3,11451,1,0],["2026-09-22","Great",153,3,18626,1,0],["2026-09-21","Tired",211,4,4940,0,0],["2026-09-20","Normal",null,0,4232,0,7],["2026-09-19","Normal",null,0,18872,0,0],["2026-09-18","Great",167,4,7344,0,0],["2026-09-17","Great",192,4,13764,1,0]];
const MEALS = ["breakfast", "lunch", "snack", "dinner"];
const moodMap = Object.fromEntries(rowsIn.map(([day, mood, protein, meals, steps, active, drinks]) => [day, {
  entries: 0,
  checkin: { day, mood, habits: {}, counts: drinks ? { drinks } : {} },
  log: protein === null ? undefined : { day, extras: [], meals: Object.fromEntries(MEALS.slice(0, meals).map((m, i) => [m, { name: m, kcal: 500, protein: i === 0 ? protein : 0 }])) },
  activity: { day, pushups: 0, types: active ? { gym: true } : {}, steps },
}]));
const moodDays = rowsIn.map((r) => r[0]);
const s200 = { ...DEFAULT_SETTINGS, goals: { ...DEFAULT_SETTINGS.goals, protein: 200 } };
const split = moodSplit(moodMap, moodDays, s200, null);
const row = (label) => split.rows.find((r) => r.label.startsWith(label));
check("29 check-ins counted", split.checkedIn === 29, split.checkedIn);
check("protein goal 200 g: 2 days reach it, so not enough (option b)", row("Hit your 200 g").yes.days === 2 && row("Hit your 200 g").enough === false, row("Hit your 200 g"));
const s150 = moodSplit(moodMap, moodDays, { ...s200, goals: { ...s200.goals, protein: 150 } }, null).rows[0];
check("at a 150 g goal it is the preview's 6 of 13 good against 1 of 9", s150.yes.days === 13 && s150.yes.good === 6 && s150.no.days === 9 && s150.no.good === 1, s150);
check("10,000 steps: 4 of 11 good against 2 of 12", row("10,000").yes.days === 11 && row("10,000").yes.good === 4 && row("10,000").no.days === 12 && row("10,000").no.good === 2, row("10,000"));
check("all meals logged: 6 days, 4 good", row("All meals").yes.days === 6 && row("All meals").yes.good === 4 && row("All meals").enough);
check("Tired is not a hard day, as in the rest of Insights", split.rows.every((r) => r.yes.hard === 0 && r.no.hard === 0));
check("drinks over the limit: one day, not enough", row("Drinks").yes.days === 1 && !row("Drinks").enough, row("Drinks"));
check("no nights recorded, no sleep row", !split.rows.some((r) => r.label.startsWith("Slept")));
const nights = Object.fromEntries(moodDays.slice(0, 10).map((d, i) => [d, { asleep: i % 2 ? 450 : 360, awake: 0, inBed: 0, deep: 0, rem: 0, light: 0, start: "23:00", end: "07:00" }]));
const slept = moodSplit(moodMap, moodDays, s200, nights).rows.find((r) => r.label.startsWith("Slept"));
check("with nights, sleep is a row on the nights there are", slept && slept.yes.days === 5 && slept.no.days === 5 && slept.enough, slept);
check(`fewer than ${MIN_SIDE} on a side is never enough`, split.rows.every((r) => r.enough === (r.yes.days >= MIN_SIDE && r.no.days >= MIN_SIDE)));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
