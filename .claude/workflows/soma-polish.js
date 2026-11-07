export const meta = {
  name: 'soma-polish',
  description: 'Polish Soma screen by screen: harsh critics on real screenshots, one maker per area, blind before/after judging, repeated until every area passes',
  whenToUse: 'When David asks to polish Soma or run the polish loop (docs/POLISH.md). Needs npm run dev on localhost:3000 and a clean git tree.',
  phases: [
    { title: 'Baseline', detail: 'screenshots of every screen, reference comparisons, the first critique' },
    { title: 'Fix', detail: 'the shared-system pass, then one maker per failing area, one at a time' },
    { title: 'Check', detail: 'npm run check, fixed if it fails' },
    { title: 'Judge', detail: 'every changed screen, blind, before against after, in both orders' },
    { title: 'Critique', detail: 'a harsh critic per area checks the fixes and looks again' },
    { title: 'Final', detail: 'every changed screen judged blind against the baseline' },
  ],
}

// ── Settings (Workflow args) ──
// run:    folder name under shots/ (letters, digits, dashes). Default "polish". Use a new one per run.
// rounds: fix → check → judge → critique cycles at most (1–6, default 3).
// areas:  ids to work on (npm run shots -- --list), default all.
// focus:  a sentence from David that every critic and maker hears ("make Today feel calmer").
// resume: set by scripts/shots/carry.mjs for a run that stopped early (a usage limit, a crash, a stop): the baseline
//         and every area's state as they stood, the round it stopped in and the makers still to run. Never by hand.
const A = args || {}
const RUN = String(A.run || 'polish').replace(/[^a-zA-Z0-9-]/g, '') || 'polish'
const ROUNDS = Math.max(1, Math.min(6, Number(A.rounds) || 3))
const FOCUS = A.focus ? String(A.focus).slice(0, 600) : ''
const RESUME = A.resume && typeof A.resume === 'object' && A.resume.base ? A.resume : null
const DIR = `shots/${RUN}`
const BLOCKING = ['blocking', 'major']

// ── Shapes ──
const SHOT = { type: 'object', properties: { scene: { type: 'string' }, theme: { type: 'string' }, frame: { type: 'integer' }, blind: { type: 'string' } }, required: ['scene', 'theme', 'frame', 'blind'] }
const SHOOT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'false only when nothing could be shot (no dev server, the command crashed)' },
    error: { type: 'string' },
    at: { type: 'string', description: 'manifest.json "at"' },
    count: { type: 'integer', description: 'how many screenshots' },
    problems: { type: 'array', items: { type: 'object', properties: { scene: { type: 'string' }, theme: { type: 'string' }, kind: { type: 'string' }, detail: { type: 'string' } }, required: ['scene', 'kind', 'detail'] } },
    changed: { type: 'array', description: 'diff entries with changed: true', items: { type: 'object', properties: { scene: { type: 'string' }, theme: { type: 'string' }, frame: { type: 'integer' }, before: { type: 'string', description: 'before.blind, "" when there was none' }, after: { type: 'string', description: 'after.blind' } }, required: ['scene', 'theme', 'frame', 'before', 'after'] } },
    leads: { type: 'array', description: 'the night, frame 1 shot of the first scene of each area', items: { type: 'object', properties: { area: { type: 'string' }, blind: { type: 'string' } }, required: ['area', 'blind'] } },
    areas: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, scenes: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } }, required: ['id', 'title'] } }, refs: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, blind: { type: 'string' } }, required: ['file', 'blind'] } } }, required: ['id', 'title', 'files', 'scenes', 'refs'] } },
    systemFiles: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'count', 'problems', 'changed'],
}
const ISSUE = {
  type: 'object',
  properties: {
    id: { type: 'string' }, severity: { enum: ['blocking', 'major', 'minor'] }, scope: { enum: ['area', 'system'] },
    scene: { type: 'string' }, theme: { enum: ['night', 'light', 'both'] }, where: { type: 'string' },
    problem: { type: 'string' }, why: { type: 'string' }, fix: { type: 'string' }, files: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'severity', 'scope', 'scene', 'theme', 'where', 'problem', 'fix'],
}
const CRITIQUE = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    score: { type: 'integer', minimum: 1, maximum: 10 },
    previous: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, resolved: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['id', 'resolved', 'evidence'] } },
    issues: { type: 'array', items: ISSUE },
    keep: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'score', 'previous', 'issues', 'keep'],
}
const MADE = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'why'] } },
    files: { type: 'array', items: { type: 'string' } },
    changes: { type: 'array', description: 'what a user would notice, in plain words, headline sentence first', items: { type: 'string' } },
    systemRequests: { type: 'array', items: { type: 'string' } },
  },
  required: ['fixed', 'skipped', 'files', 'changes'],
}
const CHECKED = { type: 'object', properties: { ok: { type: 'boolean' }, fixed: { type: 'array', items: { type: 'string' } }, tail: { type: 'string' } }, required: ['ok', 'fixed'] }
const VERDICT = {
  type: 'object',
  properties: {
    winner: { enum: ['first', 'second', 'same'] }, confidence: { type: 'integer', minimum: 1, maximum: 5 },
    reasons: { type: 'array', items: { type: 'string' } }, loserDoesBetter: { type: 'array', items: { type: 'string' } },
  },
  required: ['winner', 'confidence', 'reasons', 'loserDoesBetter'],
}

