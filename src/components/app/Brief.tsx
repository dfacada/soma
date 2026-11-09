"use client";

// Tomorrow's brief, shared by the Today card (from 6 pm), the brief itself (/tomorrow/) and its Settings card.
// Soma's side is worked out on this device from what the app already holds: the planned meals, the round's target or
// rest day, whether weight closes days, and the habits that come with great days (src/lib/great-days.ts).
//
// The calendar (Morgen) and the tasks (Todoist) need keys, which live sealed with the vault key (src/lib/brief-api.ts
// says where each one goes). So reading them needs the vault open, and what was read is kept on this device sealed
// the same way, for the evening: the Today card and a reopened brief show it without reading again.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { briefToTelegram, dropLink, fetchLinks, morgenEvents, saveLink, todoistTasks, TodoistError, type Links, type MorgenCalendar, type MorgenSealed, type Provider, type TodoistSealed } from "@/lib/brief-api";
import { greatDays, MIN_CHECKINS, type Driver } from "@/lib/great-days";
import { report } from "@/lib/log";
import { briefDay, briefText, dayBounds, freeBlocks, insightLine, NEW_DAY_HOUR, sendDue, somaSide, toEvents, toTasks, wakingDay, type Block, type Brief, type Insight, type SomaSide } from "@/lib/tomorrow";
import { addDays, dayKey } from "@/lib/today";
import { useDays } from "./Days";
import { useHealth } from "./Health";
import { useJournal } from "./Journal";
import { useRounds } from "./Rounds";
import { goalText, mainOf } from "@/lib/moves";
import { useSession } from "./Session";

type Tomorrow = {
  /** The day the brief is about, "YYYY-MM-DD": tomorrow, or between midnight and 4 am the day just begun. */
  day: string;
  soma: SomaSide;
  /** Habits that come with great days, strongest first; empty until there are enough check-ins to say. */
  lifts: Driver[];
  /** Which keys are stored. Null until known. */
  links: Links | null;
  /** The calendar and tasks for `day` once read; null before that, or while the vault is locked. */
  brief: Brief | null;
  /** Every Morgen calendar the last read saw, and the ones left out of the brief. */
  calendars: MorgenCalendar[] | null;
  skipped: string[];
  /** The waking hours free time is counted in and the free blocks (null without a calendar), and the Insights line,
   *  tied to a free block when there is a calendar. */
  awake: (Block & { fromFitbit: boolean }) | null;
  free: Block[] | null;
  insight: Insight | null;
  building: boolean;
  /** Send the brief to the Telegram chat paired in Settings. Null when it went, else what went wrong. */
  send: () => Promise<string | null>;
  /** Read the calendar and tasks again. Asks for the vault when it is locked. */
  build: () => void;
  /** Read again only when there is nothing for the day yet, or what there is has gone stale. */
  refreshIfStale: () => void;
  /** Check the key against the service, then keep it sealed. Null when it worked, else what went wrong. */
  connect: (provider: Provider, secret: string) => Promise<string | null>;
  disconnect: (provider: Provider) => Promise<void>;
  setSkipped: (ids: string[]) => Promise<void>;
};

const Ctx = createContext<Tomorrow | null>(null);
export function useTomorrow() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTomorrow outside <TomorrowProvider>");
  return v;
}

/** How far back great days are read: the 60 days the app already has loaded. */
const LOOKBACK = 60;
/** A brief older than this is read again when it is opened. */
const STALE_MS = 15 * 60 * 1000;
/** From this hour the evening turns to tomorrow: the Today card shows and the brief is read once by itself. */
export const EVENING_HOUR = 18;
const cacheKey = (userId: string) => "soma-brief." + userId;
type Cached = { brief: Brief; calendars: MorgenCalendar[] | null };

/** Why a source could not be read, in the words the brief shows. */
function reason(e: unknown, provider: Provider): string {
  if (e instanceof ApiError || e instanceof TodoistError) return e.message;
  return provider === "morgen" ? "Couldn't read Morgen." : "Couldn't read Todoist.";
}
/** A refused key is the person's to fix and already explained; anything else is worth David's attention. */
const level = (e: unknown) => ((e instanceof ApiError && e.status < 500) || (e instanceof TodoistError && e.status > 0 && e.status < 500) ? "warn" : "error");

