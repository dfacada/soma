// The one way the app talks to soma_api. Slate and functions are different origins, so the URL is
// absolute and every request carries the raw Catalyst token (or, under `next dev`, the test key).

import { authToken, forgetToken, DEV_TEST_KEY, isDevIdentity } from "./catalyst";
import { report } from "./log";

export const API_BASE = "https://soma-939530195.development.catalystserverless.com/server/soma_api/execute";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) { super(message); }
}

async function identity(): Promise<Record<string, string>> {
  return isDevIdentity ? { "x-test-key": DEV_TEST_KEY } : { Authorization: await authToken() };
}

export async function api<T>(method: "GET" | "PUT" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const where = path.split("?")[0];
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(API_BASE + path, {
        method,
        headers: { ...(await identity()), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      // Never reached the server: offline, a dropped connection, or sign-in that could not produce a token.
      report("api", "unreachable", e, { method, path: where }, navigator.onLine ? "error" : "warn");
      throw e;
    }
    // A cached token can expire mid-session: drop it and try once more with a fresh one.
    if (res.status === 401 && attempt === 0 && !isDevIdentity) { forgetToken(); continue; }
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page from the gateway */ }
    if (!res.ok) {
      const message = (json as { error?: string } | null)?.error || `request failed (${res.status})`;
      // Every failed call is logged, except the answers that are part of normal life: not signed in (401), nothing
      // logged for that day (a GET's 404), and the conflicts the screens handle themselves (409).
      const expected = res.status === 401 || res.status === 409 || (res.status === 404 && method === "GET");
      if (!expected) report("api", res.status >= 500 ? "server_error" : "refused", message, { method, path: where, status: res.status }, res.status >= 500 ? "error" : "warn");
      throw new ApiError(res.status, message, json);
    }
    return json as T;
  }
}

// ── Shapes returned by the API (catalyst/functions/soma_api/routes) ──
export type Profile = { rowId: string; displayName: string; role: "admin" | "member"; status: "pending" | "active" | "disabled" };
export type Me = { id: string; email: string; name: string; profile: Profile };

export type Checkin = { day: string; mood: string | null; habits: Record<string, boolean>; counts: Record<string, number> };
export type Eaten = { name: string; kcal: number; protein: number; carbs?: number; fat?: number };
export type Extra = { name: string; kcal: number; protein?: number; carbs?: number; fat?: number };
/** A meal slot holds a snapshot of what was eaten, so swapping the plan later never rewrites past days. */
export type DayLog = { day: string; meals: Record<string, Eaten | boolean>; extras: Extra[] };
/** `steps` is written by the Google Health sync, never by a day save. */
export type ActivityDay = { day: string; pushups: number | null; types: Record<string, boolean>; steps?: number | null };
export type EntryMeta = { id: string; createdMs: number; hasAudio: boolean; hasPhoto: boolean; transcriptStatus: string };
export type Days = {
  from: string; to: string;
  checkins: Checkin[]; dayLogs: DayLog[]; activity: ActivityDay[]; weight: { day: string; value: number }[]; entries: EntryMeta[];
};
