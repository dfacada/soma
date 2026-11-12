// Copies one person's account from one Catalyst project to another (move day, 2026-11-18: soma → Dayhub), through
// the temporary key-locked routes in catalyst/functions/soma_api/routes/migrate.js. It prints counts and checks only,
// never what it carries, and writes nothing to disk. Temporary: remove after the move.
//
//   node scripts/migrate-account.mjs --from soma --to dayhub         what would be copied, and whether the target is empty
//   node scripts/migrate-account.mjs --from soma --to dayhub --go    copy it, then check every table's count and every
//                                                                    file's bytes on the target
//
// The source's soma_api must be deployed with MIGRATE_FROM and the target's with MIGRATE_TO (catalyst/deploy.js). The
// target account must have signed in once (it needs a profile) and own nothing yet. The key is secrets.json's
// migrate.MIGRATE_KEY. Projects are the names in catalyst/targets.js.

import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const { TARGETS } = createRequire(import.meta.url)("../catalyst/targets.js");
const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const pick = (name) => (Object.hasOwn(TARGETS, name || "") ? Object.assign({ name }, TARGETS[name]) : null);
const from = pick(arg("--from")), to = pick(arg("--to"));
const go = process.argv.includes("--go");
if (!from || !to) { console.error(`usage: --from <${Object.keys(TARGETS).join("|")}> --to <…> [--go]`); process.exit(1); }
const KEY = JSON.parse(fs.readFileSync(new URL("../catalyst/secrets.json", import.meta.url), "utf8")).migrate?.MIGRATE_KEY;
if (!KEY) { console.error("secrets.json has no migrate.MIGRATE_KEY"); process.exit(1); }

const TABLES = ["checkins", "day_logs", "weight", "activity", "entries", "reviews", "health_months", "recipes", "vault_meta", "vault_tokens"];
const PUT_HEADERS = { "Content-Type": "application/octet-stream", overwrite: "true" };
const BODY_MAX = 600_000;
const sha = (buf) => crypto.createHash("sha256").update(Buffer.from(buf)).digest("hex");

async function call(t, route, body) {
  const res = await fetch(t.api + route, { method: "POST", headers: { "x-migrate-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${t.name} ${route}: ${res.status} ${json?.error ?? ""}`);
  return json;
}
async function links(t, side, method, names) {
  const out = new Map();
  for (let i = 0; i < names.length; i += 40) for (const u of (await call(t, "/migrate/links", { side, method, names: names.slice(i, i + 40) })).urls) out.set(u.name, u.url);
  return out;
}
/** Rows in batches small enough for one request (the API takes 1 MB, 200 rows). */
function batches(rows) {
  const out = []; let cur = [], size = 0;
  for (const r of rows) {
    const n = JSON.stringify(r).length;
    if (cur.length && (cur.length >= 100 || size + n > BODY_MAX)) { out.push(cur); cur = []; size = 0; }
    cur.push(r); size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}
const bytesOf = (files) => files.reduce((n, f) => n + f.size, 0);
const mb = (n) => (n / 1048576).toFixed(1) + " MB";

const src = await call(from, "/migrate/state", { side: "from" });
const dst = await call(to, "/migrate/state", { side: "to" });
console.log(`from ${from.name} (account …${src.user.slice(-4)}) to ${to.name} (account …${dst.user.slice(-4)})`);
for (const t of TABLES) console.log(`  ${t.padEnd(14)} ${String(src.tables[t]).padStart(5)} → target has ${dst.tables[t]}`);
console.log(`  files          ${String(src.files.length).padStart(5)} (${mb(bytesOf(src.files))}) → target has ${dst.files.length}`);
console.log(`  settings       ${src.settings ? "yes" : "none"} → target profile ${dst.profile ? "exists" : "MISSING"}`);

const busy = TABLES.filter((t) => dst.tables[t] > 0);
if (!dst.profile) { console.error("\nThe target account has no profile: sign in there once first."); process.exit(1); }
if (busy.length || dst.files.length) { console.error(`\nThe target account is not empty (${busy.join(", ")}${dst.files.length ? ", files" : ""}). Nothing copied.`); process.exit(1); }
if (!go) { console.log("\nDry run: nothing copied. Add --go to copy."); process.exit(0); }

console.log("\ncopying");
const prof = await call(from, "/migrate/rows", { table: "profiles" });
await call(to, "/migrate/write", { table: "profiles", from: src.user, rows: prof.rows });
console.log(`  profile        ${prof.rows.length ? "settings and name" : "nothing"}`);
for (const t of TABLES) {
  const { rows } = await call(from, "/migrate/rows", { table: t });
  let n = 0;
  for (const b of batches(rows)) n += (await call(to, "/migrate/write", { table: t, from: src.user, rows: b })).written;
  console.log(`  ${t.padEnd(14)} ${n}`);
}
const names = src.files.map((f) => f.name);
const gets = await links(from, "from", "GET", names);
const puts = await links(to, "to", "PUT", names);
const sums = new Map();
let done = 0;
for (const name of names) {
  const got = await fetch(gets.get(name));
  if (!got.ok) throw new Error(`reading ${name.split("/")[0]}/…: ${got.status}`);
  const buf = await got.arrayBuffer();
  sums.set(name, sha(buf));
  const put = await fetch(puts.get(name), { method: "PUT", body: buf, headers: PUT_HEADERS });
  if (!put.ok) throw new Error(`writing ${name.split("/")[0]}/…: ${put.status}`);
  if (++done % 25 === 0) console.log(`  files          ${done} of ${names.length}`);
}
console.log(`  files          ${done} (${mb(bytesOf(src.files))})`);

console.log("\nchecking the target");
const after = await call(to, "/migrate/state", { side: "to" });
const fails = [];
for (const t of TABLES) if (after.tables[t] !== src.tables[t]) fails.push(`${t}: ${after.tables[t]} rows, the source has ${src.tables[t]}`);
if (!after.settings && src.settings) fails.push("profile: no settings");
const sizes = new Map(after.files.map((f) => [f.name, f.size]));
for (const f of src.files) if (sizes.get(f.name) !== f.size) fails.push(`file ${f.name.split("/")[0]}/…: size differs`);
const back = await links(to, "to", "GET", names);
let same = 0;
for (const name of names) {
  const res = await fetch(back.get(name));
  if (res.ok && sha(await res.arrayBuffer()) === sums.get(name)) same++;
  else fails.push(`file ${name.split("/")[0]}/…: bytes differ`);
}
console.log(`  tables         ${TABLES.length - fails.filter((f) => !f.startsWith("file") && !f.startsWith("profile")).length} of ${TABLES.length} match`);
console.log(`  files          ${same} of ${names.length} byte for byte`);
if (fails.length) { console.error("\nPROBLEMS\n  " + fails.slice(0, 30).join("\n  ")); process.exit(1); }
console.log("\nAll copied and checked.");
