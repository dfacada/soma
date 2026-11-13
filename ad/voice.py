"""Puts a narrator's own recording under the ad.

A recording of the script's lines (VOICEOVER.md), read in order with a pause between them, retakes allowed, becomes a
bank: each line cleaned up and kept as its own file. A cut's voice track is then made from one bank or several (a
later one's lines replace an earlier one's, so a few lines can be redone in a second memo), each line where its words
come up on screen. sound.py mixes the track in over the music, lowered under it.

    python ad/voice.py bank <recording> ad/out/voice/bank1 --cues <cues-30> --cues <cues-15>
    python ad/voice.py bank <recording> ad/out/voice/bank1 --takes lines.json     where each line is, by hand
    python ad/voice.py place <cues-30> ad/out/voice/voice-30.wav ad/out/voice/bank1 [ad/out/voice/bank2]

Reading order for a bank: the first cut's lines, then the lines later cuts add (for both cuts, the 30-second lines,
then the two only the 15-second one has). To tell a retake from the take before it, Windows' own speech recognizer
listens to each piece for the script's lines (ad/recognize.ps1). Nothing leaves this computer. If a noise hides the
pauses, give the lines' rough places by hand (`--takes`, a JSON of line text to [from, to] seconds).

`place` prints where each line landed, any it had to speed up (at most 8%), anything still too long, and the
`words=` that makes the member's words on screen follow the voice (render.mjs takes it in `--query`). A cut can be
retimed around a voice with `--query T=...&beats=...` (ad.js).

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


def denoise(x, floor_db=-18.0, rt60=None):
    """Lowers steady background noise (a fan, an engine, a room): a Wiener filter whose noise estimate follows the
    quietest moments of each frequency over the last second and a half, so it adapts when a noise starts or stops,
    with a floor so the voice never turns watery. Given the room's reverberation time (rt60, seconds), it also takes
    out the room's late echo: what each frequency held 50 ms earlier, decayed as that room decays, counts as
    interference too (late reverberation suppression, after Lebart, Boucher and Denbigh)."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    from scipy.signal import istft, stft
    n, hop = 1024, 256
    _, _, X = stft(x, fs=SR, window="hann", nperseg=n, noverlap=n - hop)
    P = np.abs(X) ** 2
    Ps = uniform_filter1d(P, size=5, axis=1)
    N = minimum_filter1d(Ps, size=int(1.5 * SR / hop), axis=1, mode="nearest") * 2.0
    N = uniform_filter1d(N, size=int(0.3 * SR / hop), axis=1)
    if rt60:
        d = max(1, int(round(0.05 * SR / hop)))
        decay = np.exp(-2 * (3 * np.log(10) / rt60) * d * hop / SR)
        late = np.zeros_like(Ps)
        late[:, d:] = decay * Ps[:, :-d]
        N = N + late
    gmin = 10 ** (floor_db / 20)
    G = np.empty(P.shape, dtype=np.float32)
    prev = np.ones(P.shape[0])
    for k in range(P.shape[1]):
        post = P[:, k] / np.maximum(N[:, k], 1e-14)
        prio = 0.98 * prev + 0.02 * np.maximum(post - 1, 0)
        g = np.maximum(prio / (1 + prio), gmin)
        G[:, k] = g
        prev = g * g * post
    _, y = istft(X * G, fs=SR, window="hann", nperseg=n, noverlap=n - hop)
    return y[: len(x)].astype(np.float32)


def expand(y, below=28.0, ratio=2.0, open_s=0.002, close_s=0.08):
    """Downward expansion: whatever falls more than `below` dB under the voice's own level (the room's tail after a
    word, a breath) goes down further, `ratio` dB for each dB, so the voice sounds close. It opens at once for a
    word and closes gently after it, so nothing chatters."""
    hop = SR // 1000
    m = len(y) // hop
    env = 20 * np.log10(np.sqrt((y[: m * hop].reshape(m, hop) ** 2).mean(axis=1)) + 1e-9)
    ref = np.percentile(env[env > env.max() - 50], 90)
    want = np.minimum(0.0, (env - (ref - below)) * (ratio - 1))
    want = np.maximum(want, -30.0)
    g = np.empty(m)
    cur = 0.0
    a_open, a_close = np.exp(-1 / (open_s * 1000)), np.exp(-1 / (close_s * 1000))
    for i in range(m):
        k = a_open if want[i] > cur else a_close
        cur = want[i] + (cur - want[i]) * k
        g[i] = cur
    gain = np.interp(np.arange(len(y)) / hop, np.arange(m), 10 ** (g / 20))
    return (y * gain).astype(np.float32)


