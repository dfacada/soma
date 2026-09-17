// Google Health payload parsing (catalyst/functions/soma_api/routes/health.js).  node scripts/test-health-parse.mjs
import { createRequire } from "node:module";
const { parse } = createRequire(import.meta.url)("../catalyst/functions/soma_api/routes/health.js");

let passed = 0; const failures = [];
const check = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, "\n       got ", JSON.stringify(got), "\n       want", JSON.stringify(want)); } };

console.log("steps");
check("a daily rollup point", parse.readPoint({ civilStartTime: { date: { year: 2026, month: 9, day: 7 } }, steps: { countSum: "9037" } }), { day: "2026-09-07", steps: 9037 });
check("a point with no count is dropped", parse.readPoint({ civilStartTime: { date: { year: 2026, month: 9, day: 7 } } }), null);

console.log("sleep");
const session = (startTime, endTime, asleep, extra = {}) => ({ sleep: Object.assign({
  interval: { startTime, endTime, startUtcOffset: "-14400s", endUtcOffset: "-14400s" },
  summary: { minutesAsleep: String(asleep), minutesAwake: "38", minutesInSleepPeriod: String(asleep + 38), stagesSummary: [{ type: "DEEP", minutes: "71" }, { type: "REM", minutes: "96" }, { type: "LIGHT", minutes: "250" }, { type: "AWAKE", minutes: "38" }] },
}, extra) });
const night = parse.readNight(session("2026-09-17T03:41:00Z", "2026-09-17T11:06:00Z", 417));
check("a night belongs to the local day you woke up on, in local clock time", night, { day: "2026-09-17", asleep: 417, awake: 38, inBed: 455, deep: 71, rem: 96, light: 250, start: "23:41", end: "07:06" });
check("a session ending before local midnight stays on that day", parse.readNight(session("2026-09-17T20:00:00Z", "2026-09-18T03:30:00Z", 400)).day, "2026-09-17");
check("naps are left out", parse.readNight(session("2026-09-17T18:00:00Z", "2026-09-17T18:40:00Z", 35, { metadata: { nap: true } })), null);
check("a session without minutes asleep is dropped", parse.readNight({ sleep: { interval: { endTime: "2026-09-17T11:06:00Z" }, summary: {} } }), null);
const merged = parse.mergeNights([parse.readNight(session("2026-09-17T09:00:00Z", "2026-09-17T11:00:00Z", 100)), parse.readNight(session("2026-09-17T03:00:00Z", "2026-09-17T08:00:00Z", 280))]);
check("two sessions ending on one day are one night", [merged.length, merged[0].asleep, merged[0].start, merged[0].end, merged[0].deep], [1, 380, "23:00", "07:00", 142]);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
