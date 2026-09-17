// Microphone recorder. Every slice goes to IndexedDB as it arrives (recovery.ts), so a recording survives
// a crash, a killed tab or a dead battery. Ported from Glimpse's startRec / stopRec.

import { openDb, writeChunk } from "./recovery";

// iOS Safari records AAC in MP4; everything else records Opus in WebM. Ask for what the browser can do.
const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4"];
const SLICE_MS = 1000;

export function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIMES.find((m) => MediaRecorder.isTypeSupported(m));
}

export type Recording = { audio: Blob; seconds: number; draftId: string; interrupted: boolean };

export class Recorder {
  private mr: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private db: IDBDatabase | null = null;
  private chunks: Blob[] = [];
  private writes: Promise<void>[] = [];
  private startedAt = 0;
  private interrupted = false;
  draftId: string | null = null;

  /** `onInterrupted` fires when the OS takes the microphone away (a phone call, iOS backgrounding the tab). */
  constructor(private userId: string, private onInterrupted: () => void) {}

  get active() { return this.mr !== null; }
  get seconds() { return this.active ? Math.floor((Date.now() - this.startedAt) / 1000) : 0; }

  async start(stream?: MediaStream) {
    if (this.active) return;
    this.stream = stream || await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.chunks = []; this.writes = []; this.interrupted = false;
    const draftId = this.draftId = "draft_" + Date.now();
    // Recording must start even if IndexedDB is unavailable (private mode); only the crash safety net is lost.
    this.db = await openDb().catch(() => null);

    const mimeType = pickMime();
    const mr = this.mr = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    mr.ondataavailable = (e) => {
      if (!e.data.size) return;
      const index = this.chunks.length;
      this.chunks.push(e.data);
      if (this.db) this.writes.push(writeChunk(this.db, this.userId, draftId, index, e.data).catch(() => undefined));
    };
    this.stream.getAudioTracks().forEach((t) => t.addEventListener("ended", () => {
      if (!this.active) return;
      this.interrupted = true;
      this.onInterrupted();
    }));
    this.startedAt = Date.now();
    mr.start(SLICE_MS);
  }

  /** Resolves once the last slice has arrived and every IndexedDB write has landed. */
  async stop(): Promise<Recording | null> {
    const mr = this.mr;
    if (!mr) return null;
    const seconds = this.seconds;
    this.mr = null;
    await new Promise<void>((resolve) => {
      mr.addEventListener("stop", () => resolve(), { once: true });
      try { mr.stop(); } catch { resolve(); }
    });
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    // Waiting here stops a late write from resurrecting the draft after it has been cleared.
    await Promise.allSettled(this.writes);
    try { this.db?.close(); } catch { /* already closed */ }
    this.db = null;

    const draftId = this.draftId!;
    this.draftId = null;
    if (!this.chunks.length) return null;
    const audio = new Blob(this.chunks, { type: this.chunks[0].type || mr.mimeType || "audio/webm" });
    this.chunks = [];
    return { audio, seconds, draftId, interrupted: this.interrupted };
  }
}

/** A tone instead of a microphone, for exercising the pipeline where there is no mic (dev only). */
export function toneStream(): MediaStream {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const dest = ctx.createMediaStreamDestination();
  osc.frequency.value = 220;
  osc.connect(dest);
  osc.start();
  return dest.stream;
}
