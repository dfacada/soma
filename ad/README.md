# Dayhub's ad

An animated ad for Dayhub, made from the real app:
- the real screens from the screenshot rig, showing its made-up member;
- the landing page's 3D orb and the app's type and colours;
- drawn hands and everyday places, never photos of people.

It comes in four files, each with burned-in text and an original soundtrack: 30 and 15 seconds, each in 9:16 (Reels,
TikTok, Shorts) and 16:9 (YouTube, the website). The voiceover script is in `VOICEOVER.md`; the pack for a lifelike
version with real people is in `PRODUCTION.md`.

The rendered files live in `ad/out/` and stay out of git (`ad/.gitignore`).

## What's where

- `index.html`, `ad.css`, `ad.js`: the ad as a web page. Every frame is a pure function of time: `AD.seek(t)` lays out
  that moment, so frames render exactly whatever the machine's speed. Open `ad/index.html?cut=30&shape=vertical&t=11.5`
  through a local server to look at one moment (`?shape=wide`, `?cut=15`).
- `orb.js`: Today's orb, the landing page's WebGL shader (`site/public/orb.js`), drawn at an exact time.
- `art.js`: the drawings: hands round the phone in five skin tones, an evening street, a dinner table from above, a
  room at night, a morning window, a living-room floor, a push-up.
- `render.mjs`: headless Chrome, frame by frame, into ffmpeg (H.264, BT.709, 30 fps). It also makes stills, writes the
  sound cues, and lays the soundtrack under a video with its loudness set (two-pass, −14 LUFS or as close as keeps true
  peaks under −1.5 dBTP).
- `sound.py`: the soundtrack, made in code, so there is nothing to license: a bed in D major at 109 beats a minute
  (one bar is one 2.2 s beat of the montage), with the screen's sounds on the picture's own cues.
- `stitch.py`: joins the rig's scrolled frames into tall screens, so the phone can scroll for real, and cuts out the
  floating tab bar to sit over them.
- Fonts come from `site/public/fonts/`, the screens from `shots/site/` and `shots/ad/` (both gitignored, made below).

## Making the files

Needs ffmpeg on the PATH, Chrome, Python with numpy, scipy and Pillow, and `npm run dev` running for the rig.

```bash
npm run shots -- --only today,today-closed,sheet-say-day,moment-day,moment-day-check,moment-closed,journal,food,moment-food,activity,insights,insights-try-sleep,settings-privacy,settings-closes,moment-record --themes night --out shots/site
python ad/stitch.py
node ad/render.mjs --cut 30 --cues
node ad/render.mjs --cut 15 --cues
python ad/sound.py ad/out/dayhub-30s-vertical.cues.json ad/out/dayhub-30s.wav
python ad/sound.py ad/out/dayhub-15s-vertical.cues.json ad/out/dayhub-15s.wav
node ad/render.mjs --cut 30 --shape vertical
node ad/render.mjs --mux ad/out/dayhub-30s-vertical-silent.mp4 --audio ad/out/dayhub-30s.wav --out ad/out/Dayhub-ad-30s-9x16.mp4
```

The last two lines go once for each cut and shape. A 30-second cut takes about six minutes on four pages.

- **Stills to look at:** `node ad/render.mjs --cut 30 --shape wide --still 2.6,11.9`, into `ad/out/stills/`.
- **Screen plates for a shoot:** add `--query plate=1`, with `--from`, `--to` and `--out`. A plate is the phone's
  screen alone, 1080 × 2330, with no hand, frame, words or taps.

## Keeping it true

- **Every line on screen says what the app does today.**
  - The privacy words follow `src/lib/privacy-view.ts`, the app's `/privacy` page and Say your day's first-tap sheet.
  - The headlines are the landing page's, which were checked against the code.
  - When any of those change, change the ad.
- **The pitch line.** "Say your day in a minute. Dayhub logs it…" lost "logs it": nothing is logged until Fill in my
  day. The ad says "Check it. Nothing is logged until you tap." instead.
- **The people are drawings,** and the end card says the screens show a made-up member. No testimonials, numbers of
  users or ratings, and no web address until the domain is live.
- **What the member says** names only the three things the list on screen shows (the salmon dinner, the wine, the
  push-ups), so the list never shows something that wasn't said.

## When the domain is live

Add the address to the end card in `ad.js` (`ctaWrap`), and render again. The words leave room for a line under
Request an invite.
