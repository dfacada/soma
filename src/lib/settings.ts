// Settings live as one JSON blob on the profile (GET/PUT /settings). Defaults are here, not on the server:
// what is stored is only what the user changed, merged over these on load, so new settings need no migration.

import { BOWL_VARIANTS, MEAL_PLANS, SNACK_PRESETS, type BowlId, type MealPlanId } from "./food-data";
import { isPalette, MOTION_MODES, THEME_MODES, type MotionMode, type PaletteId, type ThemeMode } from "./look";
import { NOTE_MAX, OPENING_SOURCES, PHRASE_MAX, PHRASES_MAX, type OpeningSource, type Phrase } from "./opening";
import { cleanExperiment, type StoredExperiment } from "./experiment";
import { cleanMoves, legacyMoves, type MoveSetting } from "./moves";
import { cleanMoods, type Mood } from "./moods";

export type { Mood } from "./moods";
export type Habit = { id: string; label: string; type: "daily" | "counter"; goal?: number; dir?: "at_least" | "at_most" };
export type Meal = "breakfast" | "lunch" | "snack" | "dinner";
export type PlannedMeal = { name: string; kcal: number; protein: number; carbs?: number; fat?: number };
export type Snack = { name: string; kcal: number; protein?: number; carbs?: number; fat?: number; portion?: string };

/** Which of the Macros plans the four meals came from, or "own": the person's own usual meals, which fill in as they
 *  log (everyone who joins from 2026-11-11 starts there, Session.tsx). */
export type PlanChoice = MealPlanId | "own";

export type Settings = {
  moods: Mood[];
  habits: Habit[];
  /** Which of the Macros plans the four meals came from, and which bowl build fills the Standard plan's two bowls. */
  mealPlan: PlanChoice;
  bowl: BowlId;
  /** The four meals one tap logs: a plan's, or the person's own usual meals. null is no usual meal there yet, so a
   *  tap asks what it was (MealSheet.tsx) and can keep the answer as the usual. */
  plan: Record<Meal, PlannedMeal | null>;
  /** Daily targets. A food target of 0 is no target: nothing is measured against it and nothing says "left". */
  goals: { kcal: number; protein: number; carbs: number; fat: number; steps: number };
  /** Sleep to aim for, in minutes: the sleep pill fills toward it. 8 hours unless changed, as Fitbit's own default. */
  sleepGoal: number;
  snacks: Snack[];
  /** The moves this person tracks, each with its own daily goal (src/lib/moves.ts). Any of them closes the day. An
   *  empty list is someone new who has not chosen yet; settings from before moves existed become their push-ups and
   *  activity types (legacyMoves), so nothing changes for them until they choose. */
  moves: MoveSetting[];
  /** The move Today and Activity lead with. One of `moves`, or "" while there are none. */
  mainMove: string;
  bestStreak: number;
  /** The newest changelog release this person has seen (src/lib/changelog.ts); "" = never seen one. */
  seenChanges: string;
  /** Whether they have been shown how to put Dayhub on their Home Screen (or are already running it from there). */
  seenInstall: boolean;
  /** The local day this person first opened Dayhub (YYYY-MM-DD), set on that open (Session.tsx). Days before it are
   *  not missed days, so the week strips leave them out. "" for everyone who joined before this existed. */
  joined: string;
  /** Whether a newcomer has answered Food's "Your food" card (their own meals and targets, or a ready-made plan). */
  foodSetUp: boolean;
  /** The first-day card on Today was put away (src/lib/first-days.ts). */
  firstDayAway: boolean;
  /** The week-one question ("What almost made you stop?"): "" not yet asked, "sent" answered, "skipped" put away. */
  weekOne: "" | "sent" | "skipped";
  /** The week in review: when it is written, whether the journal may be read to write it, and where it is sent. */
  weeklyReview: { on: boolean; dayOfWeek: number; time: string; consent: boolean; telegram: boolean; speak: boolean };
  /** Off until the user opts in: transcription is the one thing that sends plaintext audio off the device. */
  cloudTranscription: boolean;
  /** How Insights reads the journal for its tone and themes. "phone": a word list on the device, nothing leaves it
   *  (the default). "claude": names and details taken out on the device, then read by Claude with nothing about the
   *  account attached (src/lib/journal-read.ts, catalyst/functions/soma_api/routes/insights.js). */
  journalInsights: "phone" | "claude";
  /** Say your day (src/lib/say-day.ts): one recording that fills in the day. Off until the person switches it on,
   *  because that recording goes to Groq to be written down and its words to Claude to be read, whatever cloud
   *  transcription is set to. The server checks it too (routes/day.js, routes/jobs.js). */
  sayDay: boolean;
  /** Let Claude estimate calories and macros for food typed in plain words. Known food is matched on the device first. */
  foodEstimate: boolean;
  /** The experiment in progress, or the last one until its result is put away (src/lib/experiment.ts): one finding
   *  from Insights, tried for three days. Its dates and words only, never a count; sealed with the vault key when the
   *  finding rests on what the vault seals (sleep). */
  experiment: StoredExperiment | null;
  /** Logging weight is one of the things that closes the day. On unless the user switches it off. */
  requireWeight: boolean;
  /** Ask for the vault passphrase when the app opens, once per tab, dismissible. The vault gates the journal, sleep and the health sync. */
  unlockOnOpen: boolean;
  /** Appearance. The colours are in globals.css; src/lib/look.ts applies these. */
  theme: ThemeMode;
  palette: PaletteId;
  motion: MotionMode;
  /** The words shown full screen when the app opens. An empty list is a choice and stays empty. */
  /** `source`: Dayhub's own words, the person's own phrases, or both taking turns (opening.ts). */
  opening: { on: boolean; source: OpeningSource; phrases: Phrase[] };
  /** One notification at `time` (local, HH:MM) when the day is still open. The server reads this: soma_jobs/nudge.js. */
  nudge: { on: boolean; time: string };
  /** Tomorrow's brief: a notification at `time` (local, HH:MM) that it is ready (the server reads on and time:
   *  soma_jobs/nudge.js), whether the brief goes to Telegram once it is read on the phone after that time, and the
   *  last day it went (so a second phone does not send it again). */
  brief: { on: boolean; time: string; telegram: boolean; sent: string };
};

