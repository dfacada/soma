// Recovery buffer in IndexedDB, ported from Glimpse. Nothing recorded is ever held only in memory:
//   chunks   every MediaRecorder slice is written as it arrives, so a crash or a killed tab mid-recording
//            leaves an orphaned draft that can be reassembled on the next launch.
//   pending  the finished recording + its entry, written the moment recording stops and removed only after
//            the encrypted upload succeeds. Anything still here on launch is retried.
// Blobs in here are plaintext, as in Glimpse: they exist only on this device, until the upload lands.

import { report } from "./log";

const DB_NAME = "soma-recovery";
const DB_VERSION = 1;
const PENDING = "pending";
const CHUNKS = "chunks";

export type JournalEntry = {
  id: string;
  createdAt: string; // ISO
  title: string;
  transcript: string;
  transcriptStatus: "none" | "pending" | "done" | "failed";
  mood: string | null;
  hasAudio: boolean;
  audioSize: number;
  audioMime: string;
  audioDuration: number; // seconds
  recovered?: boolean;
  /** The recording's draft (recorder.ts): ties the entry to its streamed cloud copy, so that copy is deleted once
   *  the entry is saved and never rebuilt into a second entry. Absent on entries made before streaming. */
  draftId?: string;
  /** Filed under an earlier day from Today's backfill: createdAt is that day, the entry was made later. */
  addedLater?: boolean;
  updatedAt?: string | null;
};
export type PendingRecording = { id: string; userId: string; entry: JournalEntry; audio: Blob; attempts: number; lastAttemptAt: number | null };
type ChunkRow = { id: string; userId: string; draftId: string; index: number; blob: Blob; at: number };

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PENDING)) db.createObjectStore(PENDING, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = work(t.objectStore(store));
    // Reading `result` can throw. Safari rebuilds stored values only when they are read, and a record it can no longer
    // rebuild (a Blob whose file has gone, say) throws "UnknownError: Cannot inject key into script value" right here.
    // Thrown from this handler it escapes as an uncaught error and the promise never settles, which would stall every
    // upload queued behind it until the app is closed. Seen once on David's iPhone (2026-11-05); which store, unknown.
    t.oncomplete = () => { try { resolve(req ? req.result : undefined); } catch (e) { reject(e); } };
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const isRecord = (v: unknown) => typeof v === "object" && v !== null;

/** Every record in a store, and the keys of any this browser can no longer read back (see tx). One unreadable record
 *  must not hide the rest, so a bulk read that fails is done again one record at a time, stepping over the bad ones. */
async function readAll<T>(db: IDBDatabase, store: string): Promise<{ rows: T[]; skipped: string[] }> {
  try {
    const all = (await tx<unknown[]>(db, store, "readonly", (s) => s.getAll())) || [];
    if (all.every(isRecord)) return { rows: all as T[], skipped: [] };
  } catch { /* one at a time, below */ }
  return new Promise((resolve, reject) => {
    const rows: T[] = [], skipped: string[] = [];
    const t = db.transaction(store, "readonly");
    const req = t.objectStore(store).openCursor();
    req.onsuccess = () => {
      try {
        const c = req.result;
        if (!c) return;
        let value: unknown = null;
        try { value = c.value; } catch { /* unreadable: skipped below */ }
        if (isRecord(value)) rows.push(value as T); else skipped.push(String(c.primaryKey));
        c.continue();
      } catch { /* the cursor itself failed: keep what was read */ }
    };
    t.oncomplete = () => resolve({ rows, skipped });
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// Once a session for each store: the log needs to know, not to hear it on every pass.
const told = new Set<string>();
function noteSkipped(store: string, count: number) {
  if (told.has(store)) return;
  told.add(store);
  report("journal", "device_record_unreadable", undefined, { store, count }, "warn");
}

async function withDb<T>(work: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDb();
  try { return await work(db); } finally { db.close(); }
}

// ── pending ──
export const putPending = (rec: PendingRecording) => withDb((db) => tx(db, PENDING, "readwrite", (s) => s.put(rec))).then(() => undefined);
export const deletePending = (id: string) => withDb((db) => tx(db, PENDING, "readwrite", (s) => s.delete(id))).then(() => undefined);
export async function listPending(userId: string): Promise<PendingRecording[]> {
  const { rows, skipped } = await withDb((db) => readAll<PendingRecording>(db, PENDING));
  if (skipped.length) noteSkipped(PENDING, skipped.length);
  return rows.filter((r) => r.userId === userId);
}

// ── chunks ──
/** One connection is held open for a whole recording: a long one writes hundreds of slices. */
export function writeChunk(db: IDBDatabase, userId: string, draftId: string, index: number, blob: Blob) {
  const row: ChunkRow = { id: `${draftId}:${index}`, userId, draftId, index, blob, at: Date.now() };
  return tx(db, CHUNKS, "readwrite", (s) => s.put(row)).then(() => undefined);
}

/** A recording's slices, by key, so nothing has to be read back first. Keys are `draftId:index` and draft ids hold no
 *  colon, so the slices are every key from `draftId:` up to, not including, `draftId;` (";" comes right after ":"). */
export async function clearDraft(draftId: string) {
  await withDb((db) => tx(db, CHUNKS, "readwrite", (s) => { s.delete(IDBKeyRange.bound(draftId + ":", draftId + ";", false, true)); }));
}

/** Everything this device holds for one person, gone: their unsent recordings and their recording slices. For a
 *  deleted account (account.ts). Other people's rows on a shared device are left alone. */
export async function forgetUser(userId: string) {
  await withDb(async (db) => {
    for (const store of [PENDING, CHUNKS]) {
      const { rows } = await readAll<{ id: string; userId: string }>(db, store);
      const mine = rows.filter((r) => r.userId === userId).map((r) => r.id);
      if (mine.length) await tx(db, store, "readwrite", (s) => { for (const id of mine) s.delete(id); });
    }
  });
}

export type OrphanDraft = { draftId: string; startedAt: number; audio: Blob; chunks: number };
/** Drafts whose recording never reached stop(): reassembled in order, ready to become an entry. */
export async function listOrphanDrafts(userId: string, activeDraftId: string | null): Promise<OrphanDraft[]> {
  const { rows: all, skipped } = await withDb((db) => readAll<ChunkRow>(db, CHUNKS));
  // A recording with a slice this browser cannot read back would rebuild broken, and adopting it would retire its
  // cloud copy (draft-stream.ts), which is whole. It is left out, so the cloud copy is the one recovered.
  const broken = new Set(skipped.map((k) => k.slice(0, k.lastIndexOf(":"))));
  if (skipped.length) noteSkipped(CHUNKS, skipped.length);
  const byDraft = new Map<string, ChunkRow[]>();
  all.filter((c) => c.userId === userId && c.draftId !== activeDraftId && !broken.has(c.draftId)).forEach((c) => byDraft.set(c.draftId, [...(byDraft.get(c.draftId) || []), c]));
  return [...byDraft.entries()].map(([draftId, rows]) => {
    rows.sort((a, b) => a.index - b.index);
    return { draftId, startedAt: rows[0].at, chunks: rows.length, audio: new Blob(rows.map((r) => r.blob), { type: rows[0].blob.type || "audio/webm" }) };
  });
}
