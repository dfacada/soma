// The browser's door into the one log (catalyst/functions/soma_api/lib/log.js). Anything that fails in the app is
// reported here, so David can see it in Settings → Admin → Log instead of hearing about it later.
//
// Rules for callers: `report()` never throws, never waits, and must never be handed journal text, a passphrase, a
// token or a key. Errors, status codes, sizes, mime types and screen names are what belong in it. The server cuts
// anything that looks like a secret as a second line of defence.

import { API_BASE } from "./api";
import { authToken, DEV_TEST_KEY, isDevIdentity } from "./catalyst";

export type Level = "error" | "warn" | "info";
type Extra = Record<string, string | number | boolean | null | undefined>;

const recent = new Map<string, number>();
let sentThisMinute = 0, minute = 0;

function describe(e: unknown): { message: string; name?: string; stack?: string } {
  if (e instanceof Error) return { message: e.message || e.name, name: e.name, stack: (e.stack || "").split("\n").slice(0, 6).join("\n") };
  if (typeof e === "string") return { message: e };
  try { return { message: JSON.stringify(e).slice(0, 300) }; } catch { return { message: String(e) }; }
}

/** area: the part of the app ("journal", "food", "health"…). event: a short stable code ("playback_failed"). */
export function report(area: string, event: string, error?: unknown, extra?: Extra, level: Level = "error") {
  try {
    const now = Date.now();
    const key = area + ":" + event;
    // The same failure in a loop is one line, not a hundred; and nothing may flood the table.
    if (now - (recent.get(key) || 0) < 15000) return;
    recent.set(key, now);
    if (Math.floor(now / 60000) !== minute) { minute = Math.floor(now / 60000); sentThisMinute = 0; }
    if (++sentThisMinute > 12) return;

    const err = error === undefined ? null : describe(error);
    const nav = navigator as Navigator & { standalone?: boolean };
    const detail = {
      ...extra, error: err?.name, stack: err?.stack, screen: window.location.pathname, online: navigator.onLine,
      installed: window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true, ua: navigator.userAgent.slice(0, 160),
    };
    const body = JSON.stringify({ level, area, event, message: err?.message, detail: JSON.stringify(detail), status: typeof extra?.status === "number" ? extra.status : undefined });
    // Straight to fetch, not through api(): api() reports its own failures here, and that must not loop.
    void (async () => {
      const identity: Record<string, string> = isDevIdentity ? { "x-test-key": DEV_TEST_KEY } : { Authorization: await authToken() };
      await fetch(API_BASE + "/logs", { method: "POST", headers: { ...identity, "Content-Type": "application/json" }, body, keepalive: true });
    })().catch(() => undefined);
  } catch { /* the reporter itself must never be the thing that breaks */ }
}

/** Uncaught errors and unhandled promise rejections, from anywhere. Returns the undo. */
export function watchUncaught(): () => void {
  const onError = (e: ErrorEvent) => report("app", "uncaught", e.error || e.message, { at: `${(e.filename || "").split("/").pop()}:${e.lineno}` });
  const onRejection = (e: PromiseRejectionEvent) => report("app", "unhandled_rejection", e.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
}
