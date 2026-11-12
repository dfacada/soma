// Someone's first days in Dayhub (David, 2026-11-11: the first-day card and the week-one question). Pure: when each
// shows, and what the first-day card still asks. The cards themselves are in src/components/app/FirstDay.tsx.
//
// Both are for people who joined since `joined` existed (2026-11-07): it is "" for everyone before, David included,
// so neither ever shows to them.

import type { Settings } from "./settings";
import { fromKey } from "./today";

/** Whole days from the day this person joined to `today` (both YYYY-MM-DD): 0 on day one. Null without a joined day. */
export function daysIn(joined: string, today: string): number | null {
  if (!joined) return null;
  return Math.round((fromKey(today).getTime() - fromKey(joined).getTime()) / 86400000);
}

export type SetUpKey = "moves" | "food" | "nudge";
/** What the first-day card asks, in its order, each with whether it is done. */
export function setUpItems(s: Pick<Settings, "moves" | "foodSetUp" | "nudge">): { key: SetUpKey; done: boolean }[] {
  return [
    { key: "moves", done: s.moves.length > 0 },
    { key: "food", done: s.foodSetUp },
    { key: "nudge", done: s.nudge.on },
  ];
}

/** The first-day card: on day one and day two, until everything on it is done or it is put away. */
export function showFirstDay(s: Pick<Settings, "joined" | "firstDayAway" | "moves" | "foodSetUp" | "nudge">, today: string): boolean {
  const d = daysIn(s.joined, today);
  return d !== null && d >= 0 && d <= 1 && !s.firstDayAway && setUpItems(s).some((x) => !x.done);
}

/** The week-one question: from the seventh day for a week, once, never to an admin (who reads the answers). */
export function showWeekOne(s: Pick<Settings, "joined" | "weekOne">, today: string, admin: boolean): boolean {
  const d = daysIn(s.joined, today);
  return !admin && d !== null && d >= 6 && d <= 13 && s.weekOne === "";
}

/** The question, as David asks it, and how an answer reads in Messages and in Dayhub Ops. */
export const WEEK_ONE_QUESTION = "What almost made you stop?";
export const weekOneMessage = (answer: string) => `${WEEK_ONE_QUESTION}\n\n${answer.trim()}`;
