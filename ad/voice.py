"""Puts a narrator's own recording under the ad.

One recording of the script's lines (VOICEOVER.md), read in order with a pause between them, retakes allowed. This
cleans the voice up, finds each line, places each where its words come up on screen, and writes a voice track the
length of the cut. sound.py then mixes it in over the music, lowered under it.

    python ad/voice.py <recording> ad/out/dayhub-30s-vertical.cues.json ad/out/voice/voice-30.wav

To tell a retake from the take before it, Windows' own speech recognizer listens to each piece for the script's lines
(ad/recognize.ps1). Nothing leaves this computer. The script prints where each line landed and any line it had to
speed up. If the member's line runs differently from the cut, it prints the `&words=` to give the page, and
render.mjs takes that as `--query`.

The recording and everything made from it stay in ad/out/, out of git.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
FAST = 1.08  # the most a line is sped up to fit its moment; past that the cut has to move instead


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise SystemExit(f"{cmd[0]} failed:\n{p.stderr[-2000:]}")
    return p


def decode(src, dst, filters=None, rate=SR):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-ac", "1", "-ar", str(rate)]
    if filters:
        cmd += ["-af", filters]
    cmd += ["-c:a", "pcm_f32le" if rate == SR else "pcm_s16le", dst]
    run(cmd)


def load(path):
    sr, x = wavfile.read(path)
    if x.dtype != np.float32:
        x = x.astype(np.float32) / (32768.0 if x.dtype == np.int16 else 1.0)
    return x if x.ndim == 1 else x.mean(axis=1)


def frames_db(x, hop=0.01):
    n = int(hop * SR)
    m = len(x) // n
    f = x[: m * n].reshape(m, n)
    return 20 * np.log10(np.sqrt((f ** 2).mean(axis=1)) + 1e-9)


def speech_pieces(x, merge=1.0, least=0.2):
    """Stretches of speech, split where the pause is longer than `merge` seconds (a line's own commas are shorter)."""
    db = frames_db(x)
    floor = np.percentile(db, 15)
    peak = np.percentile(db, 99.5)
    thr = max(floor + 10, min(floor + 18, peak - 32))
    on = db > thr
    runs, start = [], None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        if (not v or i == len(on) - 1) and start is not None:
            runs.append([start * 0.01, (i + 1) * 0.01])
            start = None
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < merge:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    out = [r for r in merged if r[1] - r[0] >= least]
    # A little room either side, so no consonant is clipped.
    for i, r in enumerate(out):
        lo = out[i - 1][1] + 0.05 if i else 0
        hi = out[i + 1][0] - 0.05 if i + 1 < len(out) else len(x) / SR
        r[0], r[1] = max(lo, r[0] - 0.09), min(hi, r[1] + 0.16)
    return out, thr


def plain(text):
    t = text.lower().replace("push-ups", "push ups").replace("dayhub", "day hub").replace("…", " ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z' ]", " ", t)).strip()


def phrases_for(lines):
    """Each line in plain words, and each of its sentences, so a stumble part-way still says which line it was."""
    out = {}
    for i, text in enumerate(lines):
        out.setdefault(plain(text), set()).add(i)
        for part in re.split(r"[.!?…,]", text):
            p = plain(part)
            if len(p.split()) >= 2:
                out.setdefault(p, set()).add(i)
    return out


def recognize(pieces_audio, phrases, work):
    files = []
    for k, a in enumerate(pieces_audio):
        f = os.path.join(work, f"piece{k:02d}.wav")
        pad = np.zeros(int(0.3 * 16000), dtype=np.int16)
        a16 = np.interp(np.arange(0, len(a), SR / 16000), np.arange(len(a)), a)
        a16 = np.clip(a16 / max(1e-6, np.abs(a16).max()) * 0.7 * 32767, -32768, 32767).astype(np.int16)
        wavfile.write(f, 16000, np.concatenate([pad, a16, pad]))
        files.append(f)
    pj, fj, oj = (os.path.join(work, n) for n in ("phrases.json", "pieces.json", "heard.json"))
    with open(pj, "w") as f:
        json.dump(sorted(phrases), f)
    with open(fj, "w") as f:
        json.dump(files, f)
    run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", os.path.join(HERE, "recognize.ps1"), fj, pj, oj])
    with open(oj, encoding="utf-8-sig") as f:
        heard = json.load(f)
    if isinstance(heard, dict):
        heard = [heard]
    return [(h.get("text") or "", float(h.get("conf") or 0)) for h in heard]


def assign(pieces, labels, n):
    """Pieces in the order they were said, to lines 0..n-1 read in order. A piece heard as the line just placed is a
    retake and replaces it; one heard as nothing is taken as the next line (a stumble then gets replaced by its
    retake, which is heard as that line)."""
    taken, k = {}, 0
    for p, lab in zip(pieces, labels):
        if lab and (k - 1) in lab and k not in lab and (k - 1) in taken:
            taken[k - 1] = p
            continue
        if lab and k not in lab:
            ahead = sorted(j for j in lab if j > k)
            if ahead:
                k = ahead[0]
        if k >= n:
            if lab and (n - 1) in lab:
                taken[n - 1] = p
            continue
        taken[k] = p
        k += 1
    return taken


