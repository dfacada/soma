// Pure Today logic, ported from the prototype's dayStatus / streakInfo / viewToday. No React, no I/O.
// A day closes when every task is done: check-in (a mood), a journal entry, all four meals, and any activity, plus weight
// first of all unless the user has switched that requirement off. Order here is the order of the cards on Today.

import type { ActivityDay, Checkin, DayLog, EntryMeta } from "./api";
import { MEALS, type Meal, type Settings } from "./settings";

const pad = (n: number) => (n < 10 ? "0" : "") + n;

/** The user's local calendar day. The server stores whatever day the client names; it does no timezone maths. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function noon(d = new Date()) { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; }
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
  checkinDone: boolean; journalDone: boolean; foodDone: boolean; weightDone: boolean; activityDone: boolean;
  /** Whether weight counts toward closing this day (settings.requireWeight). */
  weightRequired: boolean;
  weight: number | null;
  meals: number; leftMeals: Meal[]; kcal: number; protein: number; carbs: number; fat: number;
  pushups: number; acts: number; actTotal: number;
  doneCount: number;
  /** How many tasks close the day: 5 with weight required, 4 without. */
  taskCount: number;
  closed: boolean;
  /** 0–1; food counts meal by meal. Activity is whole or nothing: one logged activity is the task done (David, 2026-09-17). */
  progress: number;
  /** One segment per task, in the order they sit on Today. */
  ring: { key: TaskKey; value: number; color: string }[];
};
export type TaskKey = "checkin" | "journal" | "food" | "weight" | "activity";

export function dayStatus(data: DayData | undefined, settings: Settings): DayStatus {
  const d = data || emptyDay();
  const eaten = d.log?.meals || {};
  const leftMeals = MEALS.filter((m) => !eaten[m]);
  const meals = 4 - leftMeals.length;
  // What was eaten: the snapshot when there is one, the current plan for a bare `true` from before snapshots.
  const ate = [...MEALS.filter((m) => eaten[m]).map((m) => (typeof eaten[m] === "object" ? eaten[m] : settings.plan[m]) as { kcal: number; protein?: number; carbs?: number; fat?: number }), ...(d.log?.extras || [])];
  const total = (f: "kcal" | "protein" | "carbs" | "fat") => Math.round(ate.reduce((n, x) => n + (Number(x[f]) || 0), 0));
  const kcal = total("kcal");
  const pushups = d.activity?.pushups || 0;
  const types = d.activity?.types || {};
  const acts = (pushups > 0 ? 1 : 0) + settings.activityTypes.filter((t) => types[t.key]).length;
  const actTotal = 1 + settings.activityTypes.length;

  const checkinDone = Boolean(d.checkin?.mood);
  const journalDone = d.entries > 0;
  const foodDone = meals === 4;
  const activityDone = acts > 0;
  const weightRequired = settings.requireWeight;
  const weightDone = d.weight !== undefined;
  const ring: DayStatus["ring"] = [
    ...(weightRequired ? [{ key: "weight" as const, value: weightDone ? 1 : 0, color: "var(--food-bar)" }] : []),
    { key: "checkin", value: checkinDone ? 1 : 0, color: "var(--journal)" },
    { key: "journal", value: journalDone ? 1 : 0, color: "var(--journal-soft)" },
    { key: "food", value: meals / 4, color: "var(--food)" },
    { key: "activity", value: activityDone ? 1 : 0, color: "var(--activity)" },
  ];
  const taskCount = ring.length;
  const doneCount = [checkinDone, journalDone, foodDone, activityDone, weightRequired && weightDone].filter(Boolean).length;
  return {
    checkinDone, journalDone, foodDone, weightDone, weightRequired, weight: d.weight ?? null, activityDone, meals, leftMeals, kcal, protein: total("protein"), carbs: total("carbs"), fat: total("fat"), pushups, acts, actTotal,
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

export type Todo = { label: string; color: string };

/** Hero headline, sub-line and the chips for what is left. */
export function headline(st: DayStatus, streakNow: number, hour: number): { big: string; sub: string; todos: Todo[] } {
  const todos: Todo[] = [];
  if (st.weightRequired && !st.weightDone) todos.push({ label: "Weight", color: "var(--food-bar)" });
  if (!st.checkinDone) todos.push({ label: "Check in", color: "var(--journal)" });
  if (!st.journalDone) todos.push({ label: "Journal", color: "var(--journal-soft)" });
  if (!st.foodDone) todos.push({ label: st.leftMeals.length === 1 ? cap(st.leftMeals[0]) : `${st.leftMeals.length} meals`, color: "var(--food)" });
  if (!st.activityDone) todos.push({ label: "Any activity", color: "var(--activity)" });

  if (st.closed) return { big: "Day closed", sub: streakNow <= 1 ? "First full day of a new run." : `${streakNow} full days in a row.`, todos };
  if (st.progress === 0) {
    const hello = hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : "Good evening.";
    return { big: "Fresh day", sub: `${hello} ${st.taskCount === 5 ? "Five" : "Four"} things close it.`, todos };
  }
  if (todos.length === 1) return { big: "One to go", sub: `${todos[0].label} closes the day.`, todos };
  return { big: `${todos.length} to go`, sub: "Tap them below.", todos };
}
