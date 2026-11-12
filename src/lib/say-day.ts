// Say your day (David, 2026-11-11): one recording that fills in the day. The recording is a journal entry like any
// other (Journal.tsx); its words go to POST /day/describe (the call is in say-api.ts), which answers with what it
// heard about the five things that close a day. This file is the part with no React and no network: what goes
// along with the words, the list the person checks, and how the ticked rows land in the day.
// scripts/test-say-day.mjs runs it as it is.
//
// The rule is Food's (FoodSay.tsx): the person checks the list, and nothing is logged before that tap.
//
// What you say is the day as it stands: a weight, a mood, a meal or a move you name replaces what that day held for
// it, and the row says so before you tap. Habits are only ever ticked, never unticked.

import type { ActivityDay, Checkin, DayLog } from "./api";
import { applySaid, type Said } from "./food-say";
import { OTHER_KEY, OTHER_LABEL_MAX, OTHER_MOVE, amountText, applyMove, loggedOf, movesOf, type Move, type MoveSave } from "./moves";
import { MEALS, type Meal, type Settings } from "./settings";
import { cap, type DayData, type DayStatus } from "./today";

/** The most words one reading takes: about twenty minutes of talking (routes/day.js holds the same number). */
export const DAY_TEXT_MAX = 20000;

export type HeardMove = { key: string; n: number | null; u: "reps" | "km" | "min" | "session"; label: string };
/** What POST /day/describe answers: only what was plainly said, already checked against the person's own lists. */
export type Heard = {
  weight: number | null; mood: string | null; habits: string[]; counts: { id: string; n: number }[];
  food: Said[]; moves: HeardMove[];
};

/** The person's own words for things, sent along so "I feel great" comes back as their mood and "forty push-ups"
 *  as their move: the moods they have switched on, their habits, and their moves (never steps: a tracker counts those). */
export function dayContext(settings: Pick<Settings, "moods" | "habits" | "moves" | "goals">) {
  return {
    moods: settings.moods.filter((m) => m.on).map((m) => m.label),
    habits: settings.habits.map((h) => ({ id: h.id, label: h.label, counter: h.type === "counter" })),
    moves: movesOf(settings).filter((m) => m.key !== "steps").map((m) => ({ key: m.key, name: m.name, unit: m.unit })),
  };
}

/** The words as they are sent: one line, and no more than one reading takes. `cut` says the recording ran past
 *  that, so only its first part is read (the list says so). */
export function wordsToSend(text: string): { text: string; cut: boolean } {
  const said = text.replace(/\s+/g, " ").trim();
  return said.length > DAY_TEXT_MAX ? { text: said.slice(0, DAY_TEXT_MAX), cut: true } : { text: said, cut: false };
}

// ── The list to check ──
export type DayDomain = "journal" | "food" | "activity";
type RowBase = {
  /** Stable while the list is on screen. */
  id: string;
  /** Ticked: Fill in my day will log it. */
  on: boolean;
  domain: DayDomain;
  /** The small label over the row: "Weight", "Check-in", "Habits", "Food", "Activity". */
  eyebrow: string;
  title: string;
  /** Numbers that belong to the title, set in mono: "181.4 lb", "310 kcal · 22 P". */
  amount?: string;
  /** What ticking it changes, when the day already holds something else: "Replaces 182 lb". */
  note?: string;
};
export type DayRow = RowBase & (
  | { kind: "weight"; value: number }
  | { kind: "mood"; mood: string }
  | { kind: "habits"; habits: string[]; counts: { id: string; n: number }[] }
  | { kind: "food"; said: Said }
  | { kind: "move"; save: MoveSave }
);

const lb = (n: number) => `${n} lb`;
/** "40 push-ups", "30 min", "5 km", "20 reps", or "Done" for a move logged with no amount. */
function amountOf(move: Move, n: number | null, u: MoveSave["u"] | null): string {
  if (n === null || u === null || u === "session") return "Done";
  if (u === "reps" && move.key !== "pushups") return `${Math.round(n).toLocaleString("en-US")} reps`;
  return amountText(move, { done: true, n, u });
}

/** Several moves that are not on the person's list share the one "Other" slot a day has: their names are joined,
 *  and their amounts added up when they are all in the same unit (otherwise it is logged as done, no number). */
