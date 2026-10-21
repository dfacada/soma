// A recording every browser can play. Since iOS 18.4 Safari will record WebM/Opus but will not play it back from a
// blob: play() rejects with NotSupportedError while canPlayType still answers "maybe". Web Audio can read it, so
// such a recording is decoded and replayed as WAV. New recordings are AAC in MP4 (recorder.ts) and never need this.

const RATE = 24000; // speech loses nothing at 24 kHz, and the WAV is half the size of one at 48 kHz

/** Decode a recording and re-encode it as 16-bit mono WAV. Throws if this browser cannot decode it either. */
export async function toWav(audio: Blob): Promise<Blob> {
  // An offline context needs no tap, takes no hold of the audio session, and resamples to RATE as it decodes.
  const buf = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await audio.arrayBuffer());
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
  return new Blob([out.buffer], { type: "audio/wav" });
}
