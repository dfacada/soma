"use client";

// Journal state for the whole signed-in app: the vault key, the recorder, the decrypted entries and the
// recovery buffer. Today's Journal card, the Journal screen and the sidebar button all drive the same recorder.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { isDevIdentity } from "@/lib/catalyst";
import { deleteDraft, deleteEntry, draftTransport, listDrafts, loadAudio, loadEntries, newEntry, onDay, saveEntry, textEntry, type AudioProgress, type LoadedEntry } from "@/lib/journal";
import { DraftStream, rebuildDraft } from "@/lib/draft-stream";
import type { Meter } from "@/lib/meter";
import { Recorder, toneStream } from "@/lib/recorder";
import { clearDraft, deletePending, listOrphanDrafts, listPending, putPending, type JournalEntry, type PendingRecording } from "@/lib/recovery";
import { report } from "@/lib/log";
import { newsDone } from "@/lib/opening";
import { dayKey } from "@/lib/today";
import { within } from "@/lib/playable";
import { transcribeAudio, TranscribeError } from "@/lib/transcribe";
import { createVault, decryptJson, encryptJson, exportKey, fromB64, importKey, newRecoveryCode, openWithRecovery, parseRecoveryCode, sealForRecovery, toB64, unlockVault, wrapForPassphrase, type VaultMeta } from "@/lib/vault-crypto";
import { haptic } from "@/lib/haptics";
import { enrolledHere, enrolPasskey, forgetThisDevice, passkeyName, passkeySupported, PasskeyError, prepareChallenge, unlockWithPasskey } from "@/lib/vault-passkey";
import { SESSION_KEY } from "@/lib/vault-session";
import { Button, Input, Sheet, Toast } from "@/components/ui";
import { useSession } from "./Session";
import a from "./app.module.css";

type VaultState = "checking" | "none" | "locked" | "open";
export type Item = { id: string; createdMs: number; entry: JournalEntry | null; pending: boolean };
/** How a Say your day recording ended: its entry, its length and its words. `error` is a sentence when the words
 *  could not be written down; the entry is saved all the same. */
export type DayTake = { entryId: string; seconds: number; text: string; error: string | null };

/** A recording that has never been transcribed. A transcript or a typed note, whatever its status, is never redone. */
export const needsTranscript = (e: JournalEntry | null): e is JournalEntry => !!e && e.hasAudio && e.transcriptStatus !== "done" && !e.transcript.trim();

/** One entry of a transcribeMissing run. `stage` and `code` are the ones the admin log gets. */
export type BatchResult = { id: string; title: string; outcome: "done" | "empty" | "failed"; stage?: string; code?: string; message?: string };
/** Where a transcription is: fetching and decrypting the recording, with the transcription service, or saving the words. */
export type TxStep = "open" | "transcribe" | "save";
// transcribeAudio's steps (transcribe, convert:<step>, transcribe_wav) are all the service's part; then the save.
const txStep = (step: string): TxStep => (step === "save" ? "save" : "transcribe");
// Between entries, and the waits after "too busy" (ours or Groq's) before trying the same entry again.
const BATCH_GAP_MS = 2000;
const BUSY_WAITS_MS = [15000, 30000, 60000, 120000];
// One broken file must not hold up the rest: download, up to two transcription jobs (original, then WAV) and the save.
const ENTRY_MS = 10 * 60 * 1000;

