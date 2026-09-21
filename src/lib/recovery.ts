// Recovery buffer in IndexedDB, ported from Glimpse. Nothing recorded is ever held only in memory:
//   chunks   every MediaRecorder slice is written as it arrives, so a crash or a killed tab mid-recording
//            leaves an orphaned draft that can be reassembled on the next launch.
//   pending  the finished recording + its entry, written the moment recording stops and removed only after
//            the encrypted upload succeeds. Anything still here on launch is retried.
// Blobs in here are plaintext, as in Glimpse: they exist only on this device, until the upload lands.

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
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

async function withDb<T>(work: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDb();
  try { return await work(db); } finally { db.close(); }
}

// ── pending ──
export const putPending = (rec: PendingRecording) => withDb((db) => tx(db, PENDING, "readwrite", (s) => s.put(rec))).then(() => undefined);
export const deletePending = (id: string) => withDb((db) => tx(db, PENDING, "readwrite", (s) => s.delete(id))).then(() => undefined);
export async function listPending(userId: string): Promise<PendingRecording[]> {
  const all = (await withDb((db) => tx<PendingRecording[]>(db, PENDING, "readonly", (s) => s.getAll()))) || [];
  return all.filter((r) => r.userId === userId);
}

// ── chunks ──
/** One connection is held open for a whole recording: a long one writes hundreds of slices. */
export function writeChunk(db: IDBDatabase, userId: string, draftId: string, index: number, blob: Blob) {
  const row: ChunkRow = { id: `${draftId}:${index}`, userId, draftId, index, blob, at: Date.now() };
  return tx(db, CHUNKS, "readwrite", (s) => s.put(row)).then(() => undefined);
}

export async function clearDraft(draftId: string) {
  await withDb(async (db) => {
    const all = (await tx<ChunkRow[]>(db, CHUNKS, "readonly", (s) => s.getAll())) || [];
    const mine = all.filter((c) => c.draftId === draftId);
    if (mine.length) await tx(db, CHUNKS, "readwrite", (s) => { mine.forEach((c) => s.delete(c.id)); });
  });
}

export type OrphanDraft = { draftId: string; startedAt: number; audio: Blob; chunks: number };
/** Drafts whose recording never reached stop(): reassembled in order, ready to become an entry. */
export async function listOrphanDrafts(userId: string, activeDraftId: string | null): Promise<OrphanDraft[]> {
  const all = (await withDb((db) => tx<ChunkRow[]>(db, CHUNKS, "readonly", (s) => s.getAll()))) || [];
  const byDraft = new Map<string, ChunkRow[]>();
  all.filter((c) => c.userId === userId && c.draftId !== activeDraftId).forEach((c) => byDraft.set(c.draftId, [...(byDraft.get(c.draftId) || []), c]));
  return [...byDraft.entries()].map(([draftId, rows]) => {
    rows.sort((a, b) => a.index - b.index);
    return { draftId, startedAt: rows[0].at, chunks: rows.length, audio: new Blob(rows.map((r) => r.blob), { type: rows[0].blob.type || "audio/webm" }) };
  });
}
