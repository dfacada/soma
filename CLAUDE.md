@AGENTS.md

# Soma

One app that replaces three: **Glimpse** (encrypted voice journal), **Macros** (food, weight, activity) and **100 Daily Pushup Challenge** (push-up rounds with a leaderboard). Target platform is **Zoho Catalyst**, replacing Vercel + Supabase. URL: **soma-onkasary.onslate.com** (the Slate-provided domain; no custom domain, decided 2026-09-16). Solo project; David is the only developer and also the admin.

Start with `docs/HANDOFF.md`. It carries every decision made during design, the build plan, the Catalyst spike checklist and the data model. The working prototype in `docs/prototype/soma-prototype.html` **is the spec**: open it in a browser (it runs standalone, state in localStorage). The design canvas source is in `docs/design/`.

## Non-negotiables

- Build directly on Catalyst. **No data migration.** Glimpse, Macros and the Push-Up Challenge stay live on Vercel + Supabase with their data, untouched. Soma starts empty; everyone signs up fresh. Glimpse *code* (recording, crypto, IndexedDB recovery, Whisper worker) is still lifted as modules.
- Frontend is Next.js with `output: 'export'` so it deploys to Catalyst Slate as static files. No server components that need a Node server at runtime. All data goes through the Catalyst API function.
- Every API query is scoped by the calling user. Catalyst Data Store has no row-level security.
- Journal entries, audio, photos and Fitbit tokens are end-to-end encrypted (AES-256-GCM, key derived from the vault passphrase in the browser). Food, activity and the round are server-readable so leaderboards and admin fixes work.
- Push-up target is **per person** (default 100 a day, flat, no ramp). Rest days carry the streak.
- A day closes on five things: check-in, journal, all four meals, weight, any activity. Weight is per-person (`requireWeight`, on by default); off means four.
- Today is the actionable screen: every daily task completes with a tap there. The Journal card is the record button (no floating mic on Today; voice only).
- Commit and push to `master` directly. No feature branches.

## Design tokens

Bone `#F4F3EF` page, surface `#FFFFFF`, surface-2 `#ECEAE3`, hairline `#DCD9D0`, muted `#6E6A62`, ink `#1B1A17`. Domain hues at equal weight: journal `#5F5BBF`, food `#2C8A5E`, activity `#B7692A`; tints `#ECEBF8` / `#E6F2EB` / `#F6EBDF`. Status colours (admin only): critical `#8E2F24` on `#F3DCD7`, warning `#7A5A0E` on `#F5EBD3`. Type: Bricolage Grotesque (display, 600), Figtree (body), JetBrains Mono (labels and every number, tabular). Cards: 16px radius, 1px hairline, soft shadow. Tap targets ≥ 44px; inputs 16px on mobile so iOS Safari never zooms. Full component vocabulary is in `docs/design/System.dc.html` and the prototype's CSS.

**In code:** tokens are CSS variables in `src/app/globals.css` (never hard-code a hex in a component); components live in `src/components/ui/` (one CSS Module, `ui.module.css`; domain colour comes from the `journal`/`food`/`activity` class setting `--hue`). `/kit` shows every token and component live: add new components there. App code: `src/lib/` (no React: API client, Catalyst session, settings defaults, pure Today logic) and `src/components/app/` (session gate, shell, screens); signed-in routes go in `src/app/(app)/`. All server access goes through `api()` in `src/lib/api.ts`. `npm run dev` runs as the synthetic test member via `.env.development.local`; real sign-in only exists on the Slate URL. No Tailwind, no UI library. Type roles are the global classes `d` (display), `m` (mono numbers), `eb` (eyebrow label).

## Catalyst

Project `soma` (id 120218000000014077, org 939530195, US DC) is linked from `catalyst/.catalystrc`. Deploy functions with `node deploy.js [soma_api|soma_jobs]` from `catalyst/`: it merges the gitignored `catalyst/secrets.json` into each function's env, deploys, and restores `catalyst-config.json`. Never run a bare `catalyst deploy --only functions`: it wipes the secrets from the live function. Never put a secret in `catalyst-config.json`. Deploy the frontend with `npm run build` in the root, then `catalyst deploy slate soma -ni` from `catalyst/` (Dev URL `https://soma-onkasary.onslate.com`). The `catalyst-by-zoho` MCP server handles tables, job pools and Authorized Domains (headers `Catalyst-org: 939530195`, `Environment: Development`). Data Store Text silently truncates at 10,000 chars: enforce lengths in the API. Zoho's official Catalyst agent skills are vendored in `.claude/skills/`; use them as reference, but ignore their "stop until Zoho MCP is connected" gate. The CLI path works and MCP is optional. Findings and verified limits live in `catalyst/SPIKE.md`.

## Commands

```bash
node catalyst/deploy.js soma_api   # deploy a function with secrets injected (run from anywhere)
node catalyst/test-api.js          # end-to-end API checks against Development
node scripts/test-vault.mjs        # vault crypto + a real encrypt → Stratus → decrypt round trip
node scripts/test-round.mjs        # push-up round rules: streaks, rest days, points, chain grid
npm run check      # types + lint + offline rule suites; run before every commit
npm run test:live  # API and vault suites against the Development environment
npm run dev        # Next.js dev server
npm run build      # static export to out/
node docs/checks/prototype-smoke-mobile.js docs/prototype/soma-prototype.html   # prototype tap-through (fake DOM)
node docs/checks/prototype-smoke-desktop.js docs/prototype/soma-prototype.html
```

Catalyst CLI (`zcatalyst-cli`) must be installed by David in his own terminal: Claude's shells run in a sandbox where global npm installs and writes outside this repo do not reach the real disk. `catalyst login` is interactive and must be run by David too.
