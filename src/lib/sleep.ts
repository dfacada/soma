// Sleep as Dayhub shows it (David, 2026-11-03, from a screenshot of Google Health's Today: "especially the sleep").
// Everything comes from the nights Google Health reports (src/lib/health.ts Night: minutes, bed and wake as local
// clock times), held only while the vault is open. There is no sleep score: Google does not share Fitbit's, and Dayhub
// does not make one up (CLAUDE.md). No React, so scripts/test-sleep.mjs runs it as it is.

import type { Night, Nights } from "./health";
import { addDays, dayKey, fromKey } from "./today";

/** 336 → "5h 36m", 480 → "8h", 45 → "45m". */
export function hm(min: number): string {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

export type StageKey = "deep" | "light" | "rem" | "awake";
export type Stage = { key: StageKey; label: string; min: number; share: number };

/** The night split into deep, light, REM and awake, each with its share of their total, in the order they are drawn.
 *  Empty when the tracker reported no stages (only time asleep): nothing to split, and nothing is guessed. */
export function stagesOf(n: Night): Stage[] {
  const parts: [StageKey, string, number][] = [["deep", "Deep", n.deep], ["light", "Light", n.light], ["rem", "REM", n.rem], ["awake", "Awake", n.awake]];
  const staged = (n.deep || 0) + (n.light || 0) + (n.rem || 0);
  if (staged <= 0) return [];
  const total = parts.reduce((s, [, , m]) => s + Math.max(0, m || 0), 0);
  return parts.map(([key, label, m]) => ({ key, label, min: Math.max(0, m || 0), share: Math.max(0, m || 0) / total }));
}

/** "23:41" as "11:41 pm". */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

// The evening-to-morning axis the week's bars hang on: 6 pm to 2 pm the next day.
const AXIS_FROM = 18 * 60;
const AXIS_SPAN = 20 * 60;
const minutesOf = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
/** A clock time as minutes after 6 pm. Afternoon times (2 to 6 pm) cannot be told from the next afternoon, so a bedtime
 *  there counts as the start of the axis. */
function offset(hhmm: string, bed: boolean): number | null {
  const t = minutesOf(hhmm);
  if (t === null) return null;
  const o = (t - AXIS_FROM + 1440) % 1440;
  return o > AXIS_SPAN ? (bed ? 0 : AXIS_SPAN) : o;
}

/** Where a night sits on the axis, as fractions 0 (6 pm) to 1 (2 pm): null without a bed time. */
export function windowOf(n: Night): { from: number; to: number } | null {
  if (!n.start || !n.end) return null;
  const a = offset(n.start, true), b = offset(n.end, false);
  if (a === null || b === null) return null;
  return { from: a / AXIS_SPAN, to: Math.max(a, b) / AXIS_SPAN };
}

export type NightDay = { key: string; night: Night | null };

/** The `n` nights ending with the one you woke from on `endKey`, oldest first. */
export function lastNights(nights: Nights | null, endKey: string, n = 7): NightDay[] {
  const end = fromKey(endKey);
  return Array.from({ length: n }, (_, i) => { const key = dayKey(addDays(end, i - n + 1)); return { key, night: nights?.[key] ?? null }; });
}

/** The week in a few numbers: how many nights there are, the average asleep, how many met the goal, and the usual
 *  bed and wake times (averaged on the evening axis, so 11:50 pm and 12:10 am average to midnight, not noon). */
export function weekOf(days: NightDay[], goal: number) {
  const had = days.map((d) => d.night).filter((n): n is Night => n !== null);
  const avg = had.length ? Math.round(had.reduce((s, n) => s + n.asleep, 0) / had.length) : 0;
  const met = had.filter((n) => n.asleep >= goal).length;
  const usual = (pick: (n: Night) => string, bed: boolean) => {
    const xs = had.map((n) => offset(pick(n), bed)).filter((x): x is number => x !== null);
    if (!xs.length) return "";
    const t = Math.round((xs.reduce((s, x) => s + x, 0) / xs.length + AXIS_FROM) % 1440);
    return clock12(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
  };
  return { nights: had.length, avg, met, bed: usual((n) => n.start, true), wake: usual((n) => n.end, false) };
}
