// What Dayhub can see (David, 2026-11-11: the third bet, "privacy people can see"). Settings → What Dayhub can see
// says, in plain words, what is sealed so only the person can open it, what the server can read, what goes out and
// to whom (with their own switches as they are right now), what an admin sees in Dayhub Ops, and every time an admin
// looked at their values, with the reason (GET /account/audit). Pure: no React, no I/O; scripts/test-privacy-view.mjs
// runs it.
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

// ── Looks at the values ──
/** One row of GET /account/audit (soma_api/lib/audit.js forMember): for now only looks at the values, each with its
 *  reason. Page opens and the rest stay in Ops' own Audit (David, 2026-11-11). */
export type Visit = { at: number; action: string; by: string; reason: string | null };

/** One look in a sentence: "David F. looked at your food, weight and activity for the last 14 days". */
export function visitWords(v: Visit): string {
  const who = v.by === "you" ? "You" : v.by || "An admin";
  return v.action === "values_shown" ? `${who} looked at your food, weight and activity for the last 14 days` : `${who} looked at your account`;
}

/** Newest first, as the server sends them, at most `max`. */
export const recent = (items: Visit[], max = 20) => items.slice(0, max);

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
