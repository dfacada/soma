// Watch a polish run live: what the critics found, what each maker changed, which screens the blind judges preferred,
// and every screen at the start against now. It reads the run as it goes (the workflow journals under
// ~/.claude/projects/<this repo>/ and the rig's screenshots in shots/<run>/) and changes nothing.
//
//   node scripts/shots/status.mjs [--port 3100] [--run polish] [--rounds 3]   then open http://localhost:3100
//   node scripts/shots/status.mjs --json                                        prints what the page is fed
//
// It listens on this machine only. preview_start polish-status runs it in the browser pane.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(flag("port", process.env.PORT || 3100));
const RUN = String(flag("run", "polish")).replace(/[^a-zA-Z0-9-]/g, "") || "polish";
const ROUNDS = Math.max(1, Math.min(6, Number(flag("rounds", 3)) || 3));
const SHOTS = path.join(root, "shots", RUN);
// Claude Code keeps a project's sessions in a folder named after the project's path.
const PROJECT = path.join(os.homedir(), ".claude", "projects", root.replace(/[:\\/]/g, "-"));
const HUE = { today: "ink", sheets: "activity", journal: "journal", food: "food", activity: "activity", insights: "journal", tomorrow: "food", settings: "muted", moments: "journal" };
// Short names for the scenes in scripts/shots/scenes.ts (a new scene falls back to its id).
const NAMES = {
  today: "Today", "today-closed": "Today, day closed", "sheet-weight": "Weight sheet", "sheet-checkin": "Check-in sheet",
  "sheet-pushups": "Push-ups sheet", "sheet-steps": "Steps sheet", "sheet-sleep": "Sleep sheet", journal: "Journal",
  "journal-locked": "Journal, locked", food: "Food", activity: "Activity", insights: "Insights", tomorrow: "Tomorrow",
  settings: "Settings", "settings-appearance": "Appearance", whatsnew: "What's new", "moment-closed": "Day closed",
  "moment-closed-reduced": "Day closed, Reduce Motion", "moment-record": "Recording", "moment-food": "Saying what you ate",
};
// Rough minutes per step, from the runs so far. Only the finish estimate uses them.
const MIN = { shoot: 3, judge: 7, critique: 14, system: 20, make: 7, check: 2 };

const stat = (f) => { try { return fs.statSync(f); } catch { return null; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const clip = (s, n = 140) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.lastIndexOf(" ", n - 1);
  return `${t.slice(0, cut > n * 0.6 ? cut : n - 1)}…`;
};
// Judges name the versions by position ("second: the hero…"), which means nothing once the order is gone.
const reason = (s) => clip(String(s || "").replace(/^\s*(the\s+)?(first|second)( version)?(\s*\([^)]*\))?\s*[:,.-]\s*/i, ""), 170);

// ── The run's journals ──
function journalDirs() {
  const out = [];
  let sessions = [];
  try { sessions = fs.readdirSync(PROJECT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  for (const s of sessions) {
    const base = path.join(PROJECT, s, "subagents", "workflows");
    let runs = [];
    try { runs = fs.readdirSync(base); } catch { continue; }
    for (const r of runs) if (stat(path.join(base, r, "journal.jsonl"))) out.push(path.join(base, r));
  }
  return out;
}

/** One workflow run: its agents in the order they started, each with what it returned and when it ran. */
function readRun(dir) {
  let text = "";
  try { text = fs.readFileSync(path.join(dir, "journal.jsonl"), "utf8"); } catch { return null; }
  const agents = [], byId = new Map();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === "started" && e.agentId) {
      const a = { id: e.agentId, label: e.label || "", state: "running" };
      byId.set(a.id, a);
      agents.push(a);
    } else if (e.type === "result" && byId.has(e.agentId)) Object.assign(byId.get(e.agentId), { state: "done", result: e.result });
    else if (e.type === "failed" && byId.has(e.agentId)) byId.get(e.agentId).state = "failed";
  }
  if (!agents.some((a) => /^(critic|make|shoot):/.test(a.label))) return null;
  for (const a of agents) {
    const meta = stat(path.join(dir, `agent-${a.id}.meta.json`)), log = stat(path.join(dir, `agent-${a.id}.jsonl`));
    a.start = meta ? meta.mtimeMs : log ? log.mtimeMs : 0;
    a.end = log ? Math.max(log.mtimeMs, a.start) : a.start;
  }
  const starts = agents.map((a) => a.start).filter(Boolean);
  return { dir, agents, start: starts.length ? Math.min(...starts) : stat(path.join(dir, "journal.jsonl")).mtimeMs, baseline: agents.some((a) => a.label === "shoot:r0" && a.state === "done") };
}

