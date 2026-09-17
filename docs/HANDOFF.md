# Soma — build handoff

Written 2026-09-16 at the end of the design phase. Everything below was decided with David; treat it as settled unless he changes it.

## 1. What Soma is

A personal daily log built around **the day**. Three existing apps fold into it:

| App | What it is today | Stack | Data |
|---|---|---|---|
| Glimpse | Encrypted voice journal, check-ins (mood + habits), Fitbit, Claude pattern analysis, admin panel | Single 8,500-line HTML on Vercel | Supabase project `oxwhesgceplhfynvtyjp` (8 users, 129 entries) |
| Macros | Food log against a meal plan, weight, activity (steps, lift, run, walk, push-ups), recipes, Claude Haiku portion estimator | Next.js 16 on Vercel | Supabase project `pbxdhnoajxqobyxpprmx` |
| 100 Daily Pushup Challenge | Rounds, roster, daily push-up log, leaderboard, rest days, admin | Next.js 16 on Vercel | Shares Macros' project and `profiles` table |

Source for all three lives in `C:\Users\david\Downloads\Claude\` (`Glimpse`, `Macros`, `100 Daily Pushup Challenge`). Glimpse's recording, crypto, IndexedDB recovery tiers, Whisper worker and the September 2026 iOS screen-lock fixes should be **lifted as modules**, not rewritten.

## 2. Decisions (all approved by David)

- **Name** Soma. **URL** `https://soma-onkasary.onslate.com`, the domain Slate provides. No custom domain (decided 2026-09-16): nothing to set up, and it is already the authorized origin for auth, API CORS and bucket CORS. The origin is permanent once people install the PWA (install, session and IndexedDB drafts are all bound to it), so confirm what URL the Production environment serves **before** inviting anyone.
- **Platform** Zoho Catalyst, final. Build Soma directly there. Verified constraints: Advanced I/O functions time out at 30 s; Data Store has no row-level security; Data Store Text columns cap at 10,000 chars; Slate and functions are **different origins**, so the app calls the API by absolute URL with the raw Web SDK token in `Authorization` (no `Bearer` prefix) (see `catalyst/SPIKE.md` findings log).
- **Fresh start, no data migration** (decided 2026-09-16). Glimpse, Macros and the Push-Up Challenge stay exactly where they are on Vercel + Supabase, live, with their data. Nothing is exported, converted or deleted. Soma starts empty: everyone signs up again, creates a new vault passphrase, reconnects Fitbit, and the admin creates the round anew. See §7 for what that means in practice. Glimpse *code* is still lifted as modules; that is reuse, not migration.
- **Tabs** Today · Journal · Food · Activity · Insights, plus Settings behind the avatar. "Challenge" was renamed Activity.
- **Today** is the actionable page. Hero = 4-segment progress ring (check-in, journal, food, activity) + "N to go" + the outstanding items as pills, and a streak of **full days** (all four done) with a 7-day strip of mini rings. A closed day turns the hero dark. The sun/clock arc was tried and rejected.
- **Check-in** mood chips (Glimpse's 10-mood library, user picks which show, ≥1) and habits (daily yes/no or counters with ≥/≤ goals, max 12).
- **Journal** the Journal card on Today is the record control (tap to start, tap to stop, timer shows). Voice only; no typed notes. Floating mic exists only on the Journal tab.
- **Food** meals are planned ahead; the Today tile is a one-tap "eaten". Swaps and off-plan items happen on the Food screen. Typing a calorie target rescales protein/carbs/fat proportionally (same as the quick-set chips).
- **Activity** push-ups are entered as a **number** (sheet with −5/+5, "Hit the target", Save). Target is **per person**, default 100/day, flat. Activity's quarter of the ring fills per activity logged; the day's Activity task is satisfied once anything is logged. Activity types are user-editable (default Walk, Gym, Run). Rest days: no push-up target, streak carries.
- **Settings** phone keeps a short page; desktop (≥900px) has a sidebar layout and nine settings sections built from a line-by-line inventory of the three apps (see §6).
- **Encryption boundary** journal entries, audio, photos, Fitbit tokens encrypted client-side; food, activity, round, check-ins readable by the server.

## 3. Where the spec lives

- `docs/prototype/soma-prototype.html` — working prototype, single file, localStorage state, iPhone 17 Pro frame + desktop sidebar. Open it in a browser. Published copy: https://claude.ai/artifact/Dph2wmLtk3m35qDvyCj7EE
- `docs/design/*.dc.html` + `canvas.json` — design canvas sources (Claude Design format). Published canvas: https://claude.ai/code/artifact/53e5c6ee-63d3-4342-ba2d-95520015650e. Note: the canvas Today still shows the earlier sun-arc hero; the prototype is authoritative where they differ.
- `docs/migration-plan.html` — the earlier Glimpse-only Catalyst plan. Still the best reference for the platform constraints and the service mapping; its data-migration phases are superseded by the fresh-start decision. Published: https://claude.ai/code/artifact/99995c84-64e1-41b1-9ca8-3d8b4d0616f5
- `docs/checks/` — the two fake-DOM tap-through scripts used to verify the prototype. Reuse the approach for the real app's smoke tests.

## 4. Build plan (~7–9 weeks)

0. **Catalyst spike, 2–3 days** — see `catalyst/SPIKE.md`. Do not start screens until it passes.
1. **Design system, ~1 week** (kit built 2026-09-16: `src/components/ui/`, live at `/kit`; still to come as screens need them: chain grid, leaderboard row, day strip, hero, audio player, dark theme and the six accent palettes) — tokens and components from the prototype: card, chip, tile, medallion, ring, sheet, settings field kit, tab bar, sidebar. Storybook optional; a `/kit` route showing every component is enough.
2. **Data model + API, ~1 week** — Catalyst Express function `soma_api` (§5), Data Store tables, Stratus buckets, jobs for transcription and analysis, nightly cron for error pruning.
3. **Screens, 4–5 weeks, hardest rules first** (Today + a first Settings shell built 2026-09-17; see "Frontend as built" in §5) — Today + Settings shell → Activity (port push-up rules out of Postgres triggers into the API) → Food → Journal (lift Glimpse modules) → Insights → Admin.
4. **Beta and launch, ~1 week** — David uses it solo first, then the 8 users sign up on the onslate.com URL. The old apps stay up untouched; people move over when they are ready. No decommission step.

## 5. Data model and API (first cut)

Catalyst user IDs are numeric; every table has `user_id` BigInt. Text columns ≤ 10,000 chars.

**Data Store tables**
- `profiles` — display_name, role (admin|member), status (pending|active|disabled), timezone, units, theme, palette, last_seen, settings_json (text, the settings blob from §6)
- `vault_meta` — salt (base64), verifier_iv, verifier_ct
- `entries` — id (varchar), created_at, has_audio, audio_size, audio_mime, has_photo, photo_size, photo_mime, transcript_status (metadata only; ciphertext is a Stratus object)
- `checkins` — date, mood, habits_json, counts_json
- `day_logs` — date, meals_json (eaten flags), extras_json
- `weight` — date, value
- `activity` — date, pushups (int), types_json
- `rounds` — name, start_date, timezone, length_days, rest_days_json, bonus_hit, bonus_streak, badge_streak, badge_hits, join_open, archived_at
- `round_members` — round_id, user_id, daily_target (per person), test_number, start_day, status (active|removed), join_seq
- `day_entries` — round_id, user_id, day_index, reps
- `recipes` — payload_json
- `fitbit_daily` — date, ciphertext (small)
- `vault_tokens` — provider, ciphertext
- `errors`, `feedback`, `jobs` (id, user_id, type, status, result_ref)

**As built (2026-09-16), where it differs from the first cut above.** Tables live in Development, created over the Zoho MCP server; code is `catalyst/functions/soma_api/` (`lib/db.js` holds every query, `lib/auth.js` identity and approval, `routes/*.js` the handlers).
- Per-day tables (`checkins`, `day_logs`, `weight`, `activity`) use `day` varchar `YYYY-MM-DD` (the user's local day, chosen by the client; no server timezone maths) plus a **unique `ukey` = `<user_id>:<day>`**. Data Store has no composite unique constraint; `ukey` makes upserts race-safe and lookups direct.
- `entries` uses `entry_id` (client-generated, 8–40 URL-safe chars, unique) and `created_ms` (epoch ms bigint) instead of a datetime, because Data Store datetimes are stored in the project timezone with no offset.
- JSON columns are validated as objects and refused with **413** past 10,000 chars (Data Store would truncate silently). Emoji, accents and CJK survive both ZCQL and `insertRow` (the vendored skill note saying otherwise is out of date). Booleans come back as strings; `db.bool()` normalises.
- Nothing user-supplied is concatenated into ZCQL unless it passed a strict validator (digits, `YYYY-MM-DD`, URL-safe token). Free text and JSON only travel through `insertRow`/`updateRow`.
- Live routes: `/me`; `GET|PUT|DELETE /{checkins,day-logs,weight,activity}/:day` and `GET ?from&to` (≤300 days, partial PUT); `/vault-meta` (PUT needs `replace: true` to overwrite); `/entries` (100 a page, `?before=<createdMs>`), `PUT|DELETE /entries/:id` (delete also removes the three Stratus objects); `/sign`; `/recipes` CRUD; `POST /errors` (clips, never fails on size); `POST /feedback`; admin: `/admin/profiles` (+ `/status`, `/role`), `/admin/errors` (+ `/resolve`), `/admin/feedback` (+ `/acknowledge`).
- Not built yet: `rounds`, `round_members`, `day_entries` (with the Activity screen, where the push-up rules get designed), `fitbit_daily`, `vault_tokens`, `/jobs`, `/profiles` settings, nightly error pruning.
- Tests: `node catalyst/test-api.js` runs 41 end-to-end checks against Development as a synthetic member (`TEST_KEY` in `secrets.json`; the identity is fixed, owns no real data, can never be admin, and the bypass is off wherever `TEST_KEY` is unset, which must include Production).

**Frontend as built (2026-09-17).** `src/lib/` is framework-free: `catalyst.ts` (SDK loader, session, raw-token cache), `api.ts` (the only fetch wrapper; absolute function URL), `settings.ts` (defaults + merge; the server stores only what the user changed), `today.ts` (pure day status, streak and headline logic ported from the prototype). `src/components/app/`: `Session.tsx` (gate: loading → sign-in/sign-up → pending/disabled → ready; provides `useSession`), `Shell.tsx` (tab bar on phones, sidebar from 900px), `useDays.ts` (one `GET /days` load, optimistic edits, saves serialized per resource+day with retry and an "unsaved" banner), `Today.tsx`, `Settings.tsx`. Routes that need a user live in the `src/app/(app)/` group; `/kit` is outside it.
- New API routes: `GET|PUT /settings` (JSON blob + display name on the profile) and `GET /days?from&to&fromMs&toMs` (check-ins, day logs, activity, weight and entry metadata for a window in one round trip).
- Habits are keyed by habit **id** in `checkins.habits` (the prototype keyed by label, which breaks on rename). Counters stay keyed by id in `counts`.
- The Today streak counts closed days in the last 60; the best ever is remembered in `settings.bestStreak`.
- **Journal (built 2026-09-17, lifted from `../Glimpse/glimpse-secure.html`, which was only read, never touched).** `src/lib/vault-crypto.ts` (PBKDF2-SHA256 310k → AES-256-GCM, Glimpse's `[0x01][iv 12][ciphertext]` format for entries *and* audio; no imports, so `node scripts/test-vault.mjs` runs the same file end to end against the API and Stratus), `recovery.ts` (IndexedDB: every recorder slice is written as it arrives; the finished recording sits in `pending` until its upload succeeds), `recorder.ts` (WebM/Opus, falling back to MP4/AAC for iOS; stops and saves if the OS takes the mic), `journal.ts` (audio first, then the encrypted entry JSON, then the index row). `components/app/Journal.tsx` is one provider above all screens, so Today's Journal card, the Journal screen's mic and the sidebar button drive the same recorder and a recording survives tab changes. On unlock it adopts any orphaned draft as a "recovered" entry and retries pending uploads; it retries again when the network returns.
  - The vault key is cached in `sessionStorage` for the life of the tab (Glimpse's trade-off, kept). The passphrase cannot be reset.
  - **One bucket.** Everything lives in `soma-drafts` as `<user_id>/<kind>/<name>` with kinds `entries`, `audio`, `photos`, `drafts`. Bucket CORS is console-only and per bucket, so one bucket means one allow-list per origin. `POST /sign` takes `{ kind, names[], method }`; the caller never supplies a path. The other three buckets are unused and can be deleted.
  - Not built yet: transcription (needs a Groq key in `catalyst/secrets.json` and the `transcribe` job in `soma_jobs`; until then an entry takes a typed note), Tier 3b cloud streaming of draft chunks, photos, prompts, exports, change-passphrase.
  - Verified: crypto + Stratus round trip in Node (16 checks); in the browser with a test tone: slices land in IndexedDB while recording, stop moves them to `pending`, a reload mid-recording is recovered as a valid 3 s Opus file, a failed upload stays "waiting to upload". **Verified 2026-09-17 by David on the live site:** vault created, a real-microphone recording saved, and all three pieces landed (encrypted audio 190,362 bytes = 190,333 recorded + 29 of version, IV and GCM tag; encrypted entry JSON; index row). The recording was made on David's iPhone in the Ulaa browser, which on iOS is WebKit like every other browser there, so this covers the iOS engine (WebM/Opus means iOS 18.4 or later). Still not verified: the MP4/AAC fallback that older iOS will take, and playback of a real entry. Note for support: on iOS each browser, and an installed Home Screen app, has its own IndexedDB and sessionStorage, so a recording waiting to upload and the unlocked vault key live only in the browser that made them. Earlier note, kept for context: **not verified: a real microphone, iOS Safari, and the browser upload from the Slate origin with this code** (the spike proved that path with the same request shape; localhost is not in the bucket's CORS list so it cannot be exercised in dev).
- Differences from the prototype, on purpose: on a 375px phone the Food and Activity minis drop below the title (inline they left ~60px for the status line; they stay inline on desktop); no rest days or round day number on Today until rounds exist; the push-up target comes from `settings.pushupTarget`.
- Local dev: `npm run dev` has no Catalyst session (the SDK is only served on Slate), so `.env.development.local` (gitignored, `next dev` only, never read by `next build`) carries `NEXT_PUBLIC_DEV_TEST_KEY` and requests run as the synthetic test member. `localhost:3000` is in Authorized Domains for CORS. The function sets **no** CORS headers of its own: the gateway does it for every authorized origin and duplicates break browsers.

- **Food, Settings and Admin (built 2026-09-17).** `components/app/Days.tsx` is now a provider above all screens (one `/days` load shared by Today and Food, `weight` added as a saved resource). `Food.tsx`: calorie ring, protein/carbs/fat as real sums, four meal cards, off-plan items (quick snacks + name and kcal by hand), 30-day weight line, swap sheet listing the user's `/recipes` ahead of a starter book, with a new-recipe form. **A meal slot stores a snapshot of what was eaten** (`meals.lunch = { name, kcal, protein, carbs, fat }`), so swapping the plan never rewrites past days; a bare `true` from earlier data falls back to the current plan. `Settings.tsx`: account, moods on/off (≥1), habits (add ≤12, daily/counter, ≥/≤ goal, remove ≥1), plan presets and kcal chips that rescale macros, the four targets, quick snacks, push-up target, activity types, vault lock, feedback; everything saves on change. `Admin.tsx` (admins only, re-checked server-side): approvals, users (disable/re-enable, make admin/member, never yourself), errors, feedback. All three admin routes verified live under a real admin session.
  - Not built: the Claude food estimator (needs an Anthropic key), units other than lb/kcal, meal template editing beyond swap, steps.
  - Reports from the synthetic test member are filed as already handled, so test runs stay out of the admin inbox.

- **Activity and rounds (built 2026-09-17).** Rules are pure functions in `src/lib/round.ts`, ported from `../100 Daily Pushup Challenge/lib/domain` (read only) and pinned by `node scripts/test-round.mjs` (36 checks, including the spreadsheet's rest schedule and set breakdown).
  - **What Soma changed from the challenge app, on purpose:** the target is per person and flat (no ramp, no test number). **Points = hits × 30 + best streak × 10; total reps are not scored**, because with per-person targets counting reps would rank a 100-a-day member above a 30-a-day member for the size of the target rather than for keeping to it. Today is never a miss while it is still today. A rest day still carries the streak. *If you want reps back in the score it is one line in `memberStats`.*
  - **No `day_entries` table.** The board reads the same `activity.pushups` rows Today writes, matched to the round by calendar date, so Today, the chain grid and the leaderboard cannot disagree. Tables: `rounds`, `round_members` (`ukey` = `<round_id>:<user_id>`, `daily_target`, `start_day`, `join_seq`, `status`). A mid-round joiner starts counting from the day they join; leaving and rejoining keeps the original start day and join order.
  - Routes: `GET /rounds` (with the caller's membership), `POST|PUT /rounds` (admin), `POST /rounds/:id/join`, `PUT|DELETE /rounds/:id/me`, `DELETE /rounds/:id/members/:userId` (admin), `GET /rounds/:id/board` (members and admins only; pages past ZCQL's 300-row cap). The server does no timezone maths: the client names its own calendar date.
  - `components/app/Rounds.tsx` provides the round to every screen: in a running round Today's target is the membership's and a rest day shows as one. `Activity.tsx`: today's list, round card with progress ring and chain grid, leaderboard, join with a target, change target, and for admins a sheet to create or edit a round (name, start, length, tap-to-toggle rest days, open to join, archive).
  - Not built: steps (needs Fitbit), removing another member from the UI (route exists), round history, scoring knobs in the UI (the API accepts them), the behind/catch-up warnings from the challenge app.
  - Rounds named `__like_this__` are test fixtures and are only ever returned to the synthetic test member.

- **Insights (built 2026-09-17).** `src/lib/insights.ts` (pure, `scripts/test-insights.mjs`) counts what was actually logged over 14/30/60 days: how often each of the four tasks got done, mood mix, what good days and hard days had in common (activity against the checked-in baseline, all meals, the first "at most" counter habit over its limit), food averages, push-up totals, weight change. Under five check-ins it says there is not enough yet instead of drawing conclusions. The prototype's sleep buckets need Fitbit and its written analysis needs the Claude job; the page says so.
- **Checks.** `npm run check` = types + lint + the offline suites (`test-round`, `test-insights`). `npm run test:live` = `catalyst/test-api.js` (65 checks) + `scripts/test-vault.mjs` (16), both against Development. `scripts/ts-resolve.mjs` lets Node import the app's TypeScript as it is written.

- **Installable (2026-09-17).** Icons are the four-segment day ring on ink, drawn by `scripts/make-icons.mjs` with no image library (`public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`; `src/app/icon.png` and `apple-icon.png` for Next's conventions). `public/sw.js` does one thing: cache-first for `/_next/static/*`, because Slate serves everything `no-store` and those files are content-hashed. It never touches pages, the API, Stratus or the Catalyst SDK, so it cannot serve a stale page or get in the way of sign-in; there is no offline mode. Registered in production builds only. Verified live: second load served 14 of 14 static assets from the cache, API calls still hit the network.

- **Transcription (built 2026-09-17; needs `GROQ_API_KEY` under `soma_jobs` in `catalyst/secrets.json`, then `node catalyst/deploy.js soma_jobs`).** Opt-in per user (`settings.cloudTranscription`, default off) because it is the one place plaintext leaves the device. Flow: browser uploads the decrypted audio to `<uid>/drafts/tx-<entry>.<ext>` → `POST /jobs` → `soma_jobs` sends it to Groq `whisper-large-v3-turbo` (same call as Glimpse's `transcribe-cloud`) and writes `<uid>/drafts/tx-result-<row>.json` → browser polls `GET /jobs/:id`, reads the transcript, encrypts it into the entry, and `DELETE /jobs/:id` clears up. Runs automatically after a recording when on, and from a Transcribe button on any entry. A failed transcription is a recorded outcome on the jobs row (`error:<code>`), never a stuck "pending". At most five open jobs per user.
  - **Stratus deletes are scheduled, not immediate**: a deleted object stayed downloadable for roughly a minute or two in testing. Overwrites are immediate, so anything sensitive is **blanked, then deleted** (`shred()` in the job, the same in `DELETE /jobs/:id`). The test suite asserts the audio is unreadable the moment the job ends. The same delay applies to `DELETE /entries/:id`, where it only concerns ciphertext.
  - Verified without a key: queueing, polling, the clean `not_configured` failure, blanking, ownership checks (72 API checks). **Not verified: a real Groq call**, until a key exists.

**Stratus buckets** — `entries/{uid}/{id}.enc`, `audio/{uid}/{id}.enc`, `photos/{uid}/{id}.enc`, `drafts/{uid}/{draft}/{n}.enc` (Tier 3b chunk stream; sign URLs in batches of 100 or move to 1 s chunks). Binary format `[0x01][iv 12][ciphertext]` from Glimpse's `encAudioBin`.

**API routes (Express, one Advanced I/O function)** — `/me`, `/profiles` (admin), `/vault-meta`, `/entries`, `/checkins/:date`, `/day-logs/:date`, `/weight/:date`, `/activity/:date`, `/rounds`, `/rounds/:id/members`, `/rounds/:id/entries`, `/recipes`, `/fitbit/*`, `/sign` (batch pre-signed URLs), `/jobs` + `/jobs/:id`, `/errors`, `/feedback`, `/admin/*`. A single `withUser` middleware resolves the caller and injects `user_id` into every query; no raw ZCQL in route handlers.

**Jobs** — `transcribe` (Groq whisper-large-v3-turbo, 25 MB cap, 90 s) and `analyze` (Claude, pattern analysis and Ask). Client uploads plaintext audio to a short-lived Stratus object via pre-signed URL, enqueues, polls. This retires the stuck-in-pending class of bug.

## 6. Settings inventory (what the desktop Settings must carry)

From the three apps, plus items marked *new*:

- **Account & appearance**: display name (*no UI existed*), email, time zone, passphrase change (*Glimpse lacked it*), sign out; theme light/dark (Glimpse), six accent palettes (Macros: organic, macrofactor, balance, basecamp, bear, behance), units and energy (*new; everything was lb/kcal*).
- **Check-in**: 10 moods on/off (≥1); habits editor: add ≤12, rename, daily/counter, counter goal with at_least/at_most, remove (≥1); habits-collapsed preference.
- **Journal & vault**: cloud transcription on/off, on-device Whisper model note (base.en on phones, small.en desktop; iOS memory), retry stuck transcripts, prompt categories (*new toggle over Glimpse's 20 fixed prompts*), change passphrase, lock vault, exports (Markdown, plain text, all audio, JSON).
- **Food & targets**: plan standard/paleo/keto (defaults 2100 kcal; protein 200/175/180; carbs 150/145/23; fat 75/85/140), bowl style (standard only), quick-set kcal chips 1800–2600 that rescale macros, four targets, steps floor (*Macros hard-coded 12,000*), meal template, quick snacks list (*Macros fixed 4*), recipes, AI estimate on/off.
- **Activity & round**: activity types editor (*new*); round name, start date, length (1–366; can't shorten below logged days), per-person daily target, test number (locks after first log), start day, self-join, archive; rest-day grid with default pattern (every 7th day, plus days ≡ 4 mod 7 after day 42); scoring: points per hit (30), per streak day (10), streak badge (7), hits badge (30); catch-up window (7), behind threshold (2).
- **Integrations & AI**: Fitbit connect/disconnect, health timeframe 7/14/30, refresh interval, 90-day backfill, sync now; pattern analysis consent, Ask Claude, cloud transcription consent, food estimate; Orbit bridge (dev, localhost:4747).
- **Notifications** (*new*): daily reminder time, streak-at-risk nudge, round-day reminder. Off by default.
- **Data & privacy**: export everything, import (Macros export, Glimpse backup, Soma export; merge never replace), clear daily logs, retention days, encryption summary, delete account (*new*).
- **Admin**: approvals (pending→active), users with disable/re-enable and make admin/member (cannot disable self or remove last admin; no delete), rounds, errors with resolve, feedback with acknowledge, orphan draft recover/discard, sign-up webhook (URL, secret, from, notify email — were env vars).

## 7. Fresh start: what it means

No migration script, no rehearsal, no cutover window, no decommission. The old apps are left alone.

- **Accounts** everyone signs up fresh on Soma and waits for admin approval, same flow Macros had. Nothing links a Soma user to an old Supabase user.
- **Vault** new passphrase, new salt, new key. Old Glimpse entries are not on Soma. Anyone who wants their old journal as a file uses Glimpse's own Markdown/JSON export, which keeps working.
- **Round** the admin creates the round on Soma (same name and start date if the group wants continuity). Days before Soma launch are unscored, not migrated. Best streak and best chain start at zero; say so in the sign-up email.
- **Food** plans, targets, recipes and quick snacks are re-entered. Defaults from §6 cover the common case.
- **Fitbit** register the onslate.com URL as a redirect URI at dev.fitbit.com; users connect once.
- **Secrets** Groq, Anthropic and Fitbit keys are set fresh in Catalyst. The old apps keep their own; nothing is rotated.
- **`analyze-entry`** the edge function exists in production but not in the Glimpse repo. Still worth exporting from the Supabase dashboard once, purely to reuse the prompt and response shape when writing the Catalyst job.
- **Formats** the Stratus object layout `[0x01][iv 12][ciphertext]` and the table names in §5 are kept because Glimpse's crypto code already produces them, not because anything old has to load.

## 8. Open items

- Production URL: Development serves `https://soma-onkasary.onslate.com`. Find out whether Production keeps that hostname before the first invite; if it differs, the three allow-lists (Authorized Domains, bucket CORS, Fitbit redirect) move with it.
- Slate: answered. `catalyst deploy slate soma -ni` from `catalyst/` uploads the local `out/` as a static app (no GitHub link needed). Dev URL `https://soma-onkasary.onslate.com`. **Slate sends `cache-control: public, max-age=31536000` on every file including HTML**; see `catalyst/SPIKE.md` for the mitigation to settle before the PWA shell ships.
- Function secrets: answered. `catalyst/secrets.json` (gitignored; shape in `secrets.example.json`) is merged into each function's env by `node catalyst/deploy.js`, which restores the committed config afterwards. The file exists only on David's PC: back it up somewhere safe.
- Approval flow: `profiles.status` (pending|active|disabled) in our own table, because Catalyst's Custom User Validation hook can only accept or reject a sign-up, not hold it. `withUser` creates the profile as `pending` on a user's first call (`ADMIN_EMAILS` start as active admins); every route but `/me` requires `active`; admins use `GET /admin/profiles?status=pending` and `POST /admin/profiles/:userId/status`. Public sign-up stays open, so strangers can create a Catalyst account but reach nothing; the validation hook remains available as a spam guard if that is ever abused (Development caps app users at 25).
- Catalyst project: `soma`, id 120218000000014077, org 939530195. Dev function base: `https://soma-939530195.development.catalystserverless.com/server/soma_api/execute`.
- Job Scheduling: answered. Enabled, pool `soma_jobs` (Function, 256 MB) exists, job budget is **900 s**, dispatch delay ~20 ms. No Event-function fallback needed.
- Verified numbers: Advanced I/O 30 s; Job function 900 s; pre-signed URL expiry 30 s–7 days (we use 900 s); Data Store Text **silently truncates at 10,000 chars with no error**, so the API must reject or spill to Stratus itself; ZCQL has no `LENGTH()`; Development caps app users at 25.
- Leaderboard copy: "against your own target" stays, since targets are per person.
