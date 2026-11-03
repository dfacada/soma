// Tomorrow's brief: which day it is about, event times across zones and clock changes, repeats, free time, the waking
// day, Todoist tasks, the Insights line and the words sent to Telegram.
//   node --import ./scripts/ts-resolve.mjs scripts/test-tomorrow.mjs
// Runs on New York's clock whatever the machine's, so the clock changes below are real ones.
process.env.TZ = "America/New_York";

import { briefDay, dayBounds, zonedMs, durationMs, toEvents, dedupe, freeBlocks, wakingDay, timeline, toTasks, taskGroups, plainTask,
  clockLabel, rangeLabel, lengthLabel, insightLine, somaSide, summaryLine, briefText, taskClock, sendDue } from "../src/lib/tomorrow.ts";
import { DEFAULT_SETTINGS } from "../src/lib/settings.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail === undefined ? "" : JSON.stringify(detail)); } };
const at = (day, hm) => { const [y, m, d] = day.split("-").map(Number); const [h, mi] = hm.split(":").map(Number); return new Date(y, m - 1, d, h, mi).getTime(); };
const D = "2026-11-03";
const HOUR = 3600000;

console.log("which day");
check("in the evening it is the next day", briefDay(new Date(2026, 10, 2, 21, 0)) === D);
check("at 4 am it is already the next day", briefDay(new Date(2026, 10, 2, 4, 0)) === D);
check("after midnight it is the day that has just begun", briefDay(new Date(2026, 10, 3, 1, 30)) === D);
const fallBack = dayBounds("2026-11-01");
check("the day the clocks go back has 25 hours", fallBack.end - fallBack.start === 25 * HOUR, (fallBack.end - fallBack.start) / HOUR);

console.log("time zones");
check("9:30 in New York is 14:30 UTC in November", zonedMs("2026-11-03T09:30:00", "America/New_York") === Date.UTC(2026, 10, 3, 14, 30));
check("9:30 in London in July is 8:30 UTC", zonedMs("2026-07-01T09:30:00", "Europe/London") === Date.UTC(2026, 6, 1, 8, 30));
check("a time with no zone is read on this device's clock", zonedMs("2026-11-03T09:30:00", null) === at(D, "09:30"));
check("an unknown zone is read as floating", zonedMs("2026-11-03T09:30:00", "Mars/Olympus") === at(D, "09:30"));
const amb = zonedMs("2026-11-01T01:30:00", "America/New_York");
check("an hour that happens twice lands on one of them", [Date.UTC(2026, 10, 1, 5, 30), Date.UTC(2026, 10, 1, 6, 30)].includes(amb), new Date(amb).toISOString());
const gap = zonedMs("2026-03-08T02:30:00", "America/New_York");
check("an hour that never happens lands next to it", [Date.UTC(2026, 2, 8, 6, 30), Date.UTC(2026, 2, 8, 7, 30)].includes(gap), new Date(gap).toISOString());
check("not a time is null", zonedMs("soon", "UTC") === null);
check("durations: PT1H30M, P1D, PT25M, P1W", durationMs("PT1H30M") === 1.5 * HOUR && durationMs("P1D") === 24 * HOUR && durationMs("PT25M") === 25 * 60000 && durationMs("P1W") === 7 * 24 * HOUR);
check("an unreadable duration is 0", durationMs("an hour") === 0 && durationMs(undefined) === 0);

