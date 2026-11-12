// Deploy Catalyst functions with secrets injected.
//
// `catalyst deploy` replaces a function's environment with whatever is in its
// catalyst-config.json, so console-set values never survive. This script merges
// catalyst/secrets.json (gitignored) into each function's env_variables, deploys,
// and always restores the committed catalyst-config.json afterwards.
//
//   node deploy.js                          all functions in secrets.json / catalyst.json
//   node deploy.js soma_api                 one function
//   node deploy.js soma_api --to dayhub     to another project in targets.js (default: soma until move day)
//
// secrets.json shape: { "soma_api": { "KEY": "value" }, "soma_jobs": { ... }, "migrate": { "MIGRATE_KEY": "..." } }
// Each function also gets where it runs (targets.js functionEnv): its app's addresses, bucket and push subject.
//
// Move day only (routes/migrate.js): MIGRATE_FROM and/or MIGRATE_TO in this shell's env name the account soma_api
// may be read from or written to, and the deploy then carries secrets.json's migrate.MIGRATE_KEY. Without them the
// key is never deployed and the migration routes answer 404.
//   MIGRATE_FROM=<user id> node deploy.js soma_api            the source
//   MIGRATE_TO=<user id> node deploy.js soma_api --to dayhub  the target

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { DEFAULT, pick, functionEnv } = require('./targets');

const root = __dirname;
const secretsPath = path.join(root, 'secrets.json');
const targets = JSON.parse(fs.readFileSync(path.join(root, 'catalyst.json'), 'utf8')).functions.targets;
const target = pick();
const args = process.argv.slice(2).filter((a, i, all) => a !== '--to' && all[i - 1] !== '--to');
const only = args[0];

if (only && !targets.includes(only)) {
  console.error(`Unknown function "${only}". Known: ${targets.join(', ')}`);
  process.exit(1);
}
if (!fs.existsSync(secretsPath)) {
  console.error('catalyst/secrets.json is missing. Copy secrets.example.json and fill it in.');
  process.exit(1);
}

const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
// Which release wrote a log row or sent an alert: the deploy's UTC month-day.hourminute, like the app's own build
// (next.config.ts). The functions read it as SOMA_RELEASE; Dayhub Ops shows it under Live now and per problem.
const RELEASE = new Date().toISOString().slice(5, 16).replace('T', '.').replace(':', '');
const names = only ? [only] : targets;
const originals = new Map();

function migrateEnv(name) {
  const from = process.env.MIGRATE_FROM || '', to = process.env.MIGRATE_TO || '';
  if (name !== 'soma_api' || (!from && !to)) return {};
  if ((from && !/^\d{1,19}$/.test(from)) || (to && !/^\d{1,19}$/.test(to))) throw new Error('MIGRATE_FROM and MIGRATE_TO are user ids (digits)');
  const key = (secrets.migrate || {}).MIGRATE_KEY || '';
  if (key.length < 32) throw new Error('secrets.json has no migrate.MIGRATE_KEY of 32+ characters');
  return Object.assign({ MIGRATE_KEY: key }, from ? { MIGRATE_FROM: from } : {}, to ? { MIGRATE_TO: to } : {});
}

function restore() {
  for (const [file, text] of originals) fs.writeFileSync(file, text);
  originals.clear();
}
process.on('SIGINT', () => { restore(); process.exit(130); });

let status = 1;
try {
  for (const name of names) {
    const file = path.join(root, 'functions', name, 'catalyst-config.json');
    const text = fs.readFileSync(file, 'utf8');
    originals.set(file, text);
    const config = JSON.parse(text);
    const merged = Object.assign({}, config.deployment.env_variables, secrets[name], functionEnv(target), migrateEnv(name), { SOMA_RELEASE: RELEASE });
    const empty = Object.keys(merged).filter((k) => merged[k] === '');
    if (empty.length) throw new Error(`${name}: empty values for ${empty.join(', ')}`);
    config.deployment.env_variables = merged;
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
    console.log(`${name} → ${target.name}: ${Object.keys(merged).length} env vars (${Object.keys(merged).join(', ') || 'none'})`);
  }
  const arg = only ? `functions:${only}` : 'functions';
  // The default project is the one catalyst/.catalystrc links; any other is named explicitly.
  const cli = ['deploy', '--only', arg, '-ni'].concat(target.name === DEFAULT ? [] : ['-p', target.project]);
  const run = spawnSync('catalyst', cli, { cwd: root, stdio: 'inherit', shell: true });
  status = run.status === null ? 1 : run.status;
} catch (e) {
  console.error(e.message);
} finally {
  restore();
}
process.exit(status);
