@AGENTS.md

# Soma

One app that replaces three: **Glimpse** (encrypted voice journal), **Macros** (food, weight, activity) and **100 Daily Pushup Challenge** (push-up rounds with a leaderboard). Target platform is **Zoho Catalyst**, replacing Vercel + Supabase. Domain: **soma.davidfacada.com**. Solo project; David is the only developer and also the admin.

Start with `docs/HANDOFF.md`. It carries every decision made during design, the build plan, the Catalyst spike checklist and the data model. The working prototype in `docs/prototype/soma-prototype.html` **is the spec**: open it in a browser (it runs standalone, state in localStorage). The design canvas source is in `docs/design/`.

## Non-negotiables

- Build directly on Catalyst. **No data migration.** Glimpse, Macros and the Push-Up Challenge stay live on Vercel + Supabase with their data, untouched. Soma starts empty; everyone signs up fresh. Glimpse *code* (recording, crypto, IndexedDB recovery, Whisper worker) is still lifted as modules.
- Frontend is Next.js with `output: 'export'` so it deploys to Catalyst Slate as static files. No server components that need a Node server at runtime. All data goes through the Catalyst API function.
- Every API query is scoped by the calling user. Catalyst Data Store has no row-level security.
- Journal entries, audio, photos and Fitbit tokens are end-to-end encrypted (AES-256-GCM, key derived from the vault passphrase in the browser). Food, activity and the round are server-readable so leaderboards and admin fixes work.
- Push-up target is **per person** (default 100 a day, flat, no ramp). Rest days carry the streak.
- Today is the actionable screen: every daily task completes with a tap there. The Journal card is the record button (no floating mic on Today; voice only).
- Commit and push to `master` directly. No feature branches.

## Design tokens

Bone `#F4F3EF` page, surface `#FFFFFF`, surface-2 `#ECEAE3`, hairline `#DCD9D0`, muted `#6E6A62`, ink `#1B1A17`. Domain hues at equal weight: journal `#5F5BBF`, food `#2C8A5E`, activity `#B7692A`; tints `#ECEBF8` / `#E6F2EB` / `#F6EBDF`. Status colours (admin only): critical `#8E2F24` on `#F3DCD7`, warning `#7A5A0E` on `#F5EBD3`. Type: Bricolage Grotesque (display, 600), Figtree (body), JetBrains Mono (labels and every number, tabular). Cards: 16px radius, 1px hairline, soft shadow. Tap targets ≥ 44px; inputs 16px on mobile so iOS Safari never zooms. Full component vocabulary is in `docs/design/System.dc.html` and the prototype's CSS.

## Commands

```bash
npm run dev        # Next.js dev server
npm run build      # static export to out/
node docs/checks/prototype-smoke-mobile.js docs/prototype/soma-prototype.html   # prototype tap-through (fake DOM)
node docs/checks/prototype-smoke-desktop.js docs/prototype/soma-prototype.html
```

Catalyst CLI is installed globally (`catalyst --version`). `catalyst login` is interactive and must be run by David in a terminal.
