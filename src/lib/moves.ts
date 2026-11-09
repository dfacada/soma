// Moves: the activities each person chooses to track (David, 2026-11-08: "people should be able to choose which
// activities they track. Some people, maybe it's a push-up challenge. Some people, maybe it's a run"). Built from
// the activities mock-up (https://claude.ai/artifact/EQg4RUS8Xn9Qveeychh5FV): pick your moves, give each a daily
// goal, make one your main move. Any of them closes the day. Pure: no React, no I/O; scripts/test-moves.mjs.
//
// Where a day's moves are stored (the `activity` row, catalyst/functions/soma_api/routes/days.js):
//   pushups     push-ups, in their own column, as they always were
//   steps       steps, in their own column: Google Health writes it, or the person types it
//   types_json  every other move: `true` for a session done (or a move logged before amounts existed), or
//               { n, u } for an amount in km, min or reps. A cleared move is left out.
//
// Rounds count one of these per day (`roundAmount`). The server has its own copy of that and of ROUND_KINDS in
// catalyst/functions/soma_api/lib/moves.js: change one, change the other.

export type MoveUnit = "reps" | "km" | "min" | "steps" | "session";
/** The units someone can give a move of their own. */
export type OwnUnit = "reps" | "min" | "km" | "session";
export const OWN_UNITS: OwnUnit[] = ["reps", "min", "km", "session"];

/** An amount kept in types_json. `label` names an "Other" move ("Hike"). */
export type MoveAmount = { n: number; u: "km" | "min" | "reps"; label?: string };
export type MoveTypes = Record<string, boolean | MoveAmount>;
/** What any day row carries for moves (the API's ActivityDay has these). */
export type MoveDay = { pushups?: number | null; types?: MoveTypes; steps?: number | null };

export type MoveDef = {
  key: string; name: string; unit: MoveUnit;
  /** A second unit it can be logged in: a run timed instead of measured. */
  alt?: "min";
  /** What one tap of a goal stepper adds. 0 for a session. */
  step: number;
  /** The daily goal it starts with. */
  goal: number;
  /** The most a goal can be. */
  max: number;
  /** An IconName (src/components/ui/Icon.tsx); a string here so this file needs no React. */
  icon: string;
  /** The words under its name on the chooser. */
  hint: string;
};
/** A move as the screens use it: its definition with the person's goal, and whether they made it up. */
export type Move = MoveDef & { own: boolean };
/** What settings keep per move. Name and unit only for a move of the person's own. */
export type MoveSetting = { key: string; goal: number; name?: string; unit?: OwnUnit };

export const CATALOGUE: MoveDef[] = [
  { key: "pushups", name: "Push-ups", unit: "reps", step: 10, goal: 100, max: 10000, icon: "pushup", hint: "reps" },
  { key: "run", name: "Run", unit: "km", alt: "min", step: 0.5, goal: 5, max: 200, icon: "run", hint: "km or min" },
  { key: "walk", name: "Walk", unit: "min", step: 5, goal: 30, max: 1440, icon: "walker", hint: "minutes" },
  { key: "steps", name: "Steps", unit: "steps", step: 500, goal: 8000, max: 100000, icon: "walk", hint: "from Fitbit" },
  { key: "cycle", name: "Cycle", unit: "km", step: 1, goal: 15, max: 500, icon: "cycle", hint: "km" },
  { key: "yoga", name: "Yoga", unit: "min", step: 5, goal: 20, max: 1440, icon: "yoga", hint: "minutes" },
  { key: "swim", name: "Swim", unit: "min", step: 5, goal: 30, max: 1440, icon: "swim", hint: "minutes" },
  { key: "gym", name: "Gym", unit: "session", step: 0, goal: 1, max: 1, icon: "barbell", hint: "a session" },
  { key: "sport", name: "Sport", unit: "session", step: 0, goal: 1, max: 1, icon: "ball", hint: "a session" },
];
export const MOVES_MAX = 12;
export const MOVE_NAME_MAX = 30;
/** "Other" on the log sheet: minutes of something that is not one of your moves, with a name if you like. */
export const OTHER_KEY = "other";
export const OTHER_LABEL_MAX = 40;
/** The most one day can hold, per unit (the API refuses more: lib/moves.js). */
export const AMOUNT_MAX: Record<"km" | "min" | "reps", number> = { km: 500, min: 1440, reps: 100000 };

