# The polish loop

A way to make Soma's screens better without David checking every pixel: real screenshots, harsh critics that never see the code first, makers that fix what they find, and a blind judge that decides whether each change actually helped. It runs as one saved workflow and stops on its own.

The idea comes from a prompt that went around for building a game: fan out sub-agents, one per part; have a separate, harsh critic check each part visually; compare against the real thing blind, side by side; loop until it wins. The parts that work are kept here. The parts that don't are changed:

| The original prompt | Here | Why |
| --- | --- | --- |
| "Don't stop until it's utterly perfect" | Stops when every area has no blocking or major issue, or after `rounds` (default 3) | An unbounded loop never ends: a critic told to be harsh can always find something, so the run only burns tokens. |
| Compare blind with Call of Duty | Every change is judged blind against the version before it, **twice with the order swapped**; reference apps are an input, not the finish line | An AI judge favours one position; swapping cancels that out. A finish line you can't reach (a $700M game, Google's own app) means the loop never ends. Beating the previous version can always be checked. |
| "Check it looks triple A" | A written rubric: blocking, major and minor, each defined, each issue with where, why and a concrete fix | "AAA" can't be checked. Vague feedback ("make it pop") gets vague changes. |
| One sub-agent per item, all in parallel | Critics and judges in parallel; **makers one at a time**, the shared system fixed first | The screens share CSS modules and one dev server, so parallel makers would overwrite each other and design the same card five ways. |
| `/loop` | The loop lives inside the workflow | `/loop` re-runs a prompt on a timer. "Keep going until it passes" belongs inside the workflow, with a cap. |
| ultracode | Ask for the saved workflow by name | Asking for the workflow by name is already the go-ahead to run it. `ultracode` also sends every later task in the session through workflows, which costs more for nothing here. |

## The pieces