// ── Steps ──
let AT = A.at ? String(A.at) : ''

/** The critic and the judge are agents in .claude/agents/ (read-only tools, their brief as the system prompt). A
 *  session only knows the agents that existed when it started: without them, the same brief is read from its file. */
async function role(name, prompt, opts) {
  let r = null
  try { r = await agent(prompt, { ...opts, agentType: name }) } catch (e) { r = null }
  if (r) return r
  return agent(`Read .claude/agents/${name}.md first: it is your brief. Follow it exactly, and use only the tools it lists.\n\n${prompt}`, opts)
}

function shoot(name, opts) {
  const o = opts || {}
  const cmd = `npm run shots -- --out ${DIR}/${name}${AT ? ` --at ${AT}` : ''}${o.against ? ` --against ${DIR}/${o.against}` : ''}`
  const lines = [
    'Run Soma\'s screenshot rig and report exactly what it wrote. Change nothing, fix nothing, and don\'t start or stop any server. From the repo root:',
    '',
    ...(o.fresh ? [`rm -rf ${DIR}`, 'npm run shots -- --list'] : []),
    o.compare ? `npm run shots -- --compare ${DIR}/${o.compare[0]} ${DIR}/${o.compare[1]}` : cmd,
    '',
    'Exit code 2 means no dev server: return ok false with its message. Exit code 1 means some scenes failed: still report everything.',
    o.compare
      ? `Read ${DIR}/${o.compare[1]}/manifest.json and ${DIR}/${o.compare[1]}/compare.json.`
      : `Read ${DIR}/${name}/manifest.json${o.against ? ` and ${DIR}/${name}/diff.json` : ''}.`,
    'Return: at (manifest "at"), count (number of shots), problems (manifest "problems", all of them),',
    o.against || o.compare
      ? 'changed (every diff entry with "changed": true, as scene, theme, frame (after.frame), before (before.blind, or "" when null) and after (after.blind)),'
      : 'changed: [] (nothing to compare),',
    `leads (for each area, the blind path of the night shot with frame 1 of the first scene listed for that area in the manifest)${o.fresh ? ',' : '.'}`,
    ...(o.fresh ? ['and from the --list JSON: areas (id, title, files, scenes as id and title, refs as file and blind) and systemFiles.'] : []),
    'Copy every blind path exactly, character for character.',
  ]
  return agent(lines.join('\n'), { label: `shoot:${name}`, phase: o.phase, schema: SHOOT, effort: 'low' })
}

function judgePrompt(title, first, second, kind) {
  const list = (shots) => shots.map((s) => `- ${s.label}: ${s.blind}`).join('\n')
  return [
    kind === 'reference'
      ? 'Two phone screens, possibly from different apps. Judge craft only, not features, content or what each app is for.'
      : `Two versions of the same phone screen: "${title}".`,
    'Read every image of both versions, then say which is better crafted.',
    '',
    'First version:', list(first), '', 'Second version:', list(second),
  ].join('\n')
}

/** Asks twice, with the order swapped, so a judge that favours one position can't decide it: "better" means `after`
 *  won both times, "worse" that `before` did, anything else is "unclear". Reasons are kept by side: why each one won,
 *  and what each did better even when it lost. */