export function TomorrowProvider({ children }: { children: ReactNode }) {
  const { settings, me, saveSettings } = useSession();
  const { map, today } = useDays();
  const rounds = useRounds();
  const { nights } = useHealth();
  const { vault, openVault, seal, unseal } = useJournal();
  const userId = me.id;

  // The day rolls over at 4 am; checked when the app comes back into view and once a minute while it is open.
  const [day, setDay] = useState(() => briefDay(new Date()));
  useEffect(() => {
    const roll = () => setDay(briefDay(new Date()));
    const timer = window.setInterval(roll, 60000);
    document.addEventListener("visibilitychange", roll);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", roll); };
  }, []);

  const [links, setLinks] = useState<Links | null>(null);
  const [stored, setStored] = useState<Cached | null>(null);
  const [building, setBuilding] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchLinks().then((r) => { if (alive) setLinks(r.links); }, (e) => report("brief", "links_failed", e, undefined, "warn"));
    return () => { alive = false; };
  }, [userId]);

  // What was read before is readable once the vault opens, and dropped from memory when it locks. Nothing is read
  // afresh until this has been looked at (`looked`), or opening the brief would read again what this device holds.
  const [looked, setLooked] = useState(false);
  useEffect(() => {
    if (vault !== "open") return;
    let alive = true;
    let sealed: string | null = null;
    try { sealed = localStorage.getItem(cacheKey(userId)); } catch { /* private window */ }
    Promise.resolve(sealed ? unseal<Cached>(sealed) : null).catch(() => null).then((c) => {
      if (!alive) return;
      if (c) setStored((cur) => cur ?? c);
      setLooked(true);
    });
    return () => { alive = false; setStored(null); setLooked(false); };
  }, [vault, unseal, userId]);

  const keep = useCallback(async (c: Cached) => {
    setStored(c);
    try { localStorage.setItem(cacheKey(userId), await seal(c)); } catch (e) { report("brief", "cache_failed", e, undefined, "warn"); }
  }, [seal, userId]);

  /** Read Morgen and Todoist for the day, each on its own: one failing never hides the other. */
  const read = useCallback(async (using: Links, forDay: string) => {
    if (busy.current) return;
    busy.current = true;
    setBuilding(true);
    try {
      const { start, end } = dayBounds(forDay);
      const [m, t] = await Promise.allSettled([
        using.morgen ? unseal<MorgenSealed>(using.morgen.ciphertext).then((k) => morgenEvents(k.key, start, end, k.skip || [])) : Promise.resolve(null),
        using.todoist ? unseal<TodoistSealed>(using.todoist.ciphertext).then((k) => todoistTasks(k.token)) : Promise.resolve(null),
      ]);
      // A source that fails keeps what it said last time for the same day, under the error, rather than going blank.
      const prev = stored && stored.brief.day === forDay ? stored.brief : null;
      const next: Brief = { day: forDay, builtMs: Date.now(), events: null, tasks: null };
      let calendars = stored?.calendars ?? null;
      if (m.status === "fulfilled" && m.value) { next.events = toEvents(m.value.events, forDay); calendars = m.value.calendars; }
      if (m.status === "rejected") { next.events = prev?.events ?? null; next.eventsError = reason(m.reason, "morgen"); report("brief", "morgen_failed", m.reason, undefined, level(m.reason)); }
      if (t.status === "fulfilled" && t.value) next.tasks = toTasks(t.value);
      if (t.status === "rejected") { next.tasks = prev?.tasks ?? null; next.tasksError = reason(t.reason, "todoist"); report("brief", "todoist_failed", t.reason, undefined, level(t.reason)); }
      await keep({ brief: next, calendars });
    } finally {
      busy.current = false;
      setBuilding(false);
    }
  }, [unseal, keep, stored]);

  const build = useCallback(() => {
    if (vault !== "open") { openVault(); return; }
    if (links) void read(links, day);
  }, [vault, openVault, links, read, day]);

  const brief = stored && stored.brief.day === day ? stored.brief : null;
  const connected = Boolean(links && (links.morgen || links.todoist));

  const refreshIfStale = useCallback(() => {
    if (vault !== "open" || !looked || !links || !connected) return;
    if (!brief || Date.now() - brief.builtMs > STALE_MS) void read(links, day);
  }, [vault, looked, links, connected, brief, read, day]);

  // In the evening the brief is read once by itself, so the Today card can say what tomorrow holds.
  const autoFor = useRef<string | null>(null);
  useEffect(() => {
    const h = new Date().getHours();
    if (vault !== "open" || !looked || !links || !connected || brief || autoFor.current === day || !(h >= EVENING_HOUR || h < NEW_DAY_HOUR)) return;
    autoFor.current = day;
    // After the render, not inside it: reading sets state.
    const soon = window.setTimeout(() => void read(links, day), 0);
    return () => window.clearTimeout(soon);
  }, [vault, looked, links, connected, brief, day, read]);

  const connect = useCallback(async (provider: Provider, secret: string): Promise<string | null> => {
    if (vault !== "open") { openVault(); return "Unlock your vault first: the key is kept sealed with it."; }
    const value = secret.trim();
    if (value.length < 16) return provider === "morgen" ? "That doesn't look like a Morgen API key." : "That doesn't look like a Todoist API token.";
    try {
      // Checked against the service before it is kept, so a typo is caught here and not at 9 pm.
      if (provider === "todoist") {
        await todoistTasks(value);
        await saveLink("todoist", await seal({ token: value } satisfies TodoistSealed));
      } else {
        const { start, end } = dayBounds(day);
        await morgenEvents(value, start, end, []);
        await saveLink("morgen", await seal({ key: value, skip: [] } satisfies MorgenSealed));
      }
      const fresh = (await fetchLinks()).links;
      setLinks(fresh);
      void read(fresh, day);
      return null;
    } catch (e) {
      report("brief", `${provider}_connect_failed`, e, undefined, level(e));
      return reason(e, provider);
    }
  }, [vault, openVault, seal, day, read]);

  const disconnect = useCallback(async (provider: Provider) => {
    await dropLink(provider);
    setLinks((cur) => (cur ? { ...cur, [provider]: null } : cur));
    if (stored) {
      const b = { ...stored.brief, ...(provider === "morgen" ? { events: null, eventsError: undefined } : { tasks: null, tasksError: undefined }) };
      await keep({ brief: b, calendars: provider === "morgen" ? null : stored.calendars });
    }
  }, [stored, keep]);

  // The calendars left out live inside the sealed Morgen link; opened again whenever that link changes.
  const [opened, setOpened] = useState<{ ciphertext: string; skip: string[] } | null>(null);
  const morgenSealed = vault === "open" ? links?.morgen?.ciphertext ?? null : null;
  useEffect(() => {
    if (!morgenSealed) return;
    let alive = true;
    unseal<MorgenSealed>(morgenSealed).then((k) => { if (alive) setOpened({ ciphertext: morgenSealed, skip: k.skip || [] }); }, () => undefined);
    return () => { alive = false; };
  }, [morgenSealed, unseal]);
  const skipped = useMemo(() => (opened && opened.ciphertext === morgenSealed ? opened.skip : []), [opened, morgenSealed]);

  const setSkipped = useCallback(async (ids: string[]) => {
    if (vault !== "open" || !links?.morgen) return;
    const k = await unseal<MorgenSealed>(links.morgen.ciphertext);
    await saveLink("morgen", await seal({ key: k.key, skip: ids } satisfies MorgenSealed));
    const fresh = (await fetchLinks()).links;
    setLinks(fresh);
    void read(fresh, day);
  }, [vault, links, unseal, seal, read, day]);

  const todayKey = dayKey(today);
  // The main move with today's goal (for the insight), and with the brief's day's goal (for Soma's side of it).
  const main = mainOf(settings);
  const goalToday = main ? rounds.goalFor(main, todayKey).goal : 0;
  const onDay = main ? rounds.goalFor(main, day) : null;
  const lifts = useMemo(() => {
    if (!map) return [];
    const days = Array.from({ length: LOOKBACK }, (_, i) => dayKey(addDays(today, i - (LOOKBACK - 1))));
    const g = greatDays(map, days, settings, main ? { move: main, goal: goalToday } : null, nights);
    return g.checkedIn >= MIN_CHECKINS ? g.lifts : [];
    // todayKey, not the Date object: a new Date each render must not recount. `main` is read from settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, todayKey, settings, goalToday, nights]);

  const moveName = main?.name ?? "", moveGoal = main && onDay ? goalText({ ...main, goal: onDay.goal }) : "";
  const soma = useMemo(() => somaSide(settings, moveName && onDay ? { name: moveName, goal: moveGoal, rest: onDay.rest, dayNumber: onDay.dayNumber } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, moveName, moveGoal, onDay?.rest, onDay?.dayNumber]);

  // The day's shape, for the screen and for the words sent to Telegram alike.
  const shape = useMemo(() => {
    const events = brief?.events ?? null;
    const awake = events ? wakingDay(day, nights, events) : null;
    const free = events && awake ? freeBlocks(events, awake.start, awake.end) : null;
    return { awake, free, insight: insightLine(lifts, free) };
  }, [brief, day, nights, lifts]);

  const send = useCallback(async (): Promise<string | null> => {
    // With nothing connected the brief is still Soma's side of the day, and that can go too.
    const b = brief ?? { day, builtMs: Date.now(), events: null, tasks: null };
    try { await briefToTelegram(briefText(b, soma, shape.free, shape.insight)); return null; }
    catch (e) {
      report("brief", "telegram_failed", e, undefined, e instanceof ApiError && e.status < 500 ? "warn" : "error");
      if (e instanceof ApiError && e.status === 409) return "Telegram isn't connected. Connect it in Settings, under Week in review.";
      return e instanceof ApiError ? e.message : "Couldn't send to Telegram.";
    }
  }, [brief, day, soma, shape]);

  // Sent by itself when asked for in Settings: once a day, the first time the brief is read after its time on the
  // evening before. The day it went is kept in settings, so a second phone does not send it again.
  const sentFor = useRef<string | null>(null);
  useEffect(() => {
    if (!brief || !sendDue(brief, settings.brief) || sentFor.current === brief.day) return;
    sentFor.current = brief.day;
    const forDay = brief.day;
    // A failure is logged by send() and not retried by itself; Send on the brief is always there.
    void send().then((why) => { if (!why) void saveSettings({ brief: { ...settings.brief, sent: forDay } }).catch(() => undefined); });
  }, [brief, send, saveSettings, settings.brief]);

  const value = useMemo<Tomorrow>(() => ({
    day, soma, lifts, links, brief, calendars: stored?.calendars ?? null, skipped, ...shape, building,
    build, refreshIfStale, connect, disconnect, setSkipped, send,
  }), [day, soma, lifts, links, brief, stored, skipped, shape, building, build, refreshIfStale, connect, disconnect, setSkipped, send]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
