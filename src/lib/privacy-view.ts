// What Dayhub can see (David, 2026-11-11: the third bet, "privacy people can see"). Settings → What Dayhub can see
// says, in plain words, what is sealed so only the person can open it, what the server can read, what goes out and
// to whom (with their own switches as they are right now), what an admin sees in Dayhub Ops, and every time an admin
// opened their account (GET /account/audit). Pure: no React, no I/O; scripts/test-privacy-view.mjs runs it.
//
// This is the in-app twin of the privacy page (src/app/privacy/page.tsx). When what is sealed, readable or sent
// changes, change both.

import type { Settings } from "./settings";

export type Kept = { id: string; name: string; note: string };

/** Sealed with the vault key on the device: the server holds ciphertext it cannot open. */
export const SEALED: Kept[] = [
  { id: "journal", name: "Your journal", note: "Every entry, recording, transcript and note. The server sees that an entry exists, when, and how big it is, never what is in it." },
  { id: "sleep", name: "Your sleep", note: "Each night from Google Health, kept in one sealed file a month." },
  { id: "review", name: "Your week in review", note: "Written, then sealed before it is stored." },
  { id: "connections", name: "Your connections", note: "The Google Health, Morgen and Todoist keys. Opened on your device only for the moment of a read." },
  { id: "brief", name: "Tomorrow's brief", note: "Kept on this device for the evening, sealed." },
  { id: "experiment", name: "An experiment about sleep", note: "Sealed like the sleep it is about." },
  { id: "recovery", name: "Your recovery code", note: "Shown to you once and never stored. The server keeps only a copy of your key locked with it." },
];

/** Readable by the server, so rounds, fixes and Dayhub Ops work. */
export const READABLE: Kept[] = [
  { id: "checkins", name: "Check-ins", note: "Your mood and the habits you ticked." },
  { id: "food", name: "Food", note: "Your meals, snacks and recipes." },
  { id: "weight", name: "Weight", note: "Each weigh-in." },
  { id: "moves", name: "Moves and steps", note: "What you logged, and steps from your tracker." },
  { id: "rounds", name: "Rounds", note: "Your target and your number on each day. Other members of a round see your name, your target and how many days you hit it." },
  { id: "settings", name: "Your settings", note: "Your goals, moods, habits, phrases and switches, and an experiment that is not about sleep." },
  { id: "messages", name: "Messages with David", note: "Not sealed: he reads them to help you." },
  { id: "account", name: "Your account", note: "Name, email, when you joined, when you were last seen and on what kind of device, and the error reports your app files when something breaks." },
];

/** What an admin sees of a person in Dayhub Ops (HANDOFF §12), said once. */
export const OPS_SEES = "Your name and email, when you joined and were last seen and on what device, your moves by name, whether each of the five things was done on each of the last 14 days (never what), your messages, the errors your app reported, today's AI use, and how many journal entries you have and when. Your food, weight and activity only with a reason, which is written down before anything is shown and listed for you below. Never your journal, and never your check-in mood.";

export type Out = { id: string; name: string; to: string; what: string; on: boolean; section: string };

/** What goes out of Dayhub, each with the switch that lets it, as the person has it set now. `telegram`: whether a
 *  chat is connected (null while unknown). */
export function sentOut(s: Pick<Settings, "foodEstimate" | "cloudTranscription" | "sayDay" | "journalInsights" | "weeklyReview" | "brief">, telegram: boolean | null): Out[] {
  return [
    { id: "estimate", name: "Food estimates", to: "Claude", what: "What you type or say you ate, with foods you logged before. What you say aloud is written down by Groq first.", on: s.foodEstimate, section: "food" },
    { id: "transcribe", name: "Cloud transcription", to: "Groq", what: "Each journal recording, to be written down. Blanked on the server the moment Groq answers.", on: s.cloudTranscription, section: "journal" },
    { id: "sayday", name: "Say your day", to: "Groq and Claude", what: "That one recording, to be written down, and its words, to pick out your day.", on: s.sayDay, section: "journal" },
    { id: "insights", name: "Reading your journal for Insights", to: "Claude", what: "Your entries with names and details taken out, shuffled, with no dates.", on: s.journalInsights === "claude", section: "journal" },
    { id: "review", name: "Week in review", to: "Claude", what: "That week's entries, to write it. Groq reads it aloud when you ask.", on: s.weeklyReview.on && s.weeklyReview.consent, section: "review" },
    { id: "telegram", name: "Telegram", to: "Telegram", what: "The week in review and tomorrow's brief, as messages. Telegram keeps what it is sent.", on: telegram === true && (s.weeklyReview.telegram || s.brief.telegram), section: "review" },
  ];
}