async function blind(title, before, after, kind, label, phase) {
  const [x, y] = await parallel([
    () => role('soma-judge', judgePrompt(title, before, after, kind), { label: `${label}:1`, phase, schema: VERDICT }),
    () => role('soma-judge', judgePrompt(title, after, before, kind), { label: `${label}:2`, phase, schema: VERDICT }),
  ])
  const out = { verdict: 'unclear', afterWon: [], beforeWon: [], afterKeep: [], beforeKeep: [] }
  if (!x || !y) return { ...out, missing: !x && !y }
  let afterWins = 0, beforeWins = 0
  for (const [v, afterFirst] of [[x, false], [y, true]]) {
    if (v.winner === 'same') continue
    if ((v.winner === 'first') === afterFirst) { afterWins++; out.afterWon.push(...v.reasons); out.beforeKeep.push(...v.loserDoesBetter) }
    else { beforeWins++; out.beforeWon.push(...v.reasons); out.afterKeep.push(...v.loserDoesBetter) }
  }
  out.verdict = afterWins === 2 ? 'better' : beforeWins === 2 ? 'worse' : 'unclear'
  return out
}

function label(s) { return `${s.theme}${s.frame > 1 ? `, scrolled ${s.frame - 1}` : ', top'}` }

/** The changed shots of each scene, grouped, so one judge sees a scene's every changed view at once. */
function byScene(changed) {
  const m = {}
  for (const c of changed) {
    if (!c.before) continue
    ;(m[c.scene] = m[c.scene] || []).push(c)
  }
  return m
}

function critique(area, round, shotsDir, prior) {
  const p = prior || {}
  const lines = [
    `Critique Soma's "${area.title}" area (id ${area.id}), polish round ${round}.`,
    '',
    `Screenshots: ${shotsDir}/. Read every PNG of these scenes (files are <scene>.<theme>.png, <scene>.<theme>.2.png and so on; a <scene>.<theme>.failed.png means it failed to render):`,
    ...area.scenes.map((s) => `- ${s.id}: ${s.title}`),
    '',
    `The area's files: ${area.files.join(', ')}.`,
    `Shared system files (a fix there is scope "system"): ${SYSTEM.join(', ')}.`,
    ...(p.problems && p.problems.length ? ['', 'The rig reported these problems while shooting this area (a failed scene is blocking):', ...p.problems.map((x) => `- ${x.scene} ${x.theme || ''} ${x.kind}: ${x.detail}`)] : []),
    ...(FOCUS ? ['', `David's focus for this run: ${FOCUS}`] : []),
    ...(p.open && p.open.length ? ['', 'Open issues from last round. Check each against the new screenshots and fill `previous` (resolved true or false, and what you saw):', JSON.stringify(p.open.map(({ id, severity, scene, theme, where, problem, fix }) => ({ id, severity, scene, theme, where, problem, fix })))] : []),
    ...(p.worse && p.worse.length ? ['', 'A blind judge preferred the previous version of these screens over this round\'s change. Raise each reason as an issue unless the screenshots already answer it:', ...p.worse.map((w) => `- ${w.scene}: ${w.beforeWon.join(' / ')}${w.afterKeep.length ? ` (the new version did do this better, keep it: ${w.afterKeep.join(' / ')})` : ''}`)] : []),
    ...(p.steal && p.steal.length ? ['', 'Blind comparisons with apps David admires found these things they do better than this area. Raise the ones that fit Soma\'s design as issues:', ...p.steal.map((s) => `- ${s}`)] : []),
    ...(p.keep && p.keep.length ? ['', 'Earlier critics said to keep these:', ...p.keep.map((k) => `- ${k}`)] : []),
    '',
    `Number new issues ${area.id}-${round}-1, ${area.id}-${round}-2 and so on.`,
  ]
  return role('soma-critic', lines.join('\n'), { label: `critic:${area.id}`, phase: round === 0 ? 'Baseline' : 'Critique', schema: CRITIQUE })
}

/** An area fails while it has an open blocking or major issue, new or carried. */
function openIssues(c, carried) {
  const resolved = new Set((c.previous || []).filter((p) => p.resolved).map((p) => p.id))
  const stillOpen = (carried || []).filter((i) => !resolved.has(i.id))
  return [...stillOpen, ...(c.issues || [])].filter((i) => BLOCKING.includes(i.severity))
}