- **The rig: `npm run shots`** (`scripts/shots/`). Headless Edge at iPhone size (390×844, saved at 2×), in Night and Light. It shoots every scene in `scenes.ts`, with animations played to their end, and runs on a made-up member (`world.ts`):
  - two months of days, built on David's real Macros meal plan;
  - journal entries, sealed with a vault made fresh for each run;
  - sleep, steps and a push-up round.

  Scenes with `who: "new"` or `who: "pending"` run on a second world instead: someone on their first day (approved minutes ago, nothing logged, no vault, Fitbit not connected, settings empty as a new account's are) or someone waiting for approval. Every member starts there, so every area has a day-one scene (`new-*`), and the `welcome` area holds the waiting screen and making the vault.

  **The page never reaches Catalyst or Stratus.** Every API and storage request is answered from that fixture, and anything else trying to leave the machine is refused and listed in the report. So the rig cannot see or change anyone's data, and it works the same in any checkout. It is deterministic: two runs on the same `--at` give identical pictures. `--against <earlier run>` writes `diff.json`, which says which screens changed. Images also go to `shots/blind/` under content-hash names, so a judge can't tell which version a file is.
- **The critic: `.claude/agents/soma-critic.md`.** Read-only. It holds the rubric and Soma's design rules, and returns a punch list plus a `keep` list.
- **The judge: `.claude/agents/soma-judge.md`.** It can only read images. It gets two sets of images with neutral names and says which is better crafted, and what the loser did better.
- **The workflow: `.claude/workflows/soma-polish.js`.**
  - **Baseline:** shoot everything, compare with any reference images, then one critic per area.
  - **Each round:**
    - **Fix:** the shared system first, then one maker per failing area.
    - **Check:** `npm run check`.
    - **Judge:** every screen that changed, blind, both orders. A screen the judge likes less is a regression and reopens its area.
    - **Critique:** the critics check the fixes and look again.
  - **Final:** the baseline against the last round, blind, screen by screen.

  It never commits or deploys; the session that ran it does that.
- **The live page: `scripts/shots/status.mjs`.** `preview_start polish-status`, or `node scripts/shots/status.mjs`, then http://localhost:3100. It reads the run's journals and screenshots every few seconds and changes nothing. It shows:
  - where the run is and a rough finish time;
  - the breakthroughs: blocking issues fixed, score jumps, areas passing;
  - each area's critic score round by round;
  - every screen at the start against the latest, with a slider;
  - a timeline of every step, with before and after pictures and each judge's verdict.

  It listens on this machine only.

## Running it

Start a **new** session in this folder (agents load when a session starts), then paste:

```
Run Soma's polish loop (docs/POLISH.md) with the saved workflow .claude/workflows/soma-polish.js.

1. Check git status is clean, then start the dev server (preview_start soma-dev).
2. Run the workflow with args {"rounds": 3}.
3. When it returns, read the report and look at the last round's screenshots yourself (the "last" folder it names). For any screen the final blind judge rated worse than the baseline, fix it or revert the change that caused it.
4. Turn the areas' "changes" into What's new lines in src/lib/changelog.ts, run npm run check, commit and push to master, then build and deploy the frontend.
5. Tell me in plain words what changed screen by screen, each area's critic score at the start and the end, what is still open, and how Soma compared with my reference images.
```

Arguments, all optional:

- **`rounds`** (1 to 6, default 3): the most fix, judge and critique cycles.
- **`areas`**: which areas to work on, for example `["today", "food"]`. `npm run shots -- --list` shows them. The default is all nine.
- **`focus`**: one sentence every critic and maker hears, for example `"Today should feel calmer and more spacious"`.
- **`run`**: the folder under `shots/`, `polish` by default. It is wiped at the start.

**Size.** A full run of nine areas over three rounds makes roughly 100 to 250 agent calls and takes a few hours. Most of that is critics and judges, which run in parallel; the makers go one at a time. To try it small first, use `{"areas": ["today"], "rounds": 2}`.

**Reference images**, the "compare it with the real thing" part:

- Drop screenshots of apps you admire into `design-ref/<area>/`, for example `design-ref/today/google-health.png`.
- At the start, each one is judged blind against that area's main screen, both orders. Whatever the reference does better goes to the critic as things to raise. The result is reported at the start and again at the end.
- `design-ref/` is gitignored on purpose: the repo is public, and other companies' screenshots must not be published.

## If a run stops early

A usage limit, a crash or a stop can cut a run short. The fixes made so far stay in the working tree, and nothing has to be done twice:

1. Find the run's journal: `journal.jsonl` in the transcript folder that the Workflow result names.
2. Run `node scripts/shots/carry.mjs <journal.jsonl> '{"rounds": 3}'`, passing the run's own args. It replays the finished steps through the workflow itself, using their recorded results and running nothing. It prints where the run stood and each area's scores so far, and writes `shots/<run>-carry.js`.
3. Run that file with the Workflow tool (`scriptPath`) and the same args. It carries on in the round that stopped, starting with the makers that didn't finish, and then goes on as usual.

The Workflow tool's own resume often can't do this:
- it only works in the session that started the run;
- it replays a cached step only while every call before it repeats exactly. In a session that started before `.claude/agents/` existed, every critic and judge call fails once first, so nothing after the first one replays.

`carry.mjs` needs only the journal, and works in any session.

## Working on the rig

- **A new screen or sheet:** add a scene to `scripts/shots/scenes.ts`. Its steps click buttons by their accessible names, so a renamed button fails loudly. Say in the title what the screen must show: the critic checks the picture against it.
- **A new API call:** the rig reports `no fixture for GET /…`. Add an answer in `answer()` in `world.ts`. Its types come from the app's own types, so `npm run check` catches shapes that drift.
- **Anything else:**
  - `npm run shots -- --only today --dump` prints a scene's accessibility tree, which is where the button names come from.
  - A step or page that fails saves `<scene>.<theme>.failed.png`.
  - The rig uses the Edge already installed on Windows, through `playwright-core`, so it downloads no browser. Use `--browser chrome` to run it in Chrome instead.
  - `shots/` is scratch space and can be deleted at any time.
