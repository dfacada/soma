// Soma Ops' rules, on rows made up here: issues from signals, errors grouped into problems, a person's done-or-not
// days, the closed days the job keeps, cohorts, the funnel and the alerts. Also that the two copies of the closing
// rule are one file.
//
//   node scripts/test-ops.mjs

import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ops = require("../catalyst/functions/soma_api/lib/ops.js");
const job = require("../catalyst/functions/soma_jobs/ops.js");
const closing = require("../catalyst/functions/soma_jobs/closing.js");

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail === undefined ? "" : JSON.stringify(detail)); } };

const HOUR = 3600000, DAY = 86400000;
const now = Date.parse("2026-11-08T18:00:00Z");
const ago = (ms) => String(now - ms);
const people = new Map([["101", { name: "Priya Natarajan", email: "priya@example.com" }], ["102", { name: "Marcus", email: "m@example.com" }], ["103", { name: "", email: "ana.s@example.com" }]]);
const empty = () => ({ logs: [], repeats: [], spread: new Map(), pending: [], quiet: [], messages: [], feedback: [], subs: new Set(), nudgeOn: new Set(), people, states: new Map() });

console.log("the closing rule is one file");
check("soma_api's copy is soma_jobs' copy", fs.readFileSync(new URL("../catalyst/functions/soma_api/lib/closing.js", import.meta.url), "utf8") === fs.readFileSync(new URL("../catalyst/functions/soma_jobs/closing.js", import.meta.url), "utf8"));
check("steps close a day only for someone who chose Steps", closing.closingRules({ moves: [{ key: "steps" }], goals: { steps: 9000 } }).stepsGoal === 9000 && closing.closingRules({ moves: [{ key: "run" }] }).stepsGoal === null);

console.log("words");
check("names", ops.shortName("Priya Natarajan", "") === "Priya N." && ops.shortName("", "ana.s@example.com") === "ana.s" && ops.firstName("", "ana.s@example.com") === "Ana");
check("devices, and nothing finer", ops.deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)") === "iPhone" && ops.deviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)") === "Mac" && ops.deviceOf("") === "Unknown");
check("a time zone Node does not know is UTC", ops.zoneOr("Mars/Olympus") === "UTC" && ops.zoneOr("America/New_York") === "America/New_York" && ops.zoneOr("'; DROP") === "UTC");