type Journal = {
  vault: VaultState;
  items: Item[] | null;
  /** The entries could not be fetched or decrypted. `reload` tries again. */
  loadFailed: boolean;
  /** How far the latest load of the entries has got (downloaded and decrypted, of all). Null before any. */
  entriesProgress: { done: number; total: number } | null;
  reload: () => void;
  recording: boolean;
  seconds: number;
  /** Live loudness of the recording in progress, for the screen; null when not recording. */
  levels: () => Meter | null;
  /** A recording that has just stopped and is being put somewhere safe on this device. */
  sealing: boolean;
  /** The last recording kept safe on this device: `n` counts them, so a change means a new one landed. `day`
   *  marks a Say your day recording, whose own screen follows the sealing instead of "Saved". */
  lastSaved: { n: number; seconds: number; day: boolean };
  busy: boolean;
  /** Entries on a local day, including ones still waiting to upload. Null while the vault is closed. */
  countOn: (day: string) => number | null;
  /** Start or stop recording. `day` (YYYY-MM-DD) files the entry under an earlier day, marked added later. */
  toggleRecording: (mood: string | null, day?: string) => void;
  /** Say your day (src/lib/say-day.ts): record an entry like any other and, when it stops, have its words written
   *  down and handed back, under the person's Say your day switch and whatever cloud transcription is set to.
   *  Resolves once the words are in, or with null when the recording never started or nothing was kept (the vault
   *  sheet opens instead when the vault is closed). `cues` are what is still open that day, for the recording screen. */
  sayDay: (mood: string | null, day: string | undefined, cues: string[]) => Promise<DayTake | null>;
  /** A Say your day recording in progress: what to mention. Null for an ordinary recording. */
  dayCues: string[] | null;
  /** A Say your day recording has stopped and its words are being written down. */
  dayWriting: boolean;
  /** Save a written entry (no audio), optionally filed under an earlier day. Rejects while the vault is closed. */
  writeEntry: (text: string, mood: string | null, day?: string) => Promise<void>;
  openVault: () => void;
  /** Open the vault sheet, and once this vault is unlocked from it, go on with what the person was doing. Dropped
   *  if the sheet is closed instead, and never run after making a new vault (the recovery code comes first). */
  openVaultThen: (then: () => void) => void;
  lock: () => void;
  saveText: (id: string, text: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** A recording on this device comes back at once; an uploaded one reports its download and decrypt. */
  audioFor: (id: string, onProgress?: (p: AudioProgress) => void) => Promise<Blob>;
  /** Entries with a transcription in flight, and the step each is on. Set the moment one is asked for. */
  transcribing: Record<string, TxStep>;
  cloudOn: boolean;
  transcribeEntry: (id: string) => void;
  /** Transcribe, one at a time, every uploaded recording of this account with no transcript yet (needsTranscript).
   *  `onUpdate` hears the results so far and what is running. Set `stop.now` to finish after the current one. */
  transcribeMissing: (onUpdate: (results: BatchResult[], current: string | null) => void, stop: { now: boolean }) => Promise<BatchResult[]>;
  say: (message: string) => void;
  /** Small secrets kept outside the journal (the Google Health token): vault-encrypt to base64 and back.
   *  Both reject while the vault is closed. The key itself never leaves this provider. */
  seal: (value: unknown) => Promise<string>;
  unseal: <T>(b64: string) => Promise<T>;
  /** Face ID unlock on this device (any passkey provider). `name` is what the device calls it. */
  passkey: { supported: boolean; name: string; here: boolean };
  /** Set up Face ID on this device. Needs the open vault and a tap. Resolves to the outcome and a sentence. */
  addPasskey: () => Promise<{ ok: boolean; message: string }>;
  /** Turn Face ID off on this device; the passphrase is then the only way in here. */
  removePasskeys: () => Promise<void>;
  /** The recovery code (vault-crypto.ts): whether this vault has one, and when it was made. */
  recovery: { made: boolean; madeMs: number | null };
  /** Make a recovery code (the vault must be open) and show it, once. A new one replaces the old. */
  makeRecoveryCode: () => Promise<boolean>;
};

const Ctx = createContext<Journal | null>(null);
export function useJournal() {
  const j = useContext(Ctx);
  if (!j) throw new Error("useJournal outside <JournalProvider>");
  return j;
}

// Set once the opening prompt has been shown in this tab, so a reload or a manual lock never asks twice.
const ASKED_KEY = "soma-vault-asked.";
function askOnce(userId: string): boolean {
  try { if (sessionStorage.getItem(ASKED_KEY + userId)) return false; sessionStorage.setItem(ASKED_KEY + userId, "1"); return true; }
  catch { return false; }
}

/** Vault metadata, or null when this user has not made a vault yet. */
async function fetchMeta(): Promise<VaultMeta | null> {
  const res = await api<({ exists: true } & VaultMeta) | { exists: false }>("GET", "/vault-meta");
  if (!res.exists) return null;
  const { salt, verifierIv, verifierCt, wrapSalt, wrappedKey, recoveryKey, recoveryMs } = res;
  return { salt, verifierIv, verifierCt, wrapSalt, wrappedKey, recoveryKey, recoveryMs };
}

/** The key survives reloads for the life of the tab (sessionStorage is per tab and dies with it), as in Glimpse. */
async function restoreKey(userId: string): Promise<CryptoKey | null> {
  try { const b64 = sessionStorage.getItem(SESSION_KEY + userId); return b64 ? await importKey(b64) : null; }
  catch { sessionStorage.removeItem(SESSION_KEY + userId); return null; }
}

export function JournalProvider({ children }: { children: ReactNode }) {
  const { me, settings, displayName } = useSession();
  const userId = me.id;
  const cloudOn = settings.cloudTranscription;
  const askOnOpen = useRef(settings.unlockOnOpen);

  const [vault, setVault] = useState<VaultState>("checking");
  const [loaded, setLoaded] = useState<LoadedEntry[] | null>(null);
  const [entriesProgress, setEntriesProgress] = useState<{ done: number; total: number } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<PendingRecording[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sealing, setSealing] = useState(false);
  const [lastSaved, setLastSaved] = useState({ n: 0, seconds: 0, day: false });
  const [dayCues, setDayCues] = useState<string[] | null>(null);
  const [dayWriting, setDayWriting] = useState(false);
  // Whoever asked for the Say your day recording in progress: told how it ended, whichever way it ends.
  const dayDone = useRef<((take: DayTake | null) => void) | null>(null);
  // What to go on with once the vault sheet has unlocked the vault (openVaultThen).
  const afterUnlock = useRef<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState<Record<string, TxStep>>({});
  // The same entries, readable at once: a second tap, or the Admin batch, must not start another job on an entry
  // whose recording is still downloading, before any render has caught up.
  const inFlight = useRef(new Set<string>());
  const mark = useCallback((id: string, step: TxStep | null) => {
    if (step) inFlight.current.add(id); else inFlight.current.delete(id);
    setTranscribing((t) => {
      if (step ? t[id] === step : !(id in t)) return t;
      const next = { ...t };
      if (step) next[id] = step; else delete next[id];
      return next;
    });
  }, []);
  const [pkSupported, setPkSupported] = useState(false);
  const [pkHere, setPkHere] = useState(false);
  const [recovery, setRecovery] = useState<{ made: boolean; madeMs: number | null }>({ made: false, madeMs: null });
  // A recovery code just made, on screen until it is saved. It is never kept anywhere else.
  const [shownCode, setShownCode] = useState<string | null>(null);

  const key = useRef<CryptoKey | null>(null);
  const meta = useRef<VaultMeta | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const levels = useCallback(() => recorder.current?.levels ?? null, []);
  const moodAtStart = useRef<string | null>(null);
  const dayAtStart = useRef<string | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);
  const stopRef = useRef<() => void>(() => undefined);

  const say = useCallback((m: string) => { setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 2400); }, []);

  // A recording just made, by pending id, kept in memory until it uploads. Safari can fail to read back a Blob it
  // has only just stored in IndexedDB ("NotFoundError: The object can not be found here", seen 0.6 s after a stop),
  // so the first attempts use this copy; after a reload only the IndexedDB one exists.
  const fresh = useRef(new Map<string, Blob>());
  // The cloud copy of the recording in progress, then of each stopped one until it uploads (draft-stream.ts).
  const streaming = useRef<DraftStream | null>(null);
  const streams = useRef(new Map<string, DraftStream>());
  // The entries as last loaded, for the draft checks below, which run between renders.
  const latestLoaded = useRef<LoadedEntry[] | null>(null);

  /** The recording is saved: drop its cloud copy. A failure only leaves a draft for the next sweep to delete. */
  const dropDraft = useCallback((draftId: string | undefined) => {
    if (!draftId) return;
    streams.current.get(draftId)?.abort();
    streams.current.delete(draftId);
    void deleteDraft(draftId).catch((e) => report("journal", "draft_delete_failed", e, { draftId }, "warn"));
  }, []);

  // ── Upload whatever is waiting in IndexedDB. Runs on unlock, when the network returns, after each recording, when
  // the app comes back to the front, and on a timer while anything waits. iOS freezes a Home Screen app moments
  // after it leaves the screen, and an upload in flight dies with "Load failed"; this is what retries it. ──
  const flushOnce = useCallback(async () => {
    const k = key.current;
    if (!k) return 0;
    const waiting = await listPending(userId).catch(() => []);
    for (const rec of waiting) {
      const kept = fresh.current.get(rec.id);
      const began = Date.now();
      let step = "start", wentHidden = document.hidden;
      const onHide = () => { if (document.hidden) wentHidden = true; };
      document.addEventListener("visibilitychange", onHide);
      try {
        // Already saved from its cloud copy on another device (rebuilt while this one could not upload): keep one.
        const twin = rec.entry.draftId && latestLoaded.current?.some((l) => l.entry?.draftId === rec.entry.draftId && l.meta.id !== rec.entry.id);
        if (twin) report("journal", "pending_duplicate_skipped", undefined, { draftId: rec.entry.draftId }, "warn");
        else await saveEntry(k, rec.entry, kept ?? rec.audio, (s) => { step = s; });
        await deletePending(rec.id);
        fresh.current.delete(rec.id);
        dropDraft(rec.entry.draftId);
      } catch (e) {
        report("journal", "upload_failed", e, { attempts: rec.attempts + 1, audioBytes: rec.audio?.size ?? 0, mime: rec.entry.audioMime, step, ms: Date.now() - began, wentHidden, fromMemory: !!kept });
        await putPending({ ...rec, attempts: rec.attempts + 1, lastAttemptAt: Date.now() }).catch(() => undefined);
      } finally {
        document.removeEventListener("visibilitychange", onHide);
      }
    }
    let loadHidden = document.hidden;
    const onLoadHide = () => { if (document.hidden) loadHidden = true; };
    document.addEventListener("visibilitychange", onLoadHide);
    const [left, loaded] = await Promise.all([listPending(userId).catch(() => []), loadEntries(k, (done, total) => setEntriesProgress({ done, total })).catch((e) => { report("journal", "entries_load_failed", e); return null; })])
      .finally(() => document.removeEventListener("visibilitychange", onLoadHide));
    // iOS cuts every download in flight when the app leaves the screen: four times from 30 October to 6 November,
    // each around a Fitbit reconnect, every entry came back unreadable. An entry already read keeps that copy now;
    // only one never read shows as unreadable.
    const held = new Map((latestLoaded.current || []).flatMap((l) => (l.entry ? [[l.meta.id, l.entry] as const] : [])));
    const failed = loaded ? loaded.filter((l) => !l.entry) : [];
    const latest = loaded && (failed.length ? loaded.map((l) => (!l.entry && held.has(l.meta.id) ? { ...l, entry: held.get(l.meta.id)! } : l)) : loaded);
    if (failed.length) {
      const reasons: Record<string, number> = {};
      for (const l of failed) reasons[l.error || "unknown"] = (reasons[l.error || "unknown"] || 0) + 1;
      // Network failures while the app was away are expected: worth a note, not a warning.
      const expected = loadHidden && Object.keys(reasons).every((r) => r === "TypeError");
      report("journal", "entries_unreadable", undefined, {
        count: failed.length, of: loaded!.length, kept: failed.filter((l) => held.has(l.meta.id)).length,
        reasons: JSON.stringify(reasons), wentHidden: loadHidden, ids: failed.slice(0, 3).map((l) => l.meta.id).join(" "),
      }, expected ? "info" : "warn");
    }
    setPending(left);
    // A load that failed has to say so: without this the screen sat on "Decrypting entries" for as long as you
    // cared to wait, while the log held the real answer (David, 2026-10-20).
    setLoadFailed(!latest);
    if (latest) { setLoaded(latest); latestLoaded.current = latest; }
    return left.length;
  }, [userId, dropDraft]);

  // One pass at a time: two at once uploaded the same recording twice, and the loser could re-save a pending record
  // the winner had just deleted. A call during a pass gets one more pass after it, so nothing added meanwhile waits.
  const running = useRef<Promise<number> | null>(null);
  const queued = useRef<Promise<number> | null>(null);
  const flushPending = useCallback((): Promise<number> => {
    const start = () => {
      const run: Promise<number> = flushOnce().finally(() => { if (running.current === run) running.current = null; });
      running.current = run;
      return run;
    };
    if (!running.current) return start();
    if (!queued.current) queued.current = running.current.catch(() => 0).then(() => { queued.current = null; return start(); });
    return queued.current;
  }, [flushOnce]);

  // A recording that never reached stop() (crash, killed tab) is rebuilt from its chunks and saved like any other.
  const adoptOrphans = useCallback(async () => {
    const orphans = await listOrphanDrafts(userId, recorder.current?.draftId || null).catch(() => []);
    for (const o of orphans) {
      const entry = newEntry(o.audio, 0, null, { createdAt: new Date(o.startedAt), recovered: true, draftId: o.draftId });
      await putPending({ id: "pending_" + entry.id, userId, entry, audio: o.audio, attempts: 0, lastAttemptAt: null });
      await clearDraft(o.draftId);
    }
    return orphans.length;
  }, [userId]);

  // Cloud drafts, after the device's own orphans are adopted and uploads flushed. Each draft is one of:
  // - the recording in progress here: left alone;
  // - already an entry, or waiting to upload as one (matched by draft id; a deleted draft can stay listed ~25 s): deleted;
  // - over a day old: deleted (any recording it held has had a day to upload from its device);
  // - possibly still being recorded on another device (it would end under 15 minutes ago): left for next time;
  // - otherwise a recording that never got saved: rebuilt from its segments and saved as a recovered entry.
  const sweepDrafts = useCallback(async (k: CryptoKey) => {
    const drafts = await listDrafts().catch((e) => { report("journal", "draft_list_failed", e, undefined, "warn"); return []; });
    if (!drafts.length) return 0;
    const waiting = await listPending(userId).catch(() => []);
    const known = new Set([...(latestLoaded.current || []).map((l) => l.entry?.draftId), ...waiting.map((p) => p.entry.draftId)].filter(Boolean));
    let recovered = 0;
    for (const d of drafts) {
      if (d.draftId === recorder.current?.draftId) continue;
      const startedMs = Number(d.draftId.slice("draft_".length));
      const endedMs = startedMs + d.segments.length * 5000;
      if (known.has(d.draftId) || Date.now() - startedMs > 86400000) { dropDraft(d.draftId); continue; }
      if (Date.now() - endedMs < 15 * 60000) continue;
      try {
        const got = await rebuildDraft(k, d.draftId, d.segments, draftTransport);
        if (!got) { dropDraft(d.draftId); continue; }
        const audio = new Blob(got.parts, { type: got.mime });
        const entry = newEntry(audio, got.seconds, null, { createdAt: new Date(startedMs), recovered: true, draftId: d.draftId });
        await putPending({ id: "pending_" + entry.id, userId, entry, audio, attempts: 0, lastAttemptAt: null });
        report("journal", "draft_recovered", undefined, { draftId: d.draftId, segments: got.segments, of: d.segments.length, complete: got.complete, audioBytes: audio.size }, "warn");
        recovered++;
      } catch (e) {
        report("journal", "draft_recover_failed", e, { draftId: d.draftId, segments: d.segments.length });
      }
    }
    if (recovered) await flushPending();
    return recovered;
  }, [userId, dropDraft, flushPending]);

  const opened = useCallback(async (k: CryptoKey) => {
    key.current = k;
    setVault("open");
    // Whoever opened the sheet to get on with something does so now, not after the entries have loaded.
    const then = afterUnlock.current;
    afterUnlock.current = null;
    then?.();
    const recovered = await adoptOrphans();
    await flushPending();
    if (recovered) say(recovered === 1 ? "Recovered an interrupted recording" : `Recovered ${recovered} interrupted recordings`);
    const fromCloud = await sweepDrafts(k);
    if (fromCloud) say(fromCloud === 1 ? "Recovered a recording from the cloud" : `Recovered ${fromCloud} recordings from the cloud`);
  }, [adoptOrphans, flushPending, sweepDrafts, say]);

  // First load: is there a vault, and is its key still cached for this tab?
  useEffect(() => {
    let alive = true;
    void Promise.all([fetchMeta(), restoreKey(userId)]).then(([m, k]) => {
      if (!alive) return;
      meta.current = m;
      setRecovery({ made: Boolean(m?.recoveryKey), madeMs: m?.recoveryMs ?? null });
      if (m && k) { void opened(k); return; }
      setVault(m ? "locked" : "none");
      // Opening the app is the moment to unlock: the vault now gates the health sync and sleep as well as the journal.
      // Only for a vault that exists; creating one stays with the Journal card, where it is explained.
      // …but after the opening words, never on top of them.
      // After the opening words and What's new, never on top of them.
      if (m && askOnOpen.current && askOnce(userId)) void newsDone.then(() => { if (alive) setSheet(true); });
    }).catch(() => { if (alive) setVault("locked"); });
    return () => { alive = false; };
  }, [userId, opened]);

  useEffect(() => { void passkeySupported().then(setPkSupported); }, []);
  useEffect(() => { void enrolledHere(userId).then(setPkHere); }, [userId]);
  // iOS allows the passkey prompt only just after a tap, so the challenge is fetched as the sheet opens.
  useEffect(() => { if (sheet && pkHere && pkSupported) prepareChallenge("unlock"); }, [sheet, pkHere, pkSupported]);

  useEffect(() => {
    const online = () => { void flushPending(); };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [flushPending]);

  // While a recording waits to upload: try again whenever the app is back on screen, and on a backoff timer
  // (30 s, 1, 2, 4, then every 5 minutes) while it stays there.
  useEffect(() => {
    if (!pending.length || vault !== "open") return;
    const tries = Math.min(...pending.map((p) => p.attempts));
    const wait = Math.min(300000, 30000 * 2 ** Math.max(0, tries - 1));
    const retry = () => { if (!document.hidden) void flushPending(); };
    const timer = window.setTimeout(retry, wait);
    document.addEventListener("visibilitychange", retry);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", retry); };
  }, [pending, vault, flushPending]);

  // ── Transcription (opt-in). Takes the entry and its audio directly so it can run straight after an upload,
  // before React state has caught up. The transcript is encrypted into the entry like any other edit. ──
  // One entry, start to finish: transcribe (with the WAV retry), encrypt the transcript into the entry, save it.
  // Throws a TranscribeError; a failed save is code save_failed with the real error as `cause`.
  const transcribeAndSave = useCallback(async (entry: JournalEntry, audio: Blob, onStep?: (step: string) => void) => {
    const k = key.current;
    if (!k) throw new TranscribeError("vault_closed", "The vault is locked.");
    const text = await transcribeAudio(entry.id, audio, onStep);
    const next: JournalEntry = { ...entry, transcript: text, transcriptStatus: text ? "done" : "none", updatedAt: new Date().toISOString() };
    onStep?.("save");
    // Two different failures, two different messages: the transcript exists at this point, it just is not stored yet.
    try { await saveEntry(k, next); }
    catch (e) { throw Object.assign(new TranscribeError("save_failed", "Transcribed, but the transcript couldn't be saved. Try again."), { cause: e }); }
    setLoaded((cur) => cur && cur.map((l) => (l.meta.id === entry.id ? { ...l, entry: next } : l)));
    return text;
  }, []);

  const runTranscription = useCallback(async (entry: JournalEntry, audio: Blob) => {
    if (!key.current) return mark(entry.id, null);
    mark(entry.id, "transcribe");
    let stage = "transcribe";
    try {
      const text = await transcribeAndSave(entry, audio, (step) => { stage = step; mark(entry.id, txStep(step)); });
      say(text ? "Transcript ready" : "Nothing could be made out in that recording");
    } catch (e) {
      const code = e instanceof TranscribeError ? e.code : "unknown";
      if (code === "save_failed") report("journal", "transcript_save_failed", (e as { cause?: unknown }).cause ?? e);
      else report("journal", "transcription_failed", e, { code, stage, audioBytes: audio.size, mime: audio.type });
      say(e instanceof TranscribeError ? e.message : "Transcription failed. Try again.");
    } finally {
      mark(entry.id, null);
    }
  }, [say, transcribeAndSave, mark]);

  // The words of a Say your day recording belong in its entry like any transcript. A recording still waiting to
  // upload takes them along; one already uploaded is saved again with them. Called once the upload pass that
  // followed the recording has ended, so it never rewrites a record that pass is in the middle of sending.
  const keepWords = useCallback(async (entry: JournalEntry, text: string) => {
    const k = key.current;
    if (!k) return;
    const next: JournalEntry = { ...entry, transcript: text, transcriptStatus: "done", updatedAt: new Date().toISOString() };
    try {
      const waiting = (await listPending(userId)).find((p) => p.entry.id === entry.id);
      if (waiting) {
        await putPending({ ...waiting, entry: next });
        setPending((p) => p.map((x) => (x.entry.id === entry.id ? { ...x, entry: next } : x)));
      } else {
        await saveEntry(k, next);
        setLoaded((cur) => cur && cur.map((l) => (l.meta.id === entry.id ? { ...l, entry: next } : l)));
      }
    } catch (e) {
      report("journal", "transcript_save_failed", e, { day: true });
      say("Your words couldn't be saved into the entry. The recording is safe.");
    }
  }, [userId, say]);

  // ── Recording ──
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setSeconds(recorder.current?.seconds || 0), 500);
    return () => window.clearInterval(t);
  }, [recording]);

  const stop = useCallback(async () => {
    const told = dayDone.current;
    dayDone.current = null;
    const endDay = (take: DayTake | null) => { setDayCues(null); setDayWriting(false); told?.(take); };
    setSealing(true);
    const rec = await recorder.current?.stop();
    setRecording(false); setSeconds(0);
    // The cloud copy sends its last few seconds while the whole recording uploads. If the upload lands first, the
    // copy is dropped (flushOnce); if it never lands, the copy is complete and the next unlock rebuilds it.
    const stream = streaming.current;
    streaming.current = null;
    if (stream) {
      streams.current.set(stream.draftId, stream);
      void stream.finish();
    }
    if (!rec) { setSealing(false); endDay(null); return; }
    const day = dayAtStart.current;
    const entry = newEntry(rec.audio, rec.seconds, moodAtStart.current, day ? { createdAt: onDay(day), addedLater: true, draftId: rec.draftId } : { draftId: rec.draftId });
    // Buffer first: if this fails the recording is not safe and we must not say it is.
    try {
      await putPending({ id: "pending_" + entry.id, userId, entry, audio: rec.audio, attempts: 0, lastAttemptAt: null });
    } catch (e) {
      setSealing(false);
      say("This recording could not be saved on this device");
      report("journal", "device_save_failed", e, { audioBytes: rec.audio.size, mime: rec.audio.type, seconds: rec.seconds });
      endDay(null);
      return;
    }
    // The recording is safe now. Slices left behind would only be adopted again later as a twin, which flushOnce
    // recognises by draft id and skips, so a failure here is logged, not told.
    await clearDraft(rec.draftId).catch((e) => report("journal", "draft_clear_failed", e, undefined, "warn"));
    // Set before the sealing screen goes, so nothing shows between it and "Writing it down".
    if (told) setDayWriting(true);
    setSealing(false);
    setLastSaved((l) => ({ n: l.n + 1, seconds: rec.seconds, day: Boolean(told) }));
    fresh.current.set("pending_" + entry.id, rec.audio);
    setPending((p) => [...p, { id: "pending_" + entry.id, userId, entry, audio: rec.audio, attempts: 0, lastAttemptAt: null }]);
    if (rec.interrupted) report("journal", "recording_interrupted", undefined, { seconds: rec.seconds, audioBytes: rec.audio.size }, "warn");
    if (told) {
      // Say your day: the words are asked for at once, beside the upload instead of after it, because the person is
      // waiting on them. The id says which switch this recording runs under (routes/jobs.js).
      const uploading = flushPending().catch(() => 1);
      let text = "", error: string | null = null;
      try { text = await transcribeAudio("day_" + entry.id, rec.audio); }
      catch (e) {
        report("journal", "day_transcribe_failed", e, { code: e instanceof TranscribeError ? e.code : "unknown", audioBytes: rec.audio.size, mime: rec.audio.type, seconds: rec.seconds });
        error = e instanceof TranscribeError ? e.message : "Couldn't write that down.";
      }
      endDay({ entryId: entry.id, seconds: rec.seconds, text, error });
      const waiting = await uploading;
      if (text) await keepWords(entry, text);
      else if (waiting) say("Saved on this device · will upload automatically");
      return;
    }
    say(rec.interrupted ? "The microphone was interrupted · saved what was recorded" : "Entry saved · uploading…");
    const left = await flushPending();
    if (left) return say("Saved on this device · will upload automatically");
    if (cloudOn) void runTranscription(entry, rec.audio);
  }, [userId, flushPending, say, cloudOn, runTranscription, keepWords]);
  useEffect(() => { stopRef.current = () => { void stop(); }; }, [stop]);

  const start = useCallback(async (mood: string | null, day?: string) => {
    moodAtStart.current = mood;
    dayAtStart.current = day;
    // Each slice also goes to the cloud copy, which starts with the first slice (the draft id exists by then).
    const r = recorder.current = new Recorder(userId, () => stopRef.current(), (slice) => {
      if (!streaming.current && key.current && r.draftId) {
        streaming.current = new DraftStream(key.current, r.draftId, draftTransport, (e, seq) => report("journal", "draft_stream_failed", e, { seq }, "warn"));
      }
      streaming.current?.push(slice);
    });
    try {
      // No microphone in a dev sandbox: ?tone records a test tone instead. Never available to real users.
      const fake = isDevIdentity && new URLSearchParams(window.location.search).has("tone");
      await r.start(fake ? toneStream() : undefined);
      setSeconds(0); setRecording(true);
      return true;
    } catch (e) {
      recorder.current = null;
      const name = (e as { name?: string })?.name;
      // A refused permission is the person's choice, not a fault; everything else is.
      report("journal", "recording_start_failed", e, undefined, name === "NotAllowedError" ? "warn" : "error");
      say(name === "NotAllowedError" ? "Microphone access is needed to record" : name === "NotFoundError" ? "No microphone found" : "Could not start recording");
      return false;
    }
  }, [userId, say]);

  const toggleRecording = useCallback((mood: string | null, day?: string) => {
    if (recording) return void stop();
    if (vault !== "open") return setSheet(true);
    void start(mood, day);
  }, [recording, vault, start, stop]);

  const sayDay = useCallback((mood: string | null, day: string | undefined, cues: string[]) => new Promise<DayTake | null>((resolve) => {
    // Read from refs, not state: this can be called by a closure made before the vault opened (openVaultThen).
    if (recorder.current?.active || dayDone.current) return resolve(null);
    if (!key.current) { setSheet(true); return resolve(null); }
    dayDone.current = resolve;
    setDayCues(cues);
    void start(mood, day).then((started) => {
      if (started) return;
      dayDone.current = null;
      setDayCues(null);
      resolve(null);
    });
  }), [start]);

  const writeEntry = useCallback(async (text: string, mood: string | null, day?: string) => {
    const k = key.current;
    if (!k) { setSheet(true); throw new Error("vault is closed"); }
    const entry = textEntry(text.trim(), mood, day ? { createdAt: onDay(day), addedLater: true } : {});
    try { await saveEntry(k, entry); }
    catch (e) { report("journal", "written_save_failed", e, { chars: entry.transcript.length, backfill: Boolean(day) }); throw e; }
    await flushPending();
    say("Entry saved");
  }, [flushPending, say]);

  // ── Vault ──
  const makeRecoveryCode = useCallback(async (): Promise<boolean> => {
    const k = key.current;
    if (!k || !meta.current) { setSheet(true); return false; }
    try {
      const code = newRecoveryCode();
      const recoveryKey = await sealForRecovery(k, code);
      await api("PUT", "/vault-meta/recovery", { recoveryKey });
      const madeMs = Date.now();
      meta.current = { ...meta.current, recoveryKey, recoveryMs: madeMs };
      setRecovery({ made: true, madeMs });
      setShownCode(code);
      return true;
    } catch (e) {
      report("vault", "recovery_code_failed", e);
      say("Couldn't make a recovery code. Try again.");
      return false;
    }
  }, [say]);

  // Forgot the passphrase: the recovery code opens the vault, and a new passphrase seals the same key for next time.
  const submitRecovery = useCallback(async (code: string, pass: string): Promise<string | null> => {
    if (!meta.current) return null;
    setBusy(true);
    try {
      const k = await openWithRecovery(code, meta.current);
      if (!k) { report("vault", "wrong_recovery_code", undefined, undefined, "warn"); return "That recovery code isn't right. Check it and try again."; }
      const wrap = await wrapForPassphrase(k, pass);
      await api("PUT", "/vault-meta/passphrase", wrap);
      meta.current = { ...meta.current, ...wrap };
      sessionStorage.setItem(SESSION_KEY + userId, await exportKey(k));
      setSheet(false);
      await opened(k);
      say("Your new passphrase is set");
      return null;
    } catch (e) {
      report("vault", "recovery_failed", e);
      return "Could not reach the server. Try again.";
    } finally { setBusy(false); }
  }, [userId, opened, say]);

  const submitPassphrase = useCallback(async (pass: string): Promise<string | null> => {
    setBusy(true);
    try {
      if (meta.current) {
        const k = await unlockVault(pass, meta.current);
        if (!k) { report("vault", "wrong_passphrase", undefined, undefined, "warn"); return "That passphrase is not right."; }
        sessionStorage.setItem(SESSION_KEY + userId, await exportKey(k));
        setSheet(false);
        await opened(k);
        return null;
      }
      const made = await createVault(pass);
      // A new vault shows its recovery code next: nothing else starts on top of that.
      afterUnlock.current = null;
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
      // A new vault gets its recovery code straight away, while the person is here and paying attention.
      void makeRecoveryCode();
      return null;
    } catch (e) {
      report("vault", meta.current ? "unlock_failed" : "create_failed", e);
      return "Could not reach the server. Try again.";
    } finally { setBusy(false); }
  }, [userId, opened, makeRecoveryCode]);

  const submitPasskey = useCallback(async (): Promise<string | null> => {
    if (!meta.current) return null;
    setBusy(true);
    try {
      const k = await unlockWithPasskey(userId, meta.current);
      sessionStorage.setItem(SESSION_KEY + userId, await exportKey(k));
      setSheet(false);
      await opened(k);
      return null;
    } catch (e) {
      const code = e instanceof PasskeyError ? e.code : "failed";
      if (code === "cancelled") return null;
      if (code === "stale") setPkHere(await enrolledHere(userId));
      report("vault", "passkey_unlock_" + code, e, undefined, code === "failed" ? "error" : "warn");
      return e instanceof PasskeyError ? e.message : "Something went wrong with Face ID. Try again.";
    } finally { setBusy(false); }
  }, [userId, opened]);

  const addPasskey = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    if (!key.current) return { ok: false, message: "Unlock the vault first." };
    const name = passkeyName();
    try {
      await enrolPasskey(key.current, { id: userId, email: me.email, name: displayName || me.name });
      setPkHere(true);
      return { ok: true, message: `${name} unlocks your vault on this device now` };
    } catch (e) {
      const code = e instanceof PasskeyError ? e.code : "failed";
      if (code === "cancelled") return { ok: false, message: "Cancelled" };
      report("vault", "passkey_setup_" + code, e, undefined, code === "failed" ? "error" : "warn");
      return { ok: false, message: e instanceof PasskeyError ? e.message : "Could not set up Face ID. Try again." };
    }
  }, [userId, me.email, me.name, displayName]);

  const removePasskeys = useCallback(async () => {
    await forgetThisDevice(userId);
    setPkHere(false);
  }, [userId]);

  const lock = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY + userId);
    key.current = null;
    setLoaded(null); setPending([]); setLoadFailed(false); setVault("locked");
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

  const audioFor = useCallback(async (id: string, onProgress?: (p: AudioProgress) => void) => {
    const local = pending.find((p) => p.entry.id === id);
    if (local) return local.audio;
    const found = loaded?.find((l) => l.meta.id === id);
    if (!key.current || !found) throw new Error("vault is closed");
    return loadAudio(key.current, id, found.entry?.audioMime || "audio/webm", onProgress);
  }, [pending, loaded]);

  // Marked before the download, which can take a while for a long recording: the card shows the job from the tap.
  const transcribeEntry = useCallback((id: string) => {
    const found = loaded?.find((l) => l.meta.id === id)?.entry;
    if (!found || inFlight.current.has(id)) return;
    mark(id, "open");
    void within(audioFor(id), 120000, "download").then((audio) => runTranscription(found, audio), (e) => {
      mark(id, null);
      report("journal", "transcribe_open_failed", e, { audioBytes: found.audioSize, mime: found.audioMime });
      say("Couldn't load that recording");
    });
  }, [loaded, audioFor, runTranscription, say, mark]);

  // Strictly one at a time: the jobs queue answers 429 when several run at once, and Groq has its own limits.
  // Every failure is logged with its stage; report() folds repeats within 15 s, so one summary row at the end
  // carries every entry's outcome as well.
  const transcribeMissing = useCallback(async (onUpdate: (results: BatchResult[], current: string | null) => void, stop: { now: boolean }) => {
    const todo = (loaded || []).map((l) => l.entry).filter(needsTranscript);
    const results: BatchResult[] = [];
    for (const entry of todo) {
      if (stop.now) break;
      // Already running from its own Transcribe button.
      if (inFlight.current.has(entry.id)) continue;
      let stage = "download";
      onUpdate([...results], `${entry.title} · downloading`);
      // The card follows along. Only this loop moves it on: a step that timed out may still report from underneath.
      mark(entry.id, "open");
      try {
        const audio = await within(audioFor(entry.id), 120000, "download");
        mark(entry.id, "transcribe");
        let text = "";
        for (let attempt = 0; ; attempt++) {
          try {
            text = await within(transcribeAndSave(entry, audio, (step) => { stage = step; onUpdate([...results], `${entry.title} · ${step}`); }), ENTRY_MS, "transcribe");
            break;
          } catch (e) {
            const code = e instanceof TranscribeError ? e.code : "";
            if ((code !== "queue_busy" && code !== "rate_limited") || attempt >= BUSY_WAITS_MS.length) throw e;
            onUpdate([...results], `${entry.title} · busy, waiting ${BUSY_WAITS_MS[attempt] / 1000}s`);
            await new Promise((r) => setTimeout(r, BUSY_WAITS_MS[attempt]));
          }
        }
        results.push({ id: entry.id, title: entry.title, outcome: text ? "done" : "empty" });
      } catch (e) {
        const code = e instanceof TranscribeError ? e.code : (e as { name?: string })?.name || "unknown";
        const message = e instanceof Error ? e.message : String(e);
        report("journal", "transcription_failed", (e as { cause?: unknown }).cause ?? e, { code, stage, batch: true, entry: entry.id, audioBytes: entry.audioSize, mime: entry.audioMime });
        results.push({ id: entry.id, title: entry.title, outcome: "failed", stage, code, message });
      } finally {
        mark(entry.id, null);
      }
      onUpdate([...results], null);
      await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
    }
    const failed = results.filter((r) => r.outcome === "failed");
    report("journal", "transcribe_batch", undefined, {
      found: todo.length, done: results.filter((r) => r.outcome === "done").length, empty: results.filter((r) => r.outcome === "empty").length,
      failed: failed.length, stopped: stop.now, failures: failed.map((r) => `${r.id}:${r.stage}:${r.code}`).join("; ").slice(0, 2000),
    }, failed.length ? "warn" : "info");
    return results;
  }, [loaded, audioFor, transcribeAndSave, mark]);

  const items = useMemo<Item[] | null>(() => {
    if (vault !== "open" || !loaded) return null;
    const uploaded = new Set(loaded.map((l) => l.meta.id));
    const local = pending.filter((p) => !uploaded.has(p.entry.id)).map((p) => ({ id: p.entry.id, createdMs: new Date(p.entry.createdAt).getTime(), entry: p.entry, pending: true }));
    const remote = loaded.map((l) => ({ id: l.meta.id, createdMs: l.meta.createdMs, entry: l.entry, pending: false }));
    return [...local, ...remote].sort((x, y) => y.createdMs - x.createdMs);
  }, [vault, loaded, pending]);

  const seal = useCallback(async (value: unknown) => {
    if (!key.current) throw new Error("vault is closed");
    return toB64(await encryptJson(key.current, value));
  }, []);
  const unseal = useCallback(async <T,>(b64: string) => {
    if (!key.current) throw new Error("vault is closed");
    return decryptJson<T>(key.current, fromB64(b64));
  }, []);

  const countOn = useCallback((day: string) => (items ? items.filter((i) => dayKey(new Date(i.createdMs)) === day).length : null), [items]);
  const reload = useCallback(() => { setLoadFailed(false); void flushPending(); }, [flushPending]);
  const openVault = useCallback(() => { afterUnlock.current = null; setSheet(true); }, []);
  const openVaultThen = useCallback((then: () => void) => { afterUnlock.current = then; setSheet(true); }, []);
  const closeSheet = useCallback(() => { afterUnlock.current = null; setSheet(false); }, []);

  const passkey = useMemo(() => ({ supported: pkSupported, name: passkeyName(), here: pkHere }), [pkSupported, pkHere]);

  const value = useMemo<Journal>(
    () => ({ vault, items, loadFailed, entriesProgress, reload, recording, seconds, levels, sealing, lastSaved, busy, countOn, toggleRecording, sayDay, dayCues, dayWriting, writeEntry, openVault, openVaultThen, lock, saveText, remove, audioFor, transcribing, cloudOn, transcribeEntry, transcribeMissing, say, seal, unseal, passkey, addPasskey, removePasskeys, recovery, makeRecoveryCode }),
    [vault, items, loadFailed, entriesProgress, reload, recording, seconds, levels, sealing, lastSaved, busy, countOn, toggleRecording, sayDay, dayCues, dayWriting, writeEntry, openVault, openVaultThen, lock, saveText, remove, audioFor, transcribing, cloudOn, transcribeEntry, transcribeMissing, say, seal, unseal, passkey, addPasskey, removePasskeys, recovery, makeRecoveryCode],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <Sheet open={sheet} title={vault === "none" ? "Create your vault" : "Unlock your vault"} onClose={closeSheet}>
        <VaultForm creating={vault === "none"} busy={busy} onSubmit={submitPassphrase} onSkip={closeSheet}
          passkeyName={vault === "locked" && pkSupported && pkHere ? passkey.name : null} onPasskey={submitPasskey}
          canRecover={recovery.made} onRecover={submitRecovery} />
      </Sheet>
      <Sheet open={shownCode !== null} title="Your recovery code" onClose={() => setShownCode(null)}>
        {shownCode && <RecoveryCode code={shownCode} onDone={() => setShownCode(null)} />}
      </Sheet>
      <Toast message={toast} />
    </Ctx.Provider>
  );
}

