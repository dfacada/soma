// Where tomorrow's brief gets its calendar and tasks. Two keys, both sealed on this device with the vault key and
// stored on the server only as ciphertext (routes/links.js):
//   Morgen: every connected calendar, Google included. Morgen only answers browsers on its own sites, so the read
//     goes through soma_api (routes/morgen.js), which uses the key for that request and keeps nothing.
//   Todoist: read from this device straight from Todoist, which answers any site. Soma's server never sees the token.

import { api } from "./api";
import type { MorgenEvent, TodoistTask } from "./tomorrow";

export type Provider = "morgen" | "todoist";
export type Link = { ciphertext: string; createdMs: number };
export type Links = Record<Provider, Link | null>;
/** What is inside each sealed link. `skip`: Morgen calendars left out of the brief. */
export type MorgenSealed = { key: string; skip: string[] };
export type TodoistSealed = { token: string };
export type MorgenCalendar = { id: string; accountId: string; integration: string; name: string; color?: string };

export const fetchLinks = () => api<{ links: Links }>("GET", "/links");
export const saveLink = (provider: Provider, ciphertext: string) => api("PUT", `/links/${provider}`, { ciphertext });
export const dropLink = (provider: Provider) => api("DELETE", `/links/${provider}`);

/** The events between two instants (the day's local midnights) in every calendar not skipped. */
export const morgenEvents = (key: string, from: number, to: number, skip: string[]) =>
  api<{ events: MorgenEvent[]; calendars: MorgenCalendar[] }>("POST", "/morgen/events", {
    key, skip, from: new Date(from).toISOString().replace(/\.\d{3}Z$/, "Z"), to: new Date(to).toISOString().replace(/\.\d{3}Z$/, "Z"),
  });

/** The brief as a Telegram message, to the chat paired for the week in review (routes/telegram.js). Words only,
 *  formatted as Telegram HTML (tomorrow.ts briefText escapes everything in it). */
export const briefToTelegram = (text: string) =>
  api<{ sent: boolean }>("POST", "/telegram/send", { text, speak: false, html: true, title: "Tomorrow's brief" });

/** A refusal from Todoist, in words a person can act on. */
export class TodoistError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const TODOIST = "https://api.todoist.com/api/v1/tasks/filter";
/** Only what is due on the brief's day (David, 2026-11-03: not the earlier ones left undone). "today" is there for
 *  a brief read after midnight, which is about the day just begun; the day itself is picked out on the phone. */
export const TODOIST_QUERY = "today | tomorrow";

/** Read-only: one filter query, a page of 200 at a time, five pages at most. */
export async function todoistTasks(token: string): Promise<TodoistTask[]> {
  const out: TodoistTask[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({ query: TODOIST_QUERY, lang: "en", limit: "200", ...(cursor ? { cursor } : {}) });
    let res: Response;
    try { res = await fetch(`${TODOIST}?${q}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }); }
    catch { throw new TodoistError("Couldn't reach Todoist.", 0); }
    if (res.status === 401 || res.status === 403) throw new TodoistError("Todoist didn't accept that token. Copy it again from Todoist: Settings → Integrations → Developer.", res.status);
    if (res.status === 429) throw new TodoistError("Todoist is busy. Try again in a minute.", 429);
    if (!res.ok) throw new TodoistError(`Todoist didn't answer (${res.status}).`, res.status);
    const json = (await res.json().catch(() => null)) as { results?: TodoistTask[]; next_cursor?: string | null } | null;
    out.push(...(json?.results || []));
    cursor = json?.next_cursor || null;
    if (!cursor) break;
  }
  return out;
}
