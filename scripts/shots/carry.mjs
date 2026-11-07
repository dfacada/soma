// Carries on a polish run (.claude/workflows/soma-polish.js) that stopped early: a usage limit, a crash, a stop.
//
// The Workflow tool's own resume can't always do it: a cached step only replays while every call before it repeats
// exactly, and in a session that started before .claude/agents/ existed every critic and judge call fails once first
// (the agent type is unknown), so nothing after the first one replays. This replays the run's journal through the
// workflow itself instead: every agent is answered with what the real one returned, in the order the run started them,
// and nothing runs. The workflow stops where the real run did and hands back its state (`resume`), which goes into a
// copy of the workflow, shots/<run>-carry.js, that carries on from that round with only the makers that didn't finish.
//
//   node scripts/shots/carry.mjs <journal.jsonl> ['{"rounds": 3}']
//
// The journal is in the run's transcript folder (the Workflow result names it). Pass the run's own args. Then run the
// copy with the Workflow tool (scriptPath) and the same args.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [journal, rawArgs] = process.argv.slice(2);
if (!journal || !fs.existsSync(journal)) {
  console.error("usage: node scripts/shots/carry.mjs <journal.jsonl> ['<the run's args as JSON>']");
  process.exit(2);
}
const args = rawArgs ? JSON.parse(rawArgs) : {};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, ".claude/workflows/soma-polish.js"), "utf8");

// What each agent returned, by label, in the order the run started them: null when it failed or never finished.
const events = fs.readFileSync(journal, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const results = new Map(events.filter((e) => e.type === "result").map((e) => [e.agentId, e.result]));
const outcomes = new Map();
for (const e of events) {
  if (e.type !== "started" || !e.label) continue;
  if (!outcomes.has(e.label)) outcomes.set(e.label, []);
  outcomes.get(e.label).push(results.has(e.agentId) ? results.get(e.agentId) : null);
}
// A call for an unknown agent type fails before any agent starts, so the journal has it as a failure with no agent.
// When the run had those, every typed call is answered the same way and the fallback that follows takes the outcome.
const typesMissing = events.some((e) => e.type === "failed" && !e.agentId);

const taken = new Map();
async function agent(prompt, opts = {}) {
  if (opts.agentType && typesMissing) throw new Error(`agent type ${opts.agentType} not found`);
  const k = taken.get(opts.label) || 0;
  taken.set(opts.label, k + 1);
  const list = outcomes.get(opts.label) || [];
  return k < list.length && list[k] !== null ? structuredClone(list[k]) : null;
}
const parallel = (thunks) => Promise.all(thunks.map((t) => Promise.resolve().then(t).catch(() => null)));
const pipeline = (items, ...stages) => Promise.all(items.map(async (item, i) => {
  let v = item;
  for (const stage of stages) {
    try { v = await stage(v, item, i); } catch { return null; }
  }
  return v;
}));
const logs = [];
const budget = { total: null, spent: () => 0, remaining: () => Infinity };
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const body = source.replace(/^export const meta/m, "const meta");
const out = await new AsyncFunction("agent", "parallel", "pipeline", "phase", "log", "args", "budget", "workflow", body)(
  agent, parallel, pipeline, () => {}, (m) => logs.push(m), args, budget, null);

if (!out || !out.resume) {
  console.error("Nothing to carry on: the run finished, or this journal doesn't match the workflow and its args.");
  console.error(JSON.stringify(out).slice(0, 400));
  process.exit(1);
}
const r = out.resume;
console.log(logs.map((l) => `  ${l}`).join("\n"));
console.log(`Stopped in round ${r.round}: ${out.error}.`);
for (const id of r.areas) {
  const s = r.state[id];
  console.log(`  ${id.padEnd(9)} scores ${s.scores.join(" > ").padEnd(7)} open ${s.open.length}${r.pending.includes(id) ? "  (its maker carries on)" : ""}`);
}

const line = "const A = args || {}";
if (!source.includes(line)) throw new Error(`the workflow no longer has "${line}": update carry.mjs`);
const run = String(args.run || "polish").replace(/[^a-zA-Z0-9-]/g, "") || "polish";
const file = path.join(root, "shots", `${run}-carry.js`);
fs.writeFileSync(file, source.replace(line, `const A = { ...(args || {}), resume: ${JSON.stringify(r)} }`));
console.log(`Wrote ${path.relative(root, file)} (${Math.round(fs.statSync(file).size / 1024)} KB): run it with the Workflow tool (scriptPath) and the same args.`);