console.log("events");
const raw = [
  { id: "a", calendarId: "c1", title: "Standup", start: "2026-11-03T14:00:00", timeZone: "Europe/London", duration: "PT30M", busy: true, location: "Room 4", calendar: "Work" },
  { id: "b", calendarId: "c1", title: "Holiday", start: "2026-11-03", allDay: true, duration: "P1D", calendar: "Holidays" },
  { id: "c", calendarId: "c2", title: "Trip", start: "2026-11-02", allDay: true, duration: "P3D", calendar: "Home" },
  { id: "d", calendarId: "c2", title: "Next week", start: "2026-11-10", allDay: true, duration: "P1D" },
  { id: "e", calendarId: "c1", title: "Declined", start: "2026-11-03T11:00:00", timeZone: "America/New_York", duration: "PT1H", declined: true },
  { id: "f", calendarId: "c1", title: "Day after", start: "2026-11-04T09:00:00", timeZone: "America/New_York", duration: "PT1H" },
  { id: "g", calendarId: "c1", title: "Ended at midnight", start: "2026-11-02T23:00:00", timeZone: "America/New_York", duration: "PT1H" },
  { id: "h", calendarId: "c1", title: "Late show", start: "2026-11-02T23:30:00", timeZone: "America/New_York", duration: "PT2H" },
  { id: "i", calendarId: "c1", start: "2026-11-03T16:00:00", timeZone: "America/New_York", duration: "PT1H" },
  { id: "j1", uid: "same@x", calendarId: "c1", title: "Lunch with Sam", start: "2026-11-03T12:00:00", timeZone: "America/New_York", duration: "PT1H", busy: false },
  { id: "j2", uid: "same@x", calendarId: "c2", title: "Lunch with Sam", start: "2026-11-03T12:00:00", timeZone: "America/New_York", duration: "PT1H", busy: true },
  { id: "k1", calendarId: "c1", title: "Dentist", start: "2026-11-03T15:00:00", timeZone: "America/New_York", duration: "PT45M" },
  { id: "k2", calendarId: "c3", title: "dentist ", start: "2026-11-03T15:00:00", timeZone: "America/New_York", duration: "PT45M" },
];
const ev = toEvents(raw, D);
const ids = ev.map((e) => e.id);
check("a London meeting shows at its New York time", ev.find((e) => e.id === "a")?.start === at(D, "09:00"));
check("a one-day all-day event on the day is in, and never busy", ev.find((e) => e.id === "b")?.allDay === true && ev.find((e) => e.id === "b")?.busy === false);
check("a three-day trip that started yesterday covers the day", ids.includes("c"));
check("all-day events on other days, declined events and the next day's are out", !ids.includes("d") && !ids.includes("e") && !ids.includes("f"), ids);
check("an event ending at midnight is yesterday's", !ids.includes("g"));
check("one running past midnight into the day is in", ids.includes("h"));
check("an event with no title says Busy", ev.find((e) => e.id === "i")?.title === "Busy");
check("a calendar colour is kept only when it is a hex value", toEvents([{ ...raw[0], color: "#9fe1e7" }], D)[0].color === "#9fe1e7" && toEvents([{ ...raw[0], color: "red;background:url(x)" }], D)[0].color === undefined);
check("the same invite in two calendars shows once, as busy", ev.filter((e) => e.title === "Lunch with Sam").length === 1 && ev.find((e) => e.title === "Lunch with Sam").busy === true);
check("the same title and time without a uid shows once", ev.filter((e) => e.title.toLowerCase().trim() === "dentist").length === 1);
check("all-day events first, then by time", ev[0].allDay && ev[1].allDay && ev.slice(2).every((e, i, xs) => !e.allDay && (i === 0 || xs[i - 1].start <= e.start)), ev.map((e) => e.id));
check("dedupe keeps the first of two identical events", dedupe([{ id: "1", title: "x", start: 1, end: 2, busy: true, allDay: false, calendar: "" }, { id: "2", title: "X", start: 1, end: 2, busy: true, allDay: false, calendar: "" }]).length === 1);

