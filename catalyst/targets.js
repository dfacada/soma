// Where each copy of Dayhub runs: its Catalyst project, its API, its storage bucket and the web addresses its app
// is served from. deploy.js reads it for the functions' env; test-api.js and the two live scripts read it for the
// API to test. src/lib/api.ts keeps the browser's own copy of the API list.
//
//   soma    the old project: David's live app until move day (2026-11-18), at dayhub-onkasary.onslate.com.
//   dayhub  the new project, made on 2026-11-11 from soma's exported setup. Its Development is the test copy;
//           its Production becomes the live app on move day.
//
// Pick one with `--to <name>` or TARGET=<name>. Until move day the default is soma.
// An address goes in `origins` only once David owns it: the repo is public, and a listed name someone else could
// register would be trusted by Face ID unlock and by Google's redirect.

'use strict';

const TARGETS = {
  soma: {
    project: '120218000000014077',
    api: 'https://soma-939530195.development.catalystserverless.com/server/soma_api/execute',
    bucket: 'soma-drafts',
    origins: ['https://dayhub-onkasary.onslate.com', 'http://localhost:3000'],
  },
  dayhub: {
    project: '120218000000187219',
    api: 'https://dayhub-939530195.development.catalystserverless.com/server/soma_api/execute',
    bucket: 'dayhub-drafts',
    // dayhub-ucekgwbl: the test copy's address, given by Catalyst when its Slate app was made (2026-11-11).
    origins: ['https://dayhub-ucekgwbl.onslate.com', 'http://localhost:3000'],
  },
};

const DEFAULT = 'soma';

/** The target named by `--to <name>`, else by TARGET, else the default. Exits on a name it does not know. */
function pick(argv = process.argv) {
  const i = argv.indexOf('--to');
  const name = (i >= 0 ? argv[i + 1] : process.env.TARGET) || DEFAULT;
  if (!Object.prototype.hasOwnProperty.call(TARGETS, name)) {
    console.error(`Unknown target "${name}". Known: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
  }
  return Object.assign({ name }, TARGETS[name]);
}

/** What the functions are told about where they run. Not secrets: deploy.js merges these with secrets.json. The
 *  push subject must be an https address, so a target with none yet keeps the functions' own default. */
function functionEnv(t) {
  const site = t.origins.find((o) => o.startsWith('https://'));
  return Object.assign({ APP_ORIGINS: t.origins.join(','), STRATUS_BUCKET: t.bucket }, site ? { PUSH_SUBJECT: site + '/privacy/' } : {});
}

module.exports = { TARGETS, DEFAULT, pick, functionEnv };
