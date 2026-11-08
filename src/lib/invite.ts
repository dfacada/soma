// Invite links: https://<app>/join/?c=CODE (catalyst/functions/soma_api/routes/invites.js).
//
// The /join page shows what the link is for and keeps the code on this device, because signing up goes through
// Catalyst's own screens and an email, and the code has to survive that trip. The session (Session.tsx) hands it to
// the server with the first call, which lets a new person in at once, then joins the link's round and forgets it.

import { api, API_BASE } from "./api";

const KEY = "soma-invite";
const KEEP_MS = 14 * 24 * 60 * 60 * 1000;

export type InvitePreview = { ok: boolean; reason: string | null; from: string | null; round: { name: string; startDate: string; lengthDays: number } | null };
export type Accepted = { approved: boolean; already: boolean; round: { id: string; name: string } | null };

/** Codes are Crockford base32, ten characters; typed loosely (case, spaces, dashes, O for 0) they still read. */
export function cleanCode(text: string | null | undefined): string | null {
  const c = String(text || "").toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return /^[0-9A-HJKMNP-TV-Z]{10}$/.test(c) ? c : null;
}

/** The link's code, kept until it is used (or two weeks pass). Never throws: a private window keeps nothing. */
export function keepInvite(code: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* private window */ }
}
export function keptInvite(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null") as { code?: string; at?: number } | null;
    if (!v?.code || !v.at || Date.now() - v.at > KEEP_MS) return null;
    return cleanCode(v.code);
  } catch { return null; }
}
export function forgetInvite() {
  try { localStorage.removeItem(KEY); } catch { /* private window */ }
}

/** What a link is for, without signing in (the person holding it usually has no account yet). */
export async function previewInvite(code: string): Promise<InvitePreview> {
  const res = await fetch(`${API_BASE}/invites/${code}`);
  const json = await res.json().catch(() => null) as (InvitePreview & { error?: string }) | null;
  if (res.status === 404) return { ok: false, reason: json?.error || "That invite code is not one Soma knows.", from: null, round: null };
  if (!res.ok || !json) throw new Error(`invite preview failed (${res.status})`);
  return json;
}

/** Use a link: lets a waiting account in, and joins the link's round with the person's own daily target. */
export const acceptInvite = (code: string, today: string) => api<Accepted>("POST", `/invites/${code}/accept`, { today });

/** The address to share for a code, on whatever origin this app is served from. */
export const inviteUrl = (code: string) => `${window.location.origin}/join/?c=${code}`;
