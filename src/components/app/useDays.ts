"use client";

// Loads a window of days in one request and owns every write to them.
// Taps update local state immediately. Saves are serialized per (resource, day): while one is in flight the
// next tap only marks it dirty, and the latest state is sent once the first returns, so a quick double tap
// can never land out of order. A save that keeps failing surfaces as `unsaved` with a retry; local state is kept.

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ActivityDay, type Checkin, type DayLog, type Days } from "@/lib/api";
import { addDays, dayKey, emptyDay, indexDays, type DayMap } from "@/lib/today";

type Resource = "checkins" | "day-logs" | "activity";
type Slot = { inFlight: boolean; dirty: boolean };
const RETRY_MS = [1000, 3000];

export function useDays(today: Date, windowDays: number) {
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
          try { await api("PUT", `/${resource}/${day}`, body(resource, day)); break; }
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

  const change = useCallback((resource: Resource, day: string, edit: (d: { checkin: Checkin; log: DayLog; activity: ActivityDay }) => void) => {
    const cur = latest.current[day] || emptyDay();
    // Work on copies so React sees new objects and the previous state is never mutated.
    const draft = {
      checkin: { day, mood: null, habits: {}, counts: {}, ...structuredClone(cur.checkin || {}) } as Checkin,
      log: { day, meals: {}, extras: [], ...structuredClone(cur.log || {}) } as DayLog,
      activity: { day, pushups: 0, types: {}, ...structuredClone(cur.activity || {}) } as ActivityDay,
    };
    edit(draft);
    const next = { ...cur };
    if (resource === "checkins") next.checkin = draft.checkin;
    else if (resource === "day-logs") next.log = draft.log;
    else next.activity = draft.activity;
    latest.current = { ...latest.current, [day]: next };
    setMap(latest.current);
    void flush(resource, day);
  }, [flush]);

  const retry = useCallback(() => {
    [...failed.current].forEach((key) => { const i = key.indexOf(":"); void flush(key.slice(0, i) as Resource, key.slice(i + 1)); });
  }, [flush]);

  return { map, error, reload: load, unsaved, retry, change };
}
