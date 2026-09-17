"use client";

// Journal state for the whole signed-in app: the vault key, the recorder, the decrypted entries and the
// recovery buffer. Today's Journal card, the Journal screen and the sidebar button all drive the same recorder.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { isDevIdentity } from "@/lib/catalyst";
import { deleteEntry, loadAudio, loadEntries, newEntry, saveEntry, type LoadedEntry } from "@/lib/journal";
import { Recorder, toneStream } from "@/lib/recorder";
import { clearDraft, deletePending, listOrphanDrafts, listPending, putPending, type JournalEntry, type PendingRecording } from "@/lib/recovery";
import { dayKey } from "@/lib/today";
import { createVault, exportKey, importKey, unlockVault, type VaultMeta } from "@/lib/vault-crypto";
import { Button, Input, Sheet, Toast } from "@/components/ui";
import { useSession } from "./Session";
import a from "./app.module.css";

type VaultState = "checking" | "none" | "locked" | "open";
export type Item = { id: string; createdMs: number; entry: JournalEntry | null; pending: boolean };

type Journal = {
  vault: VaultState;
  items: Item[] | null;
  recording: boolean;
  seconds: number;
  busy: boolean;
  /** Entries on a local day, including ones still waiting to upload. Null while the vault is closed. */
  countOn: (day: string) => number | null;
  toggleRecording: (mood: string | null) => void;
  openVault: () => void;
  lock: () => void;
  saveText: (id: string, text: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  audioFor: (id: string) => Promise<Blob>;
  say: (message: string) => void;
};

const Ctx = createContext<Journal | null>(null);
export function useJournal() {
  const j = useContext(Ctx);
  if (!j) throw new Error("useJournal outside <JournalProvider>");
  return j;
}

const SESSION_KEY = "soma-ck-v1.";

/** Vault metadata, or null when this user has not made a vault yet. */
async function fetchMeta(): Promise<VaultMeta | null> {
  try { return await api<VaultMeta>("GET", "/vault-meta"); }
  catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
}

/** The key survives reloads for the life of the tab (sessionStorage is per tab and dies with it), as in Glimpse. */
async function restoreKey(userId: string): Promise<CryptoKey | null> {
  try { const b64 = sessionStorage.getItem(SESSION_KEY + userId); return b64 ? await importKey(b64) : null; }
  catch { sessionStorage.removeItem(SESSION_KEY + userId); return null; }
}

export function JournalProvider({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const userId = me.id;

  const [vault, setVault] = useState<VaultState>("checking");
  const [loaded, setLoaded] = useState<LoadedEntry[] | null>(null);
  const [pending, setPending] = useState<PendingRecording[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const key = useRef<CryptoKey | null>(null);
  const meta = useRef<VaultMeta | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const moodAtStart = useRef<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const stopRef = useRef<() => void>(() => undefined);

  const say = useCallback((m: string) => { setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 2400); }, []);

  // ── Upload whatever is waiting in IndexedDB. Runs on unlock, when the network returns, and after each recording. ──
  const flushPending = useCallback(async () => {
    const k = key.current;
    if (!k) return;
    const waiting = await listPending(userId).catch(() => []);
    for (const rec of waiting) {
      try {
        await saveEntry(k, rec.entry, rec.audio);
        await deletePending(rec.id);
      } catch {
        await putPending({ ...rec, attempts: rec.attempts + 1, lastAttemptAt: Date.now() }).catch(() => undefined);
      }
    }
    const [left, fresh] = await Promise.all([listPending(userId).catch(() => []), loadEntries(k).catch(() => null)]);
    setPending(left);
    if (fresh) setLoaded(fresh);
    return left.length;
  }, [userId]);

  // A recording that never reached stop() (crash, killed tab) is rebuilt from its chunks and saved like any other.
  const adoptOrphans = useCallback(async () => {
    const orphans = await listOrphanDrafts(userId, recorder.current?.draftId || null).catch(() => []);
    for (const o of orphans) {
      const entry = newEntry(o.audio, 0, null, { createdAt: new Date(o.startedAt), recovered: true });
      await putPending({ id: "pending_" + entry.id, userId, entry, audio: o.audio, attempts: 0, lastAttemptAt: null });
      await clearDraft(o.draftId);
    }
    return orphans.length;
  }, [userId]);

  const opened = useCallback(async (k: CryptoKey) => {
    key.current = k;
    setVault("open");
    const recovered = await adoptOrphans();
    await flushPending();
    if (recovered) say(recovered === 1 ? "Recovered an interrupted recording" : `Recovered ${recovered} interrupted recordings`);
  }, [adoptOrphans, flushPending, say]);

  // First load: is there a vault, and is its key still cached for this tab?
  useEffect(() => {
    let alive = true;
    void Promise.all([fetchMeta(), restoreKey(userId)]).then(([m, k]) => {
      if (!alive) return;
      meta.current = m;
      if (m && k) void opened(k); else setVault(m ? "locked" : "none");
    }).catch(() => { if (alive) setVault("locked"); });
    return () => { alive = false; };
  }, [userId, opened]);

  useEffect(() => {
    const online = () => { void flushPending(); };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [flushPending]);

  // ── Recording ──
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setSeconds(recorder.current?.seconds || 0), 500);
    return () => window.clearInterval(t);
  }, [recording]);

  const stop = useCallback(async () => {
    const rec = await recorder.current?.stop();
    setRecording(false); setSeconds(0);
    if (!rec) return;
    const entry = newEntry(rec.audio, rec.seconds, moodAtStart.current);
    // Buffer first: if this fails the recording is not safe and we must not say it is.
    try {
      await putPending({ id: "pending_" + entry.id, userId, entry, audio: rec.audio, attempts: 0, lastAttemptAt: null });
      await clearDraft(rec.draftId);
    } catch {
      say("This recording could not be saved on this device");
      void api("POST", "/errors", { message: "idb_write_failed", context: "journal.stop" }).catch(() => undefined);
      return;
    }
    setPending((p) => [...p, { id: "pending_" + entry.id, userId, entry, audio: rec.audio, attempts: 0, lastAttemptAt: null }]);
    say(rec.interrupted ? "The microphone was interrupted · saved what was recorded" : "Entry saved · uploading…");
    const left = await flushPending();
    if (left) say("Saved on this device · will upload automatically");
  }, [userId, flushPending, say]);
  useEffect(() => { stopRef.current = () => { void stop(); }; }, [stop]);

  const start = useCallback(async (mood: string | null) => {
    moodAtStart.current = mood;
    const r = recorder.current = new Recorder(userId, () => stopRef.current());
    try {
      // No microphone in a dev sandbox: ?tone records a test tone instead. Never available to real users.
      const fake = isDevIdentity && new URLSearchParams(window.location.search).has("tone");
      await r.start(fake ? toneStream() : undefined);
      setSeconds(0); setRecording(true);
    } catch (e) {
      recorder.current = null;
      const name = (e as { name?: string })?.name;
      say(name === "NotAllowedError" ? "Microphone access is needed to record" : name === "NotFoundError" ? "No microphone found" : "Could not start recording");
    }
  }, [userId, say]);

  const toggleRecording = useCallback((mood: string | null) => {
    if (recording) return void stop();
    if (vault !== "open") return setSheet(true);
    void start(mood);
  }, [recording, vault, start, stop]);

  // ── Vault ──
  const submitPassphrase = useCallback(async (pass: string): Promise<string | null> => {
    setBusy(true);
    try {
      if (meta.current) {
        const k = await unlockVault(pass, meta.current);
        if (!k) return "That passphrase is not right.";
        sessionStorage.setItem(SESSION_KEY + userId, await exportKey(k));
        setSheet(false);
        await opened(k);
        return null;
      }
      const made = await createVault(pass);
      try { await api("PUT", "/vault-meta", made.meta); }
      catch (e) {
        // Another device made the vault first: fall back to unlocking it.
        if (!(e instanceof ApiError && e.status === 409)) throw e;
        meta.current = await fetchMeta();
        setVault("locked");
        return "A vault already exists for this account. Enter its passphrase.";
      }
      meta.current = made.meta;
      sessionStorage.setItem(SESSION_KEY + userId, await exportKey(made.key));
      setSheet(false);
      await opened(made.key);
      return null;
    } catch {
      return "Could not reach the server. Try again.";
    } finally { setBusy(false); }
  }, [userId, opened]);

  const lock = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY + userId);
    key.current = null;
    setLoaded(null); setPending([]); setVault("locked");
  }, [userId]);

  // ── Entries ──
  const saveText = useCallback(async (id: string, text: string) => {
    const k = key.current;
    const found = loaded?.find((l) => l.meta.id === id)?.entry;
    if (!k || !found) throw new Error("vault is closed");
    const next: JournalEntry = { ...found, transcript: text, transcriptStatus: text.trim() ? "done" : "none", updatedAt: new Date().toISOString() };
    await saveEntry(k, next);
    setLoaded((cur) => cur && cur.map((l) => (l.meta.id === id ? { ...l, entry: next } : l)));
  }, [loaded]);

  const remove = useCallback(async (id: string) => {
    const local = pending.find((p) => p.entry.id === id);
    if (local) { await deletePending(local.id); setPending((p) => p.filter((x) => x.id !== local.id)); }
    if (loaded?.some((l) => l.meta.id === id)) { await deleteEntry(id); setLoaded((cur) => cur && cur.filter((l) => l.meta.id !== id)); }
  }, [pending, loaded]);

  const audioFor = useCallback(async (id: string) => {
    const local = pending.find((p) => p.entry.id === id);
    if (local) return local.audio;
    const found = loaded?.find((l) => l.meta.id === id);
    if (!key.current || !found) throw new Error("vault is closed");
    return loadAudio(key.current, id, found.entry?.audioMime || "audio/webm");
  }, [pending, loaded]);

  const items = useMemo<Item[] | null>(() => {
    if (vault !== "open" || !loaded) return null;
    const uploaded = new Set(loaded.map((l) => l.meta.id));
    const local = pending.filter((p) => !uploaded.has(p.entry.id)).map((p) => ({ id: p.entry.id, createdMs: new Date(p.entry.createdAt).getTime(), entry: p.entry, pending: true }));
    const remote = loaded.map((l) => ({ id: l.meta.id, createdMs: l.meta.createdMs, entry: l.entry, pending: false }));
    return [...local, ...remote].sort((x, y) => y.createdMs - x.createdMs);
  }, [vault, loaded, pending]);

  const countOn = useCallback((day: string) => (items ? items.filter((i) => dayKey(new Date(i.createdMs)) === day).length : null), [items]);
  const openVault = useCallback(() => setSheet(true), []);
  const closeSheet = useCallback(() => setSheet(false), []);

  const value = useMemo<Journal>(
    () => ({ vault, items, recording, seconds, busy, countOn, toggleRecording, openVault, lock, saveText, remove, audioFor, say }),
    [vault, items, recording, seconds, busy, countOn, toggleRecording, openVault, lock, saveText, remove, audioFor, say],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <Sheet open={sheet} title={vault === "none" ? "Create your vault" : "Unlock your vault"} onClose={closeSheet}>
        <VaultForm creating={vault === "none"} busy={busy} onSubmit={submitPassphrase} />
      </Sheet>
      <Toast message={toast} />
    </Ctx.Provider>
  );
}

