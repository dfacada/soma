// Keys for tomorrow's brief (David, 2026-11-02): a Morgen API key and a Todoist token. They are kept the way Dayhub
// keeps the Google Health connection: sealed on the device with the vault key, stored here only as ciphertext
// (vault_tokens, one row per person per provider). This function cannot open them and never tries.
//
// The Todoist token is only ever used by the phone itself, which calls Todoist directly. The Morgen key comes back
// here in the clear for one request at a time (routes/morgen.js), because Morgen refuses calls from Dayhub's web address.
//
//   GET    /links                 { links: { morgen: { ciphertext, createdMs } | null, todoist: … | null } }
//   PUT    /links/:provider       { ciphertext }
//   DELETE /links/:provider

'use strict';

const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError, select, upsert, needId, fitText } = require('../lib/db');

const router = express.Router();
const PROVIDERS = ['morgen', 'todoist'];
// A sealed key plus the calendars left out of the brief, base64: well under Data Store's 10,000-character Text limit.
const CIPHER_MAX = 8000;

const needProvider = (v) => { if (!PROVIDERS.includes(v)) throw new HttpError(400, 'provider must be morgen or todoist'); return v; };
const ukey = (userId, provider) => needId(userId) + ':' + provider;

router.get('/links', member, wrap(async (req, res) => {
  const rows = await select(req.admin, 'vault_tokens',
    `SELECT provider, ciphertext, created_ms FROM vault_tokens WHERE user_id = ${needId(req.user.id)} AND provider IN ('morgen', 'todoist') LIMIT 10`);
  const links = Object.fromEntries(PROVIDERS.map((p) => {
    const row = rows.find((r) => r.provider === p);
    return [p, row ? { ciphertext: row.ciphertext, createdMs: Number(row.created_ms) || 0 } : null];
  }));
  res.json({ links });
}));

router.put('/links/:provider', member, wrap(async (req, res) => {
  const provider = needProvider(req.params.provider);
  const ciphertext = fitText('ciphertext', (req.body || {}).ciphertext, CIPHER_MAX);
  if (!ciphertext || !/^[A-Za-z0-9+/=]{40,}$/.test(ciphertext)) throw new HttpError(400, 'ciphertext must be base64');
  const key = ukey(req.user.id, provider);
  await upsert(req.admin, 'vault_tokens', `SELECT ROWID FROM vault_tokens WHERE ukey = '${key}'`,
    { user_id: req.user.id, provider, ukey: key, ciphertext, created_ms: Date.now() });
  res.json({ ok: true });
}));

router.delete('/links/:provider', member, wrap(async (req, res) => {
  const rows = await select(req.admin, 'vault_tokens', `SELECT ROWID FROM vault_tokens WHERE ukey = '${ukey(req.user.id, needProvider(req.params.provider))}'`);
  if (rows[0]) await req.admin.datastore().table('vault_tokens').deleteRow(rows[0].ROWID);
  res.json({ deleted: Boolean(rows[0]) });
}));

module.exports = router;
