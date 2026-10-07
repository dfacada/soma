// The week in review: which week, what goes into it, and what comes back.
//
// The journal is encrypted, so the writing can only start here, on the device, with the vault open: the entries are
// decrypted, their text is sent to the API (routes/review.js) for Claude to write up, and what comes back is
// encrypted again before it is stored. The server keeps ciphertext and never a word of either (docs/HANDOFF.md).
//
// No React and no imports at all, so scripts/test-review.mjs runs this file as it is; the calls live in
// review-api.ts beside it.

export type Review = {
  weekStart: string;
  synopsis: string;
  remember: string[];
  threads: string[];
  noticed: string[];
  /** What the numbers said that week, kept with the writing so an old review still makes sense. */
  numbers: WeekNumbers;
  writtenMs: number;
  entries: number;
};
export type WeekNumbers = {
  daysClosed: number; of: number; streak?: number;
  weightChange?: number | null; avgKcal?: number | null; avgProtein?: number | null;
  pushups?: number; activeDays?: number; steps?: number | null; entries: number;
};
export type StoredReview = { weekStart: string; ciphertext: string; hasAudio: boolean; createdMs: number | null };

const pad = (n: number) => (n < 10 ? "0" : "") + n;
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The Monday of the week a day falls in. Weeks run Monday to Sunday, so "last week" is a finished thing. */
export function weekStart(day: Date): string {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return key(d);
}

/** The seven days of that week, Monday first. */
export function weekDays(start: string): string[] {
  const [y, m, d] = start.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => key(new Date(y, m - 1, d + i, 12)));
}

/** The week before the one this day is in: the last complete week. */
export function lastWeek(day: Date): string {
  const [y, m, d] = weekStart(day).split("-").map(Number);
  return key(new Date(y, m - 1, d - 7, 12));
}

/** "29 September to 5 October". */
export function weekLabel(start: string): string {
  const days = weekDays(start);
  const from = new Date(days[0] + "T12:00:00"), to = new Date(days[6] + "T12:00:00");
  const month = (x: Date) => x.toLocaleDateString("en-GB", { month: "long" });
  return from.getMonth() === to.getMonth()
    ? `${from.getDate()} to ${to.getDate()} ${month(to)}`
    : `${from.getDate()} ${month(from)} to ${to.getDate()} ${month(to)}`;
}

/**
 * Is a review due, and for which week? Work back from the last moment it should have arrived: the most recent
 * occurrence of the chosen day and time. The week under review is the one that had just finished then, so a
 * Sunday-evening setting covers the week ending that same evening, and a Monday-morning one covers the week that
 * ended the night before. Only the newest missing week is ever returned: miss a month and you get last week, not
 * four of them. `dayOfWeek` is 0 Sunday to 6 Saturday, as Date.getDay() counts.
 */
export function reviewDue(now: Date, have: string[], setting: { on: boolean; dayOfWeek: number; time: string }): string | null {
  if (!setting.on) return null;
  const [h, min] = (setting.time || "19:00").split(":").map(Number);
  const at = new Date(now);
  at.setHours(Number.isFinite(h) ? h : 19, Number.isFinite(min) ? min : 0, 0, 0);
  at.setDate(at.getDate() - ((at.getDay() - setting.dayOfWeek + 7) % 7));
  if (at > now) at.setDate(at.getDate() - 7); // today is the day, but the hour has not come
  const week = weekStart(new Date(at.getFullYear(), at.getMonth(), at.getDate() - 1, 12));
  return have.includes(week) ? null : week;
}

/** What the writing is given alongside the entries, so it can hold the week next to the numbers. */
export type DaySummary = { day: string; closed: boolean; weight?: number; kcal?: number; protein?: number; pushups?: number; activity?: boolean; entries: number };

export function weekNumbers(days: DaySummary[]): WeekNumbers {
  const logged = days.filter((d) => d.kcal !== undefined && d.kcal > 0);
  const weights = days.filter((d) => d.weight !== undefined).map((d) => d.weight as number);
  const avg = (list: number[]) => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null);
  return {
    daysClosed: days.filter((d) => d.closed).length,
    of: days.length,
    weightChange: weights.length > 1 ? Math.round((weights[weights.length - 1] - weights[0]) * 10) / 10 : null,
    avgKcal: avg(logged.map((d) => d.kcal as number)),
    avgProtein: avg(logged.map((d) => d.protein as number)),
    pushups: days.reduce((n, d) => n + (d.pushups || 0), 0),
    activeDays: days.filter((d) => d.activity).length,
    entries: days.reduce((n, d) => n + d.entries, 0),
  };
}

/** The review as one block of text: what is read aloud, and what Telegram is sent. */
export function asText(r: Review): string {
  const parts = [`Week in review · ${weekLabel(r.weekStart)}`, "", r.synopsis];
  if (r.remember.length) parts.push("", "Worth remembering", ...r.remember.map((x) => `· ${x}`));
  if (r.threads.length) parts.push("", "Threads through the week", ...r.threads.map((x) => `· ${x}`));
  if (r.noticed.length) parts.push("", "Noticed", ...r.noticed.map((x) => `· ${x}`));
  return parts.join("\n");
}

/** What is read aloud: the synopsis and what to remember, without the list formatting. */
export function asSpeech(r: Review): string {
  const parts = [`Your week, ${weekLabel(r.weekStart)}.`, r.synopsis];
  if (r.remember.length) parts.push("Worth remembering.", r.remember.join(" "));
  if (r.threads.length) parts.push("Through the week.", r.threads.join(" "));
  return parts.join("\n\n");
}
