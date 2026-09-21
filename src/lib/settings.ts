// Settings live as one JSON blob on the profile (GET/PUT /settings). Defaults are here, not on the server:
// what is stored is only what the user changed, merged over these on load, so new settings need no migration.

import { BOWL_VARIANTS, MEAL_PLANS, SNACK_PRESETS, type BowlId, type MealPlanId } from "./food-data";
import { isPalette, THEME_MODES, type PaletteId, type ThemeMode } from "./look";
import { DEFAULT_PHRASES, NOTE_MAX, PHRASE_MAX, PHRASES_MAX, type Phrase } from "./opening";

export type Mood = { id: string; label: string; on: boolean };
export type Habit = { id: string; label: string; type: "daily" | "counter"; goal?: number; dir?: "at_least" | "at_most" };
export type Meal = "breakfast" | "lunch" | "snack" | "dinner";
export type PlannedMeal = { name: string; kcal: number; protein: number; carbs?: number; fat?: number };
export type Snack = { name: string; kcal: number; protein?: number; carbs?: number; fat?: number; portion?: string };
export type ActivityType = { key: string; name: string };

export type Settings = {
  moods: Mood[];
  habits: Habit[];
  /** Which of the Macros plans the four meals came from, and which bowl build fills the Standard plan's two bowls. */
  mealPlan: MealPlanId;
  bowl: BowlId;
  plan: Record<Meal, PlannedMeal>;
  goals: { kcal: number; protein: number; carbs: number; fat: number; steps: number };
  snacks: Snack[];
  activityTypes: ActivityType[];
  /** Per person, flat, no ramp. Round membership will carry its own target once rounds exist. */
  pushupTarget: number;
  bestStreak: number;
  /** The newest changelog release this person has seen (src/lib/changelog.ts); "" = never seen one. */
  seenChanges: string;
  /** Off until the user opts in: transcription is the one thing that sends plaintext audio off the device. */
  cloudTranscription: boolean;
  /** Let Claude estimate calories and macros for food typed in plain words. Known food is matched on the device first. */
  foodEstimate: boolean;
  /** Logging weight is one of the things that closes the day. On unless the user switches it off. */
  requireWeight: boolean;
  /** Ask for the vault passphrase when the app opens, once per tab, dismissible. The vault gates the journal, sleep and the health sync. */
  unlockOnOpen: boolean;
  /** Appearance. The colours are in globals.css; src/lib/look.ts applies these. */
  theme: ThemeMode;
  palette: PaletteId;
  /** The words shown full screen when the app opens. An empty list is a choice and stays empty. */
  opening: { on: boolean; phrases: Phrase[] };
  /** One notification at `time` (local, HH:MM) when the day is still open. The server reads this: soma_jobs/nudge.js. */
  nudge: { on: boolean; time: string };
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
  activityTypes: [{ key: "walk", name: "Walk" }, { key: "gym", name: "Gym" }, { key: "run", name: "Run" }],
  pushupTarget: 100,
  bestStreak: 0,
  seenChanges: "",
  cloudTranscription: false,
  foodEstimate: true,
  requireWeight: true,
  unlockOnOpen: true,
  theme: "light",
  palette: "soma",
  opening: { on: true, phrases: DEFAULT_PHRASES },
  nudge: { on: false, time: "20:30" },
};

/** A plan's four meals as the day's plan, with the chosen bowl build in the Standard plan's two bowl slots. */
export function planMeals(planId: MealPlanId, bowl: BowlId): Record<Meal, PlannedMeal> {
  const pick = ({ name, kcal, protein, carbs, fat }: PlannedMeal): PlannedMeal => ({ name, kcal, protein, carbs, fat });
  const meals = MEAL_PLANS[planId].meals;
  const b = planId === "standard" ? BOWL_VARIANTS[bowl] : null;
  return { breakfast: pick(meals.breakfast), lunch: pick(b || meals.lunch), snack: pick(meals.snack), dinner: pick(b || meals.dinner) };
}

// Soma first shipped with invented sample meals and snacks. An account that still holds one (it only takes one
// swap to store the whole plan) gets the real thing instead; a name the user typed themselves is never touched.
const SAMPLE_MEALS = ["Eggs & toast", "Overnight oats", "Greek yogurt bowl", "Chicken burrito bowl", "Turkey sandwich", "Lentil soup & bread", "Yogurt & berries", "Apple & almonds", "Protein shake", "Salmon, rice & greens", "Steak & sweet potato", "Veg stir-fry & tofu"];
const SAMPLE_SNACKS = ["Beef stick", "Coffee, black", "Coffee with creamer", "Spindrift"];

/** Stored values win key by key; anything missing or of the wrong kind falls back to the default. */
export function mergeSettings(stored: unknown): Settings {
  const s = (stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}) as Partial<Settings>;
  const d = DEFAULT_SETTINGS;
  const list = <T,>(v: T[] | undefined, fallback: T[]) => (Array.isArray(v) && v.length ? v : fallback);
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback);
  return {
    moods: list(s.moods, d.moods),
    habits: list(s.habits, d.habits),
    mealPlan: s.mealPlan && s.mealPlan in MEAL_PLANS ? s.mealPlan : d.mealPlan,
    bowl: s.bowl && s.bowl in BOWL_VARIANTS ? s.bowl : d.bowl,
    plan: Object.fromEntries(MEALS.map((m) => { const kept = s.plan?.[m]; return [m, kept && kept.name && !SAMPLE_MEALS.includes(kept.name) ? kept : d.plan[m]]; })) as Record<Meal, PlannedMeal>,
    goals: { ...d.goals, ...(s.goals || {}) },
    snacks: Array.isArray(s.snacks) && !(s.snacks.length > 0 && s.snacks.every((x) => SAMPLE_SNACKS.includes(x?.name))) ? s.snacks : d.snacks,
    activityTypes: list(s.activityTypes, d.activityTypes),
    pushupTarget: Math.max(1, Math.round(num(s.pushupTarget, d.pushupTarget))),
    bestStreak: Math.round(num(s.bestStreak, 0)),
    seenChanges: typeof s.seenChanges === "string" ? s.seenChanges.slice(0, 40) : "",
    cloudTranscription: s.cloudTranscription === true,
    foodEstimate: s.foodEstimate !== false,
    requireWeight: s.requireWeight !== false,
    unlockOnOpen: s.unlockOnOpen !== false,
    theme: THEME_MODES.includes(s.theme as ThemeMode) ? (s.theme as ThemeMode) : d.theme,
    palette: isPalette(s.palette) ? s.palette : d.palette,
    nudge: { on: s.nudge?.on === true, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(s.nudge?.time || "") ? s.nudge!.time : d.nudge.time },
    opening: {
      on: s.opening?.on !== false,
      phrases: Array.isArray(s.opening?.phrases)
        ? s.opening.phrases.filter((p) => p && typeof p.text === "string" && p.text.trim()).slice(0, PHRASES_MAX)
          .map((p) => ({ text: p.text.trim().slice(0, PHRASE_MAX), ...(typeof p.note === "string" && p.note.trim() ? { note: p.note.trim().slice(0, NOTE_MAX) } : {}) }))
        : d.opening.phrases,
    },
  };
}