function makerPrompt(area, round, issues, st, prev) {
  return [
    `You are fixing Soma's "${area.title}" area (${area.id}) in polish round ${round}. A harsh critic reviewed screenshots of it; fix what it found, then prove it with new screenshots.`,
    '',
    'Issues (fix every blocking and major one; a minor one when the fix is small and safe):',
    JSON.stringify(issues),
    ...(st.keep.length ? ['', 'Keep these, the critics liked them:', ...st.keep.map((k) => `- ${k}`)] : []),
    ...(FOCUS ? ['', `David's focus for this run: ${FOCUS}`] : []),
    '',
    'Rules:',
    `- Your files: ${area.files.join(', ')}. You may also change rules in src/components/app/app.module.css and screens.module.css that only your area's components use: grep the class name across src/ first, and if anything else uses it, leave it and put it in systemRequests. Leave globals.css and src/components/ui/ alone: the system pass owns them.`,
    '- Looks and layout only. Don\'t change what anything does, what data it shows, the API, the vault or the day-closing rule. No new colours, fonts or packages: tokens only (CLAUDE.md "Design tokens"), CSS modules and the global type classes. Keep tap targets at 44 points or more.',
    '- Don\'t edit src/lib/changelog.ts. Put what a user would notice in `changes` instead, in plain words, headline first; the run adds them.',
    `- Check your work: npm run shots -- --only ${area.id} --out ${DIR}/r${round}-${area.id}${AT ? ` --at ${AT}` : ''} --against ${DIR}/${prev}. Read the new screenshots, and diff.json to see what moved. Fix anything you made worse. Repeat until every blocking and major issue is fixed or you can say exactly why it can't be (three captures at most).`,
    '- Finish with npx tsc --noEmit and npx eslint on the files you changed, both passing. The dev server is already running on localhost:3000 with hot reload: don\'t start or stop it. Don\'t commit.',
    '',
    'Return the issue ids you fixed, the ones you skipped and why, the files you changed, the changes in plain words, and systemRequests.',
  ].join('\n')
}

function systemPrompt(round, items, prev) {
  return [
    `You own Soma's shared design system for polish round ${round}. The area critics found these problems that live in shared code, or that show on more than one area's screens. Several may be the same problem seen from different screens: fix each once, at the root.`,
    '',
    JSON.stringify(items),
    ...(FOCUS ? ['', `David's focus for this run: ${FOCUS}`] : []),
    '',
    'Rules:',
    `- Your files: ${SYSTEM.join(', ')}. Change a component's own file only when a shared fix needs a matching change there.`,
    '- A shared change lands on every screen at once. Make the smallest change that fixes the problem everywhere, and nothing else.',
    '- Looks and layout only. No new colours, fonts or packages: tokens only (CLAUDE.md "Design tokens"). Keep /kit (src/app/kit/page.tsx) showing every token and component. Don\'t edit src/lib/changelog.ts: put what a user would notice in `changes`.',
    `- Check your work across every screen: npm run shots -- --out ${DIR}/r${round}-system${AT ? ` --at ${AT}` : ''} --against ${DIR}/${prev}. Read the screenshots of every scene diff.json says changed: a shared change must not make any screen worse. Three captures at most.`,
    '- Finish with npx tsc --noEmit and npx eslint on the files you changed. The dev server is running with hot reload: don\'t start or stop it. Don\'t commit.',
    '',
    'Return the issue ids you fixed, the ones you skipped and why, the files you changed, and the changes in plain words.',
  ].join('\n')
}

// ── The run ──
// A run that stopped early carries on from where it stood: the same baseline and state, no new capture or critique.
let base = RESUME && RESUME.base
if (!RESUME) {
  phase('Baseline')
  base = await shoot('r0', { fresh: true, phase: 'Baseline' })
  if (!base || !base.ok || !base.areas || !base.areas.length) {
    return { error: (base && base.error) || 'the baseline capture failed: is npm run dev running on localhost:3000?', base }
  }
}
AT = AT || base.at
const SYSTEM = base.systemFiles || []
const AREAS = RESUME ? base.areas.filter((a) => RESUME.areas.includes(a.id))
  : (Array.isArray(A.areas) && A.areas.length ? base.areas.filter((a) => A.areas.includes(a.id)) : base.areas)