def refine(x, a, b):
    """The speech inside a window given by hand: from where the voice band first rises clear of the background to
    where it last does, with a little room either side."""
    from scipy.signal import butter, sosfilt
    seg = x[int(a * SR):int(b * SR)]
    band = sosfilt(butter(4, [900, 4000], "band", fs=SR, output="sos"), seg)
    hop = int(0.01 * SR)
    m = len(band) // hop
    db = 20 * np.log10(np.sqrt((band[: m * hop].reshape(m, hop) ** 2).mean(axis=1)) + 1e-9)
    on = np.nonzero(db > np.percentile(db, 10) + 12)[0]
    if not len(on):
        return a, b
    return max(a, a + on[0] * 0.01 - 0.08), min(b, a + (on[-1] + 1) * 0.01 + 0.18)


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


def assign(pieces, labels, texts):
    """Pieces in the order they were said, to the lines in the order they were read. The best monotonic alignment:
    each piece is a line at or after the one before it, or nothing (a cough, a false start). It is scored by what the
    recognizer heard and by how long each piece runs against its line's expected length, with a cost for every line
    left out. A line said more than once keeps its last take."""
    n, m = len(texts), len(pieces)
    expect = [max(0.8, 0.068 * len(plain(t))) for t in texts]

    def fit(i, j):
        lab, d = labels[i], pieces[i][1] - pieces[i][0]
        s = (4.0 if j in lab else -3.0) if lab else 0.0
        return s - 1.5 * abs(np.log(max(d, 0.1) / expect[j]))

    def junk(i):
        return -2.5 if labels[i] else -0.8

    SKIP = 3.0
    NEG = -1e18
    # best[i][j + 1]: the best score once pieces 0..i are placed, the last line used being j (-1: none yet).
    best = np.full((m + 1, n + 1), NEG)
    back = {}
    best[0][0] = 0.0
    for i in range(m):
        for j in range(-1, n):
            here = best[i][j + 1]
            if here <= NEG / 2:
                continue
            # This piece is nothing.
            v = here + junk(i)
            if v > best[i + 1][j + 1]:
                best[i + 1][j + 1] = v
                back[(i + 1, j)] = (j, None)
            # This piece is line k: a retake of j (k == j) or a later line, the ones between left out.
            for k in range(max(j, 0), n):
                v = here + fit(i, k) - SKIP * max(0, k - j - 1)
                if v > best[i + 1][k + 1]:
                    best[i + 1][k + 1] = v
                    back[(i + 1, k)] = (j, k)
    ends = [best[m][j + 1] - SKIP * (n - 1 - j) for j in range(-1, n)]
    j = int(np.argmax(ends)) - 1
    taken = {}
    for i in range(m, 0, -1):
        prev, line = back[(i, j)]
        if line is not None and line not in taken:
            taken[line] = pieces[i - 1]
        j = prev
    return taken


def tempo(a, factor, work, k):
    src, dst = os.path.join(work, f"t{k}a.wav"), os.path.join(work, f"t{k}b.wav")
    wavfile.write(src, SR, a.astype(np.float32))
    decode(src, dst, f"atempo={factor:.4f}")
    return load(dst)