function VaultForm({ creating, busy, onSubmit, onSkip, passkeyName, onPasskey, canRecover, onRecover }: {
  creating: boolean; busy: boolean; onSubmit: (pass: string) => Promise<string | null>; onSkip: () => void;
  /** Set when a passkey can open this vault here: its button is all the sheet shows, the passphrase one tap away. */
  passkeyName: string | null; onPasskey: () => Promise<string | null>;
  /** This vault has a recovery code: "Forgot your passphrase?" can open it and set a new passphrase. */
  canRecover: boolean; onRecover: (code: string, pass: string) => Promise<string | null>;
}) {
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [code, setCode] = useState("");
  const withPass = creating || !passkeyName || typing;

  async function recover(e: React.FormEvent) {
    e.preventDefault();
    if (!parseRecoveryCode(code)) return setError("That isn't a whole recovery code. It has 32 letters and numbers.");
    if (pass.length < 8) return setError("Use at least 8 characters for the new passphrase.");
    if (pass !== again) return setError("The two passphrases do not match.");
    setError(await onRecover(code, pass));
  }

  if (recovering) {
    return (
      <form className={a.vaultForm} onSubmit={recover}>
        {canRecover ? <>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Enter the recovery code you saved, then choose a new passphrase. Your journal stays exactly as it is.
          </p>
          <Input placeholder="Recovery code" aria-label="Recovery code" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          <Input type="password" autoComplete="new-password" placeholder="New passphrase" aria-label="New passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
          <Input type="password" autoComplete="new-password" placeholder="Repeat the new passphrase" aria-label="Repeat the new passphrase" value={again} onChange={(e) => setAgain(e.target.value)} />
          {error && <p role="alert" className={a.noteBad}>{error}</p>}
          <Button type="submit" variant="journal" block disabled={busy}>{busy ? "Unlocking…" : "Unlock and keep the new passphrase"}</Button>
        </> : (
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            This vault has no recovery code, so nobody can open it without your passphrase, David included. If it comes
            back to you, it still works.
          </p>
        )}
        <button type="button" className={a.lnk} style={{ alignSelf: "center", minHeight: 44 }} onClick={() => { setRecovering(false); setError(null); }}>Back</button>
      </form>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (creating && pass.length < 8) return setError("Use at least 8 characters.");
    if (creating && pass !== again) return setError("The two passphrases do not match.");
    if (!pass) return setError("Enter your vault passphrase.");
    setError(await onSubmit(pass));
  }

  const field = (
    // No autofocus while the passkey button is showing: on a phone the keyboard would cover it.
    <Input type="password" autoComplete={creating ? "new-password" : "current-password"} placeholder="Vault passphrase" aria-label="Vault passphrase" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus={!passkeyName || typing} />
  );

  return (
    <form className={a.vaultForm} onSubmit={submit}>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        {creating
          ? "Your journal is encrypted on this device before it is uploaded. The passphrase never leaves it, so nobody can read your entries, David included. Next, Dayhub gives you a recovery code: if you forget the passphrase, that code is the only way back in."
          : "Your journal, sleep and Fitbit are encrypted. Food, weight, check-in and activity work without unlocking."}
      </p>
      {/* The one secret Dayhub cannot reset, chosen once, usually on day one: worth a sentence of advice. */}
      {creating && (
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          A short sentence works best: four or five words only you would put together. When your phone offers to save it,
          say yes.
        </p>
      )}
      {passkeyName && !typing && <>
        <Button type="button" variant="journal" block disabled={busy} onClick={async () => setError(await onPasskey())}>{busy ? "Unlocking…" : `Unlock with ${passkeyName}`}</Button>
        <div className={a.vaultLinks}>
          <button type="button" className={a.lnk} onClick={() => { setTyping(true); setError(null); }}>Use your passphrase</button>
          <button type="button" className={a.lnk} onClick={onSkip}>Not now</button>
        </div>
      </>}
      {withPass && creating && <>
        {field}
        <Input type="password" autoComplete="new-password" placeholder="Repeat the passphrase" aria-label="Repeat the passphrase" value={again} onChange={(e) => setAgain(e.target.value)} />
      </>}
      {withPass && !creating && (
        <div className={a.vaultRow}>
          {field}
          <Button type="submit" variant="journal" disabled={busy}>{busy ? "Unlocking…" : "Unlock"}</Button>
        </div>
      )}
      {error && <p role="alert" className={a.noteBad}>{error}</p>}
      {creating && <Button type="submit" variant="journal" block disabled={busy}>{busy ? "Creating…" : "Create vault"}</Button>}
      {!creating && (!passkeyName || typing) && (
        <div className={a.vaultLinks}>
          <button type="button" className={a.lnk} onClick={() => { setRecovering(true); setError(null); setPass(""); setAgain(""); }}>Forgot your passphrase?</button>
          <button type="button" className={a.lnk} onClick={onSkip}>Not now</button>
        </div>
      )}
    </form>
  );
}

/** A recovery code, shown once: big enough to copy by hand, and a button to copy it to the password manager. */
function RecoveryCode({ code, onDone }: { code: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const groups = code.split("-");
  return (
    <div className={a.vaultForm}>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        If you ever forget your passphrase, this code opens your journal and lets you choose a new one. Save it
        somewhere safe, like your password manager. Dayhub can&apos;t show it to you again.
      </p>
      <p className={`m ${a.recoveryCode}`} aria-label={"Recovery code " + code}>
        <span>{groups.slice(0, 4).join("-")}</span><span>{groups.slice(4).join("-")}</span>
      </p>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
        Keep it as private as your passphrase: with it and your Dayhub sign-in, anyone could open your journal.
      </p>
      <div className={a.rowButtons}>
        <Button variant="secondary" onClick={() => { haptic(); void navigator.clipboard?.writeText(code).then(() => setCopied(true), () => setCopied(false)); }}>{copied ? "Copied" : "Copy"}</Button>
        <Button variant="journal" onClick={() => { haptic("done"); onDone(); }}>I&apos;ve saved it</Button>
      </div>
    </div>
  );
}
