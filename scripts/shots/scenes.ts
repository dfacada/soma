// Every screen the polish loop looks at. An area is one maker's patch (the files it changes); a scene is one
// screenshot (a route, plus the taps that get there). Add a scene here when a screen or sheet is added.
//
// Steps are Playwright locators by role and accessible name, so a renamed button breaks the scene loudly (the
// capture names the step that failed) instead of quietly shooting the wrong screen.

import type { DayShape, Trying, Who } from "./world";

export type Step =
  | { click: string; role?: "button" | "link" | "tab" | "switch" | "checkbox"; exact?: boolean; nth?: number }
  /** Types into the field with this label (its aria-label). */
  | { fill: string; value: string }
  | { text: string }
  | { scroll: number }
  | { wait: number };

export type Scene = {
  id: string;
  area: string;
  /** What the screenshot shows, said for the critic. */
  title: string;
  path: string;
  steps?: Step[];
  /** "locked": the vault key is not in the tab, as after a fresh open. */
  vault?: "open" | "locked";
  day?: DayShape;
  /** Extra screenshots further down a long screen, each one screen-height lower. */
  frames?: number;
  /** Shoot as someone with Reduce Motion on sees it. Every other scene plays its animations to the end first. */
  reduced?: boolean;
  /** Whose screen: the settled member (the default), someone on their first day, or someone waiting for approval. */
  who?: Who;
  /** The settled member with an experiment in hand (Read, tried for three days): on its second day, or just over. */
  experiment?: Trying;
  /** A window size other than the phone's, for screens made for a computer first (Dayhub Ops). */
  view?: { width: number; height: number };
};

export type Area = {
  id: string;
  title: string;
  /** The files this area's maker changes. Shared files (globals.css, ui/*, app.module.css, screens.module.css) belong
   *  to the system pass, so one area's fix never quietly restyles another's screen. */
  files: string[];
};

export const AREAS: Area[] = [
  { id: "today", title: "Today: the orb, the day's tasks and the week strip", files: ["src/components/app/Today.tsx", "src/components/app/SayDay.tsx", "src/components/app/today.module.css", "src/components/app/DayBanner.tsx", "src/components/ui/Orb.tsx"] },
  { id: "sheets", title: "Today's sheets: weight, check-in, a move, steps and sleep", files: ["src/components/app/WeightSheet.tsx", "src/components/app/MoveSheet.tsx", "src/components/app/moves.module.css", "src/components/app/sheets.module.css", "src/components/app/Steps.tsx", "src/components/app/steps.module.css", "src/components/app/Sleep.tsx", "src/components/app/sleep.module.css"] },
  { id: "journal", title: "Journal: entries, search, the vault", files: ["src/components/app/JournalScreen.tsx"] },
  { id: "food", title: "Food: the day's meals, macros and saying what you ate", files: ["src/components/app/Food.tsx", "src/components/app/FoodSay.tsx"] },
  { id: "activity", title: "Activity: push-ups, moves and the round", files: ["src/components/app/Activity.tsx", "src/components/app/Rounds.tsx"] },
  { id: "insights", title: "Insights: trends and patterns", files: ["src/components/app/Insights.tsx", "src/components/app/insights.module.css"] },
  { id: "tomorrow", title: "Tomorrow: the evening brief", files: ["src/components/app/Tomorrow.tsx", "src/components/app/tomorrow.module.css"] },
  { id: "settings", title: "Settings and What's new", files: ["src/components/app/Settings.tsx", "src/components/app/WhatsNew.tsx", "src/components/app/Telegram.tsx"] },
  { id: "moments", title: "Full-screen moments: recording, saying what you ate, the day closing", files: ["src/components/app/Moments.tsx", "src/components/app/moments.module.css"] },
  { id: "welcome", title: "Getting in: waiting for approval and making the vault", files: ["src/components/app/Session.tsx", "src/components/app/Journal.tsx"] },
  { id: "ops", title: "Dayhub Ops: the admin's console (a computer first; a phone too)", files: ["src/components/ops/OpsShell.tsx", "src/components/ops/Overview.tsx", "src/components/ops/Issues.tsx", "src/components/ops/People.tsx", "src/components/ops/Person.tsx", "src/components/ops/Errors.tsx", "src/components/ops/Support.tsx", "src/components/ops/Audit.tsx", "src/components/ops/ops.module.css"] },
];

