// Deploy Catalyst functions with secrets injected.
//
// `catalyst deploy` replaces a function's environment with whatever is in its
// catalyst-config.json, so console-set values never survive. This script merges
// catalyst/secrets.json (gitignored) into each function's env_variables, deploys,
// and always restores the committed catalyst-config.json afterwards.
//
//   node deploy.js              all functions in secrets.json / catalyst.json
//   node deploy.js soma_api     one function
//
// secrets.json shape: { "soma_api": { "KEY": "value" }, "soma_jobs": { ... } }

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = __dirname;
const secretsPath = path.join(root, 'secrets.json');
const targets = JSON.parse(fs.readFileSync(path.join(root, 'catalyst.json'), 'utf8')).functions.targets;
const only = process.argv[2];

if (only && !targets.includes(only)) {
  console.error(`Unknown function "${only}". Known: ${targets.join(', ')}`);
  process.exit(1);
}
if (!fs.existsSync(secretsPath)) {
  console.error('catalyst/secrets.json is missing. Copy secrets.example.json and fill it in.');
  process.exit(1);
}

const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
const names = only ? [only] : targets;
const originals = new Map();

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
    const merged = Object.assign({}, config.deployment.env_variables, secrets[name]);
    const empty = Object.keys(merged).filter((k) => merged[k] === '');
    if (empty.length) throw new Error(`${name}: empty values for ${empty.join(', ')}`);
    config.deployment.env_variables = merged;
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
    console.log(`${name}: ${Object.keys(merged).length} env vars (${Object.keys(merged).join(', ') || 'none'})`);
  }
  const arg = only ? `functions:${only}` : 'functions';
  const run = spawnSync('catalyst', ['deploy', '--only', arg, '-ni'], { cwd: root, stdio: 'inherit', shell: true });
  status = run.status === null ? 1 : run.status;
} catch (e) {
  console.error(e.message);
} finally {
  restore();
}
process.exit(status);
