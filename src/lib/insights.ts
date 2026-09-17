// Insights from what Soma actually records. Pure: a window of days in, plain numbers out.
// The prototype's sleep correlations and the written pattern analysis need Fitbit and the Claude job;
// until those exist this file only counts things that were really logged.

import { addDays, dayKey, dayStatus, type DayMap } from "./today";
import type { Settings } from "./settings";

export const GOOD_MOODS = ["Focused", "Peaceful", "Great", "Grateful", "Excited"];
export const HARD_MOODS = ["Down", "Overwhelmed", "Anxious"];

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
};

export function insights(map: DayMap, settings: Settings, today: Date, windowDays: number, pushupTarget: number): Insights {
  const keys = Array.from({ length: windowDays }, (_, i) => dayKey(addDays(today, i - (windowDays - 1))));
  const moodCount = new Map<string, number>();
  const out: Insights = {
    days: windowDays, checkedIn: 0, closed: 0, rates: { checkin: 0, journal: 0, food: 0, weight: 0, activity: 0 }, moods: [],
    good: { days: 0, withActivity: 0, withAllMeals: 0 }, hard: { days: 0, withActivity: 0, withAllMeals: 0, overLimit: 0, limitLabel: null },
    baselineActivity: 0, food: { loggedDays: 0, avgKcal: 0, avgProtein: 0, onTarget: 0 }, pushups: { days: 0, total: 0, best: 0, hitDays: 0 }, weight: null,
  };
  // The first "at most" counter habit (Drinks ≤ 4 by default) is the one worth flagging on hard days.
  const limit = settings.habits.find((h) => h.type === "counter" && h.dir === "at_most" && h.goal);
  out.hard.limitLabel = limit ? limit.label : null;

  const done = { checkin: 0, journal: 0, food: 0, weight: 0, activity: 0 };
  let kcal = 0, protein = 0, activeCheckedIn = 0;
  const weights: number[] = [];

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
  if (weights.length >= 2) out.weight = { first: weights[0], last: weights[weights.length - 1], change: Math.round((weights[weights.length - 1] - weights[0]) * 10) / 10, points: weights.length };
  return out;
}