const OWN: Record<OwnUnit, { step: number; goal: number; max: number }> = {
  reps: { step: 5, goal: 20, max: 10000 }, min: { step: 5, goal: 20, max: 1440 },
  km: { step: 0.5, goal: 5, max: 200 }, session: { step: 0, goal: 1, max: 1 },
};
const KEY = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const defOf = (key: string) => CATALOGUE.find((d) => d.key === key) || null;

/** A goal kept inside its move's range, on its step (a session's is always 1). */
export function clampGoal(v: unknown, d: Pick<MoveDef, "unit" | "goal" | "max" | "step">): number {
  if (d.unit === "session") return 1;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return d.goal;
  const floor = d.unit === "km" ? 0.5 : 1;
  const r = d.unit === "km" ? Math.round(n * 10) / 10 : Math.round(n);
  return Math.min(d.max, Math.max(floor, r));
}

/** Stored moves, cleaned: known moves and named ones of the person's own, no repeats, at most MOVES_MAX. */
export function cleanMoves(v: unknown): MoveSetting[] {
  if (!Array.isArray(v)) return [];
  const out: MoveSetting[] = [];
  const seen = new Set<string>();
  for (const m of v as Partial<MoveSetting>[]) {
    if (!m || typeof m !== "object" || typeof m.key !== "string" || !KEY.test(m.key) || seen.has(m.key) || m.key === OTHER_KEY) continue;
    const d = defOf(m.key);
    if (d) out.push({ key: m.key, goal: clampGoal(m.goal, d) });
    else {
      const name = typeof m.name === "string" ? m.name.trim().slice(0, MOVE_NAME_MAX) : "";
      const unit = OWN_UNITS.includes(m.unit as OwnUnit) ? (m.unit as OwnUnit) : null;
      if (!name || !unit) continue;
      out.push({ key: m.key, name, unit, goal: clampGoal(m.goal, { unit, ...OWN[unit] }) });
    }
    seen.add(m.key);
    if (out.length >= MOVES_MAX) break;
  }
  return out;
}

/**
 * Moves for someone whose settings came from before moves existed: their push-up target as the main move, then the
 * activity types they had (walk, gym and run unless they changed them). Nothing changes for them until they choose.
 * A new person is never given these: their first open stores an empty list (Session.tsx), so they choose.
 */
export function legacyMoves(s: { pushupTarget?: unknown; activityTypes?: unknown }): MoveSetting[] {
  const t = Number(s.pushupTarget);
  const out: Partial<MoveSetting>[] = [{ key: "pushups", goal: Number.isFinite(t) && t >= 1 ? t : 100 }];
  const types = Array.isArray(s.activityTypes) && s.activityTypes.length ? s.activityTypes : [{ key: "walk", name: "Walk" }, { key: "gym", name: "Gym" }, { key: "run", name: "Run" }];
  for (const x of types as { key?: unknown; name?: unknown }[]) {
    if (!x || typeof x.key !== "string") continue;
    const d = defOf(x.key);
    out.push(d ? { key: x.key, goal: d.goal } : { key: x.key, name: typeof x.name === "string" ? x.name : x.key, unit: "session", goal: 1 });
  }
  return cleanMoves(out);
}

/** A key for a move of someone's own: "own-" and its name, made unique among the moves they have. */
export function ownKey(name: string, taken: string[]): string {
  const base = "own-" + (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "move");
  let key = base, i = 2;
  while (taken.includes(key)) key = `${base}-${i++}`;
  return key;
}

/** The person's moves, ready for the screens. Steps take their goal from goals.steps, which the steps pill uses. */
export function movesOf(s: { moves: MoveSetting[]; goals: { steps: number } }): Move[] {
  return s.moves.map((m) => {
    const d = defOf(m.key);
    if (d) return { ...d, goal: m.key === "steps" ? s.goals.steps : m.goal, own: false };
    const unit = m.unit || "session";
    return { key: m.key, name: m.name || m.key, unit, step: OWN[unit].step, goal: m.goal, max: OWN[unit].max, icon: "pulse", hint: unitWord(unit), own: true };
  });
}
export function mainOf(s: { moves: MoveSetting[]; mainMove: string; goals: { steps: number } }): Move | null {
  const all = movesOf(s);
  return all.find((m) => m.key === s.mainMove) || all[0] || null;
}

