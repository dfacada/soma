# Catalyst spike — prove the four unknowns before building screens

Budget: 2–3 days. Each item has a pass condition. If pre-signed uploads or the job budget fail, stop and pick the fallback before writing more code.

## Setup (David, interactive)

```bash
catalyst --version          # 1.27.2 installed globally on this machine
catalyst login              # opens a browser; use the Zoho account that will own Soma
catalyst init               # in this catalyst/ folder: pick Functions (Advanced I/O, Node), Client
```

Create a project named **soma** in the Catalyst console (US DC). Enable **Stratus** if it is behind an early-access switch; request **Job Scheduling** if not visible.

## 1. Static hosting on Slate

Pass: `npm run build` in the repo root produces `out/`, Slate serves it at `/`, and `manifest.webmanifest` is served with `application/manifest+json`.

- Connect the GitHub repo to Slate; framework Next.js; build `npm run build`; output `out`.
- If Slate insists on a framework build and refuses a static folder, that is still a pass (we have a build). If it cannot serve `out/` at all, fallback is classic Web Client Hosting for dev and Slate revisited later.
- Add custom domain `soma.davidfacada.com`; note the CNAME target Slate gives you. Add that CNAME at the davidfacada.com DNS host. SSL is issued by Slate.

## 2. Auth session reaches the API

Pass: embedded email sign-up + sign-in works on the Slate-hosted page, and `GET /server/soma_api/me` returns the caller's user id and email.

- Authentication → Embedded, email + password, sign-up allowed, Custom User Validation function that allow-lists nobody yet (returns pending) — this is the approval flow Macros had.
- In `functions/soma_api`, `catalyst.initialize(req)` then `userManagement().getCurrentUser()`. Confirm it works from the Slate origin and from a custom domain.

## 3. Pre-signed Stratus uploads from the browser

Pass: a 25 MB file uploads from the browser straight to a Stratus bucket via a URL minted by the API, and downloads the same way. Bucket CORS allows the app origin.

- Buckets: `soma-entries`, `soma-audio`, `soma-photos`, `soma-drafts` (private).
- API route `/sign` that returns N pre-signed PUT and GET URLs; note the maximum expiry allowed.
- Fallback if pre-signing is unavailable: upload through the API in ≤ 4 MB parts and assemble server-side.

## 4. Background job budget

Pass: a job submitted from `soma_api` sleeps 60 s, then writes a row to a `jobs` table with status `done`.

- Try Job Scheduling first (function job pool). Record the timeout it allows.
- Fallback: an Event function (900 s budget) triggered by a Data Store insert on `jobs`.

## Also in the spike

- Read the Node SDK docs for Data Store ZCQL and note the 10,000-char Text limit in practice (insert a 10,001-char string and confirm the error).
- Export `analyze-entry` from the Glimpse Supabase dashboard into the Glimpse repo so no function source is lost.
- Write down every number found (limits, expiries, timeouts) in `docs/HANDOFF.md` §8.

## Function skeleton

`functions/soma_api/` holds a minimal Express Advanced I/O function to grow from. `catalyst init` will want to generate `catalyst-config.json` and the function's own `package.json`; keep the handler shape below.
