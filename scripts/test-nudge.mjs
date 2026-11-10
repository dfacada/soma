// The evening nudge's rules (catalyst/functions/soma_jobs/nudge.js).  node scripts/test-nudge.mjs
import { createRequire } from "node:module";
const n = createRequire(import.meta.url)("../catalyst/functions/soma_jobs/nudge.js");

let passed = 0; const failures = [];
const check = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, "\n       got ", JSON.stringify(got), "\n       want", JSON.stringify(want)); } };

console.log("the clock");
const at = Date.UTC(2026, 8, 18, 0, 45); // 00:45 UTC on the 18th
check("local day and minutes in New York (still the 17th, 20:45)", n.localNow(at, "America/New_York"), { day: "2026-09-17", minutes: 20 * 60 + 45 });
check("…and in Tokyo (already 09:45 on the 18th)", n.localNow(at, "Asia/Tokyo"), { day: "2026-09-18", minutes: 9 * 60 + 45 });
check("an unknown zone is null, not a crash", n.localNow(at, "Mars/Olympus"), null);

console.log("settings");
check("off by default, 20:30, weight required", n.nudgeSettings({}), { on: false, minutes: 1230, requireWeight: true, stepsGoal: null });
check("the stored time and weight choice are read", n.nudgeSettings({ nudge: { on: true, time: "21:15" }, requireWeight: false }), { on: true, minutes: 1275, requireWeight: false, stepsGoal: null });
check("a nonsense time falls back", n.nudgeSettings({ nudge: { on: true, time: "25:99" } }).minutes, 1230);

console.log("when");
const local = { day: "2026-09-17", minutes: 1245 };
check("due once the time has passed", n.due(local, 1230, "2026-09-16"), true);
check("not before it", n.due({ ...local, minutes: 1229 }, 1230, null), false);
check("not twice in a day", n.due(local, 1230, "2026-09-17"), false);
check("not hours late: a cron outage does not nudge at midnight", n.due({ ...local, minutes: 1230 + 121 }, 1230, null), false);

console.log("what is left");
const full = { weight: true, mood: "Focused", entries: 1, meals: { breakfast: {}, lunch: true, snack: {}, dinner: {} }, pushups: 0, types: { walk: true } };
check("a closed day leaves nothing", n.leftToday(full, true), []);
check("everything open, in card order", n.leftToday({}, true), ["Weight", "Check-in", "Journal", "Food", "Activity"]);
check("weight not required is not asked for", n.leftToday({ ...full, weight: false }, false), []);
check("meals are counted", n.leftToday({ ...full, meals: { breakfast: {}, lunch: {}, dinner: {} } }, true), ["1 meal"]);
check("push-ups alone are activity", n.leftToday({ ...full, types: {}, pushups: 20 }, true), []);
check("a move logged with an amount is activity", n.leftToday({ ...full, types: { run: { n: 3.2, u: "km" } } }, true), []);
check("a cleared move is not", n.leftToday({ ...full, types: { walk: false, run: { n: 0, u: "km" } } }, true), ["Activity"]);
check("steps do not close the day for someone who did not choose them", n.leftToday({ ...full, types: {}, steps: 20000 }, true), ["Activity"]);
check("steps close it at the goal for someone who chose them", n.leftToday({ ...full, types: {}, steps: 8000 }, true, 8000), []);
check("…and not below it", n.leftToday({ ...full, types: {}, steps: 7999 }, true, 8000), ["Activity"]);
check("chose Steps: the goal comes from settings", n.nudgeSettings({ moves: [{ key: "steps", goal: 1 }], goals: { steps: 6000 } }).stepsGoal, 6000);
check("no moves stored (settings from before moves): steps never count", n.nudgeSettings({ goals: { steps: 6000 } }).stepsGoal, null);
check("one thing left reads as a sentence", n.message(["Journal"]), { title: "One to go", body: "Journal closes the day.", url: "/", tag: "soma-nudge" });
check("several are listed", n.message(["Weight", "Journal", "2 meals"]), { title: "Three to go", body: "Weight · Journal · 2 meals", url: "/", tag: "soma-nudge" });

