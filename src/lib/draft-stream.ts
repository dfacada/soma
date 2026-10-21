// Streaming a recording to the cloud while it is made (Glimpse's Tier 3b). IndexedDB already keeps every slice on
// the device (recorder.ts, recovery.ts); this keeps an encrypted copy in Stratus as well, so a recording outlives the
// phone itself: a killed tab, a dead battery, a lost phone. The finished recording is still uploaded whole on stop
// (journal.ts saveEntry); once that lands, the draft is deleted. A draft that was never saved is rebuilt on the next
// unlock, on any device (Journal.tsx).
//
// Slices are grouped into segments of about five seconds, each encrypted with the vault key and uploaded in order to
// drafts/cs-<draft id>-<seq>.enc. MediaRecorder output only plays from the start, so the cloud copy must be a clean
// prefix: a segment that cannot be sent after a few tries stops the stream rather than leaving a hole.
// No imports beyond the crypto, and the network comes in as a Transport, so scripts/test-drafts.mjs runs this as is.

import { decryptBytes, encryptBytes } from "./vault-crypto";

export type Transport = {
  /** PUT (or GET) URLs for these drafts/ names. */
  sign: (method: "PUT" | "GET", names: string[]) => Promise<Map<string, string>>;
  put: (url: string, bytes: Uint8Array) => Promise<void>;
  get: (url: string) => Promise<ArrayBuffer>;
};

const SEGMENT_MS = 5000;
const SIGN_AHEAD = 30; // two and a half minutes of segments per signing; a signed URL lives fifteen
const TRIES = 5;

export const segmentName = (draftId: string, seq: number) => `cs-${draftId}-${String(seq).padStart(5, "0")}.enc`;
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

export class DraftStream {
  private slices: Blob[] = [];
  private firstAt = 0;
  private seq = 0;
  private urls = new Map<string, string>();
  private chain: Promise<void> = Promise.resolve();
  private waiting = 0;
  private stopped = false;
  private aborted = false;
  /** Set once a segment could not be sent: the cloud copy is the prefix before it. */
  broken: unknown = null;

  private key: CryptoKey;
  readonly draftId: string;
  private net: Transport;
  private onError: (e: unknown, seq: number) => void;
  // Plain fields, not parameter properties: Node runs this file with types stripped, and those need a compiler.
  constructor(key: CryptoKey, draftId: string, net: Transport, onError: (e: unknown, seq: number) => void = () => undefined) {
    this.key = key; this.draftId = draftId; this.net = net; this.onError = onError;
  }

  /** Segments written or being written, not yet confirmed. Zero means the cloud has everything pushed so far. */
  get behind() { return this.waiting + (this.slices.length ? 1 : 0); }

  /** One recorder slice. Starts a segment upload once about SEGMENT_MS of slices have gathered. */
  push(slice: Blob) {
    if (this.stopped || this.broken) return;
    if (!this.slices.length) this.firstAt = Date.now();
    this.slices.push(slice);
    if (Date.now() - this.firstAt >= SEGMENT_MS) this.cut();
  }

  /** Send what is gathered and wait for every segment. Resolves even when the stream broke; check `broken`. */
  async finish() {
    if (!this.stopped && !this.broken) this.cut();
    this.stopped = true;
    await this.chain;
  }

  /** Stop sending. Anything still queued is dropped (the recording was saved whole, or is being thrown away). */
  abort() { this.stopped = this.aborted = true; this.slices = []; }

  private cut() {
    if (!this.slices.length) return;
    const blob = new Blob(this.slices);
    this.slices = [];
    const seq = this.seq++;
    this.waiting++;
    this.chain = this.chain.then(() => this.send(seq, blob)).finally(() => { this.waiting--; });
  }

  private async send(seq: number, blob: Blob) {
    if (this.broken || this.aborted) return;
    const name = segmentName(this.draftId, seq);
    const bytes = await encryptBytes(this.key, await blob.arrayBuffer());
    for (let attempt = 1; ; attempt++) {
      try {
        if (!this.urls.has(name)) {
          const names = Array.from({ length: SIGN_AHEAD }, (_, i) => segmentName(this.draftId, seq + i));
          this.urls = await this.net.sign("PUT", names);
        }
        await this.net.put(this.urls.get(name)!, bytes);
        return;
      } catch (e) {
        // A URL may have expired (a recording paused by a phone call); sign again on the next try.
        this.urls.delete(name);
        if (this.aborted) return;
        if (attempt >= TRIES) { this.broken = e; this.onError(e, seq); return; }
        await sleep(Math.min(16000, 1000 * 2 ** attempt));
      }
    }
  }
}

/** The recording a draft holds, from its first segment up to the first one missing. MP4 or WebM, read from the
 *  first bytes, since nothing else records the type. `complete` is false when segments were missing after a gap. */
export async function rebuildDraft(key: CryptoKey, draftId: string, names: string[], net: Pick<Transport, "sign" | "get">) {
  const have = new Set(names);
  const run: string[] = [];
  for (let seq = 0; have.has(segmentName(draftId, seq)); seq++) run.push(segmentName(draftId, seq));
  if (!run.length) return null;
  const parts: Uint8Array<ArrayBuffer>[] = [];
  for (let from = 0; from < run.length; from += 100) {
    const batch = run.slice(from, from + 100);
    const urls = await net.sign("GET", batch);
    for (const n of batch) parts.push(new Uint8Array(await decryptBytes(key, await net.get(urls.get(n)!))));
  }
  const head = parts[0];
  const mp4 = head.length > 8 && String.fromCharCode(head[4], head[5], head[6], head[7]) === "ftyp";
  return { parts, mime: mp4 ? "audio/mp4" : "audio/webm", segments: run.length, complete: run.length === names.length, seconds: Math.round((run.length * SEGMENT_MS) / 1000) };
}