if (!AREAS.length) return { error: `no area called ${(A.areas || []).join(', ')}: the areas are ${base.areas.map((a) => a.id).join(', ')}` }
if (RESUME) log(`Carrying on in round ${RESUME.round}${RESUME.pending.length ? `, first ${RESUME.pending.join(', ')}` : ''}`)
else log(`Baseline: ${base.count} screenshots, ${AREAS.length} area${AREAS.length === 1 ? '' : 's'} to work on, at ${AT}${base.problems.length ? `, ${base.problems.length} problems` : ''}`)

// Every area's scenes, worked on or not: a shared change can move a screen outside the areas this run works on.
const titleOf = (id) => { for (const a of base.areas) { const s = a.scenes.find((x) => x.id === id); if (s) return s.title } return id }
const areaOf = (id) => (base.areas.find((a) => a.scenes.some((s) => s.id === id)) || { id: null }).id
/** Every changed scene judged blind, before against after, all at once. */
const judgeAll = async (scenes, tag, phaseName) => (await parallel(Object.keys(scenes).map((id) => () =>
  blind(titleOf(id), scenes[id].map((c) => ({ label: label(c), blind: c.before })), scenes[id].map((c) => ({ label: label(c), blind: c.after })), 'version', `${tag}:${id}`, phaseName)
    .then((v) => ({ scene: id, ...v }))))).filter(Boolean)

// Per area: what is open, what to keep, what the judge and the references said, the work done.
const state = RESUME ? RESUME.state : {}
if (!RESUME) for (const a of AREAS) state[a.id] = { open: [], keep: [], worse: [], steal: [], changes: [], files: [], scores: [], refs: [] }
const problemsFor = (id, problems) => (problems || []).filter((p) => (AREAS.find((a) => a.id === id) || { scenes: [] }).scenes.some((s) => s.id === p.scene))

// The bar to beat: each reference image David left in design-ref/<area>/, blind against the area's lead screen.
const leadOf = (shot, id) => ((shot && shot.leads) || []).find((l) => l.area === id)
// Soma sits in the `before` slot and the reference in `after`: "better" means the reference won both orders.
const against = (shot, phaseName, tag) => parallel(AREAS.filter((a) => a.refs && a.refs.length && leadOf(shot, a.id)).flatMap((a) => a.refs.map((r) => () =>
  blind(a.title, [{ label: 'the screen', blind: leadOf(shot, a.id).blind }], [{ label: 'the screen', blind: r.blind }], 'reference', `${tag}:${a.id}`, phaseName)
    .then((v) => ({ area: a.id, ref: r.file, result: v.verdict === 'better' ? 'reference wins' : v.verdict === 'worse' ? 'Soma wins' : 'split', steal: v.afterWon })))))
// A critic that dies gets one more try: a missing critique must never read as a pass.
const critiqueOnce = async (a, round, dir, prior) => (await critique(a, round, dir, prior)) || (await critique(a, round, dir, prior))
if (!RESUME) {
  for (const r of (await against(base, 'Baseline', 'ref')).filter(Boolean)) {
    state[r.area].refs.push({ ref: r.ref, before: r.result })
    state[r.area].steal.push(...r.steal)
  }
  const critiques = await parallel(AREAS.map((a) => () => critiqueOnce(a, 0, `${DIR}/r0`, { problems: problemsFor(a.id, base.problems), steal: state[a.id].steal })))
  if (critiques.every((c) => !c)) return { error: 'no critique came back for the baseline (a usage limit?): start the run again' }
  AREAS.forEach((a, i) => {
    const c = critiques[i]
    if (!c) { state[a.id].open = [{ id: `${a.id}-0-critic`, severity: 'major', scope: 'area', scene: a.scenes[0].id, theme: 'both', where: '', problem: 'No critique came back for this area', fix: 'Critique it again' }]; return }
    state[a.id].open = openIssues(c, [])
    state[a.id].keep.push(...c.keep)
    state[a.id].scores.push(c.score)
  })
}

