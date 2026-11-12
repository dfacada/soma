// Pure Today logic, ported from the prototype's dayStatus / streakInfo / viewToday. No React, no I/O.
// A day closes when every task that counts is done: weight first (settings.requireWeight), then a check-in (a mood), a
// journal entry, the meals that count (all four unless chosen otherwise) and any activity. Each person chooses which
// count (settings.closes, since 2026-11-11); all five do unless switched off. The tasks that don't count are still
// there and still logged, they just don't hold the day open. Order here is the order of the cards on Today.
// The server's copy of this rule is catalyst/functions/soma_jobs/closing.js: change one, change the other.

import type { ActivityDay, Checkin, DayLog, EntryMeta } from "./api";
import { loggedOf, movedOn, movesOf } from "./moves";
import { MEALS, type Meal, type Settings } from "./settings";

const pad = (n: number) => (n < 10 ? "0" : "") + n;

/** The user's local calendar day. The server stores whatever day the client names; it does no timezone maths. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function noon(d = new Date()) { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; }
/** "YYYY-MM-DD" → that local day at noon (clear of any daylight-saving edge). */
export function fromKey(key: string) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d, 12, 0, 0, 0); }
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type DayData = { checkin?: Checkin; log?: DayLog; activity?: ActivityDay; weight?: number; entries: number };
export type DayMap = Record<string, DayData>;

export function emptyDay(): DayData { return { entries: 0 }; }

/** Index the /days response by local day. */
export function indexDays(days: { checkins: Checkin[]; dayLogs: DayLog[]; activity: ActivityDay[]; weight: { day: string; value: number }[]; entries: EntryMeta[] }): DayMap {
  const map: DayMap = {};
  const at = (k: string) => (map[k] ||= emptyDay());
  days.checkins.forEach((c) => { at(c.day).checkin = c; });
  days.dayLogs.forEach((l) => { at(l.day).log = l; });
  days.activity.forEach((a) => { at(a.day).activity = a; });
  days.weight.forEach((w) => { at(w.day).weight = w.value; });
  days.entries.forEach((e) => { at(dayKey(new Date(e.createdMs))).entries++; });
  return map;
}

export type DayStatus = {
  /** Each task done or not, whether or not it counts. Food is done when every meal that counts is eaten. */
  checkinDone: boolean; journalDone: boolean; foodDone: boolean; weightDone: boolean; activityDone: boolean;
  /** Whether weight counts toward closing this day (settings.requireWeight). */
  weightRequired: boolean;
  /** Which tasks close this person's day (settings.requireWeight and settings.closes). */
  counts: Record<TaskKey, boolean>;
  weight: number | null;
  /** `meals`: how many of the four were eaten. `leftMeals`: the meals that count and are not eaten yet. */
  meals: number; leftMeals: Meal[]; kcal: number; protein: number; carbs: number; fat: number;
  /** The meals that count toward food, in card order. */
  mealsNeeded: Meal[];
  /** Push-ups logged, and how many of the person's moves were logged out of how many they have. */
  pushups: number; acts: number; actTotal: number;
  doneCount: number;
  /** How many tasks close the day: 5 with weight required, 4 without. */
  taskCount: number;
  closed: boolean;
  /** 0–1; food counts meal by meal. Activity is whole or nothing: one logged move is the task done (David, 2026-09-17). */
  progress: number;
  /** One segment per task, in the order they sit on Today. */
  ring: { key: TaskKey; value: number; color: string }[];
};
export type TaskKey = "checkin" | "journal" | "food" | "weight" | "activity";

