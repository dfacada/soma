// Settings live as one JSON blob on the profile (GET/PUT /settings). Defaults are here, not on the server:
// what is stored is only what the user changed, merged over these on load, so new settings need no migration.

export type Mood = { id: string; label: string; on: boolean };
export type Habit = { id: string; label: string; type: "daily" | "counter"; goal?: number; dir?: "at_least" | "at_most" };
export type Meal = "breakfast" | "lunch" | "snack" | "dinner";
export type PlannedMeal = { name: string; kcal: number; protein: number; carbs?: number; fat?: number };
export type Snack = { name: string; kcal: number; protein?: number };
export type ActivityType = { key: string; name: string };

export type Settings = {
  moods: Mood[];
  habits: Habit[];
  plan: Record<Meal, PlannedMeal>;
  goals: { kcal: number; protein: number; carbs: number; fat: number; steps: number };
  snacks: Snack[];
  activityTypes: ActivityType[];
  /** Per person, flat, no ramp. Round membership will carry its own target once rounds exist. */
  pushupTarget: number;
  bestStreak: number;
  /** Off until the user opts in: transcription is the one thing that sends plaintext audio off the device. */
  cloudTranscription: boolean;
  /** Logging weight is one of the things that closes the day. On unless the user switches it off. */
  requireWeight: boolean;
  /** Ask for the vault passphrase when the app opens, once per tab, dismissible. The vault gates the journal, sleep and the health sync. */
  unlockOnOpen: boolean;
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
  plan: {
    breakfast: { name: "Eggs & toast", kcal: 470, protein: 22, carbs: 36, fat: 25 },
    lunch: { name: "Chicken burrito bowl", kcal: 640, protein: 52, carbs: 68, fat: 17 },
    snack: { name: "Yogurt & berries", kcal: 370, protein: 24, carbs: 44, fat: 10 },
    dinner: { name: "Salmon, rice & greens", kcal: 620, protein: 44, carbs: 52, fat: 25 },
  },
  snacks: [{ name: "Beef stick", kcal: 100, protein: 6 }, { name: "Coffee, black", kcal: 5 }, { name: "Coffee with creamer", kcal: 40 }, { name: "Spindrift", kcal: 10 }],
  // Standard plan defaults from docs/HANDOFF.md §6.
  goals: { kcal: 2100, protein: 200, carbs: 150, fat: 75, steps: 8000 },
  activityTypes: [{ key: "walk", name: "Walk" }, { key: "gym", name: "Gym" }, { key: "run", name: "Run" }],
  pushupTarget: 100,
  bestStreak: 0,
  cloudTranscription: false,
  requireWeight: true,
  unlockOnOpen: true,
};

/** The starter recipe book from the prototype. A user's own recipes (GET /recipes) are listed ahead of these. */
export const STARTER_RECIPES: PlannedMeal[] = [
  { name: "Eggs & toast", kcal: 470, protein: 22, carbs: 36, fat: 25 }, { name: "Overnight oats", kcal: 390, protein: 18, carbs: 56, fat: 10 },
  { name: "Greek yogurt bowl", kcal: 320, protein: 26, carbs: 34, fat: 8 }, { name: "Chicken burrito bowl", kcal: 640, protein: 52, carbs: 68, fat: 17 },
  { name: "Turkey sandwich", kcal: 520, protein: 34, carbs: 52, fat: 18 }, { name: "Lentil soup & bread", kcal: 480, protein: 24, carbs: 70, fat: 10 },
  { name: "Yogurt & berries", kcal: 370, protein: 24, carbs: 44, fat: 10 }, { name: "Apple & almonds", kcal: 260, protein: 7, carbs: 30, fat: 14 },
  { name: "Protein shake", kcal: 220, protein: 30, carbs: 14, fat: 5 }, { name: "Salmon, rice & greens", kcal: 620, protein: 44, carbs: 52, fat: 25 },
  { name: "Steak & sweet potato", kcal: 720, protein: 56, carbs: 48, fat: 32 }, { name: "Veg stir-fry & tofu", kcal: 540, protein: 30, carbs: 58, fat: 20 },
];

/** Stored values win key by key; anything missing or of the wrong kind falls back to the default. */
export function mergeSettings(stored: unknown): Settings {
  const s = (stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}) as Partial<Settings>;
  const d = DEFAULT_SETTINGS;
  const list = <T,>(v: T[] | undefined, fallback: T[]) => (Array.isArray(v) && v.length ? v : fallback);
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback);
  return {
    moods: list(s.moods, d.moods),
    habits: list(s.habits, d.habits),
    plan: { ...d.plan, ...(s.plan || {}) },
    goals: { ...d.goals, ...(s.goals || {}) },
    snacks: Array.isArray(s.snacks) ? s.snacks : d.snacks,
    activityTypes: list(s.activityTypes, d.activityTypes),
    pushupTarget: Math.max(1, Math.round(num(s.pushupTarget, d.pushupTarget))),
    bestStreak: Math.round(num(s.bestStreak, 0)),
    cloudTranscription: s.cloudTranscription === true,
    requireWeight: s.requireWeight !== false,
    unlockOnOpen: s.unlockOnOpen !== false,
  };
}