console.log("free time");
const ev2 = [
  { id: "1", title: "A", start: at(D, "09:00"), end: at(D, "10:00"), busy: true, allDay: false, calendar: "" },
  { id: "2", title: "B", start: at(D, "09:30"), end: at(D, "11:00"), busy: true, allDay: false, calendar: "" },
  { id: "3", title: "C", start: at(D, "12:00"), end: at(D, "12:20"), busy: true, allDay: false, calendar: "" },
  { id: "4", title: "D", start: at(D, "13:00"), end: at(D, "13:15"), busy: true, allDay: false, calendar: "" },
  { id: "5", title: "Free event", start: at(D, "15:00"), end: at(D, "16:00"), busy: false, allDay: false, calendar: "" },
  { id: "6", title: "All day", start: dayBounds(D).start, end: dayBounds(D).end, busy: false, allDay: true, calendar: "" },
];
const fb = freeBlocks(ev2, at(D, "07:00"), at(D, "22:00"));
const want = [["07:00", "09:00"], ["11:00", "12:00"], ["12:20", "13:00"], ["13:15", "22:00"]];
check("gaps of half an hour or more between busy events, overlaps merged, free events and all-day ignored",
  fb.length === want.length && fb.every((b, i) => b.start === at(D, want[i][0]) && b.end === at(D, want[i][1])), fb.map((b) => [clockLabel(b.start), clockLabel(b.end)]));
check("a 20-minute gap is not free time", freeBlocks([ev2[0], { ...ev2[0], id: "x", start: at(D, "10:20"), end: at(D, "22:00") }], at(D, "07:00"), at(D, "22:00")).every((b) => b.end - b.start >= 30 * 60000));
check("an empty day is one block", freeBlocks([], at(D, "07:00"), at(D, "22:00")).length === 1);

console.log("the waking day");
const plain = wakingDay(D, null, []);
check("with no nights it is 7 am to 10 pm", plain.start === at(D, "07:00") && plain.end === at(D, "22:00") && !plain.fromFitbit);
const nights = {
  "2026-10-31": { asleep: 420, awake: 20, inBed: 450, deep: 60, rem: 80, light: 280, start: "23:10", end: "06:40" },
  "2026-11-01": { asleep: 400, awake: 20, inBed: 430, deep: 60, rem: 80, light: 260, start: "00:20", end: "06:50" },
  "2026-11-02": { asleep: 410, awake: 20, inBed: 440, deep: 60, rem: 80, light: 270, start: "23:40", end: "07:05" },
  "2026-11-03": { asleep: 300, awake: 20, inBed: 330, deep: 60, rem: 80, light: 160, start: "02:00", end: "11:00" },
};
const fit = wakingDay(D, nights, []);
check("from Fitbit: the usual wake-up and sleep times, to the quarter hour, the day's own night left out",
  fit.fromFitbit && fit.start === at(D, "06:45") && fit.end === at(D, "23:45"), [clockLabel(fit.start), clockLabel(fit.end)]);
const early = wakingDay(D, null, [{ id: "e", title: "Flight", start: at(D, "05:30"), end: at(D, "06:30"), busy: true, allDay: false, calendar: "" }]);
check("an early event stretches the morning", early.start === at(D, "05:30"));
const lateBed = wakingDay(D, { a: { start: "02:00", end: "09:00" }, "2026-11-01": { start: "02:10", end: "09:00" }, "2026-11-02": { start: "02:20", end: "09:10" }, "2026-10-30": { start: "02:00", end: "09:00" } }, []);
check("a bedtime after midnight runs the day to midnight, no further", lateBed.end === dayBounds(D).end, clockLabel(lateBed.end));
const rows = timeline(ev2, fb);
check("the timeline puts free blocks where they fall", rows[0].kind === "free" && rows[1].kind === "event" && rows[1].event.id === "1" && rows.filter((r) => r.kind === "free").length === 4 && !rows.some((r) => r.kind === "event" && r.event.allDay), rows.map((r) => r.kind));

