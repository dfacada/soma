// Insights, rebuilt (David, 2026-11-02: "talk about the insights that really matter … what are the patterns that make
// a great day … correlations between positive things you hear in the journal and quality habits"). Pure: the day
// map, settings, and when known the nights and the journal's tone, in; a few plain findings out. Worked out on the
// device. Every finding is a pattern in the person's own record, never a claim about cause.

import { goalText, loggedOf, progressOf, type Move } from "./moves";
import { toneOf, type Mood } from "./moods";
import type { Nights } from "./health";
import { hasTarget, type Settings } from "./settings";
import { dayStatus, type DayMap } from "./today";

/** Both sides of a comparison need this many days before it is shown at all. */
export const MIN_SIDE = 3;
/** Fewer checked-in days than this and nothing is said about great days (Insights, and the line in tomorrow's brief). */
export const MIN_CHECKINS = 6;
/** A difference smaller than this (share of great days, or tone on a -1…1 scale) is not worth a line. */
export const MIN_LIFT = 0.15;

/** Something a day either had or did not. Undefined when the day cannot say (no food logged, no night recorded).
 *  `label` finishes "On your great days, you more often…"; `ask` is the same thing as something to do, for an
 *  experiment (experiment.ts): "Meditate", "Do your 100 push-ups". */
type Test = { key: string; label: string; ask: string; phrase?: string; test: (day: string) => boolean | undefined };

/** The main move with its goal (the round's target when the round counts it): "Did your 5 km run". */
export type MainGoal = { move: Move; goal: number };

/** "Did your 100 push-ups", "Did your 5 km run", "Did your 20 min of yoga", "Did your gym session"; what the brief
 *  says it as ("your run"). Steps have their own test. */
function mainTest(map: DayMap, main: MainGoal | null): Test[] {
  if (!main || main.move.key === "steps") return [];
  const mv = { ...main.move, goal: main.goal };
  const name = mv.name.toLowerCase();
  const what = mv.unit === "session" ? `your ${name} session`
    : mv.key === "pushups" ? `your ${goalText(mv)}`
    : mv.unit === "km" ? `your ${goalText(mv)} ${name}`
    : `your ${goalText(mv)} of ${name}`;
  return [{
    key: "move", label: `Did ${what}`, ask: `Do ${what}`, phrase: `your ${mv.key === "pushups" ? "push-ups" : name}`,
    test: (k) => { const l = loggedOf(map[k]?.activity, mv); const p = progressOf(mv, l); return p === null ? l.done : p >= 1; },
  }];
}

function tests(map: DayMap, settings: Settings, main: MainGoal | null, nights: Nights | null): Test[] {
  const st = (k: string) => dayStatus(map[k], settings);
  const checkin = (k: string) => map[k]?.checkin;
  return [
    // Only with a protein target to hit: someone with none set has no such finding.
    ...(hasTarget(settings.goals.protein) ? [{ key: "protein", label: `Hit your ${settings.goals.protein} g protein`, ask: `Hit your ${settings.goals.protein} g protein`, test: (k: string) => (st(k).meals > 0 ? st(k).protein >= settings.goals.protein : undefined) }] : []),
    { key: "meals", label: "Logged all four meals", ask: "Log all four meals", test: (k) => st(k).foodDone },
    { key: "active", label: "Moved", ask: "Get a move in", test: (k) => st(k).activityDone },
    ...mainTest(map, main),
    { key: "journal", label: "Talked to your journal", ask: "Talk to your journal", test: (k) => (map[k]?.entries || 0) > 0 },
    { key: "steps", label: `Walked ${settings.goals.steps.toLocaleString("en-US")} steps`, ask: `Walk ${settings.goals.steps.toLocaleString("en-US")} steps`, test: (k) => { const s = map[k]?.activity?.steps; return s === null || s === undefined ? undefined : s >= settings.goals.steps; } },
    { key: "sleep", label: "Slept 7 hours", ask: "Sleep 7 hours", test: (k) => { const n = nights?.[k]; return n ? n.asleep >= 420 : undefined; } },
    ...settings.habits.filter((h) => h.type === "daily").map((h): Test => ({
      key: "habit:" + h.id, label: h.label, ask: h.label, test: (k) => { const c = checkin(k); return c ? Boolean(c.habits[h.id]) : undefined; },
    })),
    ...settings.habits.filter((h) => h.type === "counter" && h.dir === "at_most" && h.goal).map((h): Test => ({
      key: "limit:" + h.id, label: `Kept ${h.label.toLowerCase()} to ${h.goal} or fewer`, ask: `Keep ${h.label.toLowerCase()} to ${h.goal} or fewer`, test: (k) => { const c = checkin(k); return c ? (c.counts[h.id] || 0) <= (h.goal || 0) : undefined; },
    })),
  ];
}

export type Side = { days: number; hits: number };
/** Great days: the share of great days when you did it against when you did not. */
export type Driver = { key: string; label: string; ask: string; did: Side; didnt: Side; lift: number; phrase?: string };
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

/** A great day: a good mood, by the person's own list (a renamed mood or one of their own counts as they said). */
export const isGreat = (mood: string | null | undefined, moods: Mood[]) => toneOf(mood, moods) === "good";