/** The latest run that shot a baseline, and the runs that carried it on after it stopped (scripts/shots/carry.mjs). */
function family() {
  const runs = journalDirs().map(readRun).filter(Boolean).sort((a, b) => a.start - b.start);
  let first = -1;
  runs.forEach((r, i) => { if (r.baseline) first = i; });
  return first < 0 ? [] : runs.slice(first);
}

// ── Screenshots ──
function img(folder, scene, theme = "night") {
  const name = `${scene}.${theme}.png`;
  const s = stat(path.join(SHOTS, folder, name));
  return s ? `/img/${folder}/${name}?v=${Math.round(s.mtimeMs)}` : null;
}
function captures() {
  try { return fs.readdirSync(SHOTS).filter((n) => /^r\d+$/.test(n)).map((n) => Number(n.slice(1))).sort((a, b) => a - b); } catch { return []; }
}
/** The scenes a capture changed the most, from its diff.json. */
function mostChanged(folder, n) {
  const d = readJson(path.join(SHOTS, folder, "diff.json"));
  if (!d || !Array.isArray(d.changes)) return [];
  const seen = new Set();
  return d.changes.filter((c) => c.changed && c.before && /\.png$/.test(c.file) && !/\.\d+\.png$/.test(c.file))
    .sort((a, b) => b.pixels - a.pixels).map((c) => c.scene).filter((s) => !seen.has(s) && seen.add(s)).slice(0, n);
}

