// Insights from what Soma actually records. Pure: a window of days in, plain numbers out.
// Sleep comes from Google Health when it is connected and the vault is open; without it those parts are null.
// The written pattern analysis still needs the Claude job. Everything here is a count of what was really logged:
// "on your best days you more often…" is a pattern in the record, never a claim about cause.

import { addDays, dayKey, dayStatus, type DayMap } from "./today";
import type { Nights } from "./health";
import type { Settings } from "./settings";

export const GOOD_MOODS = ["Focused", "Peaceful", "Great", "Grateful", "Excited"];
export const HARD_MOODS = ["Down", "Overwhelmed", "Anxious"];

/** Something a day either had or did not. `good`/`rest` count the days that had it, out of the days where it is known. */
export type Factor = { label: string; good: number; goodDays: number; rest: number; restDays: number; /** share on good days minus share on the rest, -1…1 */ lift: number };
export type SleepInsight = {
  nights: number; avg: number;
  /** Average minutes asleep the night before good and hard days; null without at least one such night. */
  goodAvg: number | null; hardAvg: number | null;
  /** Checked-in days by how long the night before was, and how many of them were good days. */
  buckets: { label: string; nights: number; good: number }[];
  hardShort: number; hardNights: number;
};
/** Both groups need this many known days before a factor is compared at all. */
export const FACTOR_MIN_DAYS = 3;
export const SLEEP_BUCKETS = [{ label: "under 6.5 h", below: 390 }, { label: "6.5 to 7.5 h", below: 451 }, { label: "over 7.5 h", below: Infinity }];

export type Insights = {
  days: number;
  checkedIn: number; closed: number;
  /** Share of days each task was done, 0–1. */
  rates: { checkin: number; journal: number; food: number; weight: number; activity: number };
  moods: { label: string; count: number }[];
  good: { days: number; withActivity: number; withAllMeals: number };
  hard: { days: number; withActivity: number; withAllMeals: number; overLimit: number; limitLabel: string | null };
  /** Of all checked-in days, how often an activity was logged. The baseline the two above are read against. */
  baselineActivity: number;
  food: { loggedDays: number; avgKcal: number; avgProtein: number; onTarget: number };
  pushups: { days: number; total: number; best: number; hitDays: number };
  weight: { first: number; last: number; change: number; points: number } | null;
  /** Null when no night in the window is known (not connected, or the vault is closed). */
  sleep: SleepInsight | null;
  /** Most over-represented on good days first. Only factors with enough days on both sides. */
  factors: Factor[];
  steps: { days: number; avg: number };
};

