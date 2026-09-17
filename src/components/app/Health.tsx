"use client";

// Google Health connection (Fitbit steps and sleep). Sits under the journal provider because the refresh token is vault
// ciphertext: connecting and syncing both need the vault open. Steps land in the shared day map, so Activity
// shows them the moment a sync returns. Sleep never touches the day map: it is decrypted here, held in memory
// while the vault is open, and written back as ciphertext a month at a time.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { disconnect as dropLink, exchangeCode, fetchLink, fetchMonths, lastSync, monthOf, noteSleepGranted, saveLink, saveMonth, sleepGranted, stampSync, startConnect, syncHealth, takeOAuthReturn, SYNC_EVERY_MS, type HealthLink, type Nights, type OAuthReturn, type Sealed } from "@/lib/health";
import { addDays, dayKey, noon } from "@/lib/today";
import { useDays } from "./Days";
import { useJournal } from "./Journal";
import { useSession } from "./Session";

export type HealthStatus = "loading" | "unconfigured" | "off" | "connected" | "reconnect";
type Health = {
  status: HealthStatus;
  syncing: boolean;
  lastSyncMs: number;
  /** Nights by wake-up day. Null while the vault is closed or nothing is loaded yet. */
  nights: Nights | null;
  /** Whether Google lets this connection read sleep. Null until a sync has answered. */
  sleepAllowed: boolean | null;
  connect: () => void;
  disconnect: () => Promise<void>;
  syncNow: () => void;
};

const Ctx = createContext<Health | null>(null);
export function useHealth() {
  const h = useContext(Ctx);
  if (!h) throw new Error("useHealth outside <HealthProvider>");
  return h;
}

// Google's redirect is read once per page load and finished once, however many times effects run.
let oauthReturn: OAuthReturn | undefined;
let oauthDone = false;
/** First connect fills the whole window the screens load; later syncs re-read a week, since trackers sync late. */
const BACKFILL_DAYS = 60;
const REFRESH_DAYS = 7;
/** Until one sync has succeeded on this device there is nothing to refresh: fill the window instead. */
const span = (userId: string) => (lastSync(userId) ? REFRESH_DAYS : BACKFILL_DAYS);

/** Back from Google's consent screen: trade the code, encrypt the token here, store only the ciphertext. */
async function completeConnect(code: string, seal: (value: unknown) => Promise<string>) {
  const ciphertext = await seal(await exchangeCode(code));
  await saveLink(ciphertext);
  return { ciphertext, createdMs: Date.now() };
}

/** Every stored night in the months that cover the window. A month sealed by an older vault is skipped. */
async function loadNights(unseal: <T>(b64: string) => Promise<T>): Promise<Nights> {
  const today = noon();
  // A year of months, thirteen rows at most: Insights can look back that far.
  const { months } = await fetchMonths(monthOf(dayKey(addDays(today, -366))), monthOf(dayKey(today)));
  const parts = await Promise.all(months.map((m) => unseal<Nights>(m.ciphertext).catch(() => ({} as Nights))));
  return Object.assign({}, ...parts);
}