function joinOthers(moves: HeardMove[]): HeardMove[] {
  const others = moves.filter((m) => m.key === OTHER_KEY);
  if (others.length < 2) return moves;
  const label = [...new Set(others.map((m) => m.label.trim()).filter(Boolean))].join(" + ").slice(0, OTHER_LABEL_MAX);
  const u = others[0].u;
  const sum = others.every((m) => m.u === u && m.n !== null && u !== "session") ? others.reduce((n, m) => n + (m.n || 0), 0) : null;
  const one: HeardMove = sum === null ? { key: OTHER_KEY, n: null, u: "session", label } : { key: OTHER_KEY, n: sum, u, label };
  return [...moves.filter((m) => m.key !== OTHER_KEY), one];
}

/**
 * What was heard, as rows in the order of Today's cards: weight, check-in, food by meal, moves. A row starts
 * ticked unless the day already holds that food. `day` is what that day holds now, so a row can say what it would
 * replace; a weight, mood, habit or move the day already holds exactly is left out, since ticking it would change
 * nothing.
 */
export function rowsFor(heard: Heard, settings: Pick<Settings, "habits" | "moves" | "goals">, day: DayData | undefined): DayRow[] {
  const rows: DayRow[] = [];

  if (heard.weight !== null && heard.weight !== day?.weight) {
    rows.push({ id: "weight", kind: "weight", on: true, domain: "food", eyebrow: "Weight", title: lb(heard.weight), value: heard.weight,
      ...(day?.weight !== undefined ? { note: `Replaces ${lb(day.weight)}` } : {}) });
  }

  const was = day?.checkin?.mood || null;
  if (heard.mood && heard.mood !== was) {
    rows.push({ id: "mood", kind: "mood", on: true, domain: "journal", eyebrow: "Check-in", title: heard.mood, mood: heard.mood, ...(was ? { note: `Replaces ${was}` } : {}) });
  }

  // Habits the day does not already have ticked, and counts that differ from what it holds.
  const habits = heard.habits.filter((id) => settings.habits.some((h) => h.id === id && h.type === "daily") && !day?.checkin?.habits?.[id]);
  const counts = heard.counts.filter((c) => settings.habits.some((h) => h.id === c.id && h.type === "counter") && (day?.checkin?.counts?.[c.id] || 0) !== c.n);
  if (habits.length || counts.length) {
    const label = (id: string) => settings.habits.find((h) => h.id === id)?.label || id;
    rows.push({ id: "habits", kind: "habits", on: true, domain: "journal", eyebrow: "Habits", habits, counts,
      title: [...habits.map(label), ...counts.map((c) => `${label(c.id)} ×${c.n}`)].join(" · ") });
  }

  // Food the day already holds under the same name (said again this evening, say) starts unticked, so a meal is
  // not swapped for a fresh guess at itself and an off-plan item is not logged twice. It can still be ticked.
  const eaten = day?.log?.meals || {};
  const extras = (day?.log?.extras || []).map((x) => x.name.toLowerCase());
  const held = (said: Said) => {
    if (said.meal === "extra") return extras.includes(said.name.toLowerCase());
    const now = eaten[said.meal];
    return typeof now === "object" && now.name.toLowerCase() === said.name.toLowerCase();
  };
  const order = (m: Said["meal"]) => (m === "extra" ? MEALS.length : MEALS.indexOf(m));
  [...heard.food].map((said, i) => ({ said, i })).sort((a, b) => order(a.said.meal) - order(b.said.meal) || a.i - b.i).forEach(({ said, i }) => {
    const logged = held(said);
    rows.push({ id: "food-" + i, kind: "food", on: !logged, domain: "food", eyebrow: "Food", title: said.name, said,
      amount: `${said.kcal.toLocaleString("en-US")} kcal · ${said.protein} P`, ...(logged ? { note: "Already logged" } : {}) });
  });

  const mine = movesOf(settings);
  joinOthers(heard.moves).forEach((h, i) => {
    const move: Move | undefined = h.key === OTHER_KEY ? OTHER_MOVE : mine.find((m) => m.key === h.key);
    // Steps come from a tracker, and push-ups are a number: with none said there is nothing honest to log.
    if (!move || move.key === "steps" || (move.key === "pushups" && h.n === null)) return;
    const save: MoveSave = h.n === null || h.u === "session"
      ? { key: move.key, n: 1, u: "session" }
      : { key: move.key, n: h.n, u: h.u, ...(move.key === OTHER_KEY && h.label ? { label: h.label.slice(0, OTHER_LABEL_MAX) } : {}) };
    const name = move.key === OTHER_KEY ? (h.label ? cap(h.label) : "Something else") : move.name;
    const now = loggedOf(day?.activity, move);
    const next = amountOf(move, save.u === "session" ? null : save.n, save.u);
    const held = now.done ? amountOf(move, now.n, now.u) : null;
    // Nothing to tick when the day already says exactly this, or already holds the move and no new amount was said
    // (an amount is never swapped for a bare "done").
    if (held !== null && (held === next || save.u === "session")) return;
    rows.push({ id: "move-" + i, kind: "move", on: true, domain: "activity", eyebrow: "Activity", title: name, save,
      amount: next, ...(held !== null ? { note: `Replaces ${held}` } : {}) });
  });

  return rows;
}