console.log("Todoist");
const tasks = toTasks([
  { id: "1", content: "Pay [rent](https://bank.example)", priority: 4, due: { date: "2026-11-01", is_recurring: false } },
  { id: "2", content: "* Read this", priority: 1, due: { date: "2026-11-02" } },
  { id: "3", content: "Call Sam", priority: 2, due: { date: "2026-11-03", datetime: "2026-11-03T14:30:00" }, duration: { amount: 30, unit: "minute" } },
  { id: "4", content: "Ship it", priority: 3, due: { date: "2026-11-03T20:30:00Z" } },
  { id: "5", content: "Buy milk", priority: 9, due: { date: "2026-11-03", is_recurring: true } },
  { id: "6", content: "Next week", due: { date: "2026-11-10" } },
  { id: "7", content: "Gym", due: { date: "2026-11-03" } },
  { id: "8", content: "No date" },
]);
check("links keep their words and the uncompletable mark goes", tasks.find((t) => t.id === "1").text === "Pay rent" && tasks.find((t) => t.id === "2").text === "Read this");
check("a floating time keeps its clock", tasks.find((t) => t.id === "3").time === "14:30" && tasks.find((t) => t.id === "3").minutes === 30);
check("a time in UTC is read on this device's clock", tasks.find((t) => t.id === "4").time === "15:30" && tasks.find((t) => t.id === "4").due === D);
check("priority stays between 1 and 4, recurring is kept, no due date is dropped", tasks.find((t) => t.id === "5").priority === 4 && tasks.find((t) => t.id === "5").recurring && !tasks.some((t) => t.id === "8"));
const groups = taskGroups(tasks, D, [{ id: "m", title: "gym", start: at(D, "07:00"), end: at(D, "08:00"), busy: true, allDay: false, calendar: "", task: true }]);
check("carried over: before the day, oldest first", groups.carried.map((t) => t.id).join() === "1,2", groups.carried.map((t) => t.id));
check("due: timed first by the clock, then the most urgent", groups.due.map((t) => t.id).join() === "3,4,5", groups.due.map((t) => t.id));
check("a task Morgen put on the calendar shows only there", !groups.due.some((t) => t.id === "7"));
check("a later task is not in the brief", ![...groups.carried, ...groups.due].some((t) => t.id === "6"));
check("a task's time reads as a clock", taskClock(tasks.find((t) => t.id === "3")) === "2:30 pm" && taskClock(tasks.find((t) => t.id === "5")) === null);
check("plainTask caps the length", plainTask("x".repeat(300)).length === 200);

console.log("words");
check("clock labels", clockLabel(at(D, "07:00")) === "7 am" && clockLabel(at(D, "20:30")) === "8:30 pm" && clockLabel(at(D, "12:00")) === "12 pm" && clockLabel(at(D, "00:15")) === "12:15 am");
check("ranges share am/pm when they can", rangeLabel(at(D, "07:00"), at(D, "08:30")) === "7–8:30 am" && rangeLabel(at(D, "11:30"), at(D, "13:00")) === "11:30 am–1 pm", [rangeLabel(at(D, "07:00"), at(D, "08:30")), rangeLabel(at(D, "11:30"), at(D, "13:00"))]);
check("a block to midnight says midnight", rangeLabel(at(D, "21:00"), dayBounds(D).end) === "9 pm–midnight");
check("lengths", lengthLabel(45 * 60000) === "45 min" && lengthLabel(2 * HOUR) === "2 h" && lengthLabel(2.5 * HOUR) === "2 h 30");

