// Round rules. The rest-day schedule and set breakdown are asserted against the original spreadsheet's numbers
// (via the 100 Push-Ups app's parity suite); the streak and scoring cases pin what Soma changed and what it kept.
//
//   node scripts/test-round.mjs

import { addDaysIso, chain, dayIndexOf, defaultRestDays, diffDays, leaderboard, memberStats, phaseOf, setBreakdown } from "../src/lib/round.ts";

let passed = 0; const failures = [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (name, got, want) => { if (same(got, want)) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, "\n       got ", JSON.stringify(got), "\n       want", JSON.stringify(want)); } };

const round = { id: "1", name: "Round 1", startDate: "2026-09-01", lengthDays: 90, restDays: defaultRestDays(90), bonusHit: 30, bonusStreak: 10, badgeStreak: 7, badgeHits: 30, joinOpen: true, archived: false };
const me = { userId: "a", displayName: "A", dailyTarget: 100, startDay: 1, joinSeq: 1, status: "active" };
const on = (day) => addDaysIso(round.startDate, day - 1);

console.log("dates and schedule");
check("the spreadsheet's 90-day rest schedule", defaultRestDays(90), [7, 14, 21, 28, 35, 42, 46, 49, 53, 56, 60, 63, 67, 70, 74, 77, 81, 84, 88]);
check("a 30-day round rests weekly", defaultRestDays(30), [7, 14, 21, 28]);
check("day 1 is the start date", dayIndexOf(round, "2026-09-01"), 1);
check("across a month end", dayIndexOf(round, "2026-10-01"), 31);
check("across the DST change in November", diffDays("2026-10-31", "2026-11-02"), 2);
check("addDays round-trips", addDaysIso("2026-12-31", 1), "2027-01-01");
check("phase: upcoming", phaseOf(round, "2026-08-31"), "upcoming");
check("phase: the last day is still running", phaseOf(round, on(90)), "running");
check("phase: finished the day after", phaseOf(round, on(91)), "finished");
check("phase: archived wins", phaseOf({ ...round, archived: true }, on(5)), "archived");
check("sets: 53 is 3 × 18, as the sheet had it", setBreakdown(53), { sets: 3, reps: 18 });
check("sets: 100 is 6 × 17", setBreakdown(100), { sets: 6, reps: 17 });
check("sets: never fewer than two", setBreakdown(20), { sets: 2, reps: 10 });

console.log("streaks");
const s = (log, today, m = me) => { const r = memberStats(round, m, log, on(today)); return [r.hits, r.scored, r.currentStreak, r.bestStreak]; };
check("six hits, then the rest day carries the streak", s({ 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100 }, 8), [6, 6, 6, 6]);
check("…and day 8 extends it to seven", s({ 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100, 8: 100 }, 8), [7, 7, 7, 7]);
check("reps on a rest day change nothing", s({ 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100, 7: 250 }, 8), [6, 6, 6, 6]);
check("a missed day resets the streak but best is kept", s({ 1: 100, 2: 100, 4: 100 }, 5), [3, 4, 1, 2]);
check("a short day is a miss", s({ 1: 100, 2: 99, 3: 100 }, 4), [2, 3, 1, 1]);
check("a logged zero is a miss", s({ 1: 100, 2: 0 }, 3), [1, 2, 0, 1]);
check("today, not yet hit, does not break the streak", s({ 1: 100, 2: 100 }, 3), [2, 2, 2, 2]);
check("today, once hit, counts", s({ 1: 100, 2: 100, 3: 100 }, 3), [3, 3, 3, 3]);
check("yesterday missed does break it, even if today is open", s({ 1: 100 }, 3), [1, 2, 0, 1]);
check("over target still one hit", s({ 1: 140 }, 2), [1, 1, 1, 1]);
check("a mid-round joiner is not handed misses", s({ 40: 50, 41: 50 }, 42, { ...me, dailyTarget: 50, startDay: 40 }), [2, 2, 2, 2]);
check("days after the round ends are ignored", s({ 89: 100, 90: 100 }, 140), [2, 77 - 6, 2, 2]);
check("before the round starts there is nothing", s({}, -3), [0, 0, 0, 0]);

console.log("leaderboard");
const members = [
  me,
  { userId: "b", displayName: "B", dailyTarget: 30, startDay: 1, joinSeq: 2, status: "active" },
  { userId: "c", displayName: "C", dailyTarget: 100, startDay: 1, joinSeq: 3, status: "active" },
  { userId: "d", displayName: "D", dailyTarget: 100, startDay: 1, joinSeq: 4, status: "removed" },
];
const logs = { a: { 1: 100, 2: 100, 3: 40 }, b: { 1: 30, 2: 30, 3: 30 }, c: { 1: 100, 2: 100, 3: 40 }, d: { 1: 100, 2: 100, 3: 100 } };
const board = leaderboard(round, members, logs, on(4));
check("own target: 30 a day beats 100 a day when it is kept", board.map((r) => r.userId), ["b", "a", "c"]);
check("points are hits × 30 + best streak × 10, reps excluded", board.map((r) => r.points), [3 * 30 + 3 * 10, 2 * 30 + 2 * 10, 2 * 30 + 2 * 10]);
check("ties break by join order", [board[1].userId, board[1].rank, board[2].userId, board[2].rank], ["a", 2, "c", 3]);
check("removed members drop out", board.some((r) => r.userId === "d"), false);
check("the leader is crowned", board[0].badges, ["crown"]);
check("nobody is crowned on an empty board", leaderboard(round, members, {}, on(1)).flatMap((r) => r.badges), []);
const long = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, 100]));
check("a seven-day streak earns the badge", leaderboard(round, [me], { a: long }, on(9))[0].badges, ["crown", "streak"]);

console.log("chain grid");
const cells = chain(round, { ...me, startDay: 2 }, { 2: 100, 3: 10 }, on(4));
check("before, hit, miss, today, future", cells.slice(0, 6), ["before", "hit", "miss", "today", "future", "future"]);
check("rest days, past and future", [chain(round, me, {}, on(8))[6], cells[6]], ["rest", "futureRest"]);
check("one cell per day", cells.length, 90);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
