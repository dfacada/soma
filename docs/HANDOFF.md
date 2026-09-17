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
1. **Design system, ~1 week** — tokens and components from the prototype: card, chip, tile, medallion, ring, sheet, settings field kit, tab bar, sidebar. Storybook optional; a `/kit` route showing every component is enough.
2. **Data model + API, ~1 week** — Catalyst Express function `soma_api` (§5), Data Store tables, Stratus buckets, jobs for transcription and analysis, nightly cron for error pruning.
3. **Screens, 4–5 weeks, hardest rules first** — Today + Settings shell → Activity (port push-up rules out of Postgres triggers into the API) → Food → Journal (lift Glimpse modules) → Insights → Admin.
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
- How to inject function secrets at deploy time, since `catalyst deploy` replaces the environment with `catalyst-config.json` and console-set values do not survive.
- Catalyst project: `soma`, id 120218000000014077, org 939530195. Dev function base: `https://soma-939530195.development.catalystserverless.com/server/soma_api/execute`.
- Job Scheduling: answered. Enabled, pool `soma_jobs` (Function, 256 MB) exists, job budget is **900 s**, dispatch delay ~20 ms. No Event-function fallback needed.
- Verified numbers: Advanced I/O 30 s; Job function 900 s; pre-signed URL expiry 30 s–7 days (we use 900 s); Data Store Text **silently truncates at 10,000 chars with no error**, so the API must reject or spill to Stratus itself; ZCQL has no `LENGTH()`; Development caps app users at 25.
- Leaderboard copy: "against your own target" stays, since targets are per person.