export type Linked = { id: string; name: string; what: string; on: boolean | null; section: string };
/** What Dayhub reads from, only when connected. Null: not known yet. */
export function readFrom(health: string, links: { morgen: unknown; todoist: unknown } | null): Linked[] {
  return [
    { id: "health", name: "Google Health", what: "Your steps and sleep, read only. Nothing is sent to Google.", on: health === "connected" || health === "reconnect", section: "fitbit" },
    { id: "morgen", name: "Morgen", what: "Tomorrow's calendar, read only. Your key passes through Dayhub's server for each read and is not kept.", on: links ? Boolean(links.morgen) : null, section: "brief" },
    { id: "todoist", name: "Todoist", what: "Tomorrow's tasks, read straight from Todoist by your device.", on: links ? Boolean(links.todoist) : null, section: "brief" },
  ];
}

// ── Admin visits ──
/** One row of GET /account/audit (soma_api/lib/audit.js forMember). */
export type Visit = { at: number; action: string; by: string; reason: string | null; about: string | null };

const ISSUE_WORDS: Record<string, string> = {
  fitbit: "your Fitbit connection had stopped", journal: "some journal entries wouldn't open", errors: "the same error kept coming up on your account",
  reminders: "your reminders weren't arriving", "ai-limits": "you reached a daily AI limit", approval: "your sign-up was waiting to be approved",
  "gone-quiet": "you hadn't opened Dayhub for a while", messages: "a message from you was waiting for a reply",
};

/** One visit in a sentence: "David F. opened your page in Dayhub Ops". */
export function visitWords(v: Visit): string {
  const who = v.by === "you" ? "You" : v.by || "An admin";
  const issue = v.about ? ISSUE_WORDS[v.about] : null;
  switch (v.action) {
    case "person_viewed": return `${who} opened your page in Dayhub Ops`;
    case "activity_viewed": return `${who} looked at what you logged on your last days, in Settings → Admin`;
    case "values_shown": return `${who} looked at your food, weight and activity for the last 14 days`;
    case "message_sent": return `${who} wrote to you`;
    case "issue_handled": return issue ? `${who} marked as handled that ${issue}` : `${who} marked something about your account as handled`;
    case "issue_reopened": return issue ? `${who} looked again at that ${issue}` : `${who} reopened something about your account`;
    case "profile_status": return v.about === "active" ? `${who} let your account in` : v.about === "disabled" ? `${who} turned your account off` : `${who} changed your account's status`;
    case "profile_role": return v.about === "admin" ? `${who} made you an admin` : v.about === "member" ? `${who} made you a member` : `${who} changed your role`;
    default: return `${who} did something on your account`;
  }
}

export type VisitGroup = { at: number; words: string; times: number; reason: string | null };

const localDay = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/** Newest first, as the server sends them. The same thing by the same admin on the same day is one line ("3 times");
 *  a look with a reason always stands alone, so every reason is shown. */
export function groupVisits(items: Visit[], max = 20): VisitGroup[] {
  const out: (VisitGroup & { key: string })[] = [];
  for (const v of items) {
    const key = `${v.action}|${v.by}|${localDay(v.at)}`;
    const last = out[out.length - 1];
    if (last && !v.reason && !last.reason && last.key === key) { last.times++; continue; }
    if (out.length >= max) break;
    out.push({ key, at: v.at, words: visitWords(v), times: 1, reason: v.reason });
  }
  return out.map((g) => ({ at: g.at, words: g.words, times: g.times, reason: g.reason }));
}

/** "Wed 11 Nov, 2:05 pm". */
export function whenOf(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}`;
}

/** The section's line in Settings: how many of the switches that send something out are on. */
export function summaryOf(out: Out[]): string {
  const on = out.filter((o) => o.on).length;
  return `${on} of ${out.length} things that go out ${on === 1 ? "is" : "are"} on`;
}