/** The shared design system: tokens, primitives, the shell and the shared CSS modules. One maker, run alone. */
export const SYSTEM_FILES = [
  "src/app/globals.css", "src/components/ui/ui.module.css", "src/components/ui/primitives.tsx", "src/components/ui/Nav.tsx",
  "src/components/ui/Sheet.tsx", "src/components/ui/Ring.tsx", "src/components/app/Shell.tsx", "src/components/app/app.module.css",
  "src/components/app/screens.module.css",
];

// Titles say what the screen must show, so a critic can catch a state that contradicts the data, not only bad looks.
// The member: 12 full days in a row before today (best 21); today at 7:30 pm has weight, check-in (Great),
// breakfast, lunch, the snack, 60 of 100 push-ups and a walk; the journal and dinner are left, so 3 of 5 are done.
const DESK = { width: 1280, height: 900 };
export const SCENES: Scene[] = [
  { id: "today", area: "today", title: "Today at 7:30 pm: 3 of 5 done, journal and dinner left, a 12-day streak (best 21)", path: "/", frames: 1 },
  { id: "today-closed", area: "today", title: "Today with all five done: the day is closed and the streak is 13", path: "/", day: "closed" },
  { id: "sheet-say-day", area: "today", title: "Say your day tapped for the first time: before anything is recorded, a sheet says what it does and what leaves the phone, with Turn on and start", path: "/", steps: [{ click: "Say your day" }] },
  { id: "sheet-weight", area: "sheets", title: "The weight sheet, opened from Today", path: "/", steps: [{ click: "Log today" }] },
  { id: "sheet-checkin", area: "sheets", title: "The check-in sheet: mood and habits", path: "/", steps: [{ click: "Check-in:" }] },
  { id: "sheet-pushups", area: "sheets", title: "The push-ups sheet at 60 of 100", path: "/", steps: [{ click: "Push-ups:" }] },
  { id: "sheet-steps", area: "sheets", title: "The steps sheet: today and the days before", path: "/", steps: [{ click: "Steps:" }] },
  { id: "sheet-sleep", area: "sheets", title: "The sleep sheet: last night and the week", path: "/", steps: [{ click: "Sleep:" }] },
  { id: "journal", area: "journal", title: "Journal with two months of entries, vault open", path: "/journal/", frames: 1 },
  { id: "journal-locked", area: "journal", title: "Journal with the vault locked", path: "/journal/", vault: "locked" },
  { id: "food", area: "food", title: "Food: breakfast, lunch and the snack logged, dinner to go", path: "/food/", frames: 1 },
  { id: "activity", area: "activity", title: "Activity: 60 of 100 push-ups, a walk, day 20 of a round", path: "/activity/", frames: 1 },
  { id: "insights", area: "insights", title: "Insights over two months of days", path: "/insights/", frames: 2 },
  { id: "insights-experiment", area: "insights", experiment: "running", title: "Insights on day two of an experiment (Read, yesterday to tomorrow): the experiment card first, a row a day (yesterday and today with whether Read was ticked and the mood, tomorrow to come); the great-days card under it offers no Try it, and says why: one at a time", path: "/insights/", frames: 1 },
  { id: "insights-try-sleep", area: "insights", title: "Insights a moment after Try it for 3 days was tapped on Slept 7 hours: the experiment card says it starts tomorrow, and the sleep finding is marked as the one being tried (a sleep experiment is sealed with the vault; the rig reports one that is not)", path: "/insights/", steps: [{ click: "Try it for three days: Sleep 7 hours" }, { wait: 1500 }], frames: 1 },
  { id: "insights-experiment-done", area: "insights", experiment: "finished", title: "Insights the day after an experiment ended (Read, three days): each day, then how it went in plain words, with Try it again and Done", path: "/insights/" },
  { id: "today-experiment", area: "today", experiment: "running", title: "Today on day two of an experiment: a slim row over the cards says day 2 of 3, Read, not yet today, with three dots (the first lit, today ringed)", path: "/", frames: 1 },
  { id: "tomorrow", area: "tomorrow", title: "Tomorrow's brief", path: "/tomorrow/" },
  { id: "settings", area: "settings", title: "Settings, top of the page", path: "/settings/", frames: 1 },
  { id: "settings-appearance", area: "settings", title: "Settings with Appearance open", path: "/settings/", steps: [{ click: "Appearance" }] },
  { id: "whatsnew", area: "settings", title: "What's new, opened from Settings", path: "/settings/", steps: [{ click: "What's new" }] },
  { id: "settings-privacy", area: "settings", title: "Settings with What Dayhub can see open: sealed (journal, sleep, reviews, keys, brief, a sleep experiment, the recovery code), readable by the server, what goes out with each of this member's switches On or Off (transcription and food estimates on), what Dayhub reads from, what an admin sees in Ops, and the record of looks at the values: yesterday and two weeks ago, each with the reason written down first", path: "/settings/", steps: [{ click: "What Dayhub can see" }, { wait: 800 }], frames: 4 },
  { id: "moment-closed", area: "moments", title: "The day closing, dinner just tapped as the last thing: the streak turns 12 to 13 and the week row shows six full days and today", path: "/", day: "last", steps: [{ click: "Dinner:" }, { wait: 2500 }] },
  { id: "moment-closed-reduced", area: "moments", title: "The same day-closing moment as someone with Reduce Motion on sees it: no animation, but it must still end showing 13 and the full week", path: "/", day: "last", reduced: true, steps: [{ click: "Dinner:" }, { wait: 600 }] },
  { id: "moment-record", area: "moments", title: "Recording a journal entry, full screen", path: "/", steps: [{ click: "Record a journal entry" }, { wait: 1500 }] },
  { id: "moment-food", area: "moments", title: "Saying what you ate, full screen, listening", path: "/", steps: [{ click: "Say what you ate" }, { wait: 1500 }] },
  { id: "moment-day", area: "moments", title: "Saying your day, full screen, recording: the cue under the heading is what is still open today, which is dinner", path: "/", steps: [{ click: "Say your day" }, { click: "Turn on and start" }, { wait: 1500 }] },
  { id: "moment-day-check", area: "moments", title: "Say your day, after the recording: the list to check. The entry is saved (a lock, no tick); reading, the salmon dinner, a glass of wine filed under Something else and 100 push-ups (replacing 60) are ticked; nothing is logged until Fill in my day", path: "/", steps: [{ click: "Say your day" }, { click: "Turn on and start" }, { wait: 1500 }, { click: "Stop and save" }, { wait: 4000 }] },

  // Day one. Everyone who joins starts here, and Dayhub starts empty for all of them (no data is migrated): the account
  // is minutes old, nothing is logged, there is no vault yet and Fitbit is not connected. A round is under way and open.
  // The address, signed out: what Dayhub is, three real screens, what stays private, and how to get in.
  { id: "front", area: "welcome", who: "visitor", title: "The front page a signed-out visitor sees at the address: the wordmark and Sign in, one sentence (Close your day in a minute), three real screens with captions, What stays yours (four points that match the privacy page), Getting in (invite or by hand), Privacy and Terms", path: "/?signedout", frames: 3 },
  { id: "front-signup", area: "welcome", who: "visitor", title: "Sign up tapped on the front page: first name, last name and email, Request access, and what happens without an invite", path: "/?signedout", steps: [{ click: "Sign up" }] },
  { id: "new-pending", area: "welcome", who: "pending", title: "Just signed up: the account waits for the admin to approve it", path: "/" },
  { id: "new-vault", area: "welcome", who: "new", title: "Day one: the Journal card tapped for the first time, which asks to create the vault", path: "/", steps: [{ click: "Record a journal entry" }] },
  { id: "new-vault-code", area: "welcome", who: "new", title: "Day one: the vault just made from the Journal card: its recovery code, shown once, with I've saved it", path: "/", steps: [{ click: "Record a journal entry" }, { fill: "Vault passphrase", value: "green kettle on the fifth floor" }, { fill: "Repeat the passphrase", value: "green kettle on the fifth floor" }, { click: "Create vault" }, { wait: 2500 }] },
  { id: "new-vault-record", area: "moments", who: "new", title: "Day one: I've saved it tapped on the new vault's recovery code, and the recording starts at once (no second tap on the Journal card)", path: "/", steps: [{ click: "Record a journal entry" }, { fill: "Vault passphrase", value: "green kettle on the fifth floor" }, { fill: "Repeat the passphrase", value: "green kettle on the fifth floor" }, { click: "Create vault" }, { wait: 2500 }, { click: "I've saved it" }, { wait: 1500 }] },
  { id: "new-today", area: "today", who: "new", title: "Today on day one, minutes after approval: nothing logged, no streak yet, no vault, Fitbit not connected", path: "/", frames: 1 },
  { id: "new-journal", area: "journal", who: "new", title: "Journal on day one: no vault made yet and no entries", path: "/journal/" },
  { id: "new-food", area: "food", who: "new", title: "Food on day one: no plan and no targets (never David's), a Your food card asking for optional calorie and protein targets or a ready-made plan, four meals saying Tap to log it, nothing logged yet", path: "/food/", frames: 1 },
  { id: "new-food-plan", area: "food", who: "new", title: "Food on day one with the Standard plan opened in the Your food card: its four meals and Use the Standard plan, nothing chosen yet", path: "/food/", steps: [{ click: "Standard" }] },
  { id: "new-meal-sheet", area: "sheets", who: "new", title: "Day one: Breakfast tapped on Today with no usual breakfast yet: a sheet asks what it was (say it or type it), with Just tick it, no numbers", path: "/", steps: [{ click: "Breakfast:" }] },
  { id: "new-meal-draft", area: "sheets", who: "new", title: "The breakfast sheet after typing and Look it up: the estimate (410 kcal) to check, Keep as my usual breakfast on, and Log breakfast", path: "/", steps: [{ click: "Breakfast:" }, { fill: "What you had for breakfast", value: "oats with berries and a coffee" }, { click: "Look it up" }, { wait: 600 }] },
  { id: "new-activity", area: "activity", who: "new", title: "Activity on day one: no push-ups yet, and a round on its twentieth day that is open to join", path: "/activity/", frames: 1 },
  { id: "new-insights", area: "insights", who: "new", title: "Insights on day one: not one day logged yet", path: "/insights/" },
  { id: "new-tomorrow", area: "tomorrow", who: "new", title: "Tomorrow's brief on day one: nothing connected", path: "/tomorrow/" },
  { id: "new-settings", area: "settings", who: "new", title: "Settings on day one: no vault, Fitbit not connected", path: "/settings/", frames: 2 },

  // Dayhub Ops, the admin's console, on invented people (ops-world.ts): a computer-sized window first, and a phone.
  { id: "ops-overview", area: "ops", view: DESK, title: "Ops overview: today's tiles, cohorts, the funnel, people a day (the first three days not counted yet), issues by kind", path: "/ops/", frames: 1 },
  { id: "ops-issues", area: "ops", view: DESK, title: "Ops issues: eight open, five need you; the first (journal entries won't open) picked, with its fix and a message ready", path: "/ops/issues/" },
  { id: "ops-person", area: "ops", view: DESK, title: "Ops, one person: fourteen days done or not with no values, their issue, errors, messages, values locked, journal never visible, AI use", path: "/ops/person/?id=800000000000000101", frames: 1 },
  { id: "ops-errors", area: "ops", view: DESK, title: "Ops errors: six problems grouped from 24 hours, the newest picked with its sample, Telegram alerts", path: "/ops/errors/", frames: 1 },
  { id: "ops-people", area: "ops", view: DESK, title: "Ops people: one waiting for approval, everyone, the sign-up invites", path: "/ops/people/" },
  { id: "ops-audit", area: "ops", view: DESK, title: "Ops audit: values shown with a reason, a message, a mute, an approval", path: "/ops/audit/" },
  { id: "ops-phone", area: "ops", title: "Ops overview on a phone: the nav is a row of tabs", path: "/ops/", frames: 1 },
];
