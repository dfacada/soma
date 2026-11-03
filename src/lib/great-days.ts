// Insights, rebuilt (David, 2026-11-02: "talk about the insights that really matter … what are the patterns that make
// a great day … correlations between positive things you hear in the journal and quality habits"). Pure: the day
// map, settings, and when known the nights and the journal's tone, in; a few plain findings out. Worked out on the
// device. Every finding is a pattern in the person's own record, never a claim about cause.

import { GOOD_MOODS } from "./insights";
import type { Nights } from "./health";
import type { Settings } from "./settings";
import { dayStatus, type DayMap } from "./today";

/** Both sides of a comparison need this many days before it is shown at all. */
export const MIN_SIDE = 3;
/** A difference smaller than this (share of great days, or tone on a -1…1 scale) is not worth a line. */
export const MIN_LIFT = 0.15;

/** Something a day either had or did not. Undefined when the day cannot say (no food logged, no night recorded). */
type Test = { key: string; label: string; test: (day: string) => boolean | undefined };

function tests(map: DayMap, settings: Settings, pushupTarget: number, nights: Nights | null): Test[] {
  const st = (k: string) => dayStatus(map[k], settings);
  const checkin = (k: string) => map[k]?.checkin;
  return [
    { key: "protein", label: `Hit your ${settings.goals.protein} g protein`, test: (k) => (st(k).meals > 0 ? st(k).protein >= settings.goals.protein : undefined) },
    { key: "meals", label: "Logged all four meals", test: (k) => st(k).foodDone },
    { key: "active", label: "Moved", test: (k) => st(k).activityDone },
    { key: "pushups", label: `Did your ${pushupTarget} push-ups`, test: (k) => st(k).pushups >= pushupTarget },
    { key: "journal", label: "Talked to your journal", test: (k) => (map[k]?.entries || 0) > 0 },
    { key: "steps", label: `Walked ${settings.goals.steps.toLocaleString("en-US")} steps`, test: (k) => { const s = map[k]?.activity?.steps; return s === null || s === undefined ? undefined : s >= settings.goals.steps; } },
    { key: "sleep", label: "Slept 7 hours", test: (k) => { const n = nights?.[k]; return n ? n.asleep >= 420 : undefined; } },
    ...settings.habits.filter((h) => h.type === "daily").map((h): Test => ({
      key: "habit:" + h.id, label: h.label, test: (k) => { const c = checkin(k); return c ? Boolean(c.habits[h.id]) : undefined; },
    })),
    ...settings.habits.filter((h) => h.type === "counter" && h.dir === "at_most" && h.goal).map((h): Test => ({
      key: "limit:" + h.id, label: `Kept ${h.label.toLowerCase()} to ${h.goal} or fewer`, test: (k) => { const c = checkin(k); return c ? (c.counts[h.id] || 0) <= (h.goal || 0) : undefined; },
    })),
  ];
}

export type Side = { days: number; hits: number };
/** Great days: the share of great days when you did it against when you did not. */
export type Driver = { key: string; label: string; did: Side; didnt: Side; lift: number };
/** Journal tone: the mean tone (-1…1) of the days you did it against the days you did not. */
export type ToneDriver = { key: string; label: string; did: { days: number; mean: number }; didnt: { days: number; mean: number }; lift: number };

export type GreatDays = {
  checkedIn: number;
  great: number;
  /** Habits that come with great days, strongest first; only those past MIN_LIFT with MIN_SIDE days on each side. */
  lifts: Driver[];
  /** Habits whose days are less often great. */
  drags: Driver[];
};

export const isGreat = (mood: string | null | undefined) => !!mood && GOOD_MOODS.includes(mood);

export function greatDays(map: DayMap, days: string[], settings: Settings, pushupTarget: number, nights: Nights | null): GreatDays {
  const all = tests(map, settings, pushupTarget, nights).map((t) => ({ ...t, did: { days: 0, hits: 0 }, didnt: { days: 0, hits: 0 } }));
  let checkedIn = 0, great = 0;
  for (const k of days) {
    const mood = map[k]?.checkin?.mood;
    if (!mood) continue;
    checkedIn++;
    const g = isGreat(mood);
    if (g) great++;
    for (const t of all) {
      const had = t.test(k);
      if (had === undefined) continue;
      const side = had ? t.did : t.didnt;
      side.days++;
      if (g) side.hits++;
    }
  }
  const scored: Driver[] = all
    .filter((t) => t.did.days >= MIN_SIDE && t.didnt.days >= MIN_SIDE)
    .map(({ key, label, did, didnt }) => ({ key, label, did, didnt, lift: did.hits / did.days - didnt.hits / didnt.days }));
  return {
    checkedIn, great,
    lifts: scored.filter((d) => d.lift >= MIN_LIFT).sort((a, b) => b.lift - a.lift),
    drags: scored.filter((d) => d.lift <= -MIN_LIFT).sort((a, b) => a.lift - b.lift),
  };
}

