"use client";

// Tomorrow's brief, shared by the Today card (from 6 pm) and the brief itself (/tomorrow/). Everything is worked out on
// this device from what the app already holds: the planned meals, the round's target or rest day, whether weight
// closes days, and the habits that come with great days (src/lib/great-days.ts).

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { greatDays, MIN_CHECKINS, type Driver } from "@/lib/great-days";
import { briefDay, somaSide, type SomaSide } from "@/lib/tomorrow";
import { addDays, dayKey } from "@/lib/today";
import { useDays } from "./Days";
import { useHealth } from "./Health";
import { useRounds } from "./Rounds";
import { useSession } from "./Session";

type Tomorrow = {
  /** The day the brief is about, "YYYY-MM-DD": tomorrow, or between midnight and 4 am the day just begun. */
  day: string;
  soma: SomaSide;
  /** Habits that come with great days, strongest first; empty until there are enough check-ins to say. */
  lifts: Driver[];
};

const Ctx = createContext<Tomorrow | null>(null);
export function useTomorrow() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTomorrow outside <TomorrowProvider>");
  return v;
}

/** How far back great days are read: the 60 days the app already has loaded. */
const LOOKBACK = 60;

export function TomorrowProvider({ children }: { children: ReactNode }) {
  const { settings } = useSession();
  const { map, today } = useDays();
  const rounds = useRounds();
  const { nights } = useHealth();

  // The day rolls over at 4 am; checked when the app comes back into view and once a minute while it is open.
  const [day, setDay] = useState(() => briefDay(new Date()));
  useEffect(() => {
    const roll = () => setDay(briefDay(new Date()));
    const timer = window.setInterval(roll, 60000);
    document.addEventListener("visibilitychange", roll);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", roll); };
  }, []);

  const { forDay, target } = rounds;
  const round = forDay(day);
  const todayKey = dayKey(today);
  const lifts = useMemo(() => {
    if (!map) return [];
    const days = Array.from({ length: LOOKBACK }, (_, i) => dayKey(addDays(today, i - (LOOKBACK - 1))));
    const g = greatDays(map, days, settings, target, nights);
    return g.checkedIn >= MIN_CHECKINS ? g.lifts : [];
    // todayKey, not the Date object: a new Date each render must not recount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, todayKey, settings, target, nights]);

  const value = useMemo<Tomorrow>(() => ({
    day,
    soma: somaSide(settings, { target: round.target, rest: round.rest, dayNumber: round.dayNumber }),
    lifts,
  }), [day, settings, round.target, round.rest, round.dayNumber, lifts]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
