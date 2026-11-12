"""The ad's soundtrack, made from nothing but code, so it belongs to the ad and needs no licence.

A warm bed in D major at 109 beats a minute (a bar is 2.2 s, as the picture's), soft until the day closes, then a
light groove under the montage, and the screen's sounds on the picture's own cues: taps, whooshes, the list's ticks,
the journal sealing, a chime when the day closes.

    python ad/sound.py ad/out/dayhub-30s-vertical.cues.json ad/out/dayhub-30s.wav [--spectrogram ad/out/x.png]
    python ad/sound.py <cues> <out.wav> --voice ad/out/voice/voice-30.wav     with a narrator over it (voice.py)

The cues come from `node ad/render.mjs --cut 30 --cues`. The result is 48 kHz stereo; render.mjs measures and sets
its loudness when it lays it under the picture (two-pass loudnorm to -14 LUFS, peaks under -1.5 dBTP).
"""
import json
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
BPM = 60 / 0.55
BEAT = 0.55
BAR = 2.2
RNG = np.random.default_rng(7)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# Chords: (bass note, pad notes). Voiced to move little: A3 is in nearly every one.
CH = {
    "Dmaj9": (38, [54, 57, 61, 64]),
    "Bm9": (35, [54, 57, 61, 62]),
    "Gmaj9": (43, [54, 57, 59, 62]),
    "A6sus": (45, [52, 54, 57, 62]),
    "A": (45, [52, 57, 61, 64]),
    "D/F#": (42, [54, 57, 62, 64]),
}

# Each cut's bars: (chord, section). Sections: hook, verse, build, drop, groove, end.
PLAN = {
    30: [("Gmaj9", "hook"), ("Dmaj9", "verse"), ("Bm9", "verse"), ("Gmaj9", "verse"), ("A6sus", "build"),
         ("Dmaj9", "drop"), ("Bm9", "groove"), ("Gmaj9", "groove"), ("D/F#", "groove"), ("A", "groove"),
         ("Gmaj9", "groove"), ("Gmaj9", "end"), ("Dmaj9", "end"), ("Dmaj9", "end")],
    15: [("Gmaj9", "hook"), ("Dmaj9", "verse"), ("Bm9", "verse"), ("A6sus", "build"), ("Dmaj9", "drop"),
         ("Gmaj9", "end"), ("Dmaj9", "end")],
}


def lp(x, hz, order=2):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x, axis=0)


def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x, axis=0)


class Mix:
    def __init__(self, dur):
        self.n = int(dur * SR) + SR * 3
        self.dur = dur
        self.buses = {}

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((self.n, 2))
        return self.buses[name]

    def add(self, name, t, sig, gain=1.0, pan=0.0):
        if sig.ndim == 1:
            l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            sig = np.stack([sig * l * 1.414, sig * r * 1.414], axis=1)
        i = int(round(t * SR))
        if i >= self.n:
            return
        j = min(self.n, i + len(sig))
        if i < 0:
            sig, i = sig[-i:], 0
        self.bus(name)[i:j] += sig[: j - i] * gain


def env(n, a, r, sustain_end=None):
    """Attack a seconds, hold, release r seconds at the end."""
    e = np.ones(n)
    na, nr = min(n, max(1, int(a * SR))), min(n, max(1, int(r * SR)))
    e[:na] = np.linspace(0, 1, na) ** 1.6
    e[-nr:] *= np.linspace(1, 0, nr) ** 1.4
    return e


def tone(freq, dur, partials, detune=0.0, phase=0.0):
    t = np.arange(int(dur * SR)) / SR
    f = freq * 2 ** (detune / 1200)
    out = np.zeros_like(t)
    for k, amp in partials:
        if f * k < SR / 2.2:
            out += amp * np.sin(2 * np.pi * f * k * t + phase * k)
    return out


