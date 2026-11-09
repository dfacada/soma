// Moves (src/lib/moves.ts and the server's catalyst/functions/soma_api/lib/moves.js): settings from before moves,
// the day-closing rule, what a save writes, and what a round counts, on both sides.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-moves.mjs

import { createRequire } from "node:module";
import * as mv from "../src/lib/moves.ts";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/lib/settings.ts";
import { dayStatus } from "../src/lib/today.ts";

const require = createRequire(import.meta.url);
// The server module needs its db helpers; they need nothing from Catalyst to load.
const server = require("../catalyst/functions/soma_api/lib/moves.js");

let passed = 0; const failures = [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail === undefined ? "" : JSON.stringify(detail)); } };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const keys = (s) => s.moves.map((m) => m.key).join(",");

console.log("settings from before moves");
const legacy = mergeSettings({});
check("nothing stored: push-ups as main, then walk, gym and run", keys(legacy) === "pushups,walk,gym,run" && legacy.mainMove === "pushups", legacy.moves);
check("the push-up goal is 100", legacy.moves[0].goal === 100);
const changed = mergeSettings({ pushupTarget: 60, activityTypes: [{ key: "walk", name: "Walk" }, { key: "pilates", name: "Pilates" }] });
check("a changed target and their own activity types come across", same(changed.moves, [{ key: "pushups", goal: 60 }, { key: "walk", goal: 30 }, { key: "pilates", name: "Pilates", unit: "session", goal: 1 }]), changed.moves);
check("the default settings are the same as nothing stored", same(DEFAULT_SETTINGS.moves, legacy.moves) && DEFAULT_SETTINGS.mainMove === "pushups");

console.log("chosen moves");
const fresh = mergeSettings({ moves: [] });
check("a new person's empty list stays empty: nobody new starts with push-ups", fresh.moves.length === 0 && fresh.mainMove === "", fresh);
const picked = mergeSettings({ moves: [{ key: "run", goal: 7.25 }, { key: "bogus" }, { key: "own-climb", name: "Climbing", unit: "min", goal: 45 }, { key: "run", goal: 3 }, { key: "Bad Key", goal: 1 }], mainMove: "own-climb" });
check("known moves, named moves of their own; repeats and nameless ones dropped", keys(picked) === "run,own-climb", picked.moves);
check("a km goal keeps one decimal", picked.moves[0].goal === 7.3, picked.moves[0]);
check("the main move is kept when it is one of them", picked.mainMove === "own-climb");
check("a main move that is not one of them falls back to the first", mergeSettings({ moves: [{ key: "yoga", goal: 20 }], mainMove: "run" }).mainMove === "yoga");
check("goals stay inside their range", mergeSettings({ moves: [{ key: "pushups", goal: 999999 }, { key: "walk", goal: -4 }, { key: "gym", goal: 7 }] }).moves.map((m) => m.goal).join(",") === "10000,30,1");
check("at most twelve", mergeSettings({ moves: Array.from({ length: 20 }, (_, i) => ({ key: `own-${i}`, name: `M${i}`, unit: "reps", goal: 5 })) }).moves.length === 12);
check("an own key is made unique", mv.ownKey("Rock climbing!", ["own-rock-climbing"]) === "own-rock-climbing-2");
check("steps take their goal from goals.steps", mv.movesOf({ moves: [{ key: "steps", goal: 1 }], goals: { steps: 6000 } })[0].goal === 6000);
const w = mv.withMove({ moves: [], mainMove: "" }, "run");
check("joining a run round gives someone with no moves a run, as main", same(w, { moves: [{ key: "run", goal: 5 }], mainMove: "run" }), w);
check("…and nothing when they have it already", mv.withMove({ moves: [{ key: "run", goal: 5 }], mainMove: "run" }, "run") === null);
check("minutes are not a move to add", mv.withMove({ moves: [], mainMove: "" }, "minutes") === null);

