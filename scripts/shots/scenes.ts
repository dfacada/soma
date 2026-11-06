// Every screen the polish loop looks at. An area is one maker's patch (the files it changes); a scene is one
// screenshot (a route, plus the taps that get there). Add a scene here when a screen or sheet is added.
//
// Steps are Playwright locators by role and accessible name, so a renamed button breaks the scene loudly (the
// capture names the step that failed) instead of quietly shooting the wrong screen.

import type { DayShape } from "./world";

export type Step =
  | { click: string; role?: "button" | "link" | "tab" | "switch" | "checkbox"; exact?: boolean; nth?: number }
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
};

export type Area = {
  id: string;
  title: string;
  /** The files this area's maker changes. Shared files (globals.css, ui/*, app.module.css, screens.module.css) belong
   *  to the system pass, so one area's fix never quietly restyles another's screen. */
  files: string[];
};

export const AREAS: Area[] = [
  { id: "today", title: "Today: the orb, the day's tasks and the week strip", files: ["src/components/app/Today.tsx", "src/components/app/today.module.css", "src/components/app/DayBanner.tsx", "src/components/ui/Orb.tsx"] },
  { id: "sheets", title: "Today's sheets: weight, check-in, push-ups, steps and sleep", files: ["src/components/app/WeightSheet.tsx", "src/components/app/PushSheet.tsx", "src/components/app/sheets.module.css", "src/components/app/Steps.tsx", "src/components/app/steps.module.css", "src/components/app/Sleep.tsx", "src/components/app/sleep.module.css"] },
  { id: "journal", title: "Journal: entries, search, the vault", files: ["src/components/app/JournalScreen.tsx"] },
  { id: "food", title: "Food: the day's meals, macros and saying what you ate", files: ["src/components/app/Food.tsx", "src/components/app/FoodSay.tsx"] },
  { id: "activity", title: "Activity: push-ups, moves and the round", files: ["src/components/app/Activity.tsx", "src/components/app/Rounds.tsx"] },
  { id: "insights", title: "Insights: trends and patterns", files: ["src/components/app/Insights.tsx", "src/components/app/insights.module.css"] },
  { id: "tomorrow", title: "Tomorrow: the evening brief", files: ["src/components/app/Tomorrow.tsx", "src/components/app/tomorrow.module.css"] },
  { id: "settings", title: "Settings and What's new", files: ["src/components/app/Settings.tsx", "src/components/app/WhatsNew.tsx", "src/components/app/Telegram.tsx"] },
  { id: "moments", title: "Full-screen moments: recording, saying what you ate, the day closing", files: ["src/components/app/Moments.tsx", "src/components/app/moments.module.css"] },
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
export const SCENES: Scene[] = [
  { id: "today", area: "today", title: "Today at 7:30 pm: 3 of 5 done, journal and dinner left, a 12-day streak (best 21)", path: "/", frames: 1 },
  { id: "today-closed", area: "today", title: "Today with all five done: the day is closed and the streak is 13", path: "/", day: "closed" },
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
  { id: "tomorrow", area: "tomorrow", title: "Tomorrow's brief", path: "/tomorrow/" },
  { id: "settings", area: "settings", title: "Settings, top of the page", path: "/settings/", frames: 1 },
  { id: "settings-appearance", area: "settings", title: "Settings with Appearance open", path: "/settings/", steps: [{ click: "Appearance" }] },
  { id: "whatsnew", area: "settings", title: "What's new, opened from Settings", path: "/settings/", steps: [{ click: "What's new" }] },
  { id: "moment-closed", area: "moments", title: "The day closing, dinner just tapped as the last thing: the streak turns 12 to 13 and the week row shows six full days and today", path: "/", day: "last", steps: [{ click: "Dinner:" }, { wait: 2500 }] },
  { id: "moment-closed-reduced", area: "moments", title: "The same day-closing moment as someone with Reduce Motion on sees it: no animation, but it must still end showing 13 and the full week", path: "/", day: "last", reduced: true, steps: [{ click: "Dinner:" }, { wait: 600 }] },
  { id: "moment-record", area: "moments", title: "Recording a journal entry, full screen", path: "/", steps: [{ click: "Record a journal entry" }, { wait: 1500 }] },
  { id: "moment-food", area: "moments", title: "Saying what you ate, full screen, listening", path: "/", steps: [{ click: "Say what you ate" }, { wait: 1500 }] },
];