let prev = RESUME ? RESUME.prev : 'r0'
let lastShot = RESUME ? RESUME.lastShot : base
let round = RESUME ? RESUME.round - 1 : 0
const history = RESUME ? RESUME.history : []
// Handed back when a round can't finish (a usage limit, a crash): scripts/shots/carry.mjs carries on from it, in the
// same round, with only the makers that didn't come back.
const carryOn = (failing, pending, made) => ({
  base, areas: AREAS.map((a) => a.id), state, prev, lastShot: { leads: (lastShot && lastShot.leads) || [] }, history,
  round, failing: failing.map((a) => a.id), pending, systemFixed: made.system ? made.system.fixed : null,
})
let carry = RESUME
while (round < ROUNDS) {
  let failing, pending
  if (carry) {
    failing = AREAS.filter((a) => carry.failing.includes(a.id))
    pending = carry.pending
  } else {
    failing = AREAS.filter((a) => state[a.id].open.length)
    if (!failing.length) { log('Every area passes: no open blocking or major issue.'); break }
    if (budget.total && budget.remaining() < 200000) { log(`Stopping before round ${round + 1}: under 200k tokens of budget left.`); break }
    pending = ['system', ...failing.map((a) => a.id)]
  }
  round++
  log(`Round ${round}: ${failing.map((a) => `${a.id} (${state[a.id].open.length})`).join(', ')}`)

  // Shared problems first, fixed once at the root, so the area makers build on the fixed system.
  phase('Fix')
  const made = { system: carry && carry.systemFixed ? { fixed: carry.systemFixed, files: [], changes: [] } : null, areas: {} }
  carry = null
  const unfinished = []
  if (pending.includes('system')) {
    const shared = failing.flatMap((a) => state[a.id].open.filter((i) => i.scope === 'system').map((i) => ({ ...i, area: a.id })))
    // What last round's makers needed in shared code and were not allowed to change themselves.
    const requests = AREAS.flatMap((a) => (state[a.id].requests || []).map((r, j) => ({ id: `${a.id}-request-${j + 1}`, severity: 'major', scope: 'system', area: a.id, problem: r })))
    if (shared.length + requests.length) {
      made.system = await agent(systemPrompt(round, [...shared, ...requests], prev), { label: 'make:system', phase: 'Fix', schema: MADE })
      if (made.system) {
        for (const a of AREAS) state[a.id].requests = []
        for (const a of failing) state[a.id].files.push(...made.system.files.filter((f) => !state[a.id].files.includes(f)))
      } else unfinished.push('system')
    }
  }
  // One maker at a time: the areas share CSS modules, and one dev server shows every change at once.
  for (const a of failing) {
    if (!pending.includes(a.id)) continue
    const issues = state[a.id].open.filter((i) => i.scope === 'area' || !made.system || !made.system.fixed.includes(i.id))
    if (!issues.length) continue
    const m = await agent(makerPrompt(a, round, issues, state[a.id], prev), { label: `make:${a.id}`, phase: 'Fix' , schema: MADE })
    if (!m) { unfinished.push(a.id); continue }
    made.areas[a.id] = m
    state[a.id].changes.push(...m.changes)
    state[a.id].files.push(...m.files.filter((f) => !state[a.id].files.includes(f)))
    state[a.id].requests = m.systemRequests || []
  }
  if (made.system) {
    // The system pass's changes belong to the run, said once.
    state[failing[0].id].changes.push(...made.system.changes)
  }

  phase('Check')
  const checked = await agent('Run `npm run check` from the repo root (types, lint and the offline rule suites). If it passes, return ok true. If it fails, fix the cause with the smallest change that keeps the visual work intact (a type error, a lint rule, an unused import). Never weaken a test or a rule to make it pass. Run it again until it passes, then return ok, what you fixed, and the last lines of the output as tail.', { label: 'check', phase: 'Check', schema: CHECKED })
  if (!checked || !checked.ok) log(`Round ${round}: npm run check still fails${checked && checked.tail ? `: ${checked.tail.slice(-300)}` : ''}`)

  // Blind: every changed scene, before against after, both orders. A screen the judge likes less is a regression.
  phase('Judge')
  const now = await shoot(`r${round}`, { against: prev, phase: 'Judge' })
  if (!now || !now.ok) return { error: `round ${round} capture failed${now && now.error ? `: ${now.error}` : ''}`, round, history, resume: carryOn(failing, unfinished, made) }
  const scenes = byScene(now.changed)
  const results = (await judgeAll(scenes, 'judge', 'Judge')).map((r) => ({ ...r, area: areaOf(r.scene) }))
  if (results.length && results.every((r) => r.missing)) return { error: `round ${round}: no judge came back`, round, history, resume: carryOn(failing, unfinished, made) }
  lastShot = now
  for (const a of AREAS) state[a.id].worse = results.filter((r) => r.area === a.id && r.verdict === 'worse')
  const elsewhere = results.filter((r) => r.verdict === 'worse' && !state[r.area])
  if (elsewhere.length) log(`Round ${round} made screens outside this run's areas worse: ${elsewhere.map((r) => r.scene).join(', ')} (the system pass is the likely cause)`)
  history.push({ round, worked: failing.map((a) => a.id), check: checked ? checked.ok : false, judged: results.map((r) => ({ scene: r.scene, verdict: r.verdict })) })
  log(`Round ${round} judged: ${results.filter((r) => r.verdict === 'better').length} better, ${results.filter((r) => r.verdict === 'worse').length} worse, ${results.filter((r) => r.verdict === 'unclear').length} unclear`)

  // The critics look again: at the areas just worked on, and at any area whose screens moved (a shared change).
  phase('Critique')
  const moved = new Set(Object.keys(scenes).map(areaOf))
  const again = AREAS.filter((a) => failing.includes(a) || moved.has(a.id))
  const critiques = await parallel(again.map((a) => () => critiqueOnce(a, round, `${DIR}/r${round}`, { open: state[a.id].open, worse: state[a.id].worse, keep: state[a.id].keep, problems: problemsFor(a.id, now.problems) })))
  if (again.length && critiques.every((c) => !c)) return { error: `round ${round}: no critique came back`, round, history, resume: { ...carryOn(failing, unfinished, made), history: history.slice(0, -1) } }
  again.forEach((a, i) => {
    const c = critiques[i]
    if (!c) { log(`No critique came back for ${a.id} in round ${round}; its open issues stay open.`); return }
    const open = openIssues(c, state[a.id].open)
    // A regression the critic did not raise stays open anyway: the judge saw it in both orders.
    const raised = new Set(open.map((i) => i.scene))
    const forced = state[a.id].worse.filter((w) => !raised.has(w.scene)).map((w, j) => ({
      id: `${a.id}-${round}-worse-${j + 1}`, severity: 'major', scope: 'area', scene: w.scene, theme: 'both', where: 'the whole screen', why: 'regression',
      problem: `A blind judge preferred the previous version: ${w.beforeWon.join(' / ')}`,
      fix: `Bring back what made the previous version better while keeping this round's fixes${w.afterKeep.length ? ` (the new version does do this better: ${w.afterKeep.join(' / ')})` : ''}`,
    }))
    state[a.id].open = [...open, ...forced]
    state[a.id].keep.push(...c.keep.filter((k) => !state[a.id].keep.includes(k)))
    state[a.id].scores.push(c.score)
  })
  prev = `r${round}`
}