console.log("the Insights line");
const lift = (key, label) => ({ key, label, did: { days: 5, hits: 4 }, didnt: { days: 5, hits: 1 }, lift: 0.6 });
const blocks = [{ start: at(D, "07:00"), end: at(D, "08:00") }, { start: at(D, "12:00"), end: at(D, "12:20") }, { start: at(D, "18:00"), end: at(D, "19:30") }];
const moving = insightLine([lift("habit:water", "Water"), lift("active", "Moved")], blocks);
check("a habit that is not done in a block is passed over; moving takes the morning", moving?.text === "Great days come with moving · 7–8 am is free", moving?.text);
const journal = insightLine([lift("journal", "Talked to your journal")], blocks);
check("the journal takes the evening", journal?.text === "Great days come with a journal entry · 6–7:30 pm is free", journal?.text);
check("a habit by name, in a block that fits it", insightLine([lift("habit:read", "Read")], [{ start: at(D, "12:00"), end: at(D, "12:20") }])?.text === "Great days come with “Read” · 12–12:20 pm is free");
check("without the calendar no block is named", insightLine([lift("active", "Moved")], null)?.text === "Great days come with moving");
check("no block long enough says so", insightLine([lift("active", "Moved")], [{ start: at(D, "12:00"), end: at(D, "12:20") }])?.text === "Great days come with moving · no free 30 minutes tomorrow");
check("nothing that fits a block means no line", insightLine([lift("protein", "Hit your 200 g protein"), lift("sleep", "Slept 7 hours")], blocks) === null);

console.log("Soma's side and the text");
const soma = somaSide(DEFAULT_SETTINGS, { target: 100, rest: false, dayNumber: 43 });
const planKcal = Object.values(DEFAULT_SETTINGS.plan).reduce((n, m) => n + Math.round(m.kcal), 0);
check("the four planned meals, in order, with their total", soma.meals.map((m) => m.key).join() === "breakfast,lunch,snack,dinner" && soma.kcal === planKcal && soma.weighIn === true);
check("weighing in follows the setting", somaSide({ ...DEFAULT_SETTINGS, requireWeight: false }, { target: 100, rest: false, dayNumber: null }).weighIn === false);
const brief = { day: D, builtMs: 0, events: ev, tasks };
const text0 = () => briefText(brief, soma, fb, null);
check("the Today line counts the day's events and names the first to start on it", summaryLine(brief, soma) === "5 events, first at 9 am · 6 tasks · 100 push-ups", summaryLine(brief, soma));
check("an event from the night before reads as until", text0().includes("until 1:30 am  Late show"));
check("the Today line on a rest day with nothing connected", summaryLine({ day: D, builtMs: 0, events: null, tasks: null }, { ...soma, pushups: { target: 100, rest: true, dayNumber: 7 } }) === "rest day");
check("an empty calendar says so", summaryLine({ day: D, builtMs: 0, events: [], tasks: [] }, soma) === "Nothing on the calendar · 100 push-ups");
const text = briefText(brief, soma, fb, moving);
check("the text has the day, the times and titles, the tasks and Soma's side", text.startsWith("Tomorrow · Tuesday 3 November") && text.includes("9–9:30 am  Standup") && text.includes("Carried over: P1 Pay rent; Read this") && text.includes("Due: P3 Call Sam (2:30 pm)") && text.includes("100 push-ups (day 43)") && text.includes("Great days come with moving"), text);
check("the text carries no place, link or description", !text.includes("Room 4") && !text.includes("http") && !text.includes("bank"));
console.log("sending it to Telegram by itself");
const on = { telegram: true, time: "21:00", sent: "" };
const readAt = (hm, day = "2026-11-02") => ({ day: D, builtMs: at(day, hm), events: null, tasks: null });
check("read after the time on the evening before: send", sendDue(readAt("21:05"), on));
check("read before the time: wait for a later read", !sendDue(readAt("19:00"), on));
check("read after midnight for the day just begun: send", sendDue(readAt("00:30", D), on));
check("already sent for that day: never twice", !sendDue(readAt("21:05"), { ...on, sent: D }));
check("switched off: never", !sendDue(readAt("21:05"), { ...on, telegram: false }));
check("nothing read: nothing to send", !sendDue(null, on));

check("the text fits a Telegram message", briefText({ ...brief, tasks: Array.from({ length: 400 }, (_, i) => ({ id: String(i), text: "a long task name ".repeat(5), priority: 1, due: D, time: null, minutes: null, recurring: false })) }, soma, fb, moving).length <= 3800);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