console.log("the day-closing rule");
const s = { moves: [{ key: "pushups", goal: 100 }, { key: "run", goal: 5 }], goals: { steps: 8000 } };
check("an amount closes it", mv.movedOn({ types: { run: { n: 3, u: "km" } } }, s));
check("a session closes it", mv.movedOn({ types: { gym: true } }, s));
check("a move no longer on the list still closes it (past days stay closed)", mv.movedOn({ types: { swim: { n: 20, u: "min" } } }, s));
check("cleared moves do not", !mv.movedOn({ pushups: 0, types: { walk: false, run: { n: 0, u: "km" } } }, s));
check("steps do not, for someone who did not choose them", !mv.movedOn({ steps: 20000, types: {} }, s));
const withSteps = { ...s, moves: [...s.moves, { key: "steps", goal: 1 }] };
check("steps do at the goal for someone who did", mv.movedOn({ steps: 8000 }, withSteps) && !mv.movedOn({ steps: 7999 }, withSteps));
const st = dayStatus({ entries: 0, activity: { day: "2026-11-08", pushups: 40, types: { run: { n: 3.2, u: "km" }, other: { n: 30, u: "min", label: "Hike" } } } }, { ...DEFAULT_SETTINGS, ...s });
check("Today counts the moves on the list that were logged", st.acts === 2 && st.actTotal === 2 && st.activityDone, [st.acts, st.actTotal, st.activityDone]);
check("someone with no moves has nothing to count but can still be done", dayStatus({ entries: 0, activity: { day: "x", pushups: null, types: { other: { n: 20, u: "min" } } } }, { ...DEFAULT_SETTINGS, moves: [] }).activityDone);

console.log("reading a day");
check("push-ups", same(mv.loggedOf({ pushups: 40 }, { key: "pushups", goal: 100 }), { done: true, n: 40, u: "reps" }));
check("a session or a toggle from before amounts", same(mv.loggedOf({ types: { walk: true } }, { key: "walk", goal: 30 }), { done: true, n: null, u: null }));
check("steps below the goal are there but not done", same(mv.loggedOf({ steps: 5000 }, { key: "steps", goal: 8000 }), { done: false, n: 5000, u: "steps" }));
const run = mv.movesOf(s)[1];
check("progress toward a km goal", mv.progressOf(run, { done: true, n: 2.5, u: "km" }) === 0.5);
check("a timed run can't be compared with a km goal", mv.progressOf(run, { done: true, n: 30, u: "min" }) === null);
check("words for an amount", [mv.amountText(run, { done: true, n: 3.25, u: "km" }), mv.amountText(mv.movesOf(s)[0], { done: true, n: 40, u: "reps" }), mv.goalText({ key: "yoga", unit: "min", goal: 20 })].join("|") === "3.25 km|40 push-ups|20 min");

console.log("saving a move");
const draft = { activity: { pushups: 0, types: { walk: true } } };
mv.applyMove(draft, { key: "run", n: 3.256, u: "km" });
mv.applyMove(draft, { key: "pushups", n: 25, u: "reps" });
mv.applyMove(draft, { key: "gym", n: 1, u: "session" });
mv.applyMove(draft, { key: "walk", n: null, u: "min" });
mv.applyMove(draft, { key: "other", n: 45, u: "min", label: "Hike" });
check("amounts, sessions and push-ups land where they belong; a cleared move goes", same(draft.activity, { pushups: 25, types: { run: { n: 3.26, u: "km" }, gym: true, other: { n: 45, u: "min", label: "Hike" } } }), draft.activity);
check("steps close the day only at the goal", mv.closesDay({ key: "steps", n: 9000, u: "steps" }, 8000) && !mv.closesDay({ key: "steps", n: 100, u: "steps" }, 8000) && mv.closesDay({ key: "gym", n: 1, u: "session" }, 8000));
check("the toast says a goal was hit", mv.savedLine(run, { key: "run", n: 5, u: "km" }, { goal: 5, rest: false }, false) === "Goal hit · run 5 km");
check("…and push-ups say their name once", mv.savedLine(mv.movesOf(s)[0], { key: "pushups", n: 40, u: "reps" }, { goal: 100, rest: false }, false) === "40 push-ups logged");
check("…or that a late day is the record's, not the round's", mv.savedLine(run, { key: "run", n: 5, u: "km" }, { goal: 5, rest: false }, true) === "5 km saved to your record · too late to count for the round");
check("…or names Other by what it was", mv.savedLine(mv.OTHER_MOVE, { key: "other", n: 45, u: "min", label: "Hike" }, { goal: 30, rest: false }, false) === "Hike logged · 45 min");

