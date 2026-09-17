"use client";

// Google Health connection (Fitbit steps). Sits under the journal provider because the refresh token is vault
// ciphertext: connecting and syncing both need the vault open. Steps land in the shared day map, so Activity
// shows them the moment a sync returns.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { disconnect as dropLink, exchangeCode, fetchLink, lastSync, saveLink, stampSync, startConnect, syncSteps, takeOAuthReturn, SYNC_EVERY_MS, type HealthLink, type OAuthReturn, type Sealed } from "@/lib/health";
import { addDays, dayKey, noon } from "@/lib/today";
import { useDays } from "./Days";
import { useJournal } from "./Journal";
import { useSession } from "./Session";

export type HealthStatus = "loading" | "unconfigured" | "off" | "connected" | "reconnect";
type Health = {
  status: HealthStatus;
  syncing: boolean;
  lastSyncMs: number;
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

/** Back from Google's consent screen: trade the code, encrypt the token here, store only the ciphertext. */
async function completeConnect(code: string, seal: (value: unknown) => Promise<string>) {
  const ciphertext = await seal(await exchangeCode(code));
  await saveLink(ciphertext);
  return { ciphertext, createdMs: Date.now() };
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
      const res = await syncSteps(token, dayKey(addDays(today, -span)), dayKey(today));
      applySteps(res.days);
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
  }, [userId, unseal, applySteps, say]);

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

  const link = info?.link ?? null;
  useEffect(() => {
    if (vault !== "open" || !link || stale) return;
    const tick = () => { if (document.visibilityState === "visible" && Date.now() - lastSync(userId) > SYNC_EVERY_MS) void sync(link, REFRESH_DAYS, true); };
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
      say(res.revoked ? "Disconnected, and access revoked at Google" : "Disconnected. To revoke access too, remove Soma in your Google account.");
    } catch { say("Couldn't disconnect"); }
  }, [link, vault, unseal, userId, say]);

  const syncNow = useCallback(() => {
    if (!link) return;
    if (vault !== "open") { openVault(); return; }
    void sync(link, REFRESH_DAYS, false);
  }, [link, vault, openVault, sync]);

  const status: HealthStatus = !info ? "loading" : !info.link ? (info.configured ? "off" : "unconfigured") : stale ? "reconnect" : "connected";
  const value = useMemo<Health>(() => ({ status, syncing, lastSyncMs, connect, disconnect, syncNow }), [status, syncing, lastSyncMs, connect, disconnect, syncNow]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
