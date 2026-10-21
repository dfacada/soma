// Insights → Patterns: weight with the day-to-day noise taken out, and weight by day of the week. Worked out on the
// device from the day map, like the rest of Insights. Pure and import-free apart from types, so
// scripts/test-patterns.mjs runs this file as it is.

import type { DayMap } from "./today";

export type WeighIn = { day: string; weight: number };

/** The weigh-ins on these days, in day order. */
export function weighIns(map: DayMap, days: string[]): WeighIn[] {
  return days.flatMap((day) => (typeof map[day]?.weight === "number" ? [{ day, weight: map[day].weight as number }] : []));
}

/** Days with any activity logged (push-ups or a ticked type): the same test that closes a day's activity task. */
export function activityDays(map: DayMap, days: string[]): string[] {
  return days.filter((day) => {
    const a = map[day]?.activity;
    return !!a && ((a.pushups || 0) > 0 || Object.values(a.types || {}).some(Boolean));
  });
}

const DAY_MS = 86400000;
const noonMs = (day: string) => new Date(day + "T12:00:00").getTime();

/** For each weigh-in, the mean of the weigh-ins in the `windowDays` calendar days ending that day. Missed days are
 *  simply absent, so a gap shortens the average rather than pulling it toward zero. */
export function trailingAverage(points: WeighIn[], windowDays = 7): { day: string; avg: number }[] {
  return points.map((p) => {
    const end = noonMs(p.day);
    const inside = points.filter((q) => { const t = noonMs(q.day); return t <= end && t > end - windowDays * DAY_MS; });
    return { day: p.day, avg: inside.reduce((s, q) => s + q.weight, 0) / inside.length };
  });
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Weigh-ins grouped Monday first, with each weekday's mean (null with none). */
export function byWeekday(points: WeighIn[]): { label: (typeof WEEKDAYS)[number]; weights: number[]; mean: number | null }[] {
  const groups = WEEKDAYS.map((label) => ({ label, weights: [] as number[], mean: null as number | null }));
  for (const p of points) groups[(new Date(p.day + "T12:00:00").getDay() + 6) % 7].weights.push(p.weight);
  for (const g of groups) g.mean = g.weights.length ? g.weights.reduce((s, w) => s + w, 0) / g.weights.length : null;
  return groups;
}

/** The weekday that stands out heaviest, and by how much against the mean of every other weigh-in. Null until there
 *  are enough weigh-ins to say anything (two on that day, eight in all) or when no day stands out by half a pound. */
export function heaviestWeekday(points: WeighIn[]): { label: string; over: number } | null {
  if (points.length < 8) return null;
  const groups = byWeekday(points).filter((g) => g.weights.length >= 2);
  if (!groups.length) return null;
  const top = groups.reduce((a, b) => ((b.mean as number) > (a.mean as number) ? b : a));
  const rest = points.filter((p) => WEEKDAYS[(new Date(p.day + "T12:00:00").getDay() + 6) % 7] !== top.label);
  if (!rest.length) return null;
  const over = (top.mean as number) - rest.reduce((s, p) => s + p.weight, 0) / rest.length;
  return over >= 0.5 ? { label: top.label, over: Math.round(over * 10) / 10 } : null;
}
