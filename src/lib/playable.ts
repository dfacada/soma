// A recording every browser can play. Since iOS 18.4 Safari will record WebM/Opus but will not play it back from a
// blob: play() rejects with NotSupportedError while canPlayType still answers "maybe". Web Audio can read it, so
// such a recording is decoded and replayed as WAV. New recordings are AAC in MP4 (recorder.ts) and never need this.

const RATE = 24000; // speech loses nothing at 24 kHz, and the WAV is half the size of one at 48 kHz
const DECODE_MS = 20000;

/** A step that never settled. `step` says which, so the log names the exact place playback stuck. */
export class StuckError extends Error {
  constructor(public step: string, ms: number) { super(`${step} did not finish in ${ms / 1000}s`); this.name = "TimeoutError"; }
}

/** `p`, or a StuckError after `ms`. A promise that never settles must not pin the screen on "Decrypting…". */
export function within<T>(p: Promise<T>, ms: number, step: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stuck = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new StuckError(step, ms)), ms); });
  return Promise.race([p, stuck]).finally(() => clearTimeout(timer));
}

type Ctx = typeof AudioContext;

/** Decode with an offline context first (no audio session, resamples to RATE); if Safari stalls or refuses it,
 *  a live context. Each attempt gets its own copy of the bytes: decodeAudioData detaches what it is given. */
async function decode(bytes: ArrayBuffer, note: (step: string) => void): Promise<{ buf: AudioBuffer; via: string }> {
  note("decode_offline");
  // Held in a variable on purpose: a context nothing refers to can be collected mid-decode, and its promise with it.
  const offline = new OfflineAudioContext(1, 1, RATE);
  let first: unknown;
  try { return { buf: await within(offline.decodeAudioData(bytes.slice(0)), DECODE_MS, "decode_offline"), via: "offline" }; }
  catch (e) { first = e; }
  note("decode_live");
  const Live: Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: Ctx }).webkitAudioContext;
  const live = new Live();
  try { return { buf: await within(live.decodeAudioData(bytes.slice(0)), DECODE_MS, "decode_live"), via: "live" }; }
  catch (e) {
    const name = (x: unknown) => (x as { name?: string })?.name || String(x);
    throw Object.assign(new Error(`offline: ${name(first)}; live: ${name(e)}`), { name: name(e) });
  } finally { void live.close().catch(() => undefined); }
}

/** Decode a recording and re-encode it as 16-bit mono WAV. Throws if this browser cannot decode it either.
 *  `note` hears each step as it starts, so a failure can be pinned to one. */
export async function toWav(audio: Blob, note: (step: string) => void = () => undefined): Promise<{ wav: Blob; via: string }> {
  note("read");
  const { buf, via } = await decode(await audio.arrayBuffer(), note);
  note("encode");
  const n = buf.length, channels = buf.numberOfChannels;
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(at + i, s.charCodeAt(i)); };
  text(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); text(8, "WAVE");
  text(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  text(36, "data"); out.setUint32(40, n * 2, true);
  const data = Array.from({ length: channels }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += data[c][i];
    s = Math.max(-1, Math.min(1, s / channels));
    out.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return { wav: new Blob([out.buffer], { type: "audio/wav" }), via };
}
