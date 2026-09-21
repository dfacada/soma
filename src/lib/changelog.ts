// What changed in Soma, newest first, in words for the person using it (David, 2026-09-21: "any updates to the app
// should be summarized and displayed to the end user once upon the next time they open the app", and all of them
// kept in Settings "so we can track all the great improvements").
//
// Every change a user can notice adds a line here in the same commit (CLAUDE.md). Group by the day it shipped:
// a day that already has a release gets another item, a new day gets a new release at the top. Ids never change once
// shipped: the app remembers the newest id each person has seen (settings.seenChanges) and shows what is newer.
// No React and no imports, so scripts/test-changelog.mjs runs this file as it is.

export type Release = { id: string; date: string; title: string; items: string[] };

export const CHANGES: Release[] = [
  {
    id: "2026-09-21",
    date: "2026-09-21",
    title: "Fill in the last week",
    items: [
      "Tap any of the last seven days in the strip on Today to fill it in: weight, check-in, meals, activity and push-ups all go to that day, under a bar that says which day you are editing. Food and Activity follow the same day.",
      "On a past day the journal card can record or take a written entry. It is filed under that day and marked \"added later\".",
      "Push-ups logged up to two days late still count for the round. Older ones go to your own record and streak, but not the leaderboard, so nobody can pad a week at the end.",
      "What's new: this screen. It shows once after each update, and every change ever made is in Settings.",
      "The day picked in the week strip now sits in a soft pill that fits its label, so TODAY no longer spills over the edge.",
    ],
  },
  {
    id: "2026-09-20",
    date: "2026-09-20",
    title: "Type what you ate",
    items: [
      "Type a food in plain words and Soma fills the calories, protein, carbs and fat for you to check before logging. Anything you have eaten before comes back instantly; only something new is estimated.",
      "What you type can replace a meal: log it as breakfast, lunch, snack or dinner, or tap \"Ate something else\" on the meal. It counts towards closing the day and your plan stays as it was.",
      "A switch under Food in Settings turns the estimates off.",
    ],
  },
  {
    id: "2026-09-18",
    date: "2026-09-18",
    title: "Face ID for the vault",
    items: [
      "Unlock your journal with Face ID instead of typing your passphrase. Set it up once per device in Settings, under Journal & vault. It works with Keeper and with Apple Passwords, and your passphrase still works everywhere.",
    ],
  },
  {
    id: "2026-09-17",
    date: "2026-09-17",
    title: "The first full week of Soma",
    items: [
      "Today: weight, check-in, journal, four meals and activity close the day, each with one tap, and the streak counts full days in a row.",
      "Journal: encrypted voice entries that survive a crash or a lost connection, with optional transcription.",
      "Food: your Macros plans, recipes and quick snacks, with calories and macros for the day.",
      "Activity: push-up rounds with your own daily target, a chain of days and a leaderboard.",
      "Steps and sleep from Google Health (what Fitbit became), with sleep kept encrypted.",
      "Insights: what your best days have in common, mood by sleep, and a day-by-day record.",
      "An evening nudge naming what is still open, at a time you choose.",
      "Opening words once a day, dark theme, and seven colour palettes.",
    ],
  },
];

/** The releases someone has not seen yet, newest first. Never seen anything: the last week's, at most three. */
export function unseen(seenId: string, today: string, changes: Release[] = CHANGES): Release[] {
  if (!changes.length) return [];
  if (seenId) {
    const at = changes.findIndex((r) => r.id === seenId);
    // An id this build does not know (an older build, a typo) shows only the newest, never the whole history.
    return at === -1 ? changes.slice(0, 1) : changes.slice(0, at);
  }
  const weekAgo = shift(today, -7);
  const recent = changes.filter((r) => r.date >= weekAgo).slice(0, 3);
  return recent.length ? recent : changes.slice(0, 1);
}

function shift(day: string, days: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "21 September 2026". */
export const releaseDate = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