// ── A day's moves ──
export type Logged = { done: boolean; n: number | null; u: MoveUnit | null; label?: string };
const NONE: Logged = { done: false, n: null, u: null };
const isAmount = (v: unknown): v is MoveAmount => Boolean(v) && typeof v === "object" && Number((v as MoveAmount).n) > 0;
/** Whether a types_json value is something logged: a session, or an amount above nothing. */
export const isLoggedValue = (v: unknown) => v === true || isAmount(v);

/** What a day holds for one move. Steps are "done" only at their goal: they arrive by themselves. */
export function loggedOf(day: MoveDay | undefined, move: Pick<Move, "key" | "goal">): Logged {
  if (!day) return NONE;
  if (move.key === "pushups") { const n = Number(day.pushups) || 0; return n > 0 ? { done: true, n, u: "reps" } : NONE; }
  if (move.key === "steps") {
    const n = day.steps === null || day.steps === undefined ? null : Number(day.steps);
    return n === null ? NONE : { done: n >= move.goal, n, u: "steps" };
  }
  const v = day.types?.[move.key];
  if (v === true) return { done: true, n: null, u: null };
  if (isAmount(v)) return { done: true, n: v.n, u: v.u, label: v.label };
  return NONE;
}

/**
 * The day-closing activity rule (src/lib/today.ts, and soma_jobs/nudge.js `leftToday`: change one, change the
 * other). Anything logged counts, whether or not it is still one of the person's moves, so taking a move off the
 * list never reopens a past day. Steps are the exception: they come in on their own, so they count only for someone
 * who chose Steps, and only once they reach the goal.
 */
export function movedOn(day: MoveDay | undefined, s: { moves: MoveSetting[]; goals: { steps: number } }): boolean {
  if (!day) return false;
  if ((Number(day.pushups) || 0) > 0) return true;
  if (Object.values(day.types || {}).some(isLoggedValue)) return true;
  return s.moves.some((m) => m.key === "steps") && (Number(day.steps) || 0) >= s.goals.steps;
}

/** How far a day's amount is toward the goal, 0–1. Null when the two can't be compared (a run timed against a km goal). */
export function progressOf(move: Move, logged: Logged): number | null {
  if (move.unit === "session" || logged.n === null) return logged.done ? 1 : 0;
  if (logged.u !== move.unit) return null;
  return Math.min(1, logged.n / Math.max(0.0001, move.goal));
}

// ── Words and numbers ──
const trim = (n: number, dp: number) => String(Math.round(n * 10 ** dp) / 10 ** dp);
export function unitWord(u: MoveUnit): string {
  return u === "km" ? "km" : u === "min" ? "min" : u === "steps" ? "steps" : u === "reps" ? "reps" : "a session";
}
/** "3.2", "45", "8,000": the number alone, in the move's own precision. */
export function num(n: number, u: MoveUnit | null): string {
  if (u === "km") return trim(n, 2);
  return Math.round(n).toLocaleString("en-US");
}
/** "3.2 km", "45 min", "40 push-ups", "8,000 steps", "done". */
export function amountText(move: Pick<Move, "key" | "name" | "unit">, logged: Logged): string {
  if (!logged.done && logged.n === null) return "not yet";
  if (logged.n === null || logged.u === null || logged.u === "session") return "done";
  if (logged.u === "reps") return `${num(logged.n, "reps")} ${move.key === "pushups" ? "push-ups" : move.unit === "reps" ? "reps" : ""}`.trim();
  return `${num(logged.n, logged.u)} ${unitWord(logged.u)}`;
}
/** "5 km", "100 push-ups", "20 min", "8,000 steps", "a session". */
export function goalText(move: Pick<Move, "key" | "unit" | "goal">): string {
  if (move.unit === "session") return "a session";
  if (move.key === "pushups") return `${num(move.goal, "reps")} push-ups`;
  return `${num(move.goal, move.unit)} ${unitWord(move.unit)}`;
}