def pad_note(freq, dur):
    parts = [(k, 1 / k ** 1.5) for k in range(1, 9)]
    voices = []
    for det, ph in ((-7, 0.3), (0, 1.1), (7, 2.0)):
        voices.append(tone(freq, dur, parts, det, ph))
    l = voices[0] * 0.8 + voices[1] * 0.6 + voices[2] * 0.3
    r = voices[0] * 0.3 + voices[1] * 0.6 + voices[2] * 0.8
    sig = np.stack([l, r], axis=1) * env(len(l), 0.9, 1.4)[:, None]
    # Slow movement in the tone: a little tremolo.
    t = np.arange(len(l)) / SR
    sig *= (1 + 0.08 * np.sin(2 * np.pi * 0.23 * t + freq))[:, None]
    return lp(sig, 2600)


def pluck(freq, dur=0.9, bright=1.0):
    t = np.arange(int(dur * SR)) / SR
    sig = np.zeros_like(t)
    for k, amp, dec in ((1, 1.0, 2.6), (2, 0.42, 5.0), (3, 0.2, 8.0), (4, 0.11 * bright, 12.0), (6, 0.05 * bright, 18.0)):
        sig += amp * np.sin(2 * np.pi * freq * k * t) * np.exp(-t * dec)
    att = np.minimum(1, t / 0.004)
    return sig * att * 0.6


def bell(freq, dur=3.2, index=3.2):
    t = np.arange(int(dur * SR)) / SR
    mod = np.sin(2 * np.pi * freq * 3.5 * t) * index * np.exp(-t * 1.6)
    sig = np.sin(2 * np.pi * freq * t + mod) * np.exp(-t * 1.25)
    sig += 0.25 * np.sin(2 * np.pi * freq * 2.0 * t) * np.exp(-t * 2.5)
    return sig * np.minimum(1, t / 0.002)


def bass_note(freq, dur, punch=False):
    t = np.arange(int(dur * SR)) / SR
    # Strong second and third harmonics, so the line still reads on a phone's small speaker.
    sig = np.sin(2 * np.pi * freq * t) + 0.38 * np.sin(2 * np.pi * freq * 2 * t) + 0.16 * np.sin(2 * np.pi * freq * 3 * t)
    e = env(len(t), 0.02 if punch else 0.25, 0.25 if punch else 0.6)
    if punch:
        e *= np.exp(-t * 1.2) * 0.6 + 0.4
    return np.tanh(sig * e * 1.2) * 0.8


def kick(gain=1.0):
    t = np.arange(int(0.5 * SR)) / SR
    f = 46 + 95 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(ph) * np.exp(-t / 0.22)
    click = RNG.standard_normal(len(t)) * np.exp(-t / 0.002) * 0.25
    return (hp(sig, 38) + hp(click, 2000)) * gain


def clap():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = RNG.standard_normal(n)
    e = np.zeros(n)
    for d in (0.0, 0.011, 0.023):
        e += (t >= d) * np.exp(-np.maximum(0, t - d) / 0.008)
    e += (t >= 0.03) * np.exp(-np.maximum(0, t - 0.03) / 0.11) * 0.6
    return bp(noise * e, 900, 4200) * 0.9


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return hp(RNG.standard_normal(n), 7000, 3) * np.exp(-t / (0.06 if open_ else 0.014)) * 0.5


def shaker():
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    e = np.minimum(1, t / 0.012) * np.exp(-t / 0.035)
    return bp(RNG.standard_normal(n), 4500, 11000) * e * 0.35