def tempo(a, factor, work, k):
    src, dst = os.path.join(work, f"t{k}a.wav"), os.path.join(work, f"t{k}b.wav")
    wavfile.write(src, SR, a.astype(np.float32))
    decode(src, dst, f"atempo={factor:.4f}")
    return load(dst)


def main(recording, cues_file, out):
    with open(cues_file) as f:
        cues = json.load(f)
    dur = float(cues["dur"])
    vo = [c for c in cues["cues"] if c["kind"] == "vo"]
    stop = next((c["t"] for c in cues["cues"] if c["kind"] == "rec-stop"), None)
    close = next((c["t"] for c in cues["cues"] if c["kind"] == "close"), None)
    lines = [c["text"] for c in vo]
    n = len(lines)
    work = tempfile.mkdtemp(prefix="dayhub-voice-")
    raw = os.path.join(work, "raw.wav")
    decode(recording, raw)
    x = load(raw)
    # Bring the speech to a working level, then clean it: rumble out, noise down, sibilance tamed, evened out, a
    # little presence and air, peaks held.
    pieces, thr = speech_pieces(x)
    if not pieces:
        raise SystemExit("no speech found in the recording")
    sp = np.concatenate([x[int(a * SR):int(b * SR)] for a, b in pieces])
    gain = -20 - 20 * np.log10(np.sqrt((sp ** 2).mean()) + 1e-9)
    chain = (f"volume={gain:.1f}dB,highpass=f=75,afftdn=nr=12:nf=-50:tn=1,deesser=i=0.35,"
             "acompressor=threshold=0.1:ratio=3:attack=6:release=120:makeup=2,"
             "equalizer=f=200:t=q:w=1:g=-1.5,equalizer=f=3200:t=q:w=1.2:g=2.5,equalizer=f=9500:t=h:w=1:g=1.5,alimiter=limit=0.89")
    clean = os.path.join(work, "clean.wav")
    decode(raw, clean, chain)
    y = load(clean)
    audio = [y[int(a * SR):int(b * SR)] for a, b in pieces]
    phrases = phrases_for(lines)
    heard = recognize(audio, phrases, work)
    labels = [phrases.get(t) if t else None for t, _ in heard]
    taken = assign(pieces, labels, n)
    missing = [i for i in range(n) if i not in taken]
    print(f"recording: {len(x) / SR:.1f} s, {len(pieces)} pieces of speech")
    for (a, b), (t, c) in zip(pieces, heard):
        print(f"  {a:6.2f}-{b:6.2f}  heard: {t or '(nothing)'} {f'({c:.2f})' if t else ''}")
    if missing:
        print("missing lines:", ", ".join(f"{i + 1} ({lines[i][:30]}…)" for i in missing))

    track = np.zeros(int(dur * SR) + SR, dtype=np.float32)
    report, prev_end, words = [], 0.0, None
    for i in range(n):
        if i not in taken:
            continue
        a, b = taken[i]
        seg = y[int(a * SR):int(b * SR)].copy()
        cue = vo[i]["t"]
        nxt = vo[i + 1]["t"] if i + 1 < n else dur - 0.5
        # Where the line must end: before the next line, and for the member's line before the screen moves on to
        # the list; the check-it line ends by the time the day closes.
        end_by = nxt - 0.1
        if vo[i]["who"] == "member" and stop is not None:
            end_by = min(end_by, stop - 0.05)
        if "logged" in lines[i] or "then tap" in lines[i]:
            end_by = min(end_by, (close or nxt) - 0.05)
        start = max(cue - 0.15, prev_end + 0.08) if vo[i]["who"] != "member" else cue
        slot = end_by - start
        length = len(seg) / SR
        factor = 1.0
        if length > slot:
            factor = min(FAST, length / slot)
            seg = tempo(seg, factor, work, i)
            length = len(seg) / SR
        over = max(0.0, length - slot)
        fade_in, fade_out = int(0.012 * SR), int(0.05 * SR)
        seg[:fade_in] *= np.linspace(0, 1, fade_in)
        seg[-fade_out:] *= np.linspace(1, 0, fade_out)
        s0 = int(round(start * SR))
        track[s0:s0 + len(seg)] += seg[: len(track) - s0]
        prev_end = start + length
        if vo[i]["who"] == "member":
            # The words on screen follow the voice: from its first syllable to its last.
            words = (round(start + 0.09 - 0.05, 2), round(start + length - 0.2, 2))
        report.append({"line": i + 1, "text": lines[i], "start": round(start, 2), "end": round(start + length, 2), "faster": round(factor, 3), "over": round(over, 2)})
    track = track[: int(dur * SR)]
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    wavfile.write(out, SR, track)
    for r in report:
        flag = f", {r['faster']:.0%} speed" if r["faster"] > 1.001 else ""
        flag += f", OVER by {r['over']:.2f} s" if r["over"] > 0.02 else ""
        print(f"line {r['line']:2d} at {r['start']:5.2f}-{r['end']:5.2f} s{flag}: {r['text'][:48]}")
    base = next((c for c in cues["cues"] if c["kind"] == "vo" and c["who"] == "member"), None)
    if words and base:
        print(f"words on screen: &words={words[0]},{words[1]}")
    with open(os.path.splitext(out)[0] + ".json", "w") as f:
        json.dump({"lines": report, "missing": [i + 1 for i in missing], "words": words}, f, indent=1)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