console.log("week in review reminder");
const rs = n.reviewSettings({ weeklyReview: { on: true, consent: true, dayOfWeek: 0, time: "19:00" } });
check("on needs both the switch and the consent", [rs.on, n.reviewSettings({ weeklyReview: { on: true, consent: false } }).on, n.reviewSettings({}).on], [true, false, false]);
check("Sunday 19:00 by default, like the app", { day: n.reviewSettings({ weeklyReview: { on: true, consent: true } }).dayOfWeek, minutes: n.reviewSettings({ weeklyReview: { on: true, consent: true } }).minutes }, { day: 0, minutes: 1140 });
// The same weeks review.ts reviewDue offers: Sunday evening covers the week ending that day, Monday morning the one before.
check("Sunday 25 Oct covers the week from Monday the 19th", n.reviewWeek("2026-10-25"), "2026-10-19");
check("Monday 26 Oct covers the same week", n.reviewWeek("2026-10-26"), "2026-10-19");
check("due on the day, once the time has come", n.reviewDueNow({ day: "2026-10-25", minutes: 19 * 60 + 5 }, rs, null), "2026-10-19");
check("not before the time", n.reviewDueNow({ day: "2026-10-25", minutes: 18 * 60 + 59 }, rs, null), null);
check("not on another day", n.reviewDueNow({ day: "2026-10-24", minutes: 19 * 60 + 5 }, rs, null), null);
check("not long after (the same window as the nudge)", n.reviewDueNow({ day: "2026-10-25", minutes: 21 * 60 + 1 }, rs, null), null);
check("once a week per device", n.reviewDueNow({ day: "2026-10-25", minutes: 19 * 60 + 20 }, rs, "2026-10-19"), null);
const mon = n.reviewSettings({ weeklyReview: { on: true, consent: true, dayOfWeek: 1, time: "08:00" } });
check("a Monday-morning choice is due on Monday", n.reviewDueNow({ day: "2026-10-26", minutes: 8 * 60 + 10 }, mon, "2026-10-12"), "2026-10-19");

console.log("tomorrow's brief");
check("off by default, at 21:00 like the app", n.briefSettings({}), { on: false, minutes: 1260 });
check("the stored time is read, a nonsense one falls back", [n.briefSettings({ brief: { on: true, time: "20:45" } }), n.briefSettings({ brief: { on: true, time: "9pm" } }).minutes], [{ on: true, minutes: 1245 }, 1260]);
const bs = n.briefSettings({ brief: { on: true, time: "21:00" } });
check("due once the time has come, on that day", n.briefDueNow({ day: "2026-11-02", minutes: 21 * 60 + 5 }, bs, "2026-11-01"), "2026-11-02");
check("not before the time", n.briefDueNow({ day: "2026-11-02", minutes: 20 * 60 + 59 }, bs, null), null);
check("once a day per device", n.briefDueNow({ day: "2026-11-02", minutes: 21 * 60 + 20 }, bs, "2026-11-02"), null);
check("not hours late", n.briefDueNow({ day: "2026-11-02", minutes: 23 * 60 + 1 }, bs, null), null);
check("off says nothing", n.briefDueNow({ day: "2026-11-02", minutes: 21 * 60 + 5 }, n.briefSettings({}), null), null);
check("in the evening the brief is about the next day", n.briefDayOf({ day: "2026-11-02", minutes: 21 * 60 }), "2026-11-03");
check("after midnight it is about the day just begun", n.briefDayOf({ day: "2026-11-03", minutes: 30 }), "2026-11-03");
check("the message names the day and opens the brief", n.briefMessage({ day: "2026-11-02", minutes: 21 * 60 }),
  { title: "Tomorrow's brief", body: "See what Tuesday looks like: your calendar, tasks and Dayhub's side of the day.", url: "/tomorrow/", tag: "soma-brief" });

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