export const MEALS: Meal[] = ["breakfast", "lunch", "snack", "dinner"];

export const DEFAULT_SETTINGS: Settings = {
  moods: [
    { id: "down", label: "Down", on: true }, { id: "tired", label: "Tired", on: true }, { id: "normal", label: "Normal", on: true },
    { id: "great", label: "Great", on: true }, { id: "anxious", label: "Anxious", on: false }, { id: "focused", label: "Focused", on: true },
    { id: "peaceful", label: "Peaceful", on: true }, { id: "excited", label: "Excited", on: false },
    { id: "overwhelmed", label: "Overwhelmed", on: false }, { id: "grateful", label: "Grateful", on: false },
  ],
  habits: [
    { id: "meditate", label: "Meditate", type: "daily" }, { id: "read", label: "Read", type: "daily" },
    { id: "early", label: "Early night", type: "daily" }, { id: "water", label: "Water", type: "daily" },
    { id: "drinks", label: "Drinks", type: "counter", goal: 4, dir: "at_most" },
  ],
  // David's own setup, generated from the Macros repo (src/lib/food-data.ts): the Standard plan, beef and rice bowls.
  mealPlan: "standard",
  bowl: "beef-rice",
  plan: planMeals("standard", "beef-rice"),
  snacks: SNACK_PRESETS.map((p) => ({ ...p })),
  // Standard plan defaults from docs/HANDOFF.md §6.
  goals: { kcal: 2100, protein: 200, carbs: 150, fat: 75, steps: 8000 },
  sleepGoal: 480,
  // What nothing stored means: settings from before moves existed. A new account stores an empty list on its first
  // open (Session.tsx), so nobody new starts with push-ups.
  moves: legacyMoves({}),
  mainMove: "pushups",
  bestStreak: 0,
  seenChanges: "",
  seenInstall: false,
  joined: "",
  foodSetUp: false,
  firstDayAway: false,
  weekOne: "",
  // Off until asked for: this is the one feature where journal text leaves the device.
  weeklyReview: { on: false, dayOfWeek: 0, time: "19:00", consent: false, telegram: false, speak: true },
  cloudTranscription: false,
  journalInsights: "phone",
  sayDay: false,
  foodEstimate: true,
  experiment: null,
  requireWeight: true,
  unlockOnOpen: true,
  // Night ("dark") for everyone who never picked: only what a user changed is stored, so a stored "light" or
  // "system" was a choice and stays.
  theme: "dark",
  palette: "soma",
  motion: "lively",
  // Nobody starts with anyone else's phrases: David's first two are in Dayhub's own set (opening-words.ts).
  opening: { on: true, source: "both", phrases: [] },
  nudge: { on: false, time: "20:30" },
  brief: { on: false, time: "21:00", telegram: false, sent: "" },
};

