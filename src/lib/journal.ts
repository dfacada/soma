// Journal storage. The server holds an index row per entry (id, time, sizes) and two opaque objects in
// Stratus: the encrypted entry JSON and the encrypted audio. Order matters, as Glimpse learned:
// audio first, then the entry, then the index row, so a failure never leaves a row that points at nothing.

import { api, type EntryMeta } from "./api";
import { decryptBytes, decryptJson, encryptBytes, encryptJson } from "./vault-crypto";
import type { JournalEntry } from "./recovery";

type Signed = { urls: { name: string; url: string }[] };
type Kind = "entries" | "audio";

async function signed(kind: Kind, method: "PUT" | "GET", names: string[]) {
  const res = await api<Signed>("POST", "/sign", { kind, method, names });
  return new Map(res.urls.map((u) => [u.name, u.url]));
}

// Stratus refuses a PUT to a key that already exists (409 key_already_exists) unless it carries `overwrite: true`.
// Every write here may be a re-save (a note, a transcript, a retried upload), so the header is always sent.
export const PUT_HEADERS = { "Content-Type": "application/octet-stream", overwrite: "true" };

async function putObject(url: string, bytes: Uint8Array) {
  const res = await fetch(url, { method: "PUT", body: bytes as BodyInit, headers: PUT_HEADERS });
  if (!res.ok) throw new Error(`upload failed (${res.status})`);
}

async function getObject(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  return res.arrayBuffer();
}

const fileOf = (id: string) => `${id}.enc`;

/** Encrypt and upload an entry, and its audio when given. Safe to call again: every step overwrites. */
export async function saveEntry(key: CryptoKey, entry: JournalEntry, audio?: Blob) {
  if (audio) {
    const bytes = await encryptBytes(key, await audio.arrayBuffer());
    await putObject((await signed("audio", "PUT", [fileOf(entry.id)])).get(fileOf(entry.id))!, bytes);
  }
  await putObject((await signed("entries", "PUT", [fileOf(entry.id)])).get(fileOf(entry.id))!, await encryptJson(key, entry));
  await api("PUT", `/entries/${entry.id}`, {
    createdMs: new Date(entry.createdAt).getTime(),
    hasAudio: entry.hasAudio, audioSize: entry.audioSize, audioMime: entry.audioMime.slice(0, 60),
    transcriptStatus: entry.transcriptStatus,
  });
}

export type LoadedEntry = { meta: EntryMeta; entry: JournalEntry | null };

/** Newest first. An entry that fails to decrypt is kept as metadata only, never dropped. */
export async function loadEntries(key: CryptoKey): Promise<LoadedEntry[]> {
  const { entries } = await api<{ entries: EntryMeta[] }>("GET", "/entries");
  if (!entries.length) return [];
  const urls = await signed("entries", "GET", entries.map((e) => fileOf(e.id)));
  return Promise.all(entries.map(async (meta) => {
    try { return { meta, entry: await decryptJson<JournalEntry>(key, await getObject(urls.get(fileOf(meta.id))!)) }; }
    catch { return { meta, entry: null }; }
  }));
}

export async function loadAudio(key: CryptoKey, id: string, mime: string): Promise<Blob> {
  const url = (await signed("audio", "GET", [fileOf(id)])).get(fileOf(id))!;
  return new Blob([await decryptBytes(key, await getObject(url))], { type: mime || "audio/webm" });
}

export const deleteEntry = (id: string) => api("DELETE", `/entries/${id}`);

const pad = (n: number) => (n < 10 ? "0" : "") + n;
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${pad(Math.floor(sec % 60))}`;

export function newEntry(audio: Blob, seconds: number, mood: string | null, opts: { createdAt?: Date; recovered?: boolean; addedLater?: boolean } = {}): JournalEntry {
  const at = opts.createdAt || new Date();
  return {
    id: "e_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    createdAt: at.toISOString(),
    title: at.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " + at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase(),
    transcript: "", transcriptStatus: "none", mood,
    hasAudio: true, audioSize: audio.size, audioMime: audio.type || "audio/webm", audioDuration: seconds,
    recovered: opts.recovered || undefined, addedLater: opts.addedLater || undefined, updatedAt: null,
  };
}

/** A written entry: no audio, the text is the transcript. Saved with saveEntry(key, entry) and no blob. */
export function textEntry(text: string, mood: string | null, opts: { createdAt?: Date; addedLater?: boolean } = {}): JournalEntry {
  const at = opts.createdAt || new Date();
  return {
    id: "e_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    createdAt: at.toISOString(),
    title: at.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " + at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase(),
    transcript: text, transcriptStatus: "done", mood,
    hasAudio: false, audioSize: 0, audioMime: "", audioDuration: 0,
    addedLater: opts.addedLater || undefined, updatedAt: null,
  };
}

/** For backfill: that day at the current time of day, so entries filed together keep their order. */
export function onDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const at = new Date();
  at.setFullYear(y, m - 1, d);
  return at;
}
