// Insights that become experiments: one finding tried for three days, and how it went (src/lib/experiment.ts), with
// the words and lookups it needs from src/lib/great-days.ts. Pure, so it all runs here.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-experiment.mjs

import { cleanExperiment, cleanPlain, daysBefore, daysOf, didWords, EXPERIMENT_DAYS, isSealed, needsSeal, newExperiment, span, spanDates, todayLine, trialOf, verdictWords } from "../src/lib/experiment.ts";
import { greatDays, sidesFor, testFor } from "../src/lib/great-days.ts";
import { mainOf } from "../src/lib/moves.ts";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/lib/settings.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail === undefined ? "" : JSON.stringify(detail)); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const S = DEFAULT_SETTINGS;
// Wednesday 11 November 2026, at noon.
const today = new Date(2026, 10, 11, 12);
const x = newExperiment({ key: "habit:read", ask: "Read", label: "Read" }, today);

console.log("starting one");
check("it starts tomorrow and runs three days", x.from === "2026-11-12" && x.to === "2026-11-14" && EXPERIMENT_DAYS === 3, x);
check("it keeps the finding and its words, and no numbers", same(Object.keys(x).sort(), ["ask", "from", "key", "label", "to"]), x);
check("long words are cut to 80 characters", newExperiment({ key: "active", ask: "x".repeat(200), label: "y".repeat(200) }, today).ask.length === 80);
check("its days, first to last", same(daysOf(x), ["2026-11-12", "2026-11-13", "2026-11-14"]));
check("its days across a month's end", same(daysOf({ ...x, from: "2026-11-30", to: "2026-12-02" }), ["2026-11-30", "2026-12-01", "2026-12-02"]));
const before = daysBefore(x);
check("its 'before' is the 60 days up to the day before it starts", before.length === 60 && before[0] === "2026-09-13" && before[59] === "2026-11-11" && !before.includes(x.from), [before[0], before[59]]);

console.log("what settings may hold");
check("a good one is kept as it is", same(cleanExperiment(x), x));
check("nothing, or something that is not one, is none", [null, undefined, "x", 7, [], [x]].every((v) => cleanExperiment(v) === null));
check("a key that is not a finding's is none", ["Habit:read", "habit read", "<b>", "", "a", "habit:" + "x".repeat(70)].every((key) => cleanExperiment({ ...x, key }) === null));
check("dates that are not days, or run backwards, are none", [{ from: "2026-13-01" }, { to: "11/14/2026" }, { from: "2026-11-14", to: "2026-11-12" }].every((d) => cleanExperiment({ ...x, ...d }) === null));
check("longer than two weeks is none", cleanExperiment({ ...x, from: "2026-11-01", to: "2026-11-15" }) === null && cleanExperiment({ ...x, from: "2026-11-01", to: "2026-11-14" }) !== null);
check("no words to ask is none; no label reads as the ask", cleanExperiment({ ...x, ask: "  " }) === null && cleanExperiment({ ...x, label: undefined }).label === "Read");
check("anything else it carries is dropped", same(Object.keys(cleanExperiment({ ...x, kept: 99, before: { did: 4 } })).sort(), ["ask", "from", "key", "label", "to"]));
const sealed = { sealed: "QUJDREVGR0hJSktMTU5PUA==" };
check("a sealed one is kept as ciphertext only", same(cleanExperiment({ ...sealed, key: "sleep", ask: "Sleep 7 hours" }), sealed) && isSealed(cleanExperiment(sealed)) && !isSealed(x));
check("a seal that is not base64, too short or too long is none", [{ sealed: "not base64!" + "A".repeat(20) }, { sealed: "QUJD" }, { sealed: "A".repeat(2001) }, { sealed: 42 }].every((v) => cleanExperiment(v) === null));
check("only a plain one comes out of a seal", cleanPlain(sealed) === null && same(cleanPlain(x), x));
check("sleep rests on what the vault seals, so its experiment is sealed; a habit's is not", needsSeal("sleep") && !needsSeal("habit:read") && !needsSeal("active"));
check("settings start with none, keep a good one, and drop a bad one", mergeSettings({}).experiment === null && same(mergeSettings({ experiment: x }).experiment, x) && same(mergeSettings({ experiment: sealed }).experiment, sealed) && mergeSettings({ experiment: { key: "nope" } }).experiment === null);

console.log("while it runs");
const day = (mood, read) => ({ checkin: { day: "d", mood, habits: { read }, counts: {} }, entries: 0 });
const readTest = (map) => (k) => (map[k]?.checkin ? Boolean(map[k].checkin.habits.read) : undefined);
const run = (map, todayKey, b = null, test = readTest(map)) => trialOf(x, todayKey, test, map, S.moods, b);

