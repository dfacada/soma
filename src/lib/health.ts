// Google Health (the Fitbit Web API's successor): steps only. The server does every call to Google because Google
// wants the client secret; it never keeps a token. The refresh token lives on the server only as vault ciphertext,
// so a sync needs the vault open: the browser decrypts the token and hands it over for that one request.

import { api } from "./api";

export type HealthLink = { configured: boolean; link: { ciphertext: string; createdMs: number } | null };
export type StepDay = { day: string; steps: number };
export type Sealed = { refreshToken: string };

const STATE_KEY = "soma-gh-state";
export const SYNC_EVERY_MS = 30 * 60 * 1000;
export const redirectUri = () => window.location.origin + "/settings/";

export const fetchLink = () => api<HealthLink>("GET", "/google-health");

/** Leaves the app for Google's consent screen. The state value comes back on the redirect and is checked there. */
export async function startConnect() {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => (b % 36).toString(36)).join("");
  sessionStorage.setItem(STATE_KEY, state);
  const { url } = await api<{ url: string }>("POST", "/google-health/auth-url", { redirectUri: redirectUri(), state });
  window.location.assign(url);
}

export type OAuthReturn = { code: string } | { error: string } | null;

/** Reads Google's redirect out of the address bar, once, and strips it so a reload cannot replay it. */
export function takeOAuthReturn(): OAuthReturn {
  const q = new URLSearchParams(window.location.search);
  const code = q.get("code"), error = q.get("error"), state = q.get("state");
  if (!code && !error) return null;
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  window.history.replaceState(null, "", window.location.pathname);
  if (!state || state !== expected) return { error: "That Google sign-in did not start here. Try connecting again." };
  if (error || !code) return { error: error === "access_denied" ? "Google connection cancelled" : "Google could not connect" };
  return { code };
}

export const exchangeCode = (code: string) => api<Sealed>("POST", "/google-health/exchange", { code, redirectUri: redirectUri() });
export const saveLink = (ciphertext: string) => api("PUT", "/google-health/link", { ciphertext });
export const syncSteps = (refreshToken: string, from: string, to: string) => api<{ days: StepDay[] }>("POST", "/google-health/sync", { refreshToken, from, to });
export const disconnect = (refreshToken: string | null) => api<{ revoked: boolean }>("POST", "/google-health/disconnect", refreshToken ? { refreshToken } : {});

const stampKey = (userId: string) => "soma-gh-sync." + userId;
export function lastSync(userId: string): number { try { return Number(localStorage.getItem(stampKey(userId))) || 0; } catch { return 0; } }
export function stampSync(userId: string, at: number | null) { try { if (at) localStorage.setItem(stampKey(userId), String(at)); else localStorage.removeItem(stampKey(userId)); } catch { /* private window */ } }
