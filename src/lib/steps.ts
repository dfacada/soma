// Steps as Dayhub shows them (David, 2026-11-04: "When I click on steps I want to be able to see the history of steps
// just like clicking on the sleep"). Daily totals from Google Health live in the day map (activity.steps), so the
// history reaches as far back as the screens load: today and the 60 days before it (Days.tsx). No React, so
// scripts/test-steps.mjs runs it as it is.

import { addDays, dayKey, fromKey, type DayMap } from "./today";

/** Steps short enough to sit under a bar: 8889 → "8.9k", 12345 → "12.3k", 10000 → "10k", 950 → "950". */
export function kSteps(n: number): string {
  const v = Math.max(0, Math.round(n || 0));
  if (v < 1000) return String(v);
  if (v < 100000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(v / 1000)}k`;
}

export type StepsDay = { key: string; steps: number | null };

/** The `n` days ending with `endKey`, oldest first. A day Google reported nothing for is null, not skipped. */
export function lastDays(map: DayMap | null, endKey: string, n = 7): StepsDay[] {
  const end = fromKey(endKey);
  return Array.from({ length: n }, (_, i) => {
    const key = dayKey(addDays(end, i - n + 1));
    const s = map?.[key]?.activity?.steps;
    return { key, steps: typeof s === "number" && Number.isFinite(s) ? s : null };
  });
}

/** The days in a few numbers. A day counts once it has steps (a tracker left on the charger reports none, or zero).
 *  `openKey` is today while it is still going: it counts toward the goal only once it has reached it, and never
 *  toward the average, so a morning's few hundred steps don't drag the week down. */
export function summaryOf(days: StepsDay[], goal: number, openKey?: string) {
  const had = days.filter((d): d is { key: string; steps: number } => d.steps !== null && d.steps > 0);
  const closed = had.filter((d) => d.key !== openKey);
  const open = had.find((d) => d.key === openKey);
  const met = had.filter((d) => d.steps >= goal).length;
  const counted = closed.length + (open && open.steps >= goal ? 1 : 0);
  const avg = closed.length ? Math.round(closed.reduce((s, d) => s + d.steps, 0) / closed.length) : 0;
  const best = had.reduce<{ key: string; steps: number } | null>((b, d) => (!b || d.steps > b.steps ? d : b), null);
  return { days: had.length, counted, met, avg, best };
}

// Round steps for the chart's gridlines, smallest first.
const STEPS = [1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000];
/** The chart's top and its gridlines. The top sits a little above the goal or the tallest day, whichever is higher, so
 *  the bars use the height; the gridlines are round numbers under it, four at most. */
export function scaleOf(values: number[], goal: number): { top: number; ticks: number[] } {
  const top = Math.max(goal, 1000, ...values) * 1.1;
  const step = STEPS.find((s) => Math.floor(top / s) <= 4) ?? Math.ceil(top / 40000) * 10000;
  return { top, ticks: Array.from({ length: Math.floor(top / step) }, (_, i) => (i + 1) * step) };
}
