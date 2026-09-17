"use client";

// One provider for every screen that reads or writes a day (Today, Food, Activity): a window of days loaded in
// one request, and every write to them. Shared, so a screen never shows a copy that another screen has changed.
// Taps update local state immediately. Saves are serialized per (resource, day): while one is in flight the
// next tap only marks it dirty, and the latest state is sent once the first returns, so a quick double tap
// can never land out of order. A save that keeps failing surfaces as `unsaved` with a retry; local state is kept.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type ActivityDay, type Checkin, type DayLog, type Days } from "@/lib/api";
import { addDays, dayKey, emptyDay, indexDays, noon, type DayMap } from "@/lib/today";

type Resource = "checkins" | "day-logs" | "activity" | "weight";
type Draft = { checkin: Checkin; log: DayLog; activity: ActivityDay; weight: { value: number | null } };
const WINDOW_DAYS = 60;
type Slot = { inFlight: boolean; dirty: boolean };
const RETRY_MS = [1000, 3000];

function useDaysState(today: Date, windowDays: number) {
  const [map, setMap] = useState<DayMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const latest = useRef<DayMap>({});
  const slots = useRef(new Map<string, Slot>());
  const failed = useRef(new Set<string>());
  const todayKey = dayKey(today);

  // No synchronous setState here: this is started from an effect.
  const fetchDays = useCallback(async () => {
    try {
      const from = addDays(today, -windowDays);
      const start = new Date(from); start.setHours(0, 0, 0, 0);
      const end = new Date(today); end.setHours(23, 59, 59, 999);
      const days = await api<Days>("GET", `/days?from=${dayKey(from)}&to=${dayKey(today)}&fromMs=${start.getTime()}&toMs=${end.getTime()}`);
      latest.current = indexDays(days);
      setMap(latest.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    }
    // todayKey, not the Date object: a new Date each render must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey, windowDays]);

  useEffect(() => { void fetchDays(); }, [fetchDays]);
  const load = useCallback(() => { setError(null); void fetchDays(); }, [fetchDays]);

  const body = (resource: Resource, day: string) => {
    const d = latest.current[day] || emptyDay();
    if (resource === "checkins") return { mood: d.checkin?.mood ?? null, habits: d.checkin?.habits ?? {}, counts: d.checkin?.counts ?? {} };
    if (resource === "day-logs") return { meals: d.log?.meals ?? {}, extras: d.log?.extras ?? [] };
    if (resource === "weight") return { value: d.weight ?? null };
    return { pushups: d.activity?.pushups ?? 0, types: d.activity?.types ?? {} };
  };

  const flush = useCallback(async (resource: Resource, day: string) => {
    const key = resource + ":" + day;
    const slot = slots.current.get(key) || { inFlight: false, dirty: false };
    slots.current.set(key, slot);
    if (slot.inFlight) { slot.dirty = true; return; }
    slot.inFlight = true;
    try {
      do {
        slot.dirty = false;
        for (let attempt = 0; ; attempt++) {
          try {
            const b = body(resource, day);
            // A cleared weight is a delete; everything else is an upsert of the latest state.
            if (resource === "weight" && b.value === null) await api("DELETE", `/weight/${day}`);
            else await api("PUT", `/${resource}/${day}`, b);
            break;
          }
          catch (e) {
            if (attempt >= RETRY_MS.length) throw e;
            await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
          }
        }
      } while (slot.dirty);
      failed.current.delete(key);
    } catch {
      failed.current.add(key);
    } finally {
      slot.inFlight = false;
      setUnsaved(failed.current.size > 0);
    }
  }, []);

  const change = useCallback((resource: Resource, day: string, edit: (d: Draft) => void) => {
    const cur = latest.current[day] || emptyDay();
    // Work on copies so React sees new objects and the previous state is never mutated.
    const draft = {
      checkin: { day, mood: null, habits: {}, counts: {}, ...structuredClone(cur.checkin || {}) } as Checkin,
      log: { day, meals: {}, extras: [], ...structuredClone(cur.log || {}) } as DayLog,
      activity: { day, pushups: 0, types: {}, ...structuredClone(cur.activity || {}) } as ActivityDay,
      weight: { value: cur.weight ?? null },
    };
    edit(draft);
    const next = { ...cur };
    if (resource === "checkins") next.checkin = draft.checkin;
    else if (resource === "day-logs") next.log = draft.log;
    else if (resource === "weight") next.weight = draft.weight.value ?? undefined;
    else next.activity = draft.activity;
    latest.current = { ...latest.current, [day]: next };
    setMap(latest.current);
    void flush(resource, day);
  }, [flush]);

  // Steps arrive from the Google Health sync, which has already stored them: update the map, save nothing.
  const applySteps = useCallback((list: { day: string; steps: number }[]) => {
    const next = { ...latest.current };
    for (const { day, steps } of list) {
      const cur = next[day] || emptyDay();
      if (!cur.activity && steps === 0) continue;
      next[day] = { ...cur, activity: { day, pushups: null, types: {}, ...cur.activity, steps } };
    }
    latest.current = next;
    setMap(next);
  }, []);

  const retry = useCallback(() => {
    [...failed.current].forEach((key) => { const i = key.indexOf(":"); void flush(key.slice(0, i) as Resource, key.slice(i + 1)); });
  }, [flush]);

  return useMemo(() => ({ map, error, reload: load, unsaved, retry, change, applySteps }), [map, error, load, unsaved, retry, change, applySteps]);
}

type DaysValue = ReturnType<typeof useDaysState> & { today: Date; todayKey: string; windowDays: number };
const Ctx = createContext<DaysValue | null>(null);

export function useDays() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDays outside <DaysProvider>");
  return v;
}

export function DaysProvider({ children }: { children: ReactNode }) {
  // Re-evaluate "today" when the tab comes back, so a phone left open overnight rolls over.
  const [today, setToday] = useState(() => noon());
  useEffect(() => {
    const roll = () => { if (document.visibilityState === "visible") setToday((t) => (dayKey(t) === dayKey(new Date()) ? t : noon())); };
    document.addEventListener("visibilitychange", roll);
    return () => document.removeEventListener("visibilitychange", roll);
  }, []);
  const state = useDaysState(today, WINDOW_DAYS);
  const value = useMemo(() => ({ ...state, today, todayKey: dayKey(today), windowDays: WINDOW_DAYS }), [state, today]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