export function HealthProvider({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const { vault, openVault, seal, unseal, say } = useJournal();
  const { applySteps } = useDays();
  const userId = me.id;

  const [info, setInfo] = useState<HealthLink | null>(null);
  const [stale, setStale] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMs, setLastSyncMs] = useState(() => lastSync(userId));
  const [nights, setNights] = useState<Nights | null>(null);
  const [sleepAllowed, setSleepAllowed] = useState<boolean | null>(() => sleepGranted(userId));
  const held = useRef<Nights | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchLink().then((i) => { if (alive) setInfo(i); }, () => { if (alive) setInfo({ configured: false, link: null }); });
    return () => { alive = false; };
  }, [userId]);

  const sync = useCallback(async (link: NonNullable<HealthLink["link"]>, span: number, quiet: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setSyncing(true);
    try {
      let token: string;
      // Ciphertext from a vault that has since been replaced cannot be opened: the same fix as a revoked token.
      try { token = (await unseal<Sealed>(link.ciphertext)).refreshToken; } catch { setStale(true); return; }
      const today = noon();
      const res = await syncHealth(token, dayKey(addDays(today, -span)), dayKey(today));
      applySteps(res.days);
      if (res.sleep) {
        // Merge into what is stored, then re-seal only the months that changed. The stored months are loaded first,
        // so a sync can never write a month back with nights missing.
        const base = held.current ?? await loadNights(unseal);
        const next = { ...base };
        const touched = new Set<string>();
        for (const { day, ...night } of res.sleep) {
          if (JSON.stringify(next[day]) !== JSON.stringify(night)) { next[day] = night; touched.add(monthOf(day)); }
        }
        for (const month of touched) {
          const slice = Object.fromEntries(Object.entries(next).filter(([day]) => monthOf(day) === month));
          await saveMonth(month, await seal(slice));
        }
        held.current = next;
        setNights(next);
      }
      // A failed sleep read says nothing about the permission; only a clean answer does.
      if (!res.sleepError) { noteSleepGranted(userId, res.sleep !== null); setSleepAllowed(res.sleep !== null); }
      const now = Date.now();
      stampSync(userId, now);
      setLastSyncMs(now);
      setStale(false);
      if (!quiet) say(res.days.length ? "Steps synced" : "Synced. Google has no steps for these days yet.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setStale(true); if (!quiet) say("Google needs you to connect again"); }
      else if (!quiet) say(e instanceof ApiError ? e.message : "Couldn't sync steps");
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [userId, seal, unseal, applySteps, say]);

  useEffect(() => {
    if (oauthReturn === undefined) oauthReturn = takeOAuthReturn();
    const back = oauthReturn;
    if (!back || oauthDone || vault === "checking") return;
    if ("error" in back) { oauthDone = true; say(back.error); return; }
    // The tab normally still holds the key. If not, ask for it; this runs again when the vault opens.
    if (vault !== "open") { openVault(); return; }
    oauthDone = true;
    completeConnect(back.code, seal).then((link) => {
      setInfo({ configured: true, link });
      setStale(false);
      say("Google Health connected");
      void sync(link, BACKFILL_DAYS, true);
    }, (e) => say(e instanceof ApiError ? e.message : "Couldn't finish connecting"));
  }, [vault, openVault, say, seal, sync]);

  // Stored nights are readable as soon as the vault opens, connected or not, and gone the moment it locks.
  useEffect(() => {
    let alive = true;
    if (vault === "open") loadNights(unseal).then((n) => { if (alive && !held.current) { held.current = n; setNights(n); } }, () => undefined);
    return () => { alive = false; held.current = null; setNights(null); };
  }, [vault, unseal, userId]);

  const link = info?.link ?? null;
  useEffect(() => {
    if (vault !== "open" || !link || stale) return;
    const tick = () => { if (document.visibilityState === "visible" && Date.now() - lastSync(userId) > SYNC_EVERY_MS) void sync(link, span(userId), true); };
    tick();
    document.addEventListener("visibilitychange", tick);
    const timer = window.setInterval(tick, 5 * 60 * 1000);
    return () => { document.removeEventListener("visibilitychange", tick); window.clearInterval(timer); };
  }, [vault, link, stale, userId, sync]);

  const connect = useCallback(() => {
    if (vault !== "open") { openVault(); say("Unlock your vault first. The connection is stored encrypted."); return; }
    startConnect().catch((e) => say(e instanceof ApiError ? e.message : "Couldn't reach Google"));
  }, [vault, openVault, say]);

  const disconnect = useCallback(async () => {
    let token: string | null = null;
    if (link && vault === "open") token = await unseal<Sealed>(link.ciphertext).then((s) => s.refreshToken, () => null);
    try {
      const res = await dropLink(token);
      setInfo((i) => (i ? { ...i, link: null } : i));
      setStale(false);
      stampSync(userId, null);
      setLastSyncMs(0);
      noteSleepGranted(userId, null);
      setSleepAllowed(null);
      say(res.revoked ? "Disconnected, and access revoked at Google" : "Disconnected. To revoke access too, remove Soma in your Google account.");
    } catch { say("Couldn't disconnect"); }
  }, [link, vault, unseal, userId, say]);

  const syncNow = useCallback(() => {
    if (!link) return;
    if (vault !== "open") { openVault(); return; }
    void sync(link, span(userId), false);
  }, [link, vault, openVault, sync, userId]);

  const status: HealthStatus = !info ? "loading" : !info.link ? (info.configured ? "off" : "unconfigured") : stale ? "reconnect" : "connected";
  const value = useMemo<Health>(() => ({ status, syncing, lastSyncMs, nights, sleepAllowed, connect, disconnect, syncNow }), [status, syncing, lastSyncMs, nights, sleepAllowed, connect, disconnect, syncNow]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