const ahead = run({}, "2026-11-11");
check("before it starts: ahead, every day to come, nothing to say yet", ahead.phase === "ahead" && ahead.days.every((d) => d.when === "ahead" && d.did === undefined) && ahead.verdict === null && ahead.dayNo === 0);
check("…and Today says it starts tomorrow", todayLine(ahead).eyebrow === "Experiment · starts tomorrow" && todayLine(ahead).status === "3 days, then Insights says how they went.");

const mid = { "2026-11-12": day("Great", true) };
const two = run(mid, "2026-11-13");
check("day two: which day it is, the first done, today not yet, the last to come", two.phase === "running" && two.dayNo === 2 && two.days[0].did === true && two.days[0].great && two.days[1].when === "today" && two.days[1].did === undefined && two.days[2].when === "ahead", two.days);
check("…in words, day by day", same(two.days.map(didWords), ["Did it", "Not yet", "To come"]));
check("…and on Today", same(todayLine(two), { eyebrow: "Experiment · day 2 of 3", status: "Not yet today.", done: false }));
const doneToday = run({ ...mid, "2026-11-13": day(null, true) }, "2026-11-13");
check("done today, before any mood is picked: Today says so", same(todayLine(doneToday), { eyebrow: "Experiment · day 2 of 3", status: "Done today.", done: true }));
check("a day already past that did not have it says so, and one that cannot say says that", didWords({ when: "past", did: false }) === "Didn't" && didWords({ when: "past", did: undefined }) === "Not known");
check("while it runs there is no verdict yet", two.verdict === null && verdictWords(two, null) === null);

console.log("how it went");
const three = (moods, read = [true, true, true]) => Object.fromEntries(["2026-11-12", "2026-11-13", "2026-11-14"].map((k, i) => [k, day(moods[i], read[i])]));
const b = (didDays, didHits, didntDays, didntHits) => ({ did: { days: didDays, hits: didHits }, didnt: { days: didntDays, hits: didntHits } });

const held = run(three(["Great", "Tired", "Great"]), "2026-11-15", b(6, 4, 10, 3));
check("great more often than days without it had been: it held", held.phase === "finished" && held.verdict === "held" && held.kept === 3 && held.checked === 3 && held.great === 2 && held.since === 1, held);
const words = verdictWords(held, b(6, 4, 10, 3));
check("…said plainly, with the days before beside it", words.head === "It held up this time" && words.body === "Great on 2 of the 3 days you did it. In the two months before, your days were great 4 of 6 times when you did it, and 3 of 10 when you didn't.", words);
check("Today says it is finished, then lets it go after a few days", todayLine(held).eyebrow === "Experiment · finished" && run(three(["Great"]), "2026-11-18").since === 4);

check("less often than days without it: not this time", run(three(["Tired", "Tired", "Great"]), "2026-11-15", b(6, 4, 10, 5)).verdict === "not-this-time");
const even = run(three(["Great", "Tired", "Tired"], [true, true, false]), "2026-11-15", b(4, 2, 4, 2));
check("the same as days without it is about the same, not holding up", even.kept === 2 && even.great === 1 && even.verdict === "same" && verdictWords(even, null).head === "About the same as usual", even);
const close = run(three(["Great", "Tired", "Tired"], [true, true, false]), "2026-11-15", b(24, 14, 32, 15));
check("1 of 2 great against 15 of 32 before is too close to call", close.verdict === "same", close);
check("2 of 3 against a half is past the margin; so is 1 of 3", run(three(["Great", "Great", "Tired"]), "2026-11-15", null).verdict === "held" && run(three(["Great", "Tired", "Tired"]), "2026-11-15", null).verdict === "not-this-time");
check("with no days without it to compare against, half is the line", run(three(["Great", "Great", "Tired"]), "2026-11-15", b(5, 2, 0, 0)).verdict === "held" && run(three(["Great", "Tired", "Tired"]), "2026-11-15", b(5, 2, 0, 0)).verdict === "not-this-time");
check("…and the words then leave the days before out", verdictWords(run(three(["Great", "Great", "Tired"]), "2026-11-15"), null).body === "Great on 2 of the 3 days you did it.");
check("days without it only: that one figure", verdictWords(held, b(0, 0, 10, 3)).body.endsWith(" In the two months before, days without it were great 3 of 10 times."));

