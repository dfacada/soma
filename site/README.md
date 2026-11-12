# Dayhub's landing page

The public page for Dayhub: what it is, its best parts to try on the page, and a way in. It is a plain static site,
separate from the Next.js app in `src/`. `site/public/` is exactly what gets served; there is no build step.

Not deployed anywhere yet. It waits for Dayhub's own domain (see "Deploying it" below). Until then it is previewed as a
private Artifact on claude.ai.

## What's where

- `public/index.html`: the page.
- `public/site.css`: the styles, on the app's own tokens (`src/app/globals.css`): Dayhub Night first, Light on bone.
- `public/site.js`: the demos, the 3D phones and the theme. **`APP_URL` at its top is the app's address**, the one place
  it is written: every Request an invite, I have an account, Privacy and Terms link takes it from there.
- `public/orb.js`: Today's orb in WebGL, one fragment shader and no library. The CSS orb under it stays when WebGL
  can't run.
- `public/shots/`: real screens of the app, Night and Light, from the screenshot rig's made-up member.
- `public/fonts/`: the app's three typefaces, the Latin files the app itself ships, with their licence (`OFL.txt`).
- `public/.catalyst/slate-config.toml`: tells Slate this is a static site.
- `tools/serve.mjs`, `tools/shots.mjs`, `tools/preview.mjs`: below.

## Looking at it

- On this machine: `node site/tools/serve.mjs`, then http://localhost:4400 (or `preview_start dayhub-site`).
- On a phone, before there is an address: `node site/tools/preview.mjs <folder>` writes an Artifact version of the page
  (the head, the stylesheet with its fonts inlined, and both scripts in one fragment) and copies the screens beside it.
  Publish `<folder>/index.html` as an Artifact with every `<folder>/shots/*` file as one of its `files`. The current
  preview is https://claude.ai/artifact/7inLjK1jT5WMcLcXjeRGc5 (private).

## Keeping it true

- **Every claim says what the app does today.** The privacy words come from `src/lib/privacy-view.ts` and the app's
  `/privacy` page, the closing switches from `Closing.tsx`, the experiment rules from `src/lib/experiment.ts`. When
  those change, change this page too.
- **The screens are real.** After the app's screens change, shoot them again and rebuild the WebP files:
  ```
  npm run shots -- --only today,today-closed,settings-closes,sheet-say-day,moment-day,moment-day-check,journal,moment-record,new-vault-code,food,moment-food,new-meal-sheet,activity,new-first-moves,insights,insights-experiment,insights-experiment-done,settings-privacy --out shots/site
  node site/tools/shots.mjs shots/site
  ```
- **The demos use the rig's made-up member** (`scripts/shots/world.ts`): the same evening, the same words for Say your
  day, the same meals and numbers, so each demo agrees with the real screen beside it. Nothing typed on the page leaves
  it: sealing a line runs the vault's own recipe (PBKDF2-SHA256 at 310,000 rounds, then AES-256-GCM) in the browser.
- **No trackers, nothing from elsewhere.** The page loads only its own files: no analytics, no font or script CDN.
  Keep it that way; the page says "no ads, no trackers".
- **The domain is not written anywhere in the repo** until it is bought and live (the repo is public).

## Deploying it (after the domain is bought; not yet)

Its own Slate app in the new Dayhub Catalyst project, on the bare domain. The app itself moves to a subdomain on move
day (18 November).

1. Set `APP_URL` in `public/site.js` to the app's new address, and check that its `/privacy/` and `/terms/` open.
2. Add the absolute `og:url` and an `og:image` to `public/index.html`, now that there is an address to put in them.
3. Add the site as a second Slate app beside the app, the way `catalyst/catalyst.json` lists the app today, with
   `public/` as its source (`"source": "../site/public"` from `catalyst/`), and deploy it with
   `catalyst deploy slate <its name> -ni`.
4. In the Slate console, for this app: switch **Cache off** under Configuration → General Settings. Otherwise Slate sends
   `cache-control: public, max-age=31536000` on every file, the page included, and a visitor's browser keeps a stale
   copy for a year (`catalyst/SPIKE.md`). Then map the bare domain under Domain Mapping.
5. Nothing in the app's allow-lists needs this address: the page calls no API, signs nobody in and fetches nothing.
