// Insights that become experiments (David, 2026-11-11). Insights says what a person's great days have in common
// (great-days.ts); an experiment turns one of those findings into three days of doing it, and then says how those
// days went. Pure: no React, no I/O; scripts/test-experiment.mjs runs it as it is. Worked out on the device, like
// every finding.
//
// One experiment at a time, kept in settings as the finding it is about, its words and its dates. **No numbers are
// kept with it.** Some findings come from what the server cannot read (sleep is sealed with the vault key), and a
// count of great days by hours slept, stored in settings, would be exactly that in the clear. So the "before" figures
// are counted again on the device each time, from the days before it began. An experiment on such a finding is
// itself sealed with the vault key (SealedExperiment), so the server never learns even which finding it is.
//
// It starts tomorrow, so the day it was chosen on can never count as an easy first day. Three days is a small test,
// and the words say so: a result is how it went this time, never a claim about cause.

import type { Side } from "./great-days";
import { toneOf, type Mood } from "./moods";
import type { DayMap } from "./today";

// Settings keep the experiment, so settings.ts imports this file, and today.ts imports settings.ts: the few lines of
// date arithmetic below are this file's own, so that nothing here imports today.ts and closes a circle.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => (n < 10 ? "0" : "") + n;
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** "YYYY-MM-DD" as that local day at noon, clear of any daylight-saving edge. */
const fromKey = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d, 12, 0, 0, 0); };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/** A great day: a good mood by the person's own list (great-days.ts says the same). */
const isGreat = (mood: string | null, moods: Mood[]) => toneOf(mood, moods) === "good";

export const EXPERIMENT_DAYS = 3;
/** How many days before an experiment its "before" figures are counted over (the day map holds this many). */
export const BEFORE_DAYS = 60;
/** Today stops pointing at a finished experiment after this many days; Insights keeps the result until it is put away. */
export const SHOWN_AFTER_DAYS = 3;
const TEXT_MAX = 80;
const SEALED_MAX = 2000;
/** How far apart the share of great days must be before a verdict says more than "about the same": the margin
 *  Insights asks of a finding (great-days.ts MIN_LIFT), kept here so this file imports nothing that imports it. */
export const MARGIN = 0.15;

/** What settings keep: the finding's key (great-days.ts), what it asks ("Meditate"), how the finding reads
 *  ("Meditate", "Did your 100 push-ups"), and the first and last day. */
export type Experiment = { key: string; ask: string; label: string; from: string; to: string };
/** An experiment on a finding that rests on what the vault seals, kept as vault ciphertext (base64). */
export type SealedExperiment = { sealed: string };
export type StoredExperiment = Experiment | SealedExperiment;

/** Findings that rest on what the vault seals: an experiment on one of them is sealed too. */
export const SEALED_KEYS = ["sleep"];
export const needsSeal = (key: string) => SEALED_KEYS.includes(key);
export const isSealed = (v: StoredExperiment | null | undefined): v is SealedExperiment => Boolean(v && "sealed" in v);

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
// A finding's key: a word ("active", "sleep"), or a word and one of the person's own habit ids ("habit:read").
const KEY = /^[a-z]{2,12}(:[A-Za-z0-9_-]{1,60})?$/;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Three days of a finding, starting the day after `today`. */
export function newExperiment(finding: { key: string; ask: string; label: string }, today: Date): Experiment {
  const from = addDays(today, 1);
  return { key: finding.key, ask: finding.ask.slice(0, TEXT_MAX), label: finding.label.slice(0, TEXT_MAX), from: dayKey(from), to: dayKey(addDays(from, EXPERIMENT_DAYS - 1)) };
}