// ── Rounds: what they count ──
export type RoundKind = "pushups" | "run" | "walk" | "cycle" | "swim" | "yoga" | "steps" | "minutes";
export type KindDef = {
  kind: RoundKind; name: string;
  /** "a push-up round", "a running round": how an invite names it. */
  round: string;
  /** The line under its name when starting a round. */
  line: string;
  unit: "reps" | "km" | "min" | "steps";
  /** Targets are kept as whole numbers: kilometres in metres, everything else as it is. */
  scale: number;
  /** One tap of the target stepper, and the default, smallest and largest target, all in kept (whole) units. */
  step: number; def: number; min: number; max: number;
};
export const ROUND_KINDS: KindDef[] = [
  { kind: "pushups", name: "Push-ups", round: "a push-up round", line: "reps a day", unit: "reps", scale: 1, step: 10, def: 100, min: 1, max: 10000 },
  { kind: "run", name: "Run", round: "a running round", line: "km a day", unit: "km", scale: 1000, step: 500, def: 5000, min: 100, max: 200000 },
  { kind: "walk", name: "Walk", round: "a walking round", line: "minutes a day", unit: "min", scale: 1, step: 5, def: 30, min: 1, max: 1440 },
  { kind: "cycle", name: "Cycle", round: "a cycling round", line: "km a day", unit: "km", scale: 1000, step: 1000, def: 15000, min: 100, max: 500000 },
  { kind: "swim", name: "Swim", round: "a swimming round", line: "minutes a day", unit: "min", scale: 1, step: 5, def: 30, min: 1, max: 1440 },
  { kind: "yoga", name: "Yoga", round: "a yoga round", line: "minutes a day", unit: "min", scale: 1, step: 5, def: 20, min: 1, max: 1440 },
  { kind: "steps", name: "Steps", round: "a steps round", line: "a day, from Fitbit", unit: "steps", scale: 1, step: 500, def: 8000, min: 100, max: 100000 },
  { kind: "minutes", name: "Minutes", round: "a round of minutes, any move", line: "of any move, a day", unit: "min", scale: 1, step: 5, def: 30, min: 1, max: 1440 },
];
/** A round with no kind is a push-up round: every round made before kinds existed. */
export const kindOf = (k?: string | null): KindDef => ROUND_KINDS.find((d) => d.kind === k) || ROUND_KINDS[0];
/** The move a round counts, for adding it to someone's moves when they join. Minutes count any move: none. */
export const moveOfKind = (k: RoundKind): string | null => (k === "minutes" ? null : k);

/** A kept target as the person reads it: 5000 (metres) → 5 (km). */
export const targetShown = (k: KindDef, kept: number) => kept / k.scale;
export const targetKept = (k: KindDef, shown: number) => Math.round(shown * k.scale);
/** "100 push-ups", "5 km", "30 min", "8,000 steps". `short` drops the push-ups word, for the board's narrow column. */
export function targetText(k: KindDef, kept: number, short = false): string {
  const v = targetShown(k, kept);
  if (k.unit === "reps") return short ? num(v, "reps") : `${num(v, "reps")} push-ups`;
  return `${num(v, k.unit)} ${unitWord(k.unit)}`;
}

/** The target someone starts with in a round of this kind, kept: their own goal for that move, else the kind's
 *  default (the API does the same for an invite link: lib/moves.js goalForKind). */
export function keptGoalFor(k: KindDef, s: { moves: MoveSetting[]; goals: { steps: number } }): number {
  const mv = k.kind === "minutes" ? null : movesOf(s).find((x) => x.key === k.kind) || null;
  const kept = mv ? targetKept(k, mv.goal) : k.def;
  return Math.min(k.max, Math.max(k.min, kept));
}
/** A kept target one stepper tap up or down, inside the kind's range. */
export const stepTarget = (k: KindDef, kept: number, dir: 1 | -1) => Math.min(k.max, Math.max(k.min, Math.round((kept + dir * k.step) / k.step) * k.step || k.min));

/** Whether logging this move adds to a round of that kind. */
export function countsFor(k: KindDef, moveKey: string, unit: MoveUnit | null): boolean {
  if (k.kind === "minutes") return unit === "min";
  return moveKey === k.kind && (unit === null || unit === k.unit);
}

