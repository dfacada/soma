// Sleep as Soma shows it (src/lib/sleep.ts): the formatting, the stages, the evening axis and the week.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-sleep.mjs

import { clock12, hm, lastNights, stagesOf, weekOf, windowOf } from "../src/lib/sleep.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };
const night = (asleep, start, end, stages = [60, 200, 76], awake = 40) => ({ asleep, awake, inBed: asleep + awake, deep: stages[0], light: stages[1], rem: stages[2], start, end });

console.log("hours and minutes");
check("5h 36m", hm(336) === "5h 36m");
check("a whole hour drops the minutes", hm(480) === "8h");
check("under an hour is minutes", hm(45) === "45m");
check("nothing is 0m, never negative", hm(0) === "0m" && hm(-5) === "0m");

console.log("the clock");
check("evening", clock12("23:41") === "11:41 pm");
check("just after midnight", clock12("00:05") === "12:05 am");
check("noon", clock12("12:00") === "12:00 pm");
check("not a time: empty", clock12("") === "");

console.log("the stages");
const s = stagesOf(night(336, "00:41", "06:58", [52, 191, 93], 41));
check("deep, light, REM, awake, in that order", s.map((x) => x.key).join() === "deep,light,rem,awake", s);
check("the shares add up to one", Math.abs(s.reduce((n, x) => n + x.share, 0) - 1) < 1e-9);
check("each keeps its minutes", s[0].min === 52 && s[3].min === 41);
check("no stages reported: nothing to split", stagesOf(night(400, "23:00", "06:00", [0, 0, 0], 30)).length === 0);

console.log("the evening axis");
const w = windowOf(night(420, "23:00", "07:00"));
check("11 pm to 7 am sits a quarter to two-thirds along", Math.abs(w.from - 0.25) < 1e-9 && Math.abs(w.to - 13 / 20) < 1e-9, w);
check("after midnight still comes after the evening", windowOf(night(300, "01:30", "07:00")).from > windowOf(night(300, "23:30", "07:00")).from);
check("no bed time: no window", windowOf(night(300, "", "07:00")) === null);
check("an afternoon bedtime sits at the start, not the end", windowOf(night(300, "15:00", "20:00")).from === 0);

console.log("the week");
const nights = { "2026-11-03": night(336, "00:41", "06:58"), "2026-11-02": night(500, "23:10", "07:40"), "2026-10-30": night(420, "23:50", "07:00") };
const days = lastNights(nights, "2026-11-03");
check("seven nights ending with the chosen morning, oldest first", days.length === 7 && days[6].key === "2026-11-03" && days[0].key === "2026-10-28", days.map((d) => d.key));
check("a missing night is null, not skipped", days[5].night !== null && days[4].night === null);
const wk = weekOf(days, 480);
check("three nights, their average asleep", wk.nights === 3 && wk.avg === Math.round((336 + 500 + 420) / 3), wk);
check("nights at or over the goal", wk.met === 1);
// 00:41, 23:10 and 23:50 are 401, 310 and 350 minutes after 6 pm: 354 on average, 11:54 pm.
check("bedtimes either side of midnight average near midnight, not noon", wk.bed === "11:54 pm", wk.bed);
// 06:58, 07:40 and 07:00: 793 minutes after 6 pm on average, 7:13 am.
check("the usual wake time", wk.wake === "7:13 am", wk.wake);
check("no nights: zeros and no times", JSON.stringify(weekOf(lastNights(null, "2026-11-03"), 480)) === JSON.stringify({ nights: 0, avg: 0, met: 0, bed: "", wake: "" }));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