const notTried = run(three(["Great", "Tired", "Great"], [false, false, false]), "2026-11-15", b(6, 4, 10, 3));
check("never done: you didn't get to it", notTried.verdict === "not-tried" && verdictWords(notTried, null).head === "You didn't get to it");
const noMood = run(three([null, null, null]), "2026-11-15");
check("done, but no mood picked on any of those days: nothing to compare", noMood.verdict === "no-checkins" && noMood.kept === 3 && noMood.checked === 0 && verdictWords(noMood, null).body === "You did it on 3 days, but no mood was picked on them, and the mood is how Dayhub knows a great day.");
const someMood = run(three(["Great", null, "Great"]), "2026-11-15");
check("done on three, a mood on two: counted over the two", someMood.checked === 2 && verdictWords(someMood, null).body === "Great on 2 of the 2 days you did it and picked a mood.");
const nothing = run({}, "2026-11-15");
check("no record at all for those days: nothing to go on, never 'didn't'", nothing.verdict === "unknown" && verdictWords(nothing, null).head === "Nothing to go on");
const gone = run(three(["Great", "Great", "Great"]), "2026-11-15", null, null);
check("a finding that is no longer theirs cannot say either", gone.verdict === "unknown" && gone.days.every((d) => d.did === undefined));
check("a renamed mood of theirs still counts as they said", trialOf(x, "2026-11-15", readTest(three(["Brilliant", "Brilliant", "Brilliant"])), three(["Brilliant", "Brilliant", "Brilliant"]), S.moods.map((m) => (m.id === "great" ? { ...m, label: "Brilliant" } : m)), null).great === 3);

console.log("words");
check("its days, short", span(x) === "Thu to Sat" && spanDates(x) === "Thu 12 to Sat 14 Nov");
check("its days across a month's end", spanDates({ ...x, from: "2026-11-30", to: "2026-12-02" }) === "Mon 30 Nov to Wed 2 Dec");

console.log("what a finding asks for (great-days.ts)");
const days = Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
const meal = { name: "x", kcal: 500, protein: 60, carbs: 50, fat: 10 };
const map = {};
days.forEach((k, i) => {
  const good = i < 6;
  map[k] = {
    checkin: { day: k, mood: good ? "Great" : "Tired", habits: { read: good, meditate: i % 2 === 0 }, counts: { drinks: good ? 1 : 6 } },
    activity: good ? { day: k, pushups: 0, types: { walk: true } } : undefined,
    log: { day: k, meals: { breakfast: meal, lunch: meal, snack: meal, dinner: meal }, extras: [] },
    entries: 1,
  };
});
const main = { move: mainOf(S), goal: 100 };
const g = greatDays(map, days, S, main, null);
const ask = (key) => g.lifts.find((d) => d.key === key)?.ask;
check("every finding can be asked for", g.lifts.length > 0 && g.lifts.every((d) => typeof d.ask === "string" && d.ask.length > 0), g.lifts.map((d) => d.ask));
check("…in the words of something to do", ask("habit:read") === "Read" && ask("active") === "Get a move in" && ask("limit:drinks") === "Keep drinks to 4 or fewer", g.lifts.map((d) => [d.key, d.ask]));
const mv = testFor("move", map, S, main, null);
check("the main move is asked for with its goal", mv && mv.label === "Did your 100 push-ups" && mv.ask === "Do your 100 push-ups", mv && [mv.label, mv.ask]);
check("a finding that is no longer theirs is none", testFor("habit:nope", map, S, main, null) === null && testFor("nope", map, S, main, null) === null);
check("sleep can only say with the nights open", testFor("sleep", map, S, main, null).test(days[0]) === undefined && testFor("sleep", map, S, main, { [days[0]]: { asleep: 450 } }).test(days[0]) === true);
const sides = sidesFor("habit:read", map, days.slice(0, 2), S, main, null);
check("one finding's sides over any days, with no minimum", same(sides, { did: { days: 2, hits: 2 }, didnt: { days: 0, hits: 0 } }), sides);
check("…counting only days with a mood", same(sidesFor("habit:read", { ...map, [days[0]]: { ...map[days[0]], checkin: { ...map[days[0]].checkin, mood: null } } }, days.slice(0, 2), S, main, null), { did: { days: 1, hits: 1 }, didnt: { days: 0, hits: 0 } }));
check("the sides it is compared with match Insights' own counts", (() => { const d = g.lifts.find((l) => l.key === "habit:read"); const s2 = sidesFor("habit:read", map, days, S, main, null); return same(s2.did, d.did) && same(s2.didnt, d.didnt); })());

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
