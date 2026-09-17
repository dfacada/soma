// Push-up round rules. Pure functions, no I/O, no imports: ported from the 100 Push-Ups app's lib/domain
// (which was itself a port of the original spreadsheet) and tested by scripts/test-round.mjs.
//
// What Soma changed, on purpose (docs/HANDOFF.md §2):
//   - The target is per person and flat. There is no ramp and no test number.
//   - Points are hits and streak only. Total reps are left out: with per-person targets, counting reps would
//     rank a 100-a-day member above a 30-a-day member for the size of the target, not for keeping to it.
//   - Logs are the same `activity` rows Today writes, matched to a round by calendar date. One source of truth.
//   - Today is never a miss while it is still today: it counts once hit, and until then it neither breaks nor
//     extends a streak. (The spreadsheet froze the streak at the last logged day instead.)
// What did not change: a rest day carries the streak, neither breaking nor extending it.

export type Round = {
  id: string; name: string;
  /** Civil date, YYYY-MM-DD. Day 1 of the round. */
  startDate: string;
  lengthDays: number;
  /** 1-indexed day numbers. */
  restDays: number[];
  bonusHit: number; bonusStreak: number; badgeStreak: number; badgeHits: number;
  joinOpen: boolean; archived: boolean;
};
export type Member = { userId: string; displayName: string; dailyTarget: number; startDay: number; joinSeq: number; status: "active" | "removed" };
/** dayIndex → reps. An absent key means nothing was logged that day. */
export type Log = Record<number, number>;
export type Phase = "upcoming" | "running" | "finished" | "archived";

// ── Civil dates: strings in, strings out, UTC arithmetic inside so DST can never shift a day ──
const DAY_MS = 86_400_000;
const utc = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const diffDays = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY_MS);
export function addDaysIso(iso: string, n: number) {
  const d = new Date(utc(iso) + n * DAY_MS);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
/** 1 on the start date. Less than 1 before the round, more than lengthDays after it. */
export const dayIndexOf = (round: Pick<Round, "startDate">, iso: string) => diffDays(round.startDate, iso) + 1;
export const dateOfDay = (round: Pick<Round, "startDate">, dayIndex: number) => addDaysIso(round.startDate, dayIndex - 1);

/** One rest day a week for six weeks, then two a week: 7, 14, … 42, 46, 49, 53, 56 … */
export function defaultRestDays(lengthDays: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= lengthDays; d++) if (d % 7 === 0 || (d > 42 && d % 7 === 4)) out.push(d);
  return out;
}
export const isRestDay = (round: Pick<Round, "restDays">, day: number) => round.restDays.includes(day);

export function phaseOf(round: Round, todayIso: string): Phase {
  if (round.archived) return "archived";
  const d = dayIndexOf(round, todayIso);
  // Day N is itself a training day; the round is only finished the day after.
  return d < 1 ? "upcoming" : d > round.lengthDays ? "finished" : "running";
}

/** Guidance, not arithmetic: 53 becomes "3 × 18". Kept from the spreadsheet. */
export function setBreakdown(target: number) {
  const sets = Math.max(2, Math.round(target / 18));
  return { sets, reps: Math.round(target / sets) };
}

export type Stats = {
  userId: string; displayName: string; dailyTarget: number; joinSeq: number;
  /** Training days that are over, plus today once it is hit. */
  scored: number;
  hits: number; total: number; currentStreak: number; bestStreak: number;
  points: number; rank: number; badges: ("crown" | "streak" | "hits")[];
};

export function memberStats(round: Round, m: Member, log: Log, todayIso: string): Omit<Stats, "rank" | "badges"> {
  const today = dayIndexOf(round, todayIso);
  const last = Math.min(today, round.lengthDays);
  let scored = 0, hits = 0, total = 0, cur = 0, best = 0;

  for (let d = m.startDay; d <= last; d++) {
    const reps = log[d];
    if (reps !== undefined) total += reps;
    if (isRestDay(round, d)) continue; // carried: neither broken nor extended
    const hit = reps !== undefined && reps >= m.dailyTarget;
    if (hit) { hits++; scored++; cur++; }
    else if (d === today) { /* the day is not over */ }
    else { scored++; cur = 0; }
    if (cur > best) best = cur;
  }
  return {
    userId: m.userId, displayName: m.displayName, dailyTarget: m.dailyTarget, joinSeq: m.joinSeq,
    scored, hits, total, currentStreak: cur, bestStreak: best,
    points: hits * round.bonusHit + best * round.bonusStreak,
  };
}

/** Points descending, ties by join order. Removed members drop out. */
export function leaderboard(round: Round, members: Member[], logs: Record<string, Log>, todayIso: string): Stats[] {
  const rows = members.filter((m) => m.status === "active").map((m) => memberStats(round, m, logs[m.userId] || {}, todayIso))
    .sort((a, b) => b.points - a.points || a.joinSeq - b.joinSeq);
  // No crown while everyone is on zero: a round that has not started should not crown whoever joined first.
  const anyone = rows.some((r) => r.points > 0);
  return rows.map((r, i) => {
    const badges: Stats["badges"] = [];
    if (i === 0 && anyone) badges.push("crown");
    if (r.bestStreak >= round.badgeStreak) badges.push("streak");
    if (r.hits >= round.badgeHits) badges.push("hits");
    return { ...r, rank: i + 1, badges };
  });
}

export type Cell = "hit" | "miss" | "rest" | "today" | "future" | "futureRest" | "before";
/** One cell per day of the round, for the chain grid. */
export function chain(round: Round, m: Member, log: Log, todayIso: string): Cell[] {
  const today = dayIndexOf(round, todayIso);
  return Array.from({ length: round.lengthDays }, (_, i) => {
    const d = i + 1;
    const rest = isRestDay(round, d);
    if (d > today) return rest ? "futureRest" : "future";
    if (d < m.startDay) return "before";
    if (rest) return "rest";
    const hit = log[d] !== undefined && log[d] >= m.dailyTarget;
    return hit ? "hit" : d === today ? "today" : "miss";
  });
}