export function greatDays(map: DayMap, days: string[], settings: Settings, main: MainGoal | null, nights: Nights | null): GreatDays {
  const all = tests(map, settings, main, nights).map((t) => ({ ...t, did: { days: 0, hits: 0 }, didnt: { days: 0, hits: 0 } }));
  let checkedIn = 0, great = 0;
  for (const k of days) {
    const mood = map[k]?.checkin?.mood;
    if (!mood) continue;
    checkedIn++;
    const g = isGreat(mood, settings.moods);
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
    .map(({ key, label, ask, phrase, did, didnt }) => ({ key, label, ask, ...(phrase ? { phrase } : {}), did, didnt, lift: did.hits / did.days - didnt.hits / didnt.days }));
  return {
    checkedIn, great,
    lifts: scored.filter((d) => d.lift >= MIN_LIFT).sort((a, b) => b.lift - a.lift),
    drags: scored.filter((d) => d.lift <= -MIN_LIFT).sort((a, b) => a.lift - b.lift),
  };
}

/** One finding by its key, for an experiment on it (experiment.ts): whether a day had it, and what it is called
 *  now. Null when it is no longer one of this person's (a habit taken off the list, say). */
export function testFor(key: string, map: DayMap, settings: Settings, main: MainGoal | null, nights: Nights | null): { label: string; ask: string; test: (day: string) => boolean | undefined } | null {
  const t = tests(map, settings, main, nights).find((x) => x.key === key);
  return t ? { label: t.label, ask: t.ask, test: t.test } : null;
}

/** One finding's two sides over some days, counted as greatDays counts them but with no minimum: how often a
 *  checked-in day was great when it had this, and when it did not. Null when the finding is no longer theirs. */
export function sidesFor(key: string, map: DayMap, days: string[], settings: Settings, main: MainGoal | null, nights: Nights | null): { did: Side; didnt: Side } | null {
  const t = testFor(key, map, settings, main, nights);
  if (!t) return null;
  const did = { days: 0, hits: 0 }, didnt = { days: 0, hits: 0 };
  for (const k of days) {
    const mood = map[k]?.checkin?.mood;
    const had = mood ? t.test(k) : undefined;
    if (had === undefined) continue;
    const side = had ? did : didnt;
    side.days++;
    if (isGreat(mood, settings.moods)) side.hits++;
  }
  return { did, didnt };
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
export function journalTone(map: DayMap, days: string[], settings: Settings, main: MainGoal | null, nights: Nights | null,
  tones: Record<string, number>, themes: Record<string, string[]> = {}): JournalTone {
  const known = days.filter((k) => typeof tones[k] === "number");
  const mean = known.length ? known.reduce((n, k) => n + tones[k], 0) / known.length : 0;
  const brighter: ToneDriver[] = [];
  for (const t of tests(map, settings, main, nights)) {
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
 *  from the first day anything was logged, so a year's view is not dragged down by the months before Dayhub. */
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

/** One measure for this week and the week before, and which way is the better one. */
export type WeekRow = { label: string; now: number | null; before: number | null; unit: string; better: "up" | "down" };
export type WeekCompare = { weight: { now: number; before: number } | null; rows: WeekRow[] };

/** The last seven days against the seven before them: the weight, and what was done around it (David, 2026-11-02:
 *  "is my weight drastically going up, and what have I been doing that's causing that?"). Side by side, not a cause. */
export function weekCompare(map: DayMap, settings: Settings, todayKey: string): WeekCompare {
  const back = (n: number) => { const d = new Date(todayKey + "T12:00:00"); d.setDate(d.getDate() - n); const p = (x: number) => String(x).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const now = Array.from({ length: 7 }, (_, i) => back(i)), before = Array.from({ length: 7 }, (_, i) => back(i + 7));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const weights = (ks: string[]) => ks.map((k) => map[k]?.weight).filter((w): w is number => typeof w === "number");
  const wNow = weights(now), wBefore = weights(before);
  const st = (k: string) => dayStatus(map[k], settings);
  const ate = (ks: string[]) => ks.filter((k) => st(k).meals > 0 || (map[k]?.log?.extras?.length || 0) > 0);
  const count = (ks: string[], f: (k: string) => boolean) => ks.filter(f).length;
  const steps = (ks: string[]) => ks.map((k) => map[k]?.activity?.steps).filter((x): x is number => typeof x === "number" && x > 0);
  const limit = settings.habits.find((h) => h.type === "counter" && h.dir === "at_most" && h.goal);
  const rows: WeekRow[] = [
    { label: "Calories a day", now: mean(ate(now).map((k) => st(k).kcal)), before: mean(ate(before).map((k) => st(k).kcal)), unit: "kcal", better: "down" },
    ...(hasTarget(settings.goals.protein) ? [{ label: "Protein goal hit", now: count(now, (k) => st(k).meals > 0 && st(k).protein >= settings.goals.protein), before: count(before, (k) => st(k).meals > 0 && st(k).protein >= settings.goals.protein), unit: "days", better: "up" as const }] : []),
    { label: "All four meals logged", now: count(now, (k) => st(k).foodDone), before: count(before, (k) => st(k).foodDone), unit: "days", better: "up" },
    { label: "Active days", now: count(now, (k) => st(k).activityDone), before: count(before, (k) => st(k).activityDone), unit: "days", better: "up" },
    ...(steps(now).length || steps(before).length ? [{ label: "Steps a day", now: mean(steps(now)), before: mean(steps(before)), unit: "steps", better: "up" as const }] : []),
    ...(limit ? [{ label: limit.label, now: now.reduce((n, k) => n + (map[k]?.checkin?.counts[limit.id] || 0), 0), before: before.reduce((n, k) => n + (map[k]?.checkin?.counts[limit.id] || 0), 0), unit: "this week", better: "down" as const }] : []),
  ];
  return { weight: wNow.length && wBefore.length ? { now: mean(wNow)!, before: mean(wBefore)! } : null, rows };
}