console.log("issues come from signals still in the data");
{
  const s = empty();
  s.logs = [
    { user_id: "101", area: "google-health", event: "token_dead", lvl: "warn", created_ms: ago(3 * DAY), message: "x" },
    { user_id: "101", area: "google-health", event: "token_dead", lvl: "warn", created_ms: ago(2 * DAY), message: "x" },
    { user_id: "102", area: "google-health", event: "token_dead", lvl: "warn", created_ms: ago(3 * DAY) },
    { user_id: "102", area: "google-health", event: "connected", lvl: "info", created_ms: ago(1 * DAY) },
  ];
  const out = ops.detectIssues(s, now);
  check("Google ended it and they never reconnected: an issue", out.length === 1 && out[0].kind === "Fitbit" && out[0].userId === "101", out.map((i) => i.key));
  check("it says since when, and is not new after three days", /no steps since Nov 5/.test(out[0].meta) && out[0].isNew === false, out[0]);
  check("the message is ready, with their first name", out[0].template.startsWith("Hi Priya,"), out[0].template);
  check("reconnecting clears it", !out.some((i) => i.userId === "102"));
}
{
  const s = empty();
  s.logs = [
    { user_id: "101", area: "journal", event: "entries_unreadable", lvl: "warn", created_ms: ago(5 * HOUR), detail: JSON.stringify({ count: 6, of: 41, reasons: '{"OperationError":6}' }) },
    { user_id: "102", area: "journal", event: "entries_unreadable", lvl: "info", created_ms: ago(5 * HOUR), detail: "{}" },
    { user_id: "103", area: "journal", event: "entries_unreadable", lvl: "warn", created_ms: ago(3 * DAY), detail: "{}" },
  ];
  const out = ops.detectIssues(s, now);
  check("unreadable entries in the last two days are an issue, with how many", out.length === 1 && out[0].kind === "Journal" && /6 of 41/.test(out[0].meta), out.map((i) => i.meta));
  check("the app being away (info) and old ones are not", !out.some((i) => i.userId !== "101"));
}
{
  const s = empty();
  s.logs = [
    { user_id: "101", area: "push", event: "subscription_gone", lvl: "warn", created_ms: ago(DAY), http_status: "410" },
    { user_id: "102", area: "push", event: "subscription_gone", lvl: "warn", created_ms: ago(DAY) },
    { user_id: "103", area: "push", event: "subscription_gone", lvl: "warn", created_ms: ago(DAY) },
    { user_id: "102", area: "push", event: "send_failed", lvl: "error", created_ms: ago(2 * DAY), http_status: "503" },
    { user_id: "102", area: "push", event: "send_failed", lvl: "error", created_ms: ago(5 * HOUR), http_status: "503" },
  ];
  s.subs = new Set(["103"]); s.nudgeOn = new Set(["101", "103"]);
  const out = ops.detectIssues(s, now);
  check("a dropped phone with the nudge on and nothing replacing it", out.some((i) => i.key === "reminders:101:gone"), out.map((i) => i.key));
  check("not when the nudge is off, nor when another phone took over", !out.some((i) => i.key === "reminders:102:gone" || i.key === "reminders:103:gone"));
  check("sends failing on two nights", out.some((i) => i.key === "reminders:102:failing" && /2 nights/.test(i.meta)));
}
{
  const s = empty();
  s.logs = [1, 2].map((d) => ({ user_id: "101", area: "quota", event: "cap_reached", lvl: "info", created_ms: ago(d * DAY - HOUR), detail: JSON.stringify({ kind: "food", max: 60 }) }))
    .concat([{ user_id: "102", area: "quota", event: "cap_reached", lvl: "info", created_ms: ago(HOUR), detail: JSON.stringify({ kind: "food", max: 60 }) }]);
  const out = ops.detectIssues(s, now);
  check("a cap reached two days running is worth watching; once is not", out.length === 1 && out[0].kind === "AI limits" && out[0].sev === "watching" && /food estimate/.test(out[0].title), out.map((i) => i.title));
}
{
  const s = empty();
  s.repeats = [{ user_id: "101", area: "food", event: "estimate_failed", n: 14, first: now - 8 * HOUR, last: now - HOUR }];
  s.spread = new Map([["food.estimate_failed", 1]]);
  let out = ops.detectIssues(s, now);
  check("the same error 14 times for one person", out[0].title === "Same error, 14 times today" && /Only they get it/.test(out[0].fixLong));
  s.spread = new Map([["food.estimate_failed", 4]]);
  out = ops.detectIssues(s, now);
  check("and when others have it too, it says so", /3 other people have it too/.test(out[0].fix), out[0].fix);
}
{
  const s = empty();
  s.pending = [{ user_id: "103", email: "ana.s@example.com", created_ms: String(now - 2 * DAY - HOUR) }, { user_id: "104", email: "new@example.com", created_ms: String(now - HOUR) }];
  const out = ops.detectIssues(s, now);
  check("waiting more than a day for approval, with an Approve", out.length === 1 && out[0].title === "Waiting for approval 2 days" && out[0].approve === true, out.map((i) => i.title));
}
{
  const s = empty();
  const closedDays = Array.from({ length: 16 }, (_, i) => new Date(now - (7 + i) * DAY).toISOString().slice(0, 10));
  s.quiet = [{ user_id: "102", closed_json: JSON.stringify({ c: closedDays }), last_seen_ms: String(now - 6 * DAY) }];
  const out = ops.detectIssues(s, now);
  check("a regular who stopped six days ago", out.length === 1 && out[0].kind === "Gone quiet" && /closed 16 of 21 days/.test(out[0].meta), out.map((i) => i.meta));
  check("someone still opening Soma has not gone quiet", ops.quietOf({ c: closedDays }, now - DAY, now) === null);
  check("nor someone who never had a run", ops.quietOf({ c: closedDays.slice(0, 5) }, 0, now) === null);
}
{
  const s = empty();
  s.messages = [{ user_id: "101", body: "Food search doesn't know oat milk", created_ms: ago(HOUR) }];
  s.feedback = [{ user_id: "101", body: "older", CREATEDTIME: "2026-11-01 10:00:00:000" }];
  const out = ops.detectIssues(s, now);
  check("someone wrote and nobody answered: one issue a person, newest words", out.length === 1 && out[0].title === "Wrote to you 2 times" && /oat milk/.test(out[0].meta), out.map((i) => i.meta));
}
{
  const s = empty();
  s.logs = [{ user_id: "101", area: "google-health", event: "token_dead", lvl: "warn", created_ms: ago(DAY) }];
  s.states = new Map([["fitbit:101", { handledAt: now - HOUR, by: "1" }]]);
  check("marked handled after the signal: handled", ops.detectIssues(s, now)[0].sev === "handled");
  s.states = new Map([["fitbit:101", { handledAt: now - 2 * DAY, by: "1" }]]);
  check("the signal came back since: open again", ops.detectIssues(s, now)[0].sev === "needs");
  const c = ops.issueCounts(ops.detectIssues(s, now));
  check("counts for the tabs and the badge", c.open === 1 && c.needs === 1 && c.byKind.Fitbit === 1, c);
}