def noise_sweep(dur, lo, hi, rise=True):
    """A whoosh: noise through a band that sweeps, in 20 ms blocks."""
    n = int(dur * SR)
    out = np.zeros(n)
    noise = RNG.standard_normal(n + SR)
    block = int(0.02 * SR)
    for i in range(0, n, block):
        p = i / n
        c = lo * (hi / lo) ** (p if rise else 1 - p)
        seg = bp(noise[i:i + block + 2048], max(40, c * 0.6), min(SR / 2.3, c * 1.6))[2048 // 2: 2048 // 2 + block]
        out[i:i + len(seg)] += seg[: n - i]
    t = np.arange(n) / SR
    shape = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5 if not rise else (t / dur) ** 2.2
    return out * shape


def blip(f1, f2, dur=0.07, gain=0.5):
    t = np.arange(int(dur * SR)) / SR
    f = np.where(t < dur / 2, f1, f2)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.minimum(1, t / 0.003) * np.exp(-t / (dur * 0.5)) * gain


def tick_sound(gain=0.5):
    t = np.arange(int(0.03 * SR)) / SR
    s = np.sin(2 * np.pi * 2300 * t) * np.exp(-t / 0.006) + hp(RNG.standard_normal(len(t)), 3000) * np.exp(-t / 0.002) * 0.3
    return s * gain


def impulse_response(dur=2.6, decay=2.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    tau = decay / 6.9
    ir = RNG.standard_normal((n, 2)) * np.exp(-t / tau)[:, None]
    ir = lp(ir, 5200)
    ir[: int(0.018 * SR)] = 0
    for d, g in ((0.021, 0.5), (0.034, 0.35), (0.047, 0.3), (0.061, 0.22)):
        i = int(d * SR)
        ir[i] += g * RNG.choice([-1, 1], 2)
    return ir / np.sqrt((ir ** 2).sum(axis=0))[None, :] * 0.6


def limit(x, thr, look=0.005, release=0.08):
    """A peak limiter: the gain drops to keep every sample under thr. The minimum filter spreads each drop `look`
    seconds either side of its peak, so the gain is already down when the peak arrives; it recovers over `release`."""
    from scipy.ndimage import minimum_filter1d
    level = np.abs(x).max(axis=1)
    want = np.minimum(1.0, thr / np.maximum(level, 1e-9))
    want = minimum_filter1d(want, size=2 * int(look * SR) + 1, mode="nearest")
    g = np.empty_like(want)
    k = np.exp(-1 / (release * SR))
    cur = 1.0
    for i in range(len(want)):
        w = want[i]
        cur = w if w < cur else w + (cur - w) * k
        g[i] = cur
    return x * g[:, None]


def build(cues_file, out_file, spectro=None, voice=None):
    with open(cues_file) as f:
        data = json.load(f)
    cut = int(data.get("cut", 30))
    dur = float(data["dur"])
    cues = data["cues"]
    plan = PLAN[cut]
    m = Mix(dur)

    # ── The bed ──
    for b, (chord, sec) in enumerate(plan):
        t0 = b * BAR
        if t0 >= dur:
            break
        root, notes = CH[chord]
        last = b == len(plan) - 1 or t0 + BAR >= dur
        length = BAR + (2.4 if last else 0.9)
        pad_gain = {"hook": 0.75, "verse": 0.9, "build": 1.0, "drop": 1.1, "groove": 0.85, "end": 1.0}[sec]
        if sec == "hook":
            length = BAR + 1.1
        for k, n in enumerate(notes):
            m.add("pad", t0 - (0.4 if sec == "hook" and b == 0 else 0.0), pad_note(midi(n), length + (0.4 if b == 0 else 0)), 0.065 * pad_gain, pan=(k - 1.5) * 0.25)
        # The bass: long notes before the day closes, a pulse after.
        if sec in ("verse", "build", "end"):
            m.add("bass", t0, bass_note(midi(root), BAR + 0.3), 0.11 if sec != "end" else 0.09)
        elif sec == "drop":
            m.add("bass", t0, bass_note(midi(root), BAR + 0.3, punch=True), 0.15)
        elif sec == "groove":
            for e in range(8):
                note = root if e not in (3, 7) else root + (7 if e == 3 else 12)
                m.add("bass", t0 + e * BEAT / 2, bass_note(midi(note), BEAT / 2 * 0.9, punch=True), 0.12)
        # The pluck: chord tones an octave and more up, in eighths through the verse, sixteenths in the groove.
        if sec in ("verse", "build", "groove", "drop"):
            tones = [n + 12 for n in notes] + [notes[1] + 24]
            pattern = [0, 2, 1, 3, 4, 2, 3, 1] if sec != "groove" else [0, 2, 4, 1, 3, 2, 4, 3, 0, 2, 4, 1, 3, 2, 1, 4]
            step = BEAT / 2 if sec != "groove" else BEAT / 4
            for i, p in enumerate(pattern):
                at = t0 + i * step
                if sec == "build" and i >= 6:
                    continue
                vel = 0.9 if i % 4 == 0 else 0.6
                m.add("pluck", at, pluck(midi(tones[p]), 0.8, 0.8 if sec == "verse" else 1.0), 0.07 * vel, pan=0.35 * np.sin(i * 1.7))
        # Drums: hats from the second verse bar, the groove after the day closes.
        if sec == "verse" and b >= 2:
            for i in range(8):
                m.add("drums", t0 + i * BEAT / 2 + 0.02, hat(), 0.05 if i % 2 else 0.03, pan=0.3)
        if sec == "drop":
            m.add("drums", t0, kick(1.1), 0.36)
            m.add("drums", t0 + 2 * BEAT, kick(0.8), 0.25)
            for i in range(8):
                m.add("drums", t0 + i * BEAT / 2, hat(i % 2 == 1), 0.05, pan=0.25)
        if sec == "groove":
            for i in range(4):
                m.add("drums", t0 + i * BEAT, kick(), 0.32)
                if i % 2 == 1:
                    m.add("drums", t0 + i * BEAT, clap(), 0.16, pan=-0.05)
            for i in range(16):
                m.add("drums", t0 + i * BEAT / 4, shaker(), 0.06 if i % 4 == 2 else 0.035, pan=0.4)
            for i in range(4):
                m.add("drums", t0 + i * BEAT + BEAT / 2, hat(True), 0.04, pan=-0.3)

    # ── The picture's sounds ──
    closes = [c["t"] for c in cues if c["kind"] == "close"]
    for c in cues:
        t, k = c["t"], c["kind"]
        if k == "tap":
            m.add("sfx", t, tick_sound(0.45))
        elif k == "whoosh":
            ln = c.get("len", 0.6)
            m.add("sfx", t, noise_sweep(ln, 300, 2600, rise=False), 0.12 if c.get("soft") else 0.2)
        elif k == "whip":
            s = noise_sweep(0.36, 500, 5000, rise=False)
            pan = np.linspace(0.8, -0.8, len(s))
            l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            m.add("sfx", t - 0.2, np.stack([s * l, s * r], axis=1) * 1.4, 0.22)
        elif k == "rec-start":
            m.add("sfx", t, blip(midi(88), midi(93), 0.12, 0.18))
        elif k == "rec-stop":
            m.add("sfx", t, blip(midi(93), midi(88), 0.12, 0.16))
        elif k == "tick":
            m.add("sfx", t, pluck(midi([81, 85, 88][c.get("i", 0) % 3]), 0.5, 1.2), 0.09, pan=0.2)
        elif k == "riser":
            ln = c.get("len", 0.45) + 0.35
            m.add("sfx", t - 0.35, noise_sweep(ln, 400, 7000, rise=True), 0.16)
        elif k == "close":
            # The day closes: a low swell, a chime on the chord, a soft impact.
            tt = np.arange(int(1.6 * SR)) / SR
            boom = np.sin(2 * np.pi * np.cumsum(60 * np.exp(-tt / 0.6) + 32) / SR) * np.exp(-tt / 0.5)
            m.add("sfx", t, hp(boom, 30), 0.3)
            for i, n in enumerate([86, 90, 93, 97]):
                m.add("chime", t + i * 0.07, bell(midi(n), 3.2, 2.6), 0.07, pan=(i - 1.5) * 0.3)
        elif k == "seal":
            for d, f, g in ((0.0, 1800, 0.35), (0.045, 1100, 0.28)):
                tt = np.arange(int(0.05 * SR)) / SR
                s = bp(RNG.standard_normal(len(tt)), f * 0.7, f * 1.6) * np.exp(-tt / 0.006)
                m.add("sfx", t + d, s, g)
            m.add("sfx", t + 0.045, pluck(midi(57), 0.3, 0.2), 0.12)
        elif k == "end":
            for i, n in enumerate([74, 78, 81, 86, 90]):
                m.add("chime", t + 0.2 + i * 0.11, bell(midi(n), 3.0, 1.8), 0.05, pan=(i - 2) * 0.25)

    # ── Mix ──
    n = m.n
    tt = np.arange(n) / SR
    # Ducking under the kick in the groove: the pad and bass breathe with it.
    duck = np.ones(n)
    groove_from = [b * BAR for b, (_, s) in enumerate(plan) if s == "groove"]
    if groove_from:
        g0, g1 = min(groove_from), max(groove_from) + BAR
        for b in np.arange(g0, g1 - 1e-6, BEAT):
            i = int(b * SR)
            j = min(n, i + int(0.3 * SR))
            duck[i:j] = np.minimum(duck[i:j], 1 - 0.35 * np.exp(-np.arange(j - i) / SR / 0.09))
    pad = m.bus("pad") * duck[:, None]
    bass = m.bus("bass") * duck[:, None]
    pluck_bus = m.bus("pluck")
    # Ping-pong delay on the pluck, a dotted eighth.
    d = int(BEAT * 0.75 * SR)
    delayed = np.zeros_like(pluck_bus)
    fb = pluck_bus.copy()
    for rep in range(1, 5):
        g = 0.34 ** rep
        side = 0 if rep % 2 else 1
        delayed[d * rep:, side] += lp(fb[:-d * rep, :].mean(axis=1), 3500) * g if d * rep < n else 0
    pluck_bus = pluck_bus + delayed * 0.7
    ir = impulse_response()
    send = pad * 0.45 + pluck_bus * 0.35 + m.bus("chime") * 0.55 + m.bus("drums") * 0.06
    wet = np.stack([fftconvolve(send[:, 0], ir[:, 0])[:n], fftconvolve(send[:, 1], ir[:, 1])[:n]], axis=1)
    music = pad + bass + pluck_bus + m.bus("drums") + m.bus("chime") + wet * 0.55
    sfx = m.bus("sfx")
    vo = None
    if voice is not None:
        # A voice over it (voice.py's track): the music steps 9 dB down while it speaks, the screen's sounds 4 dB,
        # quick to go down and slow to come back, so the bed breathes between lines instead of pumping.
        sr, vo = wavfile.read(voice)
        vo = vo.astype(np.float32) if vo.ndim == 1 else vo.mean(axis=1).astype(np.float32)
        vo = np.pad(vo, (0, max(0, n - len(vo))))[:n]
        hop = SR // 100
        fr = len(vo) // hop
        env = np.sqrt((vo[: fr * hop].reshape(fr, hop) ** 2).mean(axis=1))
        db = 20 * np.log10(env + 1e-9)
        act = np.clip((db - (db.max() - 40)) / 12, 0, 1)
        sm = np.zeros(fr)
        cur = 0.0
        for i in range(fr):
            cur = cur + (act[i] - cur) * (0.3 if act[i] > cur else 0.022)
            sm[i] = cur
        a = np.interp(np.arange(n) / hop, np.arange(fr), sm)
        talk = a > 0.5
        mus_rms = np.sqrt((music[talk] ** 2).mean()) if talk.any() else 0.05
        vo_rms = np.sqrt((vo[talk] ** 2).mean()) if talk.any() else 0.05
        # The voice sits 3 dB over the music before the music steps down: 12 dB clear of it while it speaks.
        vo = vo * (mus_rms / max(vo_rms, 1e-9)) * 10 ** (3 / 20)
        music = music * (10 ** (-9 * a / 20))[:, None]
        sfx = sfx * (10 ** (-4 * a / 20))[:, None]
    mix = music + sfx
    mix = hp(mix, 32)
    # A gentle lift in the presence range, for small speakers.
    mix = mix + bp(mix, 1800, 5000) * 0.35
    if vo is not None:
        # In the middle, with a breath of the same room as the music so it sits in it.
        room = np.stack([fftconvolve(vo * 0.07, ir[:, 0])[:n], fftconvolve(vo * 0.07, ir[:, 1])[:n]], axis=1)
        mix = mix + np.stack([vo, vo], axis=1) * 0.92 + room
    # Fade in the first breath and out at the end of the picture.
    fade = np.ones(n)
    fade[: int(0.25 * SR)] = np.linspace(0, 1, int(0.25 * SR))
    end_i = int(dur * SR)
    fl = int(1.1 * SR)
    fade[end_i - fl:end_i] = np.linspace(1, 0, fl) ** 1.5
    fade[end_i:] = 0
    mix = (mix * fade[:, None])[:end_i]
    # A look-ahead limiter takes the loudest few transients down 3 dB, so loudness can be set to -14 LUFS without
    # squashing anything, then the peak sits at -1 dBFS.
    mix = mix / max(np.abs(mix).max(), 1e-9)
    mix = limit(mix, 10 ** (-3 / 20))
    mix = mix / max(np.abs(mix).max(), 1e-9) * 10 ** (-1 / 20)
    wavfile.write(out_file, SR, mix.astype(np.float32))
    rms = lambda a, b: 20 * np.log10(np.sqrt((mix[int(a * SR):int(b * SR)] ** 2).mean()) + 1e-12)
    sections = [(0, BAR, "hook")]
    print(f"wrote {out_file}: {dur:.1f}s, peak {20*np.log10(np.abs(mix).max()):.1f} dBFS, rms whole {rms(0, dur):.1f} dB")
    for b, (chord, sec) in enumerate(plan):
        if b * BAR < dur:
            print(f"  bar {b:2d} {b*BAR:5.1f}s {chord:6s} {sec:7s} rms {rms(b*BAR, min(dur, (b+1)*BAR)):6.1f} dB")
    if spectro:
        spectrogram(mix.mean(axis=1), spectro)


def spectrogram(x, path, w=1400, h=500):
    """A picture of the sound, to look at in place of listening: log frequency up, time across."""
    from PIL import Image
    hop = max(1, len(x) // w)
    win = 4096
    cols = []
    for i in range(w):
        seg = x[i * hop: i * hop + win]
        if len(seg) < win:
            seg = np.pad(seg, (0, win - len(seg)))
        spec = np.abs(np.fft.rfft(seg * np.hanning(win)))
        cols.append(spec)
    S = 20 * np.log10(np.array(cols).T + 1e-9)
    freqs = np.fft.rfftfreq(win, 1 / SR)
    rows = np.geomspace(30, 16000, h)
    idx = np.searchsorted(freqs, rows)
    img = S[idx][::-1]
    img = np.clip((img - (img.max() - 80)) / 80, 0, 1)
    rgb = (np.stack([img ** 0.6, img ** 1.2, img ** 2.4], axis=2) * 255).astype(np.uint8)
    Image.fromarray(rgb).save(path)


if __name__ == "__main__":
    args = sys.argv[1:]
    opt = {}
    for name in ("--spectrogram", "--voice"):
        if name in args:
            i = args.index(name)
            opt[name] = args[i + 1]
            args = args[:i] + args[i + 2:]
    build(args[0], args[1], opt.get("--spectrogram"), opt.get("--voice"))