console.log("what the server keeps");
check("a clean day passes, cleared moves dropped, km to two places", same(server.cleanTypes({ run: { n: 3.256, u: "km" }, gym: true, walk: false, yoga: { n: 0, u: "min" } }), { run: { n: 3.26, u: "km" }, gym: true }));
check("an Other label is kept, trimmed", same(server.cleanTypes({ other: { n: 30, u: "min", label: "  Hike " } }), { other: { n: 30, u: "min", label: "Hike" } }));
check("a key from before moves (pilates, x1699…) still saves", same(server.cleanTypes({ pilates: true, x1699999999999: true }), { pilates: true, x1699999999999: true }));
check("a wrong unit is refused", throws(() => server.cleanTypes({ run: { n: 3, u: "miles" } })));
check("too much in a day is refused", throws(() => server.cleanTypes({ walk: { n: 2000, u: "min" } })));
check("a key that is not a short word is refused", throws(() => server.cleanTypes({ "<script>": true })));
check("more than 24 moves in a day is refused", throws(() => server.cleanTypes(Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`m${i}`, true])))));
check("an array is refused", throws(() => server.cleanTypes([true])));

console.log("rounds: kinds and targets");
check("the kinds are the same on both sides", same(mv.ROUND_KINDS.map((k) => [k.kind, k.unit, k.scale, k.def, k.min, k.max]), Object.entries(server.ROUND_KINDS).map(([kind, k]) => [kind, k.unit, k.scale, k.def, k.min, k.max])));
check("no kind is push-ups, on both sides", mv.kindOf(undefined).kind === "pushups" && server.kindOf(null) === "pushups" && server.kindOf("nonsense") === "pushups");
check("an unknown kind is refused when making a round", throws(() => server.needKind("chess")) && server.needKind(undefined) === "pushups");
const runK = mv.kindOf("run");
check("km targets are kept in metres", mv.targetKept(runK, 5) === 5000 && mv.targetShown(runK, 2500) === 2.5 && mv.targetText(runK, 2500) === "2.5 km");
check("push-up targets read as push-ups, short on the board", mv.targetText(mv.kindOf("pushups"), 100) === "100 push-ups" && mv.targetText(mv.kindOf("pushups"), 100, true) === "100");
check("the target stepper stays on its step and in range", mv.stepTarget(runK, 5000, 1) === 5500 && mv.stepTarget(runK, 100, -1) === 100 && mv.stepTarget(mv.kindOf("minutes"), 5, -1) === 1);
check("a target outside its kind's range is refused", throws(() => server.needTarget("run", 50)) && throws(() => server.needTarget("pushups", 1.5)) && server.needTarget("steps", 10000) === 10000);
check("your own goal is your target in a round of that move", mv.keptGoalFor(runK, { moves: [{ key: "run", goal: 3.5 }], goals: { steps: 8000 } }) === 3500);
check("…the kind's default without one", mv.keptGoalFor(mv.kindOf("yoga"), { moves: [], goals: { steps: 8000 } }) === 20);
check("the server agrees, from the same settings", server.goalForKind({ moves: [{ key: "run", goal: 3.5 }] }, "run") === 3500 && server.goalForKind({ moves: [] }, "yoga") === 20);
check("the server reads a push-up target from before moves", server.goalForKind({ pushupTarget: 60 }, "pushups") === 60 && server.goalForKind({ moves: [], pushupTarget: 60 }, "pushups") === 100);
check("the server reads the steps goal", server.goalForKind({ goals: { steps: 12000 } }, "steps") === 12000);

console.log("rounds: what a day counts, the same on both sides");
const days = [
  { pushups: 40, types: { run: { n: 3.2, u: "km" }, yoga: { n: 20, u: "min" }, walk: true }, steps: 9000 },
  { pushups: null, types: { run: { n: 30, u: "min" }, other: { n: 45, u: "min", label: "Hike" } }, steps: null },
  { pushups: 0, types: { gym: true } },
  { types: {} },
  undefined,
];
const want = {
  pushups: [40, null, 0, null, null], run: [3200, 0, null, null, null], walk: [0, null, null, null, null],
  yoga: [20, null, null, null, null], minutes: [20, 75, null, null, null], steps: [9000, null, null, null, null],
};
for (const [kind, expect] of Object.entries(want)) {
  const app = days.map((d) => mv.roundAmount(kind, d));
  const srv = days.map((d) => server.roundAmount(kind, d));
  check(`${kind}: ${expect.join(", ")}`, same(app, expect) && same(srv, expect), { app, srv });
}
check("a move logged counts for its own kind, and minutes take every timed move", mv.countsFor(runK, "run", "km") && !mv.countsFor(runK, "run", "min") && mv.countsFor(mv.kindOf("minutes"), "yoga", "min") && !mv.countsFor(mv.kindOf("minutes"), "pushups", "reps"));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => " - " + f).join("\n")); process.exit(1); }
