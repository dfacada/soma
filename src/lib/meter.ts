// How loud the microphone is, live, for the recording screens (David, 2026-11-03: "I want the animation to move
// according to the volume that I'm speaking"). An AnalyserNode listens to the same stream the recorder uses; nothing
// is recorded or sent from here. Where the browser cannot (no Web Audio), it returns null and the screens fall back
// to their decorative motion.

export type Meter = {
  /** `n` levels, 0–1, across the voice's frequencies, low to high. */
  bands: (n: number) => number[];
  /** The overall loudness, 0–1. */
  level: () => number;
  close: () => void;
};

export function meter(stream: MediaStream): Meter | null {
  const AC = typeof window === "undefined" ? undefined : (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!AC) return null;
  try {
    const ctx = new AC();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    // iOS starts an AudioContext suspended; recording always begins from a tap, so resuming here is allowed.
    void ctx.resume?.().catch(() => undefined);
    const freq = new Uint8Array(analyser.frequencyBinCount);
    const wave = new Uint8Array(analyser.fftSize);
    // About 190 Hz a bin at 48 kHz: bins 1–24 hold a speaking voice (roughly 190 Hz to 4.5 kHz).
    const LO = 1, HI = Math.min(freq.length, 25);
    return {
      bands(n) {
        analyser.getByteFrequencyData(freq);
        return Array.from({ length: n }, (_, i) => {
          const a = LO + Math.floor((i * (HI - LO)) / n), b = Math.max(a + 1, LO + Math.floor(((i + 1) * (HI - LO)) / n));
          let sum = 0;
          for (let k = a; k < b; k++) sum += freq[k];
          // A gentle curve, so a normal speaking voice fills the bars without shouting.
          return Math.min(1, Math.pow(sum / (b - a) / 255, 0.8) * 1.25);
        });
      },
      level() {
        analyser.getByteTimeDomainData(wave);
        let sum = 0;
        for (const v of wave) { const x = (v - 128) / 128; sum += x * x; }
        return Math.min(1, Math.sqrt(sum / wave.length) * 3.2);
      },
      close() {
        try { source.disconnect(); } catch { /* already gone */ }
        void ctx.close().catch(() => undefined);
      },
    };
  } catch {
    return null;
  }
}