export type JournalTone = {
  /** Days with a tone. */
  days: number;
  mean: number;
  /** Habits whose days sound brighter in the journal, strongest first. */
  brighter: ToneDriver[];
  /** Themes that come up on the brightest days more than on the others (only when themes are known). */
  brightThemes: string[];
};

/** `tones` is the journal's tone per day, -1 (heavy) … 1 (bright); `themes` the topics per day, when known. */
export function journalTone(map: DayMap, days: string[], settings: Settings, pushupTarget: number, nights: Nights | null,
  tones: Record<string, number>, themes: Record<string, string[]> = {}): JournalTone {
  const known = days.filter((k) => typeof tones[k] === "number");
  const mean = known.length ? known.reduce((n, k) => n + tones[k], 0) / known.length : 0;
  const brighter: ToneDriver[] = [];
  for (const t of tests(map, settings, pushupTarget, nights)) {
    const yes: number[] = [], no: number[] = [];
    for (const k of known) { const had = t.test(k); if (had !== undefined) (had ? yes : no).push(tones[k]); }
    if (yes.length < MIN_SIDE || no.length < MIN_SIDE) continue;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const lift = avg(yes) - avg(no);
    if (lift >= MIN_LIFT) brighter.push({ key: t.key, label: t.label, did: { days: yes.length, mean: avg(yes) }, didnt: { days: no.length, mean: avg(no) }, lift });
  }
  brighter.sort((a, b) => b.lift - a.lift);

  // Bright days are the upper third by tone; a theme counts when it is on at least two of them and more common there.
  const sorted = [...known].sort((a, b) => tones[b] - tones[a]);
  const bright = new Set(sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 3))).filter((k) => tones[k] > 0));
  const count = (set: string[]) => { const m = new Map<string, number>(); set.forEach((k) => new Set(themes[k] || []).forEach((t) => m.set(t, (m.get(t) || 0) + 1))); return m; };
  const onBright = count([...bright]), onRest = count(known.filter((k) => !bright.has(k)));
  const restDays = Math.max(1, known.length - bright.size);
  const brightThemes = [...onBright.entries()]
    .filter(([t, n]) => n >= 2 && n / bright.size > (onRest.get(t) || 0) / restDays)
    .sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
  return { days: known.length, mean, brighter, brightThemes };
}

export type TaskKey = "weight" | "checkin" | "journal" | "food" | "activity";
export const TASK_LABEL: Record<TaskKey, string> = { weight: "Weight", checkin: "Check-in", journal: "Journal", food: "All four meals", activity: "Activity" };
export type Progress = { days: number; closed: number; rates: { key: TaskKey; rate: number }[]; weakest: TaskKey | null; perDay: { day: string; done: number; total: number }[] };

/** How the window went: days closed, how often each task got done, and which one most often kept a day open. Counted
 *  from the first day anything was logged, so a year's view is not dragged down by the months before Soma. */
export function progress(map: DayMap, all: string[], settings: Settings): Progress {
  const logged = (k: string) => { const d = map[k]; return !!d && (!!d.checkin || !!d.log || !!d.activity || d.weight !== undefined || d.entries > 0); };
  const first = all.findIndex(logged);
  const days = first < 0 ? all.slice(-1) : all.slice(first);
  const keys: TaskKey[] = settings.requireWeight ? ["weight", "checkin", "journal", "food", "activity"] : ["checkin", "journal", "food", "activity"];
  const done: Record<TaskKey, number> = { weight: 0, checkin: 0, journal: 0, food: 0, activity: 0 };
  let closed = 0;
  const perDay = days.map((k) => {
    const st = dayStatus(map[k], settings);
    if (st.closed) closed++;
    if (st.weightDone) done.weight++;
    if (st.checkinDone) done.checkin++;
    if (st.journalDone) done.journal++;
    if (st.foodDone) done.food++;
    if (st.activityDone) done.activity++;
    return { day: k, done: st.doneCount, total: st.taskCount };
  });
  const rates = keys.map((key) => ({ key, rate: days.length ? done[key] / days.length : 0 }));
  const low = [...rates].sort((a, b) => a.rate - b.rate)[0];
  return { days: days.length, closed, rates, weakest: low && low.rate < 1 ? low.key : null, perDay };
}
