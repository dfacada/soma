// Your data: take all of it with you, or delete the account (catalyst/functions/soma_api/routes/account.js).
//
// The export is built here, not on the server, because the server cannot read the journal, the weekly reviews or
// sleep: they are vault ciphertext. The server sends everything it holds; with the vault open, this opens what the
// key can open and adds the transcripts (and, if asked, the recordings) before saving one file. With the vault
// locked, the file says what was left out and why.

import { api } from "./api";
import { report } from "./log";
import { forgetUser } from "./recovery";
import { forgetDeviceRecord } from "./vault-passkey";
import { makeZip, type ZipFile } from "./zip";
import type { JournalEntry } from "./recovery";
import type { AudioProgress } from "./journal";

type Sealed = { ciphertext: string };
export type ServerExport = {
  app: string; exportedAt: string;
  account: Record<string, unknown>; settings: Record<string, unknown>;
  journal: { id: string; createdMs: number; transcriptStatus: string; hasAudio: boolean; audioBytes: number; audioType: string | null; hasPhoto: boolean }[];
  reviews: (Sealed & { weekStart: string; hasAudio: boolean; createdMs: number | null })[];
  sleep: (Sealed & { month: string })[];
  [rest: string]: unknown;
};

/** What the journal provider can do with the vault open (Journal.tsx): its entries, its key, its recordings. */
export type VaultReach = {
  items: { id: string; createdMs: number; entry: JournalEntry | null; pending: boolean }[];
  unseal: <T>(b64: string) => Promise<T>;
  audioFor: (id: string, onProgress?: (p: AudioProgress) => void) => Promise<Blob>;
};

export const fetchExport = () => api<ServerExport>("GET", "/account/export");

/** Bytes the recordings take, from the index, so the screen can say how big the file will be before it is made. */
export const recordingBytes = (items: VaultReach["items"]) =>
  items.reduce((n, i) => n + (i.entry?.hasAudio ? i.entry.audioSize || 0 : 0), 0);

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
const extOf = (mime: string) => (/mp4|m4a|aac/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : /wav/.test(mime) ? "wav" : "webm");

export type ExportStep = { label: string; done?: number; total?: number };

/**
 * The file to save: a .json, or with recordings a .zip holding the same JSON and one audio file per recording.
 * `vault` is null while the vault is locked. Recordings that fail to download are listed in the file, not fatal.
 */
export async function buildExport(vault: VaultReach | null, withRecordings: boolean, onStep: (s: ExportStep) => void): Promise<{ file: Blob; name: string; missed: number }> {
  onStep({ label: "Collecting your data" });
  const server = await fetchExport();
  const day = new Date().toISOString().slice(0, 10);
  const { journal, reviews, sleep, ...rest } = server;
  const out: Record<string, unknown> = {
    about: vault
      ? `Everything Soma kept for you on ${day}, with your journal, weekly reviews and sleep opened with your vault key.` +
        (withRecordings ? " Each recording is in the recordings folder, named by when you made it." : " Recordings are not in this file; export again with Include recordings to get them.")
      : `Everything Soma kept for you on ${day}. Your journal, weekly reviews and sleep are encrypted with your vault passphrase and are not in this file: unlock your vault in Soma and export again to include them.`,
    ...rest,
  };

  let missed = 0;
  const files: ZipFile[] = [];
  if (vault) {
    onStep({ label: "Opening your journal" });
    const byId = new Map(vault.items.map((i) => [i.id, i]));
    // Every entry the server knows, plus any still waiting on this device to upload.
    const ids = [...new Set([...journal.map((j) => j.id), ...vault.items.filter((i) => i.pending).map((i) => i.id)])];
    const meta = new Map(journal.map((j) => [j.id, j]));
    const entries = ids.map((id) => {
      const item = byId.get(id);
      const e = item?.entry;
      const createdMs = meta.get(id)?.createdMs ?? item?.createdMs ?? 0;
      if (!e) return { id, created: new Date(createdMs).toISOString(), unreadable: true };
      return {
        id, created: e.createdAt, title: e.title, text: e.transcript, mood: e.mood, seconds: Math.round(e.audioDuration || 0),
        hasRecording: e.hasAudio, addedLater: Boolean(e.addedLater), notUploadedYet: Boolean(item?.pending),
      };
    }).sort((a, b) => (a.created < b.created ? -1 : 1));
    out.journal = entries;

    out.reviews = await Promise.all(reviews.map(async (r) => ({ weekStart: r.weekStart, ...(await vault.unseal<Record<string, unknown>>(r.ciphertext).catch(() => ({ unreadable: true }))) })));
    const nights: Record<string, unknown> = {};
    for (const m of sleep) Object.assign(nights, await vault.unseal<Record<string, unknown>>(m.ciphertext).catch(() => ({})));
    out.sleep = Object.keys(nights).sort().map((night) => ({ night, ...(nights[night] as object) }));

    if (withRecordings) {
      const withAudio = vault.items.filter((i) => i.entry?.hasAudio);
      const missing: string[] = [];
      for (let n = 0; n < withAudio.length; n++) {
        const { id, entry } = withAudio[n];
        onStep({ label: "Saving recordings", done: n, total: withAudio.length });
        try {
          const blob = await vault.audioFor(id);
          const when = new Date(entry!.createdAt);
          files.push({ name: `recordings/${stamp(when)} ${id}.${extOf(blob.type || entry!.audioMime || "")}`, data: blob, modified: when });
        } catch (e) {
          missing.push(id);
          report("account", "export_recording_failed", e, { id }, "warn");
        }
      }
      missed = missing.length;
      if (missing.length) out.recordingsNotIncluded = missing;
    }
  } else {
    out.journal = journal.map((j) => ({ id: j.id, created: new Date(j.createdMs).toISOString(), encrypted: true, hasRecording: j.hasAudio }));
    out.reviews = reviews.map((r) => ({ weekStart: r.weekStart, encrypted: true }));
    out.sleep = sleep.map((s) => ({ month: s.month, encrypted: true }));
  }

  const json = JSON.stringify(out, null, 2);
  if (!files.length) return { file: new Blob([json], { type: "application/json" }), name: `soma-export-${day}.json`, missed };
  onStep({ label: "Making the file" });
  const zip = await makeZip([{ name: "soma-data.json", data: json }, ...files], (done, total) => onStep({ label: "Making the file", done, total }));
  return { file: zip, name: `soma-export-${day}.zip`, missed };
}

/** Hands the file to the browser's own save (Files on an iPhone, Downloads on a computer). */
export function saveFile(file: Blob, name: string) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Starts the deletion (the server finishes it in the background), then clears what this device kept for the person:
 *  unsent recordings, the Face ID record and everything stored under their id. */
export async function deleteAccount(userId: string): Promise<void> {
  await api("DELETE", "/account", { confirm: "DELETE" });
  await forgetUser(userId).catch((e) => report("account", "device_forget_failed", e, { store: "recovery" }, "warn"));
  await forgetDeviceRecord(userId);
  for (const store of [localStorage, sessionStorage]) {
    try { for (const k of Object.keys(store)) if (k.includes(userId)) store.removeItem(k); } catch { /* private window */ }
  }
}
