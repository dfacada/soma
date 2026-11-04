// The Journal's own rhythm, worked out on the phone from entries that are already decrypted; nothing here is sent
// anywhere. Which of the last two weeks' days have an entry (the dots on the record card), the run of days in a
// row, and one past entry to look back on. No React, so scripts/test-journal-days.mjs runs it as it is.

import { addDays, dayKey } from "./today";

export type Dated = { id: string; createdMs: number };

const daysOf = (items: Dated[]) => new Set(items.map((i) => dayKey(new Date(i.createdMs))));
/** Whole calendar days from b to a, by the local date (a clock change in between does not matter). */
const between = (a: Date, b: Date) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);

/** The last `n` days, oldest first, each with whether it has an entry. */
export function recentDays(items: Dated[], today: Date, n = 14): { key: string; on: boolean }[] {
  const have = daysOf(items);
  return Array.from({ length: n }, (_, i) => { const key = dayKey(addDays(today, i - n + 1)); return { key, on: have.has(key) }; });
}

/** Days in a row with an entry, ending today, or yesterday while today has none yet. */
export function journalRun(items: Dated[], today: Date): number {
  const have = daysOf(items);
  let d = have.has(dayKey(today)) ? today : addDays(today, -1);
  let n = 0;
  while (have.has(dayKey(d))) { n++; d = addDays(d, -1); }
  return n;
}

export type LookBack<T> = { item: T; days: number; label: string };

/** One entry to look back on: from about a month ago, else about a week ago. The one closest to the mark wins,
 *  then the earlier of the day. Nothing near either mark means nothing to show: a gap is not filled with another day. */
export function lookBack<T extends Dated>(items: T[], today: Date): LookBack<T> | null {
  for (const [mark, slack] of [[30, 2], [7, 1]] as const) {
    let best: T | null = null, bestGap = Infinity;
    for (const i of items) {
      const gap = Math.abs(between(today, new Date(i.createdMs)) - mark);
      if (gap > slack) continue;
      if (gap < bestGap || (gap === bestGap && best && i.createdMs < best.createdMs)) { best = i; bestGap = gap; }
    }
    if (best) {
      const days = between(today, new Date(best.createdMs));
      return { item: best, days, label: days === 7 ? "A week ago" : days >= 29 && days <= 31 ? "A month ago" : `${days} days ago` };
    }
  }
  return null;
}
