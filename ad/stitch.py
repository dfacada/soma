"""Tall screens for the ad, so the phone can scroll for real.

The screenshot rig shoots a long page as frames, each scrolled 724 CSS px (1,448 px at 2x) past the last, the last one
less if the page ends. This finds each overlap exactly, joins the frames into one tall image, and cuts out the
floating tab bar (with see-through corners) to lay over it while it scrolls.

    python ad/stitch.py                 reads shots/site, writes shots/ad/<screen>.long.png, .tab.png and long.json
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "shots", "site")
OUT = os.path.join(ROOT, "shots", "ad")
SCREENS = ["activity", "insights", "settings-privacy", "journal", "food", "today"]


def frames(name):
    files = [os.path.join(SRC, f"{name}.night.png")]
    k = 2
    while os.path.exists(os.path.join(SRC, f"{name}.night.{k}.png")):
        files.append(os.path.join(SRC, f"{name}.night.{k}.png"))
        k += 1
    return [Image.open(f).convert("RGB") for f in files]


def overlap(a, b, rows=70):
    """How far b is scrolled past a: b's top rows matched against a's lower rows, exactly."""
    A = np.asarray(a.convert("L"), dtype=np.float32)
    B = np.asarray(b.convert("L"), dtype=np.float32)
    best = None
    for dy in range(600, A.shape[0] - rows):
        d = float(np.abs(A[dy:dy + rows] - B[:rows]).mean())
        if best is None or d < best[0]:
            best = (d, dy)
    if best[0] > 0.5:
        raise SystemExit(f"frames do not line up (best {best})")
    return best[1]


def tab_bounds(frs):
    """The floating tab bar (top 1534, bottom 1664 at 2x): the straight run of its top hairline on row 1536, then
    half its height on each side for the round ends. Only what every frame shares is the bar: a card's edge under it
    in one frame is not there in the next."""
    on = np.ones(frs[0].width, dtype=bool)
    for im in frs:
        on &= np.asarray(im.convert("L"), dtype=np.float32)[1536] > 32
    best, start = (0, 0, 0), None
    for x in range(20, 761):
        if on[x] and start is None:
            start = x
        if (not on[x] or x == 760) and start is not None:
            if x - start > best[0]:
                best = (x - start, start, x)
            start = None
    # Row 1536 is a pixel into the bar's round ends, whose curve there starts 56 px in from each end (measured).
    return [max(0, best[1] - 56), 1534, min(frs[0].width, best[2] + 56), 1664]


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for name in SCREENS:
        fr = frames(name)
        if len(fr) < 2:
            continue
        offs = [0]
        for i in range(1, len(fr)):
            offs.append(offs[-1] + overlap(fr[i - 1], fr[i]))
        H = offs[-1] + fr[-1].height
        long = Image.new("RGB", (fr[0].width, H))
        for i, (im, o) in enumerate(zip(fr, offs)):
            part = im if i == len(fr) - 1 else im.crop((0, 0, im.width, offs[i + 1] - o))
            long.paste(part, (0, o))
        long.save(os.path.join(OUT, f"{name}.long.png"), optimize=True)
        x0, y0, x1, y1 = tab_bounds(fr)
        # The bar alone, from the last frame, with its rounded ends see-through (drawn 4x and scaled down, for soft edges).
        k = 4
        mask = Image.new("L", ((x1 - x0) * k, (y1 - y0) * k), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, mask.width - 1, mask.height - 1], radius=(y1 - y0) * k // 2, fill=255)
        mask = mask.resize((x1 - x0, y1 - y0), Image.LANCZOS)
        bar = fr[-1].crop((x0, y0, x1, y1)).convert("RGBA")
        bar.putalpha(mask)
        bar.save(os.path.join(OUT, f"{name}.tab.png"))
        meta[name] = {"height": H, "offsets": offs, "tab": [x0, y0, x1, y1]}
        print(name, "frames", len(fr), "offsets", offs, "height", H, "tab", [x0, y0, x1, y1])
    with open(os.path.join(OUT, "long.json"), "w") as f:
        json.dump(meta, f, indent=1)


if __name__ == "__main__":
    sys.exit(main())