export function insights(map: DayMap, settings: Settings, today: Date, windowDays: number, pushupTarget: number, nights: Nights | null = null): Insights {
  const keys = Array.from({ length: windowDays }, (_, i) => dayKey(addDays(today, i - (windowDays - 1))));
  const moodCount = new Map<string, number>();
  const out: Insights = {
    days: windowDays, checkedIn: 0, closed: 0, rates: { checkin: 0, journal: 0, food: 0, weight: 0, activity: 0 }, moods: [],
    good: { days: 0, withActivity: 0, withAllMeals: 0 }, hard: { days: 0, withActivity: 0, withAllMeals: 0, overLimit: 0, limitLabel: null },
    baselineActivity: 0, food: { loggedDays: 0, avgKcal: 0, avgProtein: 0, onTarget: 0 }, pushups: { days: 0, total: 0, best: 0, hitDays: 0 }, weight: null,
    sleep: null, factors: [], steps: { days: 0, avg: 0 },
  };
  // The first "at most" counter habit (Drinks ≤ 4 by default) is the one worth flagging on hard days.
  const limit = settings.habits.find((h) => h.type === "counter" && h.dir === "at_most" && h.goal);
  out.hard.limitLabel = limit ? limit.label : null;

  const done = { checkin: 0, journal: 0, food: 0, weight: 0, activity: 0 };
  let kcal = 0, protein = 0, activeCheckedIn = 0;
  const weights: number[] = [];
  // label → [had it on good days, good days known, had it on other days, other days known]
  const tally = new Map<string, [number, number, number, number]>();
  const note = (label: string, isGood: boolean, had: boolean | undefined) => {
    if (had === undefined) return;
    const t = tally.get(label) || [0, 0, 0, 0];
    tally.set(label, t);
    if (isGood) { t[1]++; if (had) t[0]++; } else { t[3]++; if (had) t[2]++; }
  };
  const sleep = { nights: 0, total: 0, good: [] as number[], hard: [] as number[], buckets: SLEEP_BUCKETS.map((b) => ({ label: b.label, nights: 0, good: 0 })), hardShort: 0 };
  let stepTotal = 0;

  for (const k of keys) {
    const d = map[k];
    const st = dayStatus(d, settings);
    if (st.checkinDone) done.checkin++;
    if (st.journalDone) done.journal++;
    if (st.foodDone) done.food++;
    if (st.weightDone) done.weight++;
    if (st.activityDone) done.activity++;
    if (st.closed) out.closed++;
    if (d?.weight !== undefined) weights.push(d.weight);
    const steps = d?.activity?.steps;
    if (steps !== null && steps !== undefined) { out.steps.days++; stepTotal += steps; }
    const night = nights?.[k];
    if (night) { sleep.nights++; sleep.total += night.asleep; }

    if (st.meals > 0 || (d?.log?.extras || []).length) {
      out.food.loggedDays++; kcal += st.kcal; protein += st.protein;
      if (Math.abs(st.kcal - settings.goals.kcal) <= settings.goals.kcal * 0.1) out.food.onTarget++;
    }
    if (st.pushups > 0) {
      out.pushups.days++; out.pushups.total += st.pushups; out.pushups.best = Math.max(out.pushups.best, st.pushups);
      if (st.pushups >= pushupTarget) out.pushups.hitDays++;
    }

    const mood = d?.checkin?.mood;
    if (!mood) continue;
    out.checkedIn++;
    moodCount.set(mood, (moodCount.get(mood) || 0) + 1);
    if (st.activityDone) activeCheckedIn++;

    // What this day had, for "what do my best days have in common". Undefined means unknown, and is not counted.
    const isGood = GOOD_MOODS.includes(mood);
    note("Did push-ups", isGood, st.pushups > 0);
    note("Hit the push-up target", isGood, st.pushups > 0 ? st.pushups >= pushupTarget : undefined);
    for (const t of settings.activityTypes) note(t.name, isGood, Boolean(d?.activity?.types[t.key]));
    for (const h of settings.habits) {
      if (h.type === "daily") note(h.label, isGood, Boolean(d?.checkin?.habits[h.id]));
      else if (h.goal) { const c = d?.checkin?.counts[h.id] || 0; note(`${h.label} ${h.dir === "at_most" ? "at or under" : "at least"} ${h.goal}`, isGood, h.dir === "at_most" ? c <= h.goal : c >= h.goal); }
    }
    note("Journaled", isGood, st.journalDone);
    note("Ate all four meals", isGood, st.foodDone);
    note(`${Math.round(settings.goals.protein * 0.9)} g of protein or more`, isGood, st.meals > 0 ? st.protein >= settings.goals.protein * 0.9 : undefined);
    note(`${settings.goals.steps.toLocaleString("en-US")} steps or more`, isGood, steps === null || steps === undefined ? undefined : steps >= settings.goals.steps);
    note("Slept 7 hours or more", isGood, night ? night.asleep >= 420 : undefined);
    // "23:41" is before midnight, "00:30" is after; anything from noon on counts as the evening before.
    note("Asleep before midnight", isGood, night && night.start ? night.start >= "12:00" : undefined);
    if (night) {
      const b = sleep.buckets[SLEEP_BUCKETS.findIndex((x) => night.asleep < x.below)];
      b.nights++;
      if (isGood) { b.good++; sleep.good.push(night.asleep); }
      if (HARD_MOODS.includes(mood)) { sleep.hard.push(night.asleep); if (night.asleep < 360) sleep.hardShort++; }
    }
    const bucket = GOOD_MOODS.includes(mood) ? out.good : HARD_MOODS.includes(mood) ? out.hard : null;
    if (!bucket) continue;
    bucket.days++;
    if (st.activityDone) bucket.withActivity++;
    if (st.foodDone) bucket.withAllMeals++;
    if (bucket === out.hard && limit && (d?.checkin?.counts[limit.id] || 0) > (limit.goal || 0)) out.hard.overLimit++;
  }

  out.rates = { checkin: done.checkin / windowDays, journal: done.journal / windowDays, food: done.food / windowDays, weight: done.weight / windowDays, activity: done.activity / windowDays };
  out.moods = [...moodCount.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  out.baselineActivity = out.checkedIn ? activeCheckedIn / out.checkedIn : 0;
  if (out.food.loggedDays) { out.food.avgKcal = Math.round(kcal / out.food.loggedDays); out.food.avgProtein = Math.round(protein / out.food.loggedDays); }
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : null);
  if (sleep.nights) out.sleep = { nights: sleep.nights, avg: Math.round(sleep.total / sleep.nights), goodAvg: mean(sleep.good), hardAvg: mean(sleep.hard), buckets: sleep.buckets, hardShort: sleep.hardShort, hardNights: sleep.hard.length };
  if (out.steps.days) out.steps.avg = Math.round(stepTotal / out.steps.days);
  out.factors = [...tally.entries()]
    .filter(([, t]) => t[1] >= FACTOR_MIN_DAYS && t[3] >= FACTOR_MIN_DAYS)
    .map(([label, t]) => ({ label, good: t[0], goodDays: t[1], rest: t[2], restDays: t[3], lift: t[0] / t[1] - t[2] / t[3] }))
    .sort((a, b) => b.lift - a.lift);
  if (weights.length >= 2) out.weight = { first: weights[0], last: weights[weights.length - 1], change: Math.round((weights[weights.length - 1] - weights[0]) * 10) / 10, points: weights.length };
  return out;
}