/** No usual meals yet: each fills in the first time the person logs that meal and keeps it. */
export const OWN_PLAN: Record<Meal, PlannedMeal | null> = { breakfast: null, lunch: null, snack: null, dinner: null };

/** What a new account stores on its first open (Session.tsx; David, 2026-11-11: "their own meals"): no plan, no
 *  targets and no quick snacks, all of them David's. Nothing stored still reads as his Macros setup above, so nobody
 *  already on Dayhub sees a change. */
export const NEWCOMER_FOOD: Pick<Settings, "mealPlan" | "plan" | "goals" | "snacks"> = {
  mealPlan: "own",
  plan: OWN_PLAN,
  goals: { ...DEFAULT_SETTINGS.goals, kcal: 0, protein: 0, carbs: 0, fat: 0 },
  snacks: [],
};

/** Whether a food target is set: 0 is none. */
export const hasTarget = (n: number) => Number.isFinite(n) && n > 0;

/** A plan's four meals as the day's plan, with the chosen bowl build in the Standard plan's two bowl slots. */
export function planMeals(planId: MealPlanId, bowl: BowlId): Record<Meal, PlannedMeal> {
  const pick = ({ name, kcal, protein, carbs, fat }: PlannedMeal): PlannedMeal => ({ name, kcal, protein, carbs, fat });
  const meals = MEAL_PLANS[planId].meals;
  const b = planId === "standard" ? BOWL_VARIANTS[bowl] : null;
  return { breakfast: pick(meals.breakfast), lunch: pick(b || meals.lunch), snack: pick(meals.snack), dinner: pick(b || meals.dinner) };
}

// Dayhub first shipped with invented sample meals and snacks. An account that still holds one (it only takes one
// swap to store the whole plan) gets the real thing instead; a name the user typed themselves is never touched.
const SAMPLE_MEALS = ["Eggs & toast", "Overnight oats", "Greek yogurt bowl", "Chicken burrito bowl", "Turkey sandwich", "Lentil soup & bread", "Yogurt & berries", "Apple & almonds", "Protein shake", "Salmon, rice & greens", "Steak & sweet potato", "Veg stir-fry & tofu"];
const SAMPLE_SNACKS = ["Beef stick", "Coffee, black", "Coffee with creamer", "Spindrift"];

/** Moves as stored, or, for settings from before moves, the push-up target and activity types they had. */
function movesFrom(s: Partial<Settings>): Pick<Settings, "moves" | "mainMove"> {
  const moves = Array.isArray(s.moves) ? cleanMoves(s.moves) : legacyMoves(s as { pushupTarget?: unknown; activityTypes?: unknown });
  const main = typeof s.mainMove === "string" && moves.some((m) => m.key === s.mainMove) ? s.mainMove : moves[0]?.key ?? "";
  return { moves, mainMove: main };
}