// ── Final: the whole run, blind, the baseline against the last round ──
phase('Final')
let final = []
const refsAfter = {}
if (prev !== 'r0') {
  const all = await shoot('final', { compare: ['r0', prev], phase: 'Final' })
  final = (await judgeAll(byScene((all && all.changed) || []), 'final', 'Final')).map((r) => ({
    scene: r.scene, verdict: r.verdict, why: r.verdict === 'worse' ? r.beforeWon : r.verdict === 'better' ? r.afterWon : [...r.afterWon, ...r.beforeWon],
  }))
  for (const r of (await against(lastShot, 'Final', 'ref-final')).filter(Boolean)) (refsAfter[r.area] = refsAfter[r.area] || []).push(r)
}

return {
  run: RUN, at: AT, rounds: round, folder: DIR, last: `${DIR}/${prev}`,
  areas: AREAS.map((a) => ({
    id: a.id, title: a.title,
    passed: state[a.id].open.length === 0,
    scores: state[a.id].scores,
    open: state[a.id].open.map(({ id, severity, scene, theme, where, problem, fix }) => ({ id, severity, scene, theme, where, problem, fix })),
    changes: state[a.id].changes, files: state[a.id].files,
    references: state[a.id].refs.map((r) => ({ ...r, after: ((refsAfter[a.id] || []).find((x) => x.ref === r.ref) || {}).result || null })),
  })),
  final,
  history,
}