function VaultForm({ creating, busy, onSubmit }: { creating: boolean; busy: boolean; onSubmit: (pass: string) => Promise<string | null> }) {
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (creating && pass.length < 8) return setError("Use at least 8 characters.");
    if (creating && pass !== again) return setError("The two passphrases do not match.");
    if (!pass) return setError("Enter your vault passphrase.");
    setError(await onSubmit(pass));
  }

  return (
    <form className={a.vaultForm} onSubmit={submit}>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        {creating
          ? "Your journal is encrypted on this device before it is uploaded. The passphrase never leaves it, so nobody can read your entries, David included. It also cannot be reset: if you forget it, the entries are gone."
          : "Your journal is encrypted with a passphrase only you know. Enter it to record and read entries on this device."}
      </p>
      <Input type="password" autoComplete={creating ? "new-password" : "current-password"} placeholder="Vault passphrase" aria-label="Vault passphrase" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
      {creating && <Input type="password" autoComplete="new-password" placeholder="Repeat the passphrase" aria-label="Repeat the passphrase" value={again} onChange={(e) => setAgain(e.target.value)} />}
      {error && <p role="alert" className={a.noteBad}>{error}</p>}
      <Button type="submit" variant="journal" block disabled={busy}>{busy ? (creating ? "Creating…" : "Unlocking…") : creating ? "Create vault" : "Unlock"}</Button>
    </form>
  );
}