/** Stored values win key by key; anything missing or of the wrong kind falls back to the default. */
export function mergeSettings(stored: unknown): Settings {
  const s = (stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}) as Partial<Settings>;
  const d = DEFAULT_SETTINGS;
  const list = <T,>(v: T[] | undefined, fallback: T[]) => (Array.isArray(v) && v.length ? v : fallback);
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback);
  const mealPlan: PlanChoice = s.mealPlan === "own" || (s.mealPlan && s.mealPlan in MEAL_PLANS) ? s.mealPlan : d.mealPlan;
  return {
    moods: cleanMoods(s.moods, d.moods),
    habits: list(s.habits, d.habits),
    mealPlan,
    bowl: s.bowl && s.bowl in BOWL_VARIANTS ? s.bowl : d.bowl,
    // A meal kept as null is a usual meal not made yet; on their own meals a missing one is too, never David's.
    plan: Object.fromEntries(MEALS.map((m) => {
      const kept = s.plan?.[m];
      if (kept === null) return [m, null];
      return [m, kept && kept.name && !SAMPLE_MEALS.includes(kept.name) ? kept : mealPlan === "own" ? null : d.plan[m]];
    })) as Record<Meal, PlannedMeal | null>,
    goals: { ...d.goals, ...(s.goals || {}) },
    sleepGoal: typeof s.sleepGoal === "number" && s.sleepGoal >= 240 && s.sleepGoal <= 720 ? Math.round(s.sleepGoal) : d.sleepGoal,
    snacks: Array.isArray(s.snacks) && !(s.snacks.length > 0 && s.snacks.every((x) => SAMPLE_SNACKS.includes(x?.name))) ? s.snacks : d.snacks,
    ...movesFrom(s),
    bestStreak: Math.round(num(s.bestStreak, 0)),
    seenChanges: typeof s.seenChanges === "string" ? s.seenChanges.slice(0, 40) : "",
    seenInstall: s.seenInstall === true,
    joined: typeof s.joined === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.joined) ? s.joined : "",
    foodSetUp: s.foodSetUp === true,
    firstDayAway: s.firstDayAway === true,
    weekOne: s.weekOne === "sent" || s.weekOne === "skipped" ? s.weekOne : "",
    weeklyReview: {
      on: s.weeklyReview?.on === true,
      dayOfWeek: [0, 1, 2, 3, 4, 5, 6].includes(Number(s.weeklyReview?.dayOfWeek)) ? Number(s.weeklyReview!.dayOfWeek) : d.weeklyReview.dayOfWeek,
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(s.weeklyReview?.time || "") ? s.weeklyReview!.time : d.weeklyReview.time,
      consent: s.weeklyReview?.consent === true,
      telegram: s.weeklyReview?.telegram === true,
      speak: s.weeklyReview?.speak !== false,
    },
    cloudTranscription: s.cloudTranscription === true,
    journalInsights: s.journalInsights === "claude" ? "claude" : "phone",
    sayDay: s.sayDay === true,
    foodEstimate: s.foodEstimate !== false,
    experiment: cleanExperiment(s.experiment),
    requireWeight: s.requireWeight !== false,
    unlockOnOpen: s.unlockOnOpen !== false,
    theme: THEME_MODES.includes(s.theme as ThemeMode) ? (s.theme as ThemeMode) : d.theme,
    palette: isPalette(s.palette) ? s.palette : d.palette,
    motion: MOTION_MODES.includes(s.motion as MotionMode) ? (s.motion as MotionMode) : d.motion,
    nudge: { on: s.nudge?.on === true, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(s.nudge?.time || "") ? s.nudge!.time : d.nudge.time },
    brief: {
      on: s.brief?.on === true,
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(s.brief?.time || "") ? s.brief!.time : d.brief.time,
      telegram: s.brief?.telegram === true,
      sent: /^\d{4}-\d{2}-\d{2}$/.test(s.brief?.sent || "") ? s.brief!.sent : "",
    },
    opening: {
      on: s.opening?.on !== false,
      source: OPENING_SOURCES.includes(s.opening?.source as OpeningSource) ? (s.opening!.source as OpeningSource) : d.opening.source,
      phrases: Array.isArray(s.opening?.phrases)
        ? s.opening.phrases.filter((p) => p && typeof p.text === "string" && p.text.trim()).slice(0, PHRASES_MAX)
          .map((p) => ({ text: p.text.trim().slice(0, PHRASE_MAX), ...(typeof p.note === "string" && p.note.trim() ? { note: p.note.trim().slice(0, NOTE_MAX) } : {}) }))
        : d.opening.phrases,
    },
  };
}