/** An experiment in the clear (as stored, or as opened from its seal), or null when it does not make sense. */
export function cleanPlain(v: unknown): Experiment | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const x = v as Partial<Experiment>;
  if (typeof x.key !== "string" || !KEY.test(x.key)) return null;
  if (typeof x.from !== "string" || typeof x.to !== "string" || !DAY.test(x.from) || !DAY.test(x.to) || x.to < x.from) return null;
  const ask = typeof x.ask === "string" ? x.ask.trim().slice(0, TEXT_MAX) : "";
  const label = typeof x.label === "string" ? x.label.trim().slice(0, TEXT_MAX) : "";
  if (!ask) return null;
  const length = Math.round((fromKey(x.to).getTime() - fromKey(x.from).getTime()) / 86400000) + 1;
  if (length < 1 || length > 14) return null;
  return { key: x.key, ask, label: label || ask, from: x.from, to: x.to };
}

/** What settings may hold: an experiment, a sealed one, or nothing (settings are only ever trusted so far). */
export function cleanExperiment(v: unknown): StoredExperiment | null {
  if (v && typeof v === "object" && !Array.isArray(v) && "sealed" in v) {
    const s = (v as { sealed: unknown }).sealed;
    return typeof s === "string" && s.length >= 16 && s.length <= SEALED_MAX && B64.test(s) ? { sealed: s } : null;
  }
  return cleanPlain(v);
}

/** The days it runs over, first to last. */
export function daysOf(x: Experiment): string[] {
  const out: string[] = [];
  for (let d = fromKey(x.from); dayKey(d) <= x.to && out.length < 14; d = addDays(d, 1)) out.push(dayKey(d));
  return out;
}

/** The days before it began, oldest first: what its "before" figures are counted over. */
export function daysBefore(x: Experiment, n = BEFORE_DAYS): string[] {
  const first = fromKey(x.from);
  return Array.from({ length: n }, (_, i) => dayKey(addDays(first, i - n)));
}

export type TrialDay = {
  day: string;
  when: "ahead" | "today" | "past";
  /** Whether that day had it. Undefined when the day cannot say (no check-in, nothing synced) or is still ahead. */
  did: boolean | undefined;
  mood: string | null;
  great: boolean;
};
/** "same": within MARGIN of the days without it. "unknown": no day could say whether it had the thing, which is not
 *  the same as not having done it. */
export type Verdict = "held" | "same" | "not-this-time" | "not-tried" | "no-checkins" | "unknown";
export type Trial = {
  phase: "ahead" | "running" | "finished";
  /** Which day of it today is, from 1, while it runs. */
  dayNo: number;
  length: number;
  days: TrialDay[];
  /** Days it was done; of those, the ones with a mood picked; of those, the great ones. */
  kept: number; checked: number; great: number;
  /** How it went, once it is over. */
  verdict: Verdict | null;
  /** Days since its last day (0 while it has not ended). */
  since: number;
};

/**
 * Where an experiment stands on `todayKey`. `test` says whether a day had the thing (great-days.ts `testFor`); null
 * when the finding is no longer one of this person's, and then no day can say. `before` is the finding's two sides
 * over the days before it began (`sidesFor`), for the comparison in the verdict.
 *
 * It held up when the days it was done (with a mood picked) were great more often than days without it had been, by
 * at least MARGIN; it did not show when they were less often great by as much; anything closer is about the same. With
 * no days without it to compare against, half is the line.
 */
export function trialOf(x: Experiment, todayKey: string, test: ((day: string) => boolean | undefined) | null, map: DayMap, moods: Mood[], before: { did: Side; didnt: Side } | null): Trial {
  const all = daysOf(x);
  const phase = todayKey < x.from ? "ahead" : todayKey > x.to ? "finished" : "running";
  const days: TrialDay[] = all.map((day) => {
    const when = day > todayKey ? "ahead" : day === todayKey ? "today" : "past";
    const mood = map[day]?.checkin?.mood || null;
    return { day, when, did: when === "ahead" || !test ? undefined : test(day), mood, great: isGreat(mood, moods) };
  });
  const done = days.filter((d) => d.did === true);
  const checked = done.filter((d) => d.mood);
  const great = checked.filter((d) => d.great).length;
  let verdict: Verdict | null = null;
  if (phase === "finished") {
    if (days.every((d) => d.did === undefined)) verdict = "unknown";
    else if (!done.length) verdict = "not-tried";
    else if (!checked.length) verdict = "no-checkins";
    else {
      const without = before && before.didnt.days > 0 ? before.didnt.hits / before.didnt.days : 0.5;
      const diff = great / checked.length - without;
      // A hair's breadth either side of the margin is float noise, not a difference.
      verdict = diff >= MARGIN - 1e-9 ? "held" : diff <= -MARGIN + 1e-9 ? "not-this-time" : "same";
    }
  }
  const since = phase === "finished" ? Math.round((fromKey(todayKey).getTime() - fromKey(x.to).getTime()) / 86400000) : 0;
  return { phase, dayNo: phase === "running" ? all.indexOf(todayKey) + 1 : 0, length: all.length, days, kept: done.length, checked: checked.length, great, verdict, since };
}