/**
 * One day's number for a round, in kept units (reps, metres, minutes, steps). Null when nothing it counts was
 * logged. The board reads the API's frozen copy of the day (activity.round_json, round_pushups); a member's own
 * chain reads their live day with this same rule.
 */
export function roundAmount(kind: RoundKind, day: MoveDay | undefined): number | null {
  if (!day) return null;
  if (kind === "pushups") return day.pushups === null || day.pushups === undefined ? null : Number(day.pushups);
  if (kind === "steps") return day.steps === null || day.steps === undefined ? null : Number(day.steps);
  const types = day.types || {};
  if (kind === "minutes") {
    let sum = 0, any = false;
    for (const v of Object.values(types)) if (isAmount(v) && v.u === "min") { sum += v.n; any = true; }
    return any ? Math.round(sum) : null;
  }
  const k = kindOf(kind);
  const v = types[kind];
  if (isAmount(v) && v.u === k.unit) return Math.round(v.n * k.scale);
  return isLoggedValue(v) ? 0 : null;
}

/** Someone's moves with one more added (joining a round that counts it, say), made main if they had none. Null when
 *  it is already there, there is no such move, or the list is full. */
export function withMove(s: { moves: MoveSetting[]; mainMove: string }, key: string): { moves: MoveSetting[]; mainMove: string } | null {
  const d = defOf(key);
  if (!d || s.moves.some((m) => m.key === key) || s.moves.length >= MOVES_MAX) return null;
  return { moves: [...s.moves, { key, goal: d.goal }], mainMove: s.moves.length ? s.mainMove : key };
}

// ── Saving a move ──
/** What a save writes for one move: an amount in a unit, a session done (n 1), or nothing (n null: cleared). */
export type MoveSave = { key: string; n: number | null; u: MoveUnit; label?: string };
/** "Other": minutes of something that is not one of your moves, with a name if you like. */
export const OTHER_MOVE: Move = { key: OTHER_KEY, name: "Other", unit: "min", step: 5, goal: 30, max: 1440, icon: "plus", hint: "minutes", own: true };

/** A save, written into a day's draft: push-ups to their column, every other move into types (steps never: they go
 *  through Days.setSteps on their own). A cleared move is taken out. */
export function applyMove(d: { activity: { pushups: number | null; types: MoveTypes } }, s: MoveSave) {
  if (s.key === "pushups") { d.activity.pushups = s.n ? Math.round(s.n) : 0; return; }
  const types = (d.activity.types ||= {});
  if (!s.n) { delete types[s.key]; return; }
  types[s.key] = s.u === "session" ? true
    : { n: s.u === "km" ? Math.round(s.n * 100) / 100 : Math.round(s.n), u: s.u === "km" || s.u === "min" ? s.u : "reps", ...(s.label ? { label: s.label } : {}) };
}

/** Whether a save closes the activity task by itself: anything logged, or steps at their goal. */
export const closesDay = (s: MoveSave, stepsGoal: number) => Boolean(s.n) && (s.key !== "steps" || (s.n || 0) >= stepsGoal);

/** The toast after a save: "Goal hit · run 5 km", "Yoga logged · 20 min", "40 push-ups logged", "Gym done", "Run cleared". */
export function savedLine(move: Move, s: MoveSave, goal: { goal: number; rest: boolean }, lateForRound: boolean): string {
  const name = move.key === OTHER_KEY ? (s.label || "Other") : move.name;
  if (!s.n) return `${name} cleared`;
  if (s.u === "session") return `${name} done`;
  const amount = amountText(move, { done: true, n: s.n, u: s.u });
  if (lateForRound) return `${amount} saved to your record · too late to count for the round`;
  // Push-ups say their own name in the amount ("40 push-ups"); every other move says it first ("run 3.2 km").
  const what = move.key === "pushups" ? amount : `${name.toLowerCase()} ${amount}`;
  if (move.key !== OTHER_KEY && s.u === move.unit && !goal.rest && s.n >= goal.goal) return `Goal hit · ${what}`;
  return move.key === "pushups" ? `${amount} logged` : `${name} logged · ${amount}`;
}
