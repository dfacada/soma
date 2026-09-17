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
- **Stratus pre-signed URLs work** (item 3, server side): `generatePreSignedUrl` under admin scope returns `https://<bucket>-development.zohostratus.com/_signed/...`; a 25 MB PUT with `overwrite: true` took ~5.6 s from this machine, the GET ~2.1 s, bytes identical. Expiry option is `expiryIn` seconds (min 30, max 7 days per SDK notes).
- **Browsers need two CORS allow-lists, both console-only.** (a) The function gateway answers `OPTIONS` itself with 200 and no CORS headers and never forwards preflights to the function, so the localhost CORS middleware in code only affects simple requests. Any origin that calls the API from a browser must be in Authentication → Authorized Domains with CORS on. (b) Each Stratus bucket has its own CORS list under the bucket's Configurations → Bucket CORS (domain + method); without it a signed PUT from a page is blocked at preflight (403). Both lists need the Slate domain, the custom domain and `http://localhost:<port>` for dev.
- **Env vars from `catalyst-config.json` reach `process.env`** (SPIKE_KEY proved it).
- **Job Scheduling is enabled** on the account (console shows Dashboard, Job Pool, Cron, Jobs). `soma_jobs` (type job, node24) is deployed. The SDK cannot create job pools; `submitJob` with a missing pool fails with `invalid jobpool name`. Pool `soma_jobs` (Function, 256 MB) must be created in the console once.
- Zoho's official agent skills are vendored in `.claude/skills/` (see `CATALYST-SKILLS-SOURCE.md`). Their "hard stop without Zoho MCP" gate does not apply here; the CLI path works and is what we use. Zoho MCP (mcp.zoho.com) is optional and would only save console clicks for table creation.

## Findings log, continued (2026-09-16, evening)

- **Zoho MCP is connected** (`.mcp.json`, `catalyst-by-zoho`) and replaces most console clicks: job pools, tables and columns, Authorized Domains, bucket listing, auth config reads. Every call needs headers `Catalyst-org: 939530195`, `Environment: Development` and path `projectId`. Not available over MCP: **bucket CORS**, Slate cache toggle, public sign-up toggle, Custom User Validation.
- **Item 4 PASSES.** Pool `soma_jobs` (Function, 256 MB, id `120218000000019007`) created over MCP. `POST /spike/job` inserts a `jobs` row (`queued`), submits the job; `soma_jobs` slept 60 s, wrote its result to Stratus and flipped the row to `done`. `context.getMaxExecutionTimeMs()` = **900,000 ms**; execution 60.6 s; dispatch delay ~20 ms; PENDING → RUNNING in under 10 s. `submitJob` takes `jobpool_name`, string-only `params`, and `job_name` must be alphanumeric/underscore.
- **Data Store tables** created over MCP: `jobs` (`user_id` bigint, `type` varchar 40, `status` varchar 20, `result_ref` varchar 255; table id `120218000000014100`) and throwaway `spike_text` (`body` text). `insertRow`/`updateRow`/`getRow` and ZCQL all work under admin scope from both function types.
- **Text columns silently truncate at 10,000 chars. No error.** Inserting 10,001 and 50,000 chars returned success and stored exactly 10,000 (read back with `getRow`; the final marker char was gone). The insert response echoes the truncated value, which is the only signal. The API layer must enforce length itself (reject, or spill to Stratus) for anything that can grow: transcripts, analysis results, notes. ZCQL has no `LENGTH()` function.
- **Item 1 PASSES, with two caveats.** No GitHub hookup needed: `catalyst.json` has `"slate": [{ "name": "soma", "source": "../out" }]` (a relative path works, despite the vendored skill saying absolute) and `public/.catalyst/slate-config.toml` (`framework = "static"`) rides into `out/` on every `npm run build`. Deploy: `npm run build` in the repo root, then `catalyst deploy slate soma -ni` in `catalyst/` (the app name is mandatory with `-ni`). ~1 s server side. URL **`https://soma-onkasary.onslate.com`**. Directory indexes resolve with and without trailing slash. The CLI sometimes prints `HTTP Error: 404, No such deployment with the given id exists` *after* "Deploy is Live"; the deploy is fine, check the URL.
  - Caveat A: `.webmanifest` is served as `application/octet-stream`. `manifest.json` is served as `application/json`, so the manifest is **`/manifest.json`**.
  - Caveat B: **every response, HTML included, carries `cache-control: public, max-age=31536000`**, and `If-None-Match` is ignored (always 200). The edge itself is fine: a redeploy is served within seconds. The risk is browsers and installed PWAs holding `index.html` for a year. Unknown paths get Slate's own 404 page, not Next's `404.html`. To settle before the app shell ships: (1) David disables Cache under Slate → soma → Configuration → General Settings and we re-read the headers; (2) if the header stays, a service worker serves navigations network-first with `cache: 'reload'`, and the page registers `sw.js?v=<build id>` so the worker URL changes each deploy. Hashed `_next/static` assets are safe under a long max-age either way.