def place(cues, lines, work, out, tag):
    """One cut's voice track: each of its lines from the bank, where its words come up on screen."""
    dur = float(cues["dur"])
    vo = [c for c in cues["cues"] if c["kind"] == "vo"]
    stop = next((c["t"] for c in cues["cues"] if c["kind"] == "rec-stop"), None)
    close = next((c["t"] for c in cues["cues"] if c["kind"] == "close"), None)
    track = np.zeros(int(dur * SR) + SR, dtype=np.float32)
    report, prev_end, words, missing = [], 0.0, None, []
    for i, c in enumerate(vo):
        text = c["text"]
        if text not in lines:
            missing.append(text)
            continue
        seg = lines[text].copy()
        nxt = vo[i + 1]["t"] if i + 1 < len(vo) else dur - 0.5
        # Where the line must end: before the next line; the member's line before the screen moves on to the list;
        # the check-it line just after the day closes.
        end_by = nxt - 0.1
        if c["who"] == "member" and stop is not None:
            end_by = min(end_by, stop - 0.05)
        if "logged" in text or "then tap" in text:
            end_by = min(end_by, (close or nxt) + 0.2)
        start = max(c["t"] - 0.15, prev_end + 0.08) if c["who"] != "member" else c["t"]
        slot = end_by - start
        length = len(seg) / SR
        factor = 1.0
        if length > slot:
            factor = min(FAST, length / slot)
            seg = tempo(seg, factor, work, f"{tag}{i}")
            length = len(seg) / SR
        over = max(0.0, length - slot)
        fade_in, fade_out = int(0.012 * SR), int(0.05 * SR)
        seg[:fade_in] *= np.linspace(0, 1, fade_in)
        seg[-fade_out:] *= np.linspace(1, 0, fade_out)
        s0 = int(round(start * SR))
        track[s0:s0 + len(seg)] += seg[: len(track) - s0]
        prev_end = start + length
        if c["who"] == "member":
            # The words on screen follow the voice: from its first syllable to its last.
            words = (round(start + 0.04, 2), round(start + length - 0.2, 2))
        report.append({"line": i + 1, "text": text, "start": round(start, 2), "end": round(start + length, 2), "faster": round(factor, 3), "over": round(over, 2)})
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    wavfile.write(out, SR, track[: int(dur * SR)])
    print(f"{os.path.basename(out)} ({dur:.0f} s):")
    for r in report:
        flag = f", {r['faster']:.0%} speed" if r["faster"] > 1.001 else ""
        flag += f", OVER by {r['over']:.2f} s" if r["over"] > 0.02 else ""
        print(f"  line {r['line']:2d} at {r['start']:5.2f}-{r['end']:5.2f} s{flag}: {r['text'][:48]}")
    if missing:
        print("  missing:", " | ".join(m[:40] for m in missing))
    if words:
        print(f"  member's words on screen: words={words[0]},{words[1]}")
    with open(os.path.splitext(out)[0] + ".json", "w") as f:
        json.dump({"lines": report, "missing": missing, "words": words}, f, indent=1)


def clean(recording, work):
    """The recording decoded, brought to a working level and cleaned for a voice that sounds close: background
    noise and the room's echo lowered (adaptively, so a noise that starts part-way is followed), rumble and
    sibilance out, a warm tone, evened, the tail between words pushed back down. Returns it, with where its speech
    is."""
    raw = os.path.join(work, "raw.wav")
    decode(recording, raw)
    x = load(raw)
    pieces, _ = speech_pieces(x)
    if not pieces:
        raise SystemExit("no speech found in " + recording)
    sp = np.concatenate([x[int(a * SR):int(b * SR)] for a, b in pieces])
    gain = -20 - 20 * np.log10(np.sqrt((sp ** 2).mean()) + 1e-9)
    level = os.path.join(work, "level.wav")
    wavfile.write(level, SR, denoise(x * 10 ** (gain / 20), rt60=0.5))
    # Close and warm: a little chest, the boxy room around 400 Hz down, presence for the words, a breath of air.
    chain = ("highpass=f=75,equalizer=f=140:t=q:w=0.9:g=2,equalizer=f=420:t=q:w=1.3:g=-3,"
             "equalizer=f=2800:t=q:w=1:g=2.5,equalizer=f=10500:t=h:w=0.8:g=1.5,deesser=i=0.4,"
             "acompressor=threshold=0.063:ratio=3:attack=4:release=90:makeup=3")
    out = os.path.join(work, "clean.wav")
    decode(level, out, chain)
    # The compressor lifts the room's tail along with the quiet words; the expander takes the tail back down.
    y = expand(load(out))
    return x, (y / max(1e-6, np.abs(y).max()) * 0.89).astype(np.float32), pieces


