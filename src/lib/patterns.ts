// Insights → Patterns: weight with the day-to-day noise taken out, and weight by day of the week. Worked out on the
// device from the day map, like the rest of Insights. Pure (no React), so scripts/test-patterns.mjs runs it as it is.

import type { Nights } from "./health";
import { GOOD_MOODS, HARD_MOODS } from "./insights";
import type { Settings } from "./settings";
import { dayStatus, type DayMap } from "./today";

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

// ── Mood split by condition (chart A). Each row compares the checked-in days that had a thing against those that
// did not, by the share of good, other and hard days: the same mood groups and the same tests as "what your best
// days have in common" (insights.ts), so the two never disagree. A day where the thing is unknown (no food logged,
// no steps synced, no night recorded) is on neither side. Fewer than MIN_SIDE days on either side and the row says so
// instead of drawing a share out of two days.

export const MIN_SIDE = 3;
export type MoodBand = "good" | "other" | "hard";
export type SplitSide = { days: number; good: number; other: number; hard: number };
export type SplitRow = { label: string; yes: SplitSide; no: SplitSide; enough: boolean };

const band = (mood: string): MoodBand => (GOOD_MOODS.includes(mood) ? "good" : HARD_MOODS.includes(mood) ? "hard" : "other");
const side = (): SplitSide => ({ days: 0, good: 0, other: 0, hard: 0 });

export function moodSplit(map: DayMap, days: string[], settings: Settings, nights: Nights | null): { checkedIn: number; rows: SplitRow[] } {
  const limit = settings.habits.find((h) => h.type === "counter" && h.dir === "at_most" && h.goal);
  const tests: { label: string; test: (day: string) => boolean | undefined }[] = [
    { label: `Hit your ${settings.goals.protein} g protein goal`, test: (k) => { const st = dayStatus(map[k], settings); return st.meals > 0 ? st.protein >= settings.goals.protein : undefined; } },
    { label: "10,000 steps+", test: (k) => { const s = map[k]?.activity?.steps; return s === null || s === undefined ? undefined : s >= 10000; } },
    { label: "Activity day", test: (k) => dayStatus(map[k], settings).activityDone },
    { label: "All meals logged", test: (k) => dayStatus(map[k], settings).foodDone },
    { label: "Slept 7 h+", test: (k) => { const n = nights?.[k]; return n ? n.asleep >= 420 : undefined; } },
    ...(limit ? [{ label: `${limit.label} over your limit`, test: (k: string) => (map[k]?.checkin?.counts[limit.id] || 0) > (limit.goal || 0) }] : []),
  ];
  const rows = tests.map(({ label }) => ({ label, yes: side(), no: side(), enough: false }));
  let checkedIn = 0;
  for (const k of days) {
    const mood = map[k]?.checkin?.mood;
    if (!mood) continue;
    checkedIn++;
    const b = band(mood);
    tests.forEach(({ test }, i) => {
      const had = test(k);
      if (had === undefined) return;
      const s = had ? rows[i].yes : rows[i].no;
      s.days++; s[b]++;
    });
  }
  for (const r of rows) r.enough = r.yes.days >= MIN_SIDE && r.no.days >= MIN_SIDE;
  // Sleep is only a row once a night has been recorded at all: without the vault open, or without Fitbit, it is absent.
  return { checkedIn, rows: rows.filter((r) => r.label !== "Slept 7 h+" || r.yes.days + r.no.days > 0) };
}