// ── What the page shows ──
function build() {
  const now = Date.now();
  const runs = family();
  if (!runs.length) return { now, empty: true, run: RUN };
  const current = runs[runs.length - 1];
  const all = [];
  for (const r of runs) for (const a of r.agents) {
    if (a.state === "running" && r !== current) a.state = "stopped";
    all.push(a);
  }

  // Each step's round: the last capture that finished decides (makers and the check belong to the next round).
  let shot = -1;
  for (const a of all) {
    const L = a.label;
    let m;
    if ((m = /^shoot:(?:r(\d+)|(final))$/.exec(L))) {
      a.kind = "shoot";
      a.round = m[2] ? "final" : Number(m[1]);
      if (a.state === "done" && a.round !== "final") shot = Math.max(shot, a.round);
    } else if ((m = /^critic:(.+)$/.exec(L))) Object.assign(a, { kind: "critic", area: m[1], round: shot });
    else if ((m = /^make:(.+)$/.exec(L))) Object.assign(a, { kind: "make", area: m[1], round: shot + 1 });
    else if (L === "check") Object.assign(a, { kind: "check", round: shot + 1 });
    else if ((m = /^(judge|final):(.+):([12])$/.exec(L))) Object.assign(a, { kind: m[1], scene: m[2], order: Number(m[3]), round: m[1] === "final" ? "final" : shot });
    else a.kind = "other";
  }
  const steps = all.filter((a) => a.state !== "stopped");
  const base = (steps.find((a) => a.label === "shoot:r0" && a.state === "done") || {}).result || {};
  const areaList = base.areas || [];
  const areaTitle = (id) => id === "system" ? "Shared design" : (areaList.find((a) => a.id === id) || { title: id }).title.split(":")[0];
  const sceneTitle = (id) => { for (const a of areaList) { const s = a.scenes.find((x) => x.id === id); if (s) return s.title; } return id; };
  const sceneName = (id) => NAMES[id] || id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  const caps = captures();
  const top = caps.length ? caps[caps.length - 1] : 0;

  // The critics: scores by round, and every issue with the round it was resolved in.
  const scores = {}, critEnd = {}, issues = new Map();
  for (const a of steps) {
    if (a.kind !== "critic" || a.state !== "done") continue;
    const r = a.result;
    (scores[a.area] = scores[a.area] || {})[a.round] = r.score;
    (critEnd[a.area] = critEnd[a.area] || {})[a.round] = a.end;
    for (const p of r.previous || []) {
      const i = issues.get(p.id);
      if (i && p.resolved && !i.resolved) i.resolved = { round: a.round, evidence: p.evidence };
    }
    for (const i of r.issues || []) if (!issues.has(i.id)) issues.set(i.id, { ...i, area: a.area, round: a.round, resolved: null });
  }
  const serious = (i) => i.severity === "blocking" || i.severity === "major";
  const openAt = (area, R) => [...issues.values()].filter((i) => i.area === area && serious(i) && i.round <= R && !(i.resolved && i.resolved.round <= R));
  const lastCrit = Math.max(-1, ...steps.filter((a) => a.kind === "critic" && a.state === "done").map((a) => a.round));
  const failingAfter = (R) => (R < 0 ? areaList.length : areaList.filter((a) => openAt(a.id, R).length).length);

  const areas = areaList.map((a) => {
    const s = scores[a.id] || {};
    const rs = Object.keys(s).map(Number).sort((x, y) => x - y);
    const open = rs.length ? openAt(a.id, rs[rs.length - 1]).length : null;
    return { id: a.id, title: areaTitle(a.id), hue: HUE[a.id] || "ink", scores: rs.map((r) => ({ round: r, score: s[r] })), open, passed: open === 0 };
  });

  // The blind judges: each changed screen asked twice, the order swapped.
  const pairs = {};
  for (const a of steps) if (a.kind === "judge" || a.kind === "final") {
    const g = (pairs[a.round] = pairs[a.round] || {});
    (g[a.scene] = g[a.scene] || [])[a.order - 1] = a;
  }
  const verdictOf = (pair) => {
    const [x, y] = pair || [];
    if (!x || !y || x.state !== "done" || y.state !== "done") return { verdict: "pending", why: [], confidence: 0, end: 0 };
    // The new version is "second" the first time and "first" the second time.
    const w1 = { second: "after", first: "before" }[x.result.winner] || null;
    const w2 = { first: "after", second: "before" }[y.result.winner] || null;
    const verdict = w1 === "after" && w2 === "after" ? "better" : w1 === "before" && w2 === "before" ? "worse" : "unclear";
    const why = [x, y].map((v) => reason((v.result.reasons || [])[0])).filter(Boolean);
    return { verdict, why, confidence: Math.min(x.result.confidence || 0, y.result.confidence || 0), end: Math.max(x.end, y.end) };
  };

  const scenes = areaList.flatMap((a) => a.scenes.map((s) => s.id)).map((id) => {
    const latest = (theme) => {
      for (let k = caps.length - 1; k > 0; k--) { const u = img(`r${caps[k]}`, id, theme); if (u) return { url: u, round: caps[k] }; }
      return null;
    };
    const verdicts = Object.keys(pairs).filter((r) => r !== "final" && pairs[r][id]).map(Number).sort((x, y) => x - y)
      .map((r) => ({ round: r, verdict: verdictOf(pairs[r][id]).verdict }));
    return {
      id, area: (areaList.find((a) => a.scenes.some((s) => s.id === id)) || {}).id, name: sceneName(id), title: sceneTitle(id),
      night: { start: img("r0", id, "night"), now: latest("night") }, light: { start: img("r0", id, "light"), now: latest("light") },
      verdicts, final: pairs.final && pairs.final[id] ? verdictOf(pairs.final[id]).verdict : null,
    };
  });

  // ── The timeline ──
  const items = [];
  const r0 = steps.find((a) => a.label === "shoot:r0");
  if (r0 && r0.state === "done") items.push({
    id: "r0", time: r0.end, kind: "capture", round: 0, title: "Every screen photographed",
    text: `${base.count} screenshots of ${areaList.length} areas in Night and Light, on a made-up member at 7:30 on a fixed evening. This is the start line.`,
    gallery: areaList.map((a) => ({ label: areaTitle(a.id), url: img("r0", a.scenes[0].id) })).filter((g) => g.url),
  });

  for (const R of [...new Set(steps.filter((a) => a.kind === "critic").map((a) => a.round))].sort((x, y) => x - y)) {
    const g = steps.filter((a) => a.kind === "critic" && a.round === R);
    const done = g.filter((a) => a.state === "done");
    const raised = done.flatMap((a) => (a.result.issues || []).map((i) => ({ ...i, area: a.area })));
    const resolved = [...issues.values()].filter((i) => i.resolved && i.resolved.round === R);
    const chips = done.map((a) => {
      const prev = Object.entries(scores[a.area] || {}).filter(([r]) => Number(r) < R).sort((x, y) => Number(x[0]) - Number(y[0])).pop();
      const s = a.result.score;
      return { label: `${areaTitle(a.area)} ${prev ? `${prev[1]} → ` : ""}${s}`, tone: s >= 8 ? "good" : s >= 7 ? "ok" : "low" };
    });
    const open = done.reduce((n, a) => n + openAt(a.area, R).length, 0);
    const passing = done.filter((a) => openAt(a.area, R).length === 0).map((a) => areaTitle(a.area));
    items.push({
      id: `critique-${R}`, time: done.length === g.length ? Math.max(...done.map((a) => a.end)) : now, running: done.length < g.length,
      kind: "critique", round: R, title: R === 0 ? "The critics' first look" : `Round ${R}: the critics look again`,
      text: R === 0
        ? `${raised.length} issues raised: ${raised.filter((i) => i.severity === "blocking").length} blocking, ${raised.filter((i) => i.severity === "major").length} major.`
        : `${resolved.length} earlier issues confirmed fixed. ${open} blocking or major issue${open === 1 ? "" : "s"} still open${passing.length ? `; ${passing.join(", ")} pass${passing.length === 1 ? "es" : ""}` : ""}.`,
      progress: { done: done.length, total: g.length }, chips,
      bullets: (R === 0 ? raised.filter((i) => i.severity === "blocking").map((i) => `Blocking · ${areaTitle(i.area)}: ${clip(i.problem, 160)}`)
        : resolved.filter((i) => i.severity === "blocking").map((i) => `Fixed · ${areaTitle(i.area)}: ${clip(i.problem, 160)}`)).slice(0, 10),
    });
  }

  // A step that failed is told once, in "The run stopped" below.
  for (const a of steps.filter((x) => x.kind === "make" && x.state !== "failed")) {
    const R = a.round, folder = `r${R}-${a.area}`, before = `r${Math.max(0, R - 1)}`;
    const own = (areaList.find((x) => x.id === a.area) || { scenes: [] }).scenes.map((s) => s.id);
    let picks = mostChanged(folder, a.area === "system" ? 3 : 2);
    if (!picks.length && own.length) picks = [own[0]];
    const r = a.result || {};
    items.push({
      id: a.id, time: a.state === "running" ? now : a.end, running: a.state === "running", kind: a.state === "failed" ? "stop" : "make",
      round: R, area: a.area,
      title: a.state === "running" ? `Round ${R}: fixing ${areaTitle(a.area)}` : a.state === "failed" ? `Round ${R}: the ${areaTitle(a.area)} fixer didn't finish`
        : a.area === "system" ? `Round ${R}: shared design fixes` : `Round ${R}: ${areaTitle(a.area)} fixed`,
      text: a.state === "done" ? `${(r.fixed || []).length} issue${(r.fixed || []).length === 1 ? "" : "s"} fixed${(r.skipped || []).length ? `, ${r.skipped.length} left with a reason` : ""}, in ${(r.files || []).length} file${(r.files || []).length === 1 ? "" : "s"}.` : "",
      bullets: (r.changes || []).map((c) => clip(c, 220)),
      pairs: a.state === "failed" ? [] : picks.map((s) => ({ label: sceneName(s), before: img(before, s), after: img(folder, s) || img(`r${R}`, s), beforeLabel: R - 1 > 0 ? `Round ${R - 1}` : "Start", afterLabel: `Round ${R}` })).filter((p) => p.before && p.after),
    });
  }

  for (const a of steps.filter((x) => x.kind === "check" && x.state !== "failed")) items.push({
    id: a.id, time: a.state === "running" ? now : a.end, running: a.state === "running", kind: a.state === "done" && a.result.ok ? "check" : a.state === "running" ? "check" : "stop", round: a.round,
    title: a.state === "running" ? `Round ${a.round}: checking types and lint` : a.state === "done" && a.result.ok ? `Round ${a.round}: types, lint and rules pass` : `Round ${a.round}: the checks didn't finish`,
    text: a.state === "done" && (a.result.fixed || []).length ? `Fixed on the way: ${a.result.fixed.join("; ")}` : "",
  });

  for (const a of steps.filter((x) => x.kind === "shoot" && x.round !== 0 && x.state === "running")) items.push({
    id: a.id, time: now, running: true, kind: "capture", round: a.round, title: a.round === "final" ? "Lining up the start against the finish" : `Round ${a.round}: photographing every screen`, text: "",
  });

  for (const R of Object.keys(pairs)) {
    const isFinal = R === "final";
    const rows = Object.keys(pairs[R]).map((s) => ({ scene: s, ...verdictOf(pairs[R][s]) }));
    const done = rows.filter((x) => x.verdict !== "pending");
    const n = (v) => done.filter((x) => x.verdict === v).length;
    const beforeFolder = isFinal ? "r0" : `r${Number(R) - 1}`, afterFolder = isFinal ? `r${top}` : `r${R}`;
    const show = [...done.filter((x) => x.verdict === "worse"), ...done.filter((x) => x.verdict === "better").sort((x, y) => y.confidence - x.confidence), ...done.filter((x) => x.verdict === "unclear")];
    items.push({
      id: `judge-${R}`, time: done.length === rows.length && done.length ? Math.max(...done.map((x) => x.end)) : now, running: done.length < rows.length,
      kind: "judge", round: R, title: isFinal ? "Final: the start against the finish, judged blind" : `Round ${R}: every changed screen judged blind`,
      text: `${rows.length} screen${rows.length === 1 ? "" : "s"}, each judged twice with the order swapped. ${n("better")} better, ${n("worse")} worse, ${n("unclear")} unclear${done.length < rows.length ? `, ${rows.length - done.length} still being judged` : ""}.`,
      progress: { done: done.length, total: rows.length },
      chips: [{ label: `${n("better")} better`, tone: "good" }, { label: `${n("worse")} worse`, tone: n("worse") ? "bad" : "muted" }, { label: `${n("unclear")} unclear`, tone: "muted" }],
      verdicts: show.map((x) => ({ scene: x.scene, name: sceneName(x.scene), verdict: x.verdict, why: x.why })),
      pairs: show.slice(0, isFinal ? 20 : 8).map((x) => ({ label: sceneName(x.scene), verdict: x.verdict, before: img(beforeFolder, x.scene), after: img(afterFolder, x.scene), beforeLabel: isFinal ? "Start" : Number(R) - 1 > 0 ? `Round ${Number(R) - 1}` : "Start", afterLabel: isFinal ? "Finish" : `Round ${R}` })).filter((p) => p.before && p.after),
    });
  }

  runs.forEach((r, k) => {
    const failed = r.agents.filter((a) => a.state === "failed");
    if (failed.length) items.push({
      id: `stop-${k}`, time: Math.min(...failed.map((a) => a.end)), kind: "stop", title: "The run stopped",
      text: `${failed.length} step${failed.length === 1 ? "" : "s"} didn't finish (${failed.map((a) => a.label.replace(/:.*/, "")).join(", ")}). The work before it stayed in place.`,
    });
    if (k > 0) items.push({ id: `carry-${k}`, time: r.start, kind: "carry", title: "Carried on where it stopped", text: "Rebuilt from the run's own log and continued in the same round, with nothing redone." });
  });
  items.sort((x, y) => y.time - x.time);

  // ── Breakthroughs ──
  const highlights = [];
  for (const i of issues.values()) if (i.resolved && i.severity === "blocking") highlights.push({
    kind: "fixed", time: (critEnd[i.area] || {})[i.resolved.round] || 0, area: i.area, areaTitle: areaTitle(i.area), round: i.resolved.round,
    title: clip(i.problem, 120), text: clip(i.resolved.evidence, 200),
  });
  for (const a of areas) {
    for (let k = 1; k < a.scores.length; k++) if (a.scores[k].score - a.scores[k - 1].score >= 2) highlights.push({
      kind: "jump", time: critEnd[a.id][a.scores[k].round], area: a.id, areaTitle: a.title, round: a.scores[k].round,
      title: `${a.title}: ${a.scores[k - 1].score} → ${a.scores[k].score}`, text: `The critic's score after round ${a.scores[k].round}.`,
    });
    const pass = a.scores.find((s) => s.round > 0 && openAt(a.id, s.round).length === 0);
    if (pass) highlights.push({ kind: "pass", time: critEnd[a.id][pass.round], area: a.id, areaTitle: a.title, round: pass.round, title: `${a.title} passes`, text: `No blocking or major issue left after round ${pass.round}.` });
  }
  highlights.sort((x, y) => y.time - x.time);

  // ── Where it stands ──
  const running = current.agents.filter((a) => a.state === "running");
  const finished = steps.some((a) => a.kind === "final") && !steps.some((a) => a.kind === "final" && a.state !== "done");
  const state = running.length ? "running" : finished ? "done" : "stopped";
  const cur = running[0] || null;
  const doneOf = (kind, R) => { const g = steps.filter((a) => a.kind === kind && a.round === R); return { done: g.filter((a) => a.state === "done").length, total: g.length }; };
  const where = (a) => {
    if (!a) return "";
    if (a.kind === "shoot") return a.round === 0 ? "Photographing the start" : a.round === "final" ? "Final screenshots" : `Round ${a.round}: photographing every screen`;
    if (a.kind === "critic") { const d = doneOf("critic", a.round); return `${a.round === 0 ? "First critique" : `Round ${a.round}: critique`}, ${d.done} of ${d.total} critics done`; }
    if (a.kind === "make") return `Round ${a.round}: fixing ${areaTitle(a.area)}`;
    if (a.kind === "check") return `Round ${a.round}: checking types and lint`;
    if (a.kind === "judge") { const d = doneOf("judge", a.round); return `Round ${a.round}: blind judging, ${d.done} of ${d.total} judgments in`; }
    if (a.kind === "final") { const d = doneOf("final", "final"); return `Final blind comparison, ${d.done} of ${d.total} judgments in`; }
    return a.label;
  };
  const frac = (kind, R) => { const d = doneOf(kind, R); return d.total ? d.done / d.total : 0; };
  let eta = null;
  if (cur) {
    let min = 0;
    const R = typeof cur.round === "number" ? cur.round : null;
    if (cur.kind === "final") min = MIN.judge * (1 - frac("final", "final"));
    else if (cur.kind === "shoot" && cur.round === "final") min = MIN.shoot + MIN.judge;
    else {
      const rest = MIN.check + MIN.shoot + MIN.judge + MIN.critique;
      if (cur.kind === "make") min = Math.max(1, failingAfter(R - 1) - steps.filter((a) => a.kind === "make" && a.round === R && a.area !== "system" && a.state === "done").length) * MIN.make + rest;
      else if (cur.kind === "check") min = rest;
      else if (cur.kind === "shoot") min = rest - MIN.check;
      else if (cur.kind === "judge") min = MIN.judge * (1 - frac("judge", R)) + MIN.critique;
      else if (cur.kind === "critic") min = MIN.critique * (1 - frac("critic", R));
      // Later rounds: one maker per area still failing (from the last finished critique), then the rest.
      const failing = cur.kind === "critic" && frac("critic", R) < 1 ? failingAfter(lastCrit) : failingAfter(R ?? lastCrit);
      for (let r = (R ?? 0) + 1; r <= ROUNDS && failing > 0; r++) min += MIN.system + failing * MIN.make + rest;
      min += MIN.shoot + MIN.judge;
    }
    eta = now + Math.round(min) * 60000;
  }
  const roundOf = (a) => (a ? a.round : null);
  const latestRound = roundOf(cur) ?? (steps.length ? roundOf(steps[steps.length - 1]) : 0);
  const rail = [{ id: 0, label: "Start" }, ...Array.from({ length: ROUNDS }, (_, i) => ({ id: i + 1, label: `Round ${i + 1}` })), { id: "final", label: "Final" }].map((s) => {
    const inRound = steps.filter((a) => a.round === s.id);
    const crit = steps.filter((a) => a.kind === "critic" && a.round === s.id);
    const isCur = cur && cur.round === s.id;
    const done = s.id === "final" ? finished : crit.length > 0 && crit.every((a) => a.state === "done") && !isCur;
    const skipped = typeof s.id === "number" && s.id > 0 && !inRound.length && (finished || (lastCrit >= s.id - 1 && failingAfter(s.id - 1) === 0));
    return { ...s, state: isCur ? "now" : done ? "done" : skipped ? "skipped" : "next" };
  });

  return {
    now, run: RUN, rounds: ROUNDS, started: runs[0].start, state, where: cur ? where(cur) : state === "done" ? "Finished" : "Stopped",
    round: latestRound, eta, rail, running: running.map((a) => ({ label: a.label, what: where(a), since: a.start })),
    areas, scenes, highlights, timeline: items, top,
  };
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(build(), null, 2));
  process.exit(0);
}

const page = path.join(here, "status.html");
let cached = { at: 0, body: "" };
function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(page));
    }
    if (url.pathname === "/status.json") {
      if (Date.now() - cached.at > 1500) cached = { at: Date.now(), body: JSON.stringify(build()) };
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(cached.body);
    }
    if (url.pathname.startsWith("/img/")) {
      const file = path.resolve(SHOTS, decodeURIComponent(url.pathname.slice(5)));
      if (!file.startsWith(SHOTS + path.sep) || !file.endsWith(".png") || !stat(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "max-age=86400" });
      return fs.createReadStream(file).pipe(res);
    }
    res.writeHead(404);
    res.end();
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(String((e && e.stack) || e));
  }
}
// Loopback only, on both address families, so "localhost" works whichever one the browser tries first.
for (const host of ["127.0.0.1", "::1"]) http.createServer(handle).on("error", () => {}).listen(PORT, host);
console.log(`Polish status: http://localhost:${PORT}  (run "${RUN}", journals under ${PROJECT})`);
