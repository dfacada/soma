// Morgen payloads, trimmed for tomorrow's brief (catalyst/functions/soma_api/routes/morgen.js).  node scripts/test-morgen-parse.mjs
// Shapes from Morgen's own examples (docs.morgen.so, events and calendars).
import { createRequire } from "node:module";
const { parse } = createRequire(import.meta.url)("../catalyst/functions/soma_api/routes/morgen.js");

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail === undefined ? "" : JSON.stringify(detail)); } };

console.log("calendars");
const cal = parse.calendarOf({ "@type": "Calendar", id: "c1", accountId: "a1", integrationId: "google", name: "Work", color: "#9fe1e7", myRights: { mayReadItems: true }, "morgen.so:metadata": { busy: true, overrideName: "Day job" } });
check("Morgen's own name for a calendar wins over the provider's", cal.name === "Day job" && cal.color === "#9fe1e7" && cal.integration === "google" && cal.readable, cal);
check("a calendar that cannot be read is marked so", parse.calendarOf({ id: "c2", accountId: "a1", myRights: { mayReadItems: false } }).readable === false);
check("lists come wrapped or bare", parse.listOf({ data: { events: [1, 2] } }, "events").length === 2 && parse.listOf({ data: [1] }, "events").length === 1 && parse.listOf(null, "events").length === 0);

console.log("events");
const calendars = new Map([["c1", cal]]);
const raw = {
  "@type": "Event", id: "e1", uid: "u1@google.com", calendarId: "c1", accountId: "a1", integrationId: "google",
  title: "Design review", description: "Secret agenda, call 555-0100", start: "2026-11-03T09:30:00", timeZone: "America/New_York", duration: "PT45M",
  showWithoutTime: false, freeBusyStatus: "busy", privacy: "public",
  locations: { 1: { "@type": "Location", name: "Morgen HQ, Forrlibuckstrasse 223" } },
  participants: {
    "doe@morgen.so": { "@type": "Participant", name: "John Doe", email: "doe@morgen.so", roles: { attendee: true, owner: true }, participationStatus: "needs-action" },
    bWFyY29AbW9yZ2Vu0000: { "@type": "Participant", name: "Willie White", email: "white@morgen.so", roles: { attendee: true, accountOwner: true }, participationStatus: "accepted" },
  },
  "morgen.so:derived": { virtualRoom: { url: "https://zoom.us/j/123" } },
  "morgen.so:metadata": { taskId: "t9", updated: "2026-11-01T10:00:00Z" },
};
const ev = parse.eventOf(raw, calendars);
check("the parts the brief shows", ev.title === "Design review" && ev.start === "2026-11-03T09:30:00" && ev.timeZone === "America/New_York" && ev.duration === "PT45M" && ev.busy && !ev.allDay, ev);
check("the calendar's name and colour ride along", ev.calendar === "Day job" && ev.color === "#9fe1e7");
check("the first place, a video call and a task are noted", ev.location === "Morgen HQ, Forrlibuckstrasse 223" && ev.video === true && ev.taskId === "t9");
check("no description, attendee or link leaves the server", !JSON.stringify(ev).includes("agenda") && !JSON.stringify(ev).includes("@morgen.so") && !JSON.stringify(ev).includes("zoom.us"), ev);
check("accepted is not declined", ev.declined === false);
const declined = { ...raw, participants: { me: { roles: { accountOwner: true }, participationStatus: "declined" }, them: { roles: { owner: true }, participationStatus: "accepted" } } };
check("declined by the account's owner is marked", parse.eventOf(declined, calendars).declined === true);
check("declined by someone else is not", parse.eventOf({ ...raw, participants: { them: { roles: { attendee: true }, participationStatus: "declined" } } }, calendars).declined === false);
check("free and all-day are read", (() => { const e = parse.eventOf({ ...raw, showWithoutTime: true, freeBusyStatus: "free" }, calendars); return e.allDay && !e.busy; })());
check("a long title is cut", parse.eventOf({ ...raw, title: "x".repeat(500) }, calendars).title.length === 200);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