- **Item 2, as far as it goes without a human.** Authorized Domain `soma-onkasary.onslate.com` (CORS on, iframe on) added over MCP; the domain is given bare, without `https://`. The gateway then answers preflights from that origin with `Access-Control-Allow-Origin` + `Allow-Credentials: true` and echoes the requested headers; other origins get no CORS headers. `/__catalyst/sdk/init.js` is served on Slate (ZAID `10134228420`). The embedded sign-in iframe is **proxied through the Slate origin** (`https://soma-onkasary.onslate.com/accounts/p/...`), so the session cookie is first-party, which is what iOS Safari needs. Auth config today: embedded on, `public_signup: true`, `custom_validation: false` (approval flow not wired yet).
- **Item 3 in the browser is blocked only on bucket CORS.** A preflight to `soma-drafts-development.zohostratus.com` from the Slate origin returns 403 until the origin is added in the bucket's Configurations → Bucket CORS.
- **Spike page**: `public/spike.html` → `https://soma-onkasary.onslate.com/spike.html`. Sign up, sign in, `GET /me` three ways (raw token, `Bearer` token, cookies only: the vendored SDK notes say raw, our earlier note said Bearer; the page reports which the gateway accepts), then a 25 MB PUT/GET round trip through `/sign` with a SHA-256 compare. "Copy log" puts the whole run on the clipboard.

## What is left (needs David)

1. Bucket CORS, console only: Stratus → `soma-drafts` → Configurations → Bucket CORS → add `https://soma-onkasary.onslate.com` for GET and PUT. Repeat for the other three buckets when convenient.
2. Open `https://soma-onkasary.onslate.com/spike.html` on the iPhone in Safari. Sign up, confirm by email, sign in, tap **GET /me**, tap **Upload, download, compare**, tap **Copy log** and paste the log into the session. That closes items 2 and 3.
3. Slate → soma → Configuration → General Settings → Cache → Disable, so the headers can be re-read (caveat B).
4. Custom domain: Slate → soma → Domains → add `soma.davidfacada.com`, note the CNAME target, add it at the DNS host. Then the custom domain needs the same three allow-lists: Authorized Domains, bucket CORS, and a repeat of step 2 from that origin.
5. Export `analyze-entry` from the Glimpse Supabase dashboard.

After that: delete the `/spike/*` routes, `SPIKE_KEY`, `public/spike.html`, the `spike_text` table and `soma-drafts/spike/*` objects.

## Function skeleton

`functions/soma_api/` is the deployed Express Advanced I/O function: `/health` (public), `/me` and `/sign` (require an app-user session). `/sign` mints pre-signed Stratus URLs with `bucket.generatePreSignedUrl(key, 'PUT'|'GET', { expiryIn: 900 })` under admin scope and only for keys under the caller's own `<user_id>/` prefix. Buckets must exist first: `soma-entries`, `soma-audio`, `soma-photos`, `soma-drafts`.