// ── Words ──
const short = (key: string) => { const d = fromKey(key); return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`; };
const month = (key: string) => fromKey(key).toLocaleDateString("en-GB", { month: "short" });
/** "Thu to Sat". */
export const span = (x: Experiment) => `${WEEKDAYS[fromKey(x.from).getDay()]} to ${WEEKDAYS[fromKey(x.to).getDay()]}`;
/** "Thu 12 to Sat 14 Nov", or "Mon 30 Nov to Wed 2 Dec" across a month's end. */
export const spanDates = (x: Experiment) => (month(x.from) === month(x.to) ? `${short(x.from)} to ${short(x.to)} ${month(x.to)}` : `${short(x.from)} ${month(x.from)} to ${short(x.to)} ${month(x.to)}`);
/** "Thu 12". */
export const shortDay = short;
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** The line on Today's card: where it stands and what today holds. */
export function todayLine(t: Trial): { eyebrow: string; status: string; done: boolean } {
  if (t.phase === "ahead") return { eyebrow: "Experiment · starts tomorrow", status: `${plural(t.length, "day")}, then Insights says how they went.`, done: false };
  if (t.phase === "finished") return { eyebrow: "Experiment · finished", status: "See how it went.", done: false };
  const today = t.days.find((d) => d.when === "today");
  return { eyebrow: `Experiment · day ${t.dayNo} of ${t.length}`, status: today?.did === true ? "Done today." : "Not yet today.", done: today?.did === true };
}

/** One day's row on Insights: whether it had it, in a word or two. */
export function didWords(d: TrialDay): string {
  if (d.when === "ahead") return "To come";
  if (d.did === true) return "Did it";
  if (d.when === "today") return "Not yet";
  return d.did === false ? "Didn't" : "Not known";
}

/** How it went, in a heading and a sentence or two. Only once it is over. */
export function verdictWords(t: Trial, before: { did: Side; didnt: Side } | null): { head: string; body: string } | null {
  if (!t.verdict) return null;
  if (t.verdict === "unknown") return { head: "Nothing to go on", body: "There's no record of it for those days (no check-in, or nothing synced), so there's nothing to read from them." };
  if (t.verdict === "not-tried") return { head: "You didn't get to it", body: `It wasn't done on any of the ${plural(t.length, "day")}, so there's nothing to read from them.` };
  if (t.verdict === "no-checkins") return { head: "Nothing to compare", body: `You did it on ${plural(t.kept, "day")}, but no mood was picked on ${t.kept === 1 ? "it" : "them"}, and the mood is how Dayhub knows a great day.` };
  const of = t.checked === t.kept ? `the ${plural(t.kept, "day")} you did it` : `the ${plural(t.checked, "day")} you did it and picked a mood`;
  const then = before && before.did.days > 0 && before.didnt.days > 0
    ? ` In the two months before, your days were great ${before.did.hits} of ${before.did.days} times when you did it, and ${before.didnt.hits} of ${before.didnt.days} when you didn't.`
    : before && before.didnt.days > 0 ? ` In the two months before, days without it were great ${before.didnt.hits} of ${before.didnt.days} times.` : "";
  const head = t.verdict === "held" ? "It held up this time" : t.verdict === "same" ? "About the same as usual" : "It didn't show this time";
  return { head, body: `Great on ${t.great} of ${of}.${then}` };
}