/** A food row moved to another meal (the list lets each item be refiled, as Food's does). Its note was about the
 *  meal it came from, so it goes. */
export function withMeal(row: DayRow, meal: Said["meal"]): DayRow {
  if (row.kind !== "food") return row;
  const next = { ...row, said: { ...row.said, meal } };
  delete next.note;
  return next;
}

/** "breakfast", "breakfast and lunch", "breakfast, lunch and dinner". */
export const listed = (words: string[]) => (words.length < 2 ? words.join("") : words.slice(0, -1).join(", ") + " and " + words[words.length - 1]);

/** The meals the ticked food rows would replace: ones that already hold something that day. */
export function replacedMeals(rows: DayRow[], day: DayData | undefined): Meal[] {
  const eaten = day?.log?.meals || {};
  return MEALS.filter((m) => eaten[m] && rows.some((r) => r.on && r.kind === "food" && r.said.meal === m));
}

type Draft = { checkin: Checkin; log: DayLog; activity: ActivityDay; weight: { value: number | null } };
/** Days.change, as much of it as this needs. */
export type ChangeDay = (resource: "checkins" | "day-logs" | "activity" | "weight", day: string, edit: (d: Draft) => void) => void;

/** Logs the ticked rows, one save per kind of thing, and says how many rows went in. */
export function fillDay(rows: DayRow[], change: ChangeDay, day: string): number {
  const on = rows.filter((r) => r.on);
  for (const r of on) if (r.kind === "weight") change("weight", day, (d) => { d.weight.value = r.value; });

  const checkin = on.filter((r) => r.kind === "mood" || r.kind === "habits");
  if (checkin.length) {
    change("checkins", day, (d) => {
      for (const r of checkin) {
        if (r.kind === "mood") d.checkin.mood = r.mood;
        if (r.kind === "habits") {
          for (const id of r.habits) d.checkin.habits[id] = true;
          for (const c of r.counts) d.checkin.counts[c.id] = c.n;
        }
      }
    });
  }

  const food = on.flatMap((r) => (r.kind === "food" ? [r.said] : []));
  if (food.length) change("day-logs", day, (d) => applySaid(d.log, food));

  const moves = on.flatMap((r) => (r.kind === "move" ? [r.save] : []));
  if (moves.length) change("activity", day, (d) => { for (const s of moves) applyMove(d, s); });

  return on.length;
}

/** What is still open that day, as things to mention: shown on the recording screen as a cue. */
export function cuesOf(st: Pick<DayStatus, "weightRequired" | "weightDone" | "checkinDone" | "foodDone" | "activityDone" | "leftMeals"> & Partial<Pick<DayStatus, "counts" | "mealsNeeded">>): string[] {
  // Only what closes this person's day (settings.closes): everything, when the status does not say.
  const counts = (key: "checkin" | "food" | "activity") => st.counts?.[key] ?? true;
  const cues: string[] = [];
  if (st.weightRequired && !st.weightDone) cues.push("Your weight");
  if (counts("checkin") && !st.checkinDone) cues.push("How you feel");
  if (counts("food") && !st.foodDone) cues.push(st.leftMeals.length === (st.mealsNeeded?.length ?? 4) ? "What you ate" : st.leftMeals.map(cap).join(", "));
  if (counts("activity") && !st.activityDone) cues.push("How you moved");
  return cues;
}

/** The toast once the list is logged: "Filled in 5 things". */
export const filledLine = (n: number) => `Filled in ${n} thing${n === 1 ? "" : "s"}`;
