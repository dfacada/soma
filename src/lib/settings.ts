// Settings live as one JSON blob on the profile (GET/PUT /settings). Defaults are here, not on the server:
// what is stored is only what the user changed, merged over these on load, so new settings need no migration.

export type Mood = { id: string; label: string; on: boolean };
export type Habit = { id: string; label: string; type: "daily" | "counter"; goal?: number; dir?: "at_least" | "at_most" };
export type Meal = "breakfast" | "lunch" | "snack" | "dinner";
export type PlannedMeal = { name: string; kcal: number; protein: number };
export type ActivityType = { key: string; name: string };

export type Settings = {
  moods: Mood[];
  habits: Habit[];
  plan: Record<Meal, PlannedMeal>;
  goals: { kcal: number; protein: number; carbs: number; fat: number; steps: number };
  activityTypes: ActivityType[];
  /** Per person, flat, no ramp. Round membership will carry its own target once rounds exist. */
  pushupTarget: number;
  bestStreak: number;
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
    breakfast: { name: "Eggs & toast", kcal: 470, protein: 22 },
    lunch: { name: "Chicken burrito bowl", kcal: 640, protein: 52 },
    snack: { name: "Yogurt & berries", kcal: 370, protein: 24 },
    dinner: { name: "Salmon, rice & greens", kcal: 620, protein: 44 },
  },
  // Standard plan defaults from docs/HANDOFF.md §6.
  goals: { kcal: 2100, protein: 200, carbs: 150, fat: 75, steps: 8000 },
  activityTypes: [{ key: "walk", name: "Walk" }, { key: "gym", name: "Gym" }, { key: "run", name: "Run" }],
  pushupTarget: 100,
  bestStreak: 0,
};

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
    activityTypes: list(s.activityTypes, d.activityTypes),
    pushupTarget: Math.max(1, Math.round(num(s.pushupTarget, d.pushupTarget))),
    bestStreak: Math.round(num(s.bestStreak, 0)),
  };
}
