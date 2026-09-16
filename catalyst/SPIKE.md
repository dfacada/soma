# Catalyst spike — prove the four unknowns before building screens

Budget: 2–3 days. Each item has a pass condition. If pre-signed uploads or the job budget fail, stop and pick the fallback before writing more code.

## Setup (David, interactive)

```bash
npm i -g zcatalyst-cli       # run this in YOUR terminal: Claude's shells are sandboxed and global installs made there never reach the real disk
catalyst --version          # 1.27.2 at time of writing
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

## Findings log (2026-09-16)

- Project **soma** created in the console: id `120218000000014077`, org `939530195`, US DC, timezone America/New_York. `catalyst/.catalystrc` links this folder to it.
- `catalyst init -ni` only links a project. Functions are added with `catalyst functions:add --name <n> --type aio --stack node24 -ni`, which writes `catalyst.json` and `functions/<n>/catalyst-config.json`. There is no Express template flag; the scaffold is a raw `(req, res)` handler, and an Express app is exactly that, so `module.exports = app` works.
- **Deployed and verified**: `catalyst deploy --only functions:soma_api -ni` → `https://soma-939530195.development.catalystserverless.com/server/soma_api/`. `GET .../execute/health` 200 in ~0.3 s warm, ~1.5 s cold. `/execute/me` 401 when unauthenticated. The gateway passes `/execute` through to the function, so Express strips that prefix; calling `/health` without `/execute` also worked, contrary to the vendored skill notes.
- **Slate and functions are different origins.** Slate serves from `*.onslate.com` (or the mapped custom domain); functions live on `*.catalystserverless.com`. Every API call from the app must use the absolute function URL, send `Authorization: Bearer <token>` from `catalyst.auth.generateAuthToken()` (Web SDK ≥ 4.6.1), and the Slate domain must be in Authentication → Authorized Domains with CORS on. The function must not set CORS headers for those origins (the gateway does; duplicates break the browser). This replaces the "same-origin, no CORS" assumption in `docs/migration-plan.html`. Item 2 below now means: prove that token flow from the custom domain, on iOS Safari, where third-party cookies are blocked.
- **Env vars**: `catalyst deploy` overwrites a function's environment with whatever is in `catalyst-config.json`; console-set values are lost on every deploy. Secrets therefore have to be injected into `catalyst-config.json` at deploy time from a gitignored file, never committed. Decide the mechanism before the Groq/Anthropic/Fitbit keys are needed.
- Development environment caps app users at 25. Fine for 8 people; Production removes the cap.
- `getCurrentUser()` returns null for console collaborators; only registered app users count. David must sign up as an app user like everyone else.
- Zoho's official agent skills are vendored in `.claude/skills/` (see `CATALYST-SKILLS-SOURCE.md`). Their "hard stop without Zoho MCP" gate does not apply here; the CLI path works and is what we use. Zoho MCP (mcp.zoho.com) is optional and would only save console clicks for table creation.

## Function skeleton

`functions/soma_api/` is the deployed Express Advanced I/O function: `/health` (public), `/me` and `/sign` (require an app-user session). `/sign` mints pre-signed Stratus URLs with `bucket.generatePreSignedUrl(key, 'PUT'|'GET', { expiryIn: 900 })` under admin scope and only for keys under the caller's own `<user_id>/` prefix. Buckets must exist first: `soma-entries`, `soma-audio`, `soma-photos`, `soma-drafts`.