def lines_in_order(cues_files):
    """Every distinct line of these cuts, in the order a recording of them reads: the first cut's, then each later
    cut's that the earlier ones didn't have."""
    order = []
    for cf in cues_files:
        with open(cf) as f:
            for c in json.load(f)["cues"]:
                if c["kind"] == "vo" and c["text"] not in order:
                    order.append(c["text"])
    return order


def bank(recording, bank_dir, order, takes_file=None):
    """Cuts a recording into its lines, one cleaned file each, into bank_dir (index.json says which is which)."""
    work = tempfile.mkdtemp(prefix="dayhub-voice-")
    x, y, pieces = clean(recording, work)
    if takes_file:
        # Where each line is, given by hand (a recording whose pauses a noise hides): refined to its speech.
        with open(takes_file) as f:
            given = json.load(f)
        takes = {t: (w[0], w[1]) if len(w) > 2 and w[2] == "exact" else refine(y, *w[:2]) for t, w in given.items()}
        print(f"{os.path.basename(recording)}: {len(x) / SR:.1f} s, {len(takes)} lines given by hand")
    else:
        phrases = phrases_for(order)
        heard = recognize([y[int(a * SR):int(b * SR)] for a, b in pieces], phrases, work)
        labels = [phrases.get(t) if t else None for t, _ in heard]
        taken = assign(pieces, labels, order)
        print(f"{os.path.basename(recording)}: {len(x) / SR:.1f} s, {len(pieces)} pieces of speech, {len(order)} lines expected")
        for (a, b), (t, c) in zip(pieces, heard):
            print(f"  {a:6.2f}-{b:6.2f}  heard: {t or '(nothing)'} {f'({c:.2f})' if t else ''}")
        takes = {order[i]: p for i, p in taken.items()}
    os.makedirs(bank_dir, exist_ok=True)
    index = {}
    for k, (text, (a, b)) in enumerate(takes.items()):
        name = f"line{k:02d}.wav"
        wavfile.write(os.path.join(bank_dir, name), SR, y[int(a * SR):int(b * SR)])
        index[text] = {"file": name, "from": round(a, 2), "to": round(b, 2)}
    with open(os.path.join(bank_dir, "index.json"), "w") as f:
        json.dump(index, f, indent=1)
    missing = [t for t in order if t not in takes]
    print(f"  bank: {len(index)} lines" + (f"; not in it: {' | '.join(m[:36] for m in missing)}" if missing else ""))


def place_from(cues_file, out, banks):
    """A cut's voice track from one or more banks; a line in a later bank replaces the same line in an earlier one."""
    lines = {}
    for b in banks:
        with open(os.path.join(b, "index.json")) as f:
            for text, e in json.load(f).items():
                lines[text] = load(os.path.join(b, e["file"]))
    with open(cues_file) as f:
        cues = json.load(f)
    place(cues, lines, tempfile.mkdtemp(prefix="dayhub-place-"), out, "p")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["bank"] and len(a) >= 3:
        opts, rest, i = {}, [], 1
        while i < len(a):
            if a[i] in ("--takes", "--cues", "--order"):
                opts.setdefault(a[i], []).append(a[i + 1])
                i += 2
            else:
                rest.append(a[i])
                i += 1
        recording, bank_dir = rest
        # A memo of a few redone lines reads them in its own order: --order, a JSON list of the lines as said.
        if opts.get("--order"):
            with open(opts["--order"][0], encoding="utf-8") as f:
                order = json.load(f)
        else:
            order = lines_in_order(opts.get("--cues", []))
        bank(recording, bank_dir, order, (opts.get("--takes") or [None])[0])
    elif a[:1] == ["place"] and len(a) >= 4:
        place_from(a[1], a[2], a[3:])
    else:
        raise SystemExit(__doc__)