console.log("errors, grouped into problems");
{
  const rows = [];
  for (let i = 0; i < 14; i++) rows.push({ area: "food", event: "estimate_failed", lvl: "error", user_id: "101", created_ms: ago(i * 20 * 60000 + 60000), message: "bad", detail: JSON.stringify({ build: "11-08.2342" }) });
  for (let i = 0; i < 12; i++) rows.push({ area: "api", event: "unreachable", lvl: "warn", user_id: String(110 + (i % 6)), created_ms: ago(i * 2 * HOUR + 60000), message: "Failed to fetch" });
  rows.push({ area: "health", event: "token_dead", lvl: "warn", user_id: "102", created_ms: ago(HOUR) });
  const history = [{ area: "food", event: "estimate_failed", first: now - 5 * HOUR }, { area: "api", event: "unreachable", first: now - 20 * DAY }, { area: "health", event: "token_dead", first: now - 20 * DAY }];
  const states = new Map([["health.token_dead", { mutedUntil: now + HOUR }]]);
  const out = ops.groupProblems(rows, history, states, now);
  const food = out.find((p) => p.id === "food.estimate_failed"), api = out.find((p) => p.id === "api.unreachable"), muted = out.find((p) => p.id === "health.token_dead");
  check("one problem a code, with people and count", food.count === 14 && food.people === 1 && api.people === 6, { food, api });
  check("first seen today is new; the build it came with", food.status === "new" && food.release === "11-08.2342");
  check("an old warning at its usual rate is steady", api.status === "steady");
  check("muted stays muted until its time", muted.status === "muted");
  check("twelve hours of trend, oldest first", food.trend.length === 12 && food.trend[11] === 3 && food.trend.reduce((a, b) => a + b, 0) === 14, food.trend);
  const spike = [];
  for (let i = 0; i < 9; i++) spike.push({ area: "review", event: "write_failed", lvl: "error", user_id: String(i), created_ms: ago(i * 10 * 60000 + 1000) });
  spike.push({ area: "review", event: "write_failed", lvl: "error", user_id: "x", created_ms: ago(12 * HOUR) });
  check("many in the last three hours against a quiet day: spiking", ops.groupProblems(spike, [{ area: "review", event: "write_failed", first: now - 9 * DAY }], new Map(), now)[0].status === "spiking");
  const fixed = ops.groupProblems(rows.slice(0, 3), history, new Map([["food.estimate_failed", { fixedAt: now }]]), now)[0];
  const back = ops.groupProblems(rows.slice(0, 3), history, new Map([["food.estimate_failed", { fixedAt: now - 2 * HOUR }]]), now)[0];
  check("marked fixed and quiet since: fixed; seen again after: back", fixed.status === "fixed" && back.status === "back", { fixed: fixed.status, back: back.status });
}

