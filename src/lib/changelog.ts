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
    id: "2026-10-21",
    date: "2026-10-21",
    title: "Recordings reach the cloud",
    items: [
      "Fixed: a recording that couldn't upload straight away (usually because the phone was locked or you switched apps while it was sending) waited until you next unlocked the vault. Now it tries again as soon as you're back in Soma, and every few minutes while it waits. It was always safe on your phone in the meantime.",
      "Admin: the Log reads properly on a phone. Each entry is a card; tap it for the full message, every detail and the stack, and Copy row to paste it anywhere.",
      "Search your journal: a search box at the top of the Journal finds entries by what you said or wrote, with the words highlighted. It searches on your phone, after your vault is open; nothing you type is sent anywhere.",
      "Recordings are now backed up to the cloud while you talk, a few seconds at a time and encrypted like everything else. If your phone dies, the app is closed mid-recording, or the upload never gets through, the recording is rebuilt the next time you unlock, on any device.",
    ],
  },
  {
    id: "2026-10-20",
    date: "2026-10-20",
    title: "The journal opens again",
    items: [
      "Fixed: past about sixteen entries the Journal stopped loading altogether and sat on \"Decrypting entries\" forever. Storage would only hand out so many download links at once; Soma now asks for them a few at a time, so a journal of any length opens.",
      "If entries ever do fail to load, the screen now says so and offers Try again instead of waiting silently. Nothing was ever lost: the entries stay encrypted and stored either way.",
      "Fixed: on iPhone, playing a recording showed \"Decrypting…\" and then \"Couldn't play this recording\". The iPhone had started saving recordings in a format it can't play back itself. Those recordings now play (Soma converts them as it opens them), and new recordings are saved in a format every phone and browser plays.",
      "Playing a recording can no longer sit on \"Decrypting…\" forever: if a step stalls, Soma stops, says it couldn't play, and you can tap again.",
      "Opening a recording now shows its progress under the play button: downloading (with how much has arrived), decrypting, and converting when your phone needs it. If a step fails, the bar turns red and says which one.",
      "Fixed: some iPhone recordings came back from transcription with \"Transcription failed\" because the service wouldn't accept the file. Soma now converts those and tries once more, so Transcribe works on them.",
      "The tabs at the bottom answer the moment you touch them: the one you tapped lights up straight away, and buttons visibly press on iPhone.",
      "Switching tabs is instant now, with no wait and no blank moment, and each tab stays where you left it: same scroll position, same open section, a recording keeps playing.",
      "Tabs fade into each other with a short, quiet cross-fade (on iPhones with iOS 18 or newer; if Reduce Motion is on, they switch without it).",
    ],
  },
  {
    id: "2026-10-07",
    date: "2026-10-07",
    title: "Your week, read back to you",
    items: [
      "Week in review: once a week Soma reads your journal back to you — what happened, the things worth remembering (a promise made, a date, a decision), what came up more than once, and a few notes where your week and your numbers meet. Open it from Insights.",
      "It is written on your phone with your vault open, because that is the only place your journal can be read. Switch it on under Week in review in Settings: that switch is the one place journal text leaves your device, and nothing happens until you turn it on.",
      "Listen to it: a Listen button reads the review aloud, in Soma's voice where that is available and your phone's own voice otherwise.",
      "Send it to Telegram: connect once in Settings and each week's review arrives as a message, with the audio if you want it.",
      "The audio sent to Telegram is the synopsis read aloud, made in short pieces and stitched into one file, because the voice only takes a few hundred words at a time.",
    ],
  },
  {
    id: "2026-09-23",
    date: "2026-09-23",
    title: "Weight moved to Insights",
    items: [
      "The weight graph now lives on Insights instead of Food, and follows the window you pick there: 7 days, 30, 60 or a year. Logging your weight for the day is still one tap on Today.",
      "Touch or hover a point on that graph and it names the day and the weight: \"183 lb · Wed 16 Sep\". Arrow keys walk along it too.",
    ],
  },
  {
    id: "2026-09-22",
    date: "2026-09-22",
    title: "Sharing Soma, and who is using it",
    items: [
      "A page to send anyone joining: soma-onkasary.onslate.com/install/ shows how to add Soma to a Home Screen on an iPhone, an Android phone or a computer, and what to do once they are in.",
      "That page now draws each step on a phone: which button to tap, where it sits, and what Soma looks like once it is on the Home Screen.",
      "Opening Soma in a browser on a phone now shows those steps once, so nobody has to be told twice. It never appears if Soma is already on your Home Screen, and Settings keeps a link to the steps.",
      "For the admin: Settings \u2192 Admin \u2192 Users now shows when each person last used Soma, most recent first, and how many were around this week. Tap Activity on someone to see their last fortnight: which days they logged, how many journal entries, push-ups and steps.",
    ],
  },
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