export function dayStatus(data: DayData | undefined, settings: Settings): DayStatus {
  const d = data || emptyDay();
  const eaten = d.log?.meals || {};
  const c = settings.closes;
  const mealsNeeded = c.meals;
  const leftMeals = mealsNeeded.filter((m) => !eaten[m]);
  const meals = MEALS.filter((m) => eaten[m]).length;
  // What was eaten: the snapshot when there is one, the current plan for a bare `true` from before snapshots (nothing,
  // where there is no usual meal). A meal ticked with no numbers is a snapshot of zeros: eaten, counting nothing.
  const ate = [...MEALS.filter((m) => eaten[m]).map((m) => (typeof eaten[m] === "object" ? eaten[m] : settings.plan[m] ?? { kcal: 0 }) as { kcal: number; protein?: number; carbs?: number; fat?: number }), ...(d.log?.extras || [])];
  const total = (f: "kcal" | "protein" | "carbs" | "fat") => Math.round(ate.reduce((n, x) => n + (Number(x[f]) || 0), 0));
  const kcal = total("kcal");
  const pushups = d.activity?.pushups || 0;
  const moves = movesOf(settings);
  const acts = moves.filter((m) => loggedOf(d.activity, m).done).length;
  const actTotal = moves.length;

  const checkinDone = Boolean(d.checkin?.mood);
  const journalDone = d.entries > 0;
  const foodDone = leftMeals.length === 0;
  // Any move logged, even one no longer on the list; steps only at their goal (moves.ts movedOn, and nudge.js).
  const activityDone = movedOn(d.activity, settings);
  const weightRequired = settings.requireWeight;
  const weightDone = d.weight !== undefined;
  const counts: Record<TaskKey, boolean> = { weight: weightRequired, checkin: c.checkin, journal: c.journal, food: c.food, activity: c.activity };
  const ring: DayStatus["ring"] = [
    ...(counts.weight ? [{ key: "weight" as const, value: weightDone ? 1 : 0, color: "var(--food-bar)" }] : []),
    ...(counts.checkin ? [{ key: "checkin" as const, value: checkinDone ? 1 : 0, color: "var(--journal)" }] : []),
    ...(counts.journal ? [{ key: "journal" as const, value: journalDone ? 1 : 0, color: "var(--journal-soft)" }] : []),
    ...(counts.food ? [{ key: "food" as const, value: (mealsNeeded.length - leftMeals.length) / mealsNeeded.length, color: "var(--food)" }] : []),
    ...(counts.activity ? [{ key: "activity" as const, value: activityDone ? 1 : 0, color: "var(--activity)" }] : []),
  ];
  const taskCount = ring.length;
  const doneCount = [counts.checkin && checkinDone, counts.journal && journalDone, counts.food && foodDone, counts.activity && activityDone, counts.weight && weightDone].filter(Boolean).length;
  return {
    checkinDone, journalDone, foodDone, weightDone, weightRequired, counts, weight: d.weight ?? null, activityDone, meals, leftMeals, mealsNeeded, kcal, protein: total("protein"), carbs: total("carbs"), fat: total("fat"), pushups, acts, actTotal,
    doneCount, taskCount, closed: doneCount === taskCount,
    progress: ring.reduce((n, r) => n + r.value, 0) / taskCount,
    ring,
  };
}

/** Full days in a row ending today (today counts only once it is closed), and the longest run in the window. */
export function streak(map: DayMap, settings: Settings, today: Date, windowDays: number) {
  const closed = (offset: number) => dayStatus(map[dayKey(addDays(today, -offset))], settings).closed;
  let now = closed(0) ? 1 : 0;
  for (let i = 1; i <= windowDays && closed(i); i++) now++;
  let best = 0, run = 0;
  for (let i = windowDays; i >= 0; i--) { if (closed(i)) { run++; best = Math.max(best, run); } else run = 0; }
  return { now, best: Math.max(best, now, settings.bestStreak) };
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const COUNT_WORD = ["No", "One", "Two", "Three", "Four", "Five"];
/** "Five things close the day.", "One thing closes it." */
export const closesLine = (n: number, what = "the day") => (n === 1 ? `One thing closes ${what}.` : `${COUNT_WORD[n] ?? n} things close ${what}.`);

/** The meals that count, in words: "all four meals", or "breakfast, lunch and dinner". */
export function mealsWord(meals: Meal[]): string {
  if (meals.length === 4) return "all four meals";
  if (meals.length === 1) return meals[0];
  return `${meals.slice(0, -1).join(", ")} and ${meals[meals.length - 1]}`;
}

export type Todo = { label: string; color: string };

/** Hero headline, sub-line and the chips for what is left. */
export function headline(st: DayStatus, streakNow: number, hour: number): { big: string; sub: string; todos: Todo[] } {
  // Each dot is its task's domain colour, the same as its bead on the orb. Only what counts is asked for.
  const todos: Todo[] = [];
  if (st.counts.weight && !st.weightDone) todos.push({ label: "Weight", color: "var(--food)" });
  if (st.counts.checkin && !st.checkinDone) todos.push({ label: "Check in", color: "var(--journal)" });
  if (st.counts.journal && !st.journalDone) todos.push({ label: "Journal", color: "var(--journal)" });
  if (st.counts.food && !st.foodDone) todos.push({ label: st.leftMeals.length === 1 ? cap(st.leftMeals[0]) : `${st.leftMeals.length} meals`, color: "var(--food)" });
  if (st.counts.activity && !st.activityDone) todos.push({ label: "Any activity", color: "var(--activity)" });

  if (st.closed) return { big: "Day closed", sub: streakNow <= 1 ? "First full day of a new run." : `${streakNow} full days in a row.`, todos };
  if (st.progress === 0) {
    const hello = hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : "Good evening.";
    return { big: "Fresh day", sub: `${hello} ${closesLine(st.taskCount, "it")}`, todos };
  }
  if (todos.length === 1) return { big: "One to go", sub: `${todos[0].label} closes the day.`, todos };
  return { big: `${todos.length} to go`, sub: "Tap them below.", todos };
}

/** "just now", "14 minutes ago", "3 hours ago", "yesterday", "5 days ago", then the date. Null is "never". */
export function since(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return "never";
  const secs = Math.round((now - ms) / 1000);
  if (secs < 0) return "just now";
  if (secs < 90) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor((now - ms) / 86400000);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return "on " + new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