/** One line of the plain record: what the scale said, whether the day closed, and what was actually done. */
export type LogRow = {
  day: string; weight: number | null; mood: string | null;
  closed: boolean; done: number; total: number;
  /** What kept the day open, in card order: "Weight", "Check-in", "Journal", "2 meals", "Activity". */
  missed: string[];
  /** "100 push-ups", then each activity type logged, then steps when known. */
  did: string[];
  /** Nothing at all was logged that day. */
  empty: boolean;
};

/** Newest first. Days before the first thing ever logged in the window are left off: they are not misses, they are before. */
export function dayLog(map: DayMap, settings: Settings, today: Date, windowDays: number): LogRow[] {
  const rows: LogRow[] = [];
  for (let i = 0; i < windowDays; i++) {
    const day = dayKey(addDays(today, -i));
    const d = map[day];
    const st = dayStatus(d, settings);
    const missed: string[] = [];
    if (st.weightRequired && !st.weightDone) missed.push("Weight");
    if (!st.checkinDone) missed.push("Check-in");
    if (!st.journalDone) missed.push("Journal");
    if (!st.foodDone) missed.push(st.leftMeals.length === 4 ? "Food" : `${st.leftMeals.length} meal${st.leftMeals.length === 1 ? "" : "s"}`);
    if (!st.activityDone) missed.push("Activity");
    const did: string[] = [];
    if (st.pushups > 0) did.push(`${st.pushups.toLocaleString("en-US")} push-ups`);
    for (const t of settings.activityTypes) if (d?.activity?.types[t.key]) did.push(t.name);
    const steps = d?.activity?.steps;
    if (steps !== null && steps !== undefined && steps > 0) did.push(`${steps.toLocaleString("en-US")} steps`);
    const empty = st.doneCount === 0 && st.meals === 0 && st.weight === null && did.length === 0;
    rows.push({ day, weight: st.weight, mood: d?.checkin?.mood ?? null, closed: st.closed, done: st.doneCount, total: st.taskCount, missed, did, empty });
  }
  while (rows.length && rows[rows.length - 1].empty) rows.pop();
  return rows;
}
