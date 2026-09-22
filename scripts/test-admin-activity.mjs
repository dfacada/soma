// The admin activity monitor: rows a member wrote → the lines an admin reads (routes/admin.js summarize).
//
//   node scripts/test-admin-activity.mjs

import { summarize } from "../catalyst/functions/soma_api/routes/admin.js";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };

const ms = (day, hour = 9) => Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
const rows = {
  weight: [{ day: "2026-09-22" }, { day: "2026-09-20" }],
  checkins: [{ day: "2026-09-22", mood: "Great" }, { day: "2026-09-21", mood: null }],
  logs: [{ day: "2026-09-22", meals_json: JSON.stringify({ breakfast: true, lunch: { name: "Bowl", kcal: 700 }, snack: false }) }, { day: "2026-09-19", meals_json: "{}" }],
  activity: [
    { day: "2026-09-22", pushups: "100", types_json: JSON.stringify({ walk: true }), steps: "12000" },
    { day: "2026-09-20", pushups: "0", types_json: JSON.stringify({ walk: false }), steps: "4000" },
  ],
  entries: [{ created_ms: ms("2026-09-22") }, { created_ms: ms("2026-09-22", 21) }, { created_ms: ms("2026-09-18") }],
};
const out = summarize(rows, 14);

console.log("one line a day");
check("newest first", out.recent.map((d) => d.day).join() === "2026-09-22,2026-09-20,2026-09-18", out.recent.map((d) => d.day));
const top = out.recent[0];
check("a full day reads as full", top.weight && top.checkin && top.meals === 2 && top.activity && top.entries === 2, top);
check("a mood that was cleared is not a check-in", !out.recent.some((d) => d.day === "2026-09-21"), out.recent);
check("meals counts only what was eaten", top.meals === 2, top);
check("no push-ups and every activity off is not activity", out.recent.find((d) => d.day === "2026-09-20").activity === false);
check("a day with only weight still shows", out.recent.find((d) => d.day === "2026-09-20").weight === true);
check("a day with only a journal entry still shows", out.recent.find((d) => d.day === "2026-09-18").entries === 1);
check("days with nothing at all are left out", out.recent.length === 3 && !out.recent.some((d) => d.day === "2026-09-19"), out.recent);

console.log("the totals");
check("active days", out.activeDays === 3, out.activeDays);
check("entries", out.entries === 3, out.entries);
check("steps add up", out.steps === 16000, out.steps);
check("push-ups add up", out.pushups === 100, out.pushups);
check("last logged day", out.lastLoggedDay === "2026-09-22", out.lastLoggedDay);
check("the window is carried through", out.days === 14);

console.log("nothing logged");
const empty = summarize({ weight: [], checkins: [], logs: [], activity: [], entries: [] }, 14);
check("an empty member is empty, not a crash", empty.activeDays === 0 && empty.recent.length === 0 && empty.lastLoggedDay === null, empty);
check("broken JSON in a row does not throw", summarize({ weight: [], checkins: [], logs: [{ day: "2026-09-22", meals_json: "{oops" }], activity: [{ day: "2026-09-22", pushups: null, types_json: "nope", steps: null }], entries: [] }, 14).recent.length === 0);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