console.log("a person's days, done or not, no values");
{
  const days = ["2026-11-08", "2026-11-07", "2026-11-06"];
  const rows = {
    weight: [{ day: "2026-11-07" }, { day: "2026-11-06" }],
    checkins: [{ day: "2026-11-07", mood: "Great" }, { day: "2026-11-06", mood: "Down" }],
    logs: [{ day: "2026-11-07", meals_json: JSON.stringify({ breakfast: {}, lunch: {}, snack: true, dinner: { name: "x", kcal: 500 } }) }, { day: "2026-11-06", meals_json: JSON.stringify({ breakfast: {} }) }],
    activity: [{ day: "2026-11-07", pushups: "0", types_json: JSON.stringify({ run: { n: 5, u: "km" } }), steps: "0" }, { day: "2026-11-08", pushups: "0", types_json: "{}", steps: "12000" }],
    entries: [{ created_ms: String(Date.parse("2026-11-07T20:00:00Z")) }, { created_ms: String(Date.parse("2026-11-06T20:00:00Z")) }],
  };
  const g = ops.doneGrid(rows, days, { moves: [{ key: "run" }] }, (ms) => new Date(ms).toISOString().slice(0, 10));
  check("a full day is closed", g.days[1].closed === true && g.days[1].meals === 4 && g.days[1].move === true, g.days[1]);
  check("one meal is not", g.days[2].closed === false && g.days[2].meals === 1);
  check("steps only count for someone who chose Steps", g.days[0].move === false && ops.doneGrid(rows, days, { moves: [{ key: "steps" }] }, (ms) => new Date(ms).toISOString().slice(0, 10)).days[0].move === true);
  check("nothing in the grid says what was eaten, weighed or done", !JSON.stringify(g).includes("kcal") && !JSON.stringify(g).includes("Great") && !JSON.stringify(g).includes("km"));
  check("the streak counts back from yesterday when today is open", ops.streakOf(g.days) === 1);
}

console.log("people and support");
check("search by part of a name or email, or an exact id", ops.matches({ user_id: "101", display_name: "Priya N", email: "p@x.com" }, "pri") && ops.matches({ user_id: "120218000000014007", email: "p@x.com" }, "120218000000014007") && !ops.matches({ user_id: "120218000000014007", email: "p@x.com" }, "1202180000"));
{
  const t = ops.threads([
    { user_id: "101", sender: "member", body: "hello", created_ms: String(now - HOUR), read_ms: null },
    { user_id: "102", sender: "member", body: "hi", created_ms: String(now - 3 * HOUR), read_ms: null },
    { user_id: "102", sender: "admin", body: "hey", created_ms: String(now - 2 * HOUR), read_ms: null },
  ], [{ user_id: "103", body: "old form", acknowledged: "false", CREATEDTIME: "2026-11-01 10:00:00:000" }]);
  check("one thread a person; unanswered first", t.length === 3 && t[0].unanswered && !t.find((x) => x.userId === "102").unanswered, t);
  check("the old feedback form counts as writing", t.find((x) => x.userId === "103").unanswered === true);
}

console.log("closed days, kept by the job");
{
  let c = job.nextClosed(null, "2026-11-06", true);
  c = job.nextClosed(JSON.stringify(c), "2026-11-07", true);
  check("closed days are added, and the first is remembered", c.c.join() === "2026-11-06,2026-11-07" && c.f === "2026-11-06", c);
  c = job.nextClosed(JSON.stringify(c), "2026-11-07", false);
  check("a day judged again as open comes out", c.c.join() === "2026-11-06", c);
  const many = { c: Array.from({ length: 70 }, (_, i) => new Date(now - i * DAY).toISOString().slice(0, 10)), f: "2026-08-01" };
  check("at most 60 kept, the newest", job.nextClosed(JSON.stringify(many), "2026-11-08", true).c.length === 60);
  const facts = job.factsByPerson({ weight: [{ user_id: "1" }], checkins: [{ user_id: "1", mood: "Great" }], logs: [{ user_id: "1", meals_json: JSON.stringify({ breakfast: 1, lunch: 1, snack: 1, dinner: 1 }) }], activity: [{ user_id: "1", pushups: "20", types_json: "{}", steps: "0" }], entries: [{ user_id: "1", created_ms: String(Date.parse("2026-11-08T02:00:00Z")) }] }, "2026-11-07", () => "2026-11-07");
  check("a person's rows become the closing rule's facts", closing.leftToday(facts.get("1"), true, null).length === 0, facts.get("1"));
}

console.log("cohorts and the funnel");
{
  const joined = (d) => Date.parse(d + "T10:00:00Z");
  const run = (from, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(from + "T00:00:00Z") + i * DAY).toISOString().slice(0, 10));
  const pp = [
    { joinedMs: joined("2026-10-05"), closed: run("2026-10-05", 25), vault: true }, // keeps going
    { joinedMs: joined("2026-10-06"), closed: run("2026-10-06", 6), vault: true },  // first week only
    { joinedMs: joined("2026-10-07"), closed: [], vault: false },                   // never
    { joinedMs: joined("2026-11-04"), closed: run("2026-11-04", 4), vault: true },  // this week: too soon
  ];
  const t = job.cohortTable(pp, "2026-11-08");
  const oct = t.find((r) => r.week === "2026-10-05"), nov = t.find((r) => r.week === "2026-11-02");
  check("a cohort a sign-up week, Monday first", oct && oct.n === 3 && nov && nov.n === 1, t);
  check("week 1: two of three closed 4+ days; week 3: one", oct.cells[0] === 67 && oct.cells[2] === 33, oct.cells);
  check("a week not over for everyone is left empty", nov.cells.every((c) => c === null) && oct.cells[5] === null, { nov: nov.cells, oct: oct.cells });
  const f = job.funnel(pp, "2026-11-08");
  check("the funnel follows the newest cohort past its third week", f.week === "2026-10-05" && f.steps.map((s) => s[1]).join() === "3,2,2,2,1", f);
}

console.log("alerts: counts and codes, never a name");
{
  const base = { toggles: { fresh: true, wide: true, api: true, deploy: false }, api: { last15: 0, per15: 2 }, release: null, sent: new Map(), now };
  let due = job.alertsDue({ ...base, problems: [{ id: "food.estimate_failed", first: now - 5 * 60000, people1h: 1, count15: 3 }] });
  check("a new problem", due.length === 1 && due[0].id === "fresh:food.estimate_failed" && /3 times/.test(due[0].text), due);
  due = job.alertsDue({ ...base, problems: [{ id: "push.send_failed", first: now - 9 * DAY, people1h: 12, count15: 4 }] });
  check("one problem reaching 10 people in an hour", due.length === 1 && due[0].id === "wide:push.send_failed");
  due = job.alertsDue({ ...base, problems: [], api: { last15: 25, per15: 3 } });
  check("server errors at twice the usual", due.length === 1 && due[0].id === "api");
  due = job.alertsDue({ ...base, problems: [{ id: "food.estimate_failed", first: now - 5 * 60000, people1h: 1, count15: 3 }], sent: new Map([["fresh:food.estimate_failed", now - 10 * 60000]]) });
  check("at most once a problem an hour", due.length === 0);
  due = job.alertsDue({ ...base, toggles: { fresh: false, wide: false, api: false, deploy: true }, release: { at: now - 30 * 60000 }, problems: [{ id: "tone.failed", first: now - 10 * 60000, people1h: 2, count15: 2 }] });
  check("new errors after a release, when only that is on", due.length === 1 && due[0].id === "deploy:tone.failed");
  check("no alert text names anyone", !JSON.stringify(job.alertsDue({ ...base, problems: [{ id: "a.b", first: now - 60000, people1h: 11, count15: 1 }] })).match(/Priya|@/));
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => " - " + f).join("\n")); process.exit(1); }
