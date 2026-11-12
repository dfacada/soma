// Copying one person's account from one Catalyst project to another (move day, 2026-11-18: soma → Dayhub). Driven by
// scripts/migrate-account.mjs; the rules are lib/migrate.js. Temporary: remove after the move.
//
// Off unless this deploy was given MIGRATE_KEY (32+ characters, from secrets.json, never in the repo) and at least one
// account: MIGRATE_FROM, whose rows and files may be read, and/or MIGRATE_TO, whose account may be written
// (catalyst/deploy.js sets them only when asked). Every call must carry the key, and a missing or wrong key gets the
// same 404 as a route that does not exist. Nothing else can be read or written through here, and nothing of what
// passes is logged, only counts.
//
//   POST /migrate/state  { side }                    rows per table and the files (name, size) of that side's account
//   POST /migrate/rows   { table }                   the source account's rows of one table (Catalyst's columns dropped)
//   POST /migrate/write  { table, from, rows }       the target: rows written for MIGRATE_TO, ids and ukeys rewritten
//   POST /migrate/links  { side, method, names }     signed links for that side's own files; PUT only on the target

'use strict';

const express = require('express');
const crypto = require('crypto');
const catalyst = require('zcatalyst-sdk-node');
const { HttpError, select, selectAll } = require('../lib/db');
const { TABLES, TOKEN_PROVIDERS, KINDS, isId, fileName, rowFor, profileFor } = require('../lib/migrate');

const router = express.Router();
const KEY = process.env.MIGRATE_KEY || '';
const FROM = isId(process.env.MIGRATE_FROM || '') ? process.env.MIGRATE_FROM : '';
const TO = isId(process.env.MIGRATE_TO || '') ? process.env.MIGRATE_TO : '';
const ON = KEY.length >= 32 && Boolean(FROM || TO);
const BUCKET = process.env.STRATUS_BUCKET || 'soma-drafts';
const SIGN_EXPIRY_S = 3600;
const MAX_ROWS = 200;
const MAX_NAMES = 40;
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function guard(req, res, next) {
  const given = req.get('x-migrate-key') || '';
  const ok = ON && given.length === KEY.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(KEY));
  if (!ok) return res.status(404).json({ error: 'no such route' });
  req.admin = catalyst.initialize(req, { scope: 'admin' });
  next();
}

/** The account a call is about. The source is only ever read; the target is written, and read back to check. */
function account(side, write) {
  if (side === 'from' && FROM && !write) return FROM;
  if (side === 'to' && TO) return TO;
  throw new HttpError(403, `this deploy does not ${write ? 'write' : 'read'} the "${side}" side`);
}

const tokenFilter = `AND provider IN (${TOKEN_PROVIDERS.map((p) => `'${p}'`).join(', ')})`;
const rowsOf = (admin, table, uid, cols) =>
  selectAll(admin, table, `SELECT ${cols} FROM ${table} WHERE user_id = ${uid} ${table === 'vault_tokens' ? tokenFilter : ''} ORDER BY ROWID ASC`);

async function filesOf(admin, uid) {
  const bucket = admin.stratus().bucket(BUCKET);
  const out = [];
  for (const kind of KINDS) {
    const prefix = `${uid}/${kind}/`;
    let token;
    do {
      const page = await bucket.listPagedObjects({ prefix, maxKeys: 1000, continuationToken: token });
      for (const o of (page.contents || []).map((x) => x.keyDetails || x)) {
        const name = fileName(String(o.key || '').slice(uid.length + 1));
        if (name) out.push({ name, size: Number(o.size) || 0 });
      }
      token = String(page.truncated) === 'true' ? page.next_continuation_token : undefined;
    } while (token && out.length < 20000);
  }
  return out;
}

router.post('/migrate/state', guard, wrap(async (req, res) => {
  const uid = account(req.body && req.body.side, false);
  const tables = {};
  for (const t of TABLES) tables[t] = (await rowsOf(req.admin, t, uid, 'ROWID')).length;
  const profile = (await select(req.admin, 'profiles', `SELECT ROWID, settings_json FROM profiles WHERE user_id = ${uid}`))[0];
  const files = await filesOf(req.admin, uid);
  console.log(JSON.stringify({ action: 'migrate_state', side: req.body.side, files: files.length }));
  res.json({ user: uid, profile: Boolean(profile), settings: Boolean(profile && profile.settings_json), tables, files });
}));

router.post('/migrate/rows', guard, wrap(async (req, res) => {
  const uid = account('from', false);
  const table = req.body && req.body.table;
  if (table === 'profiles') {
    const row = (await select(req.admin, 'profiles', `SELECT display_name, settings_json, created_ms, closed_json FROM profiles WHERE user_id = ${uid}`))[0];
    return res.json({ rows: row ? [profileFor(row)] : [] });
  }
  if (!TABLES.includes(table)) throw new HttpError(400, 'not a table that is copied');
  const rows = (await rowsOf(req.admin, table, uid, '*')).map((r) => rowFor(table, r, uid, uid)).filter(Boolean);
  console.log(JSON.stringify({ action: 'migrate_rows', table, rows: rows.length }));
  res.json({ rows });
}));

router.post('/migrate/write', guard, wrap(async (req, res) => {
  const uid = account('to', true);
  const b = req.body || {};
  if (!isId(b.from)) throw new HttpError(400, 'from must be the source user id');
  if (!Array.isArray(b.rows) || b.rows.length > MAX_ROWS) throw new HttpError(400, `rows must be an array of at most ${MAX_ROWS}`);
  if (b.table === 'profiles') {
    const target = (await select(req.admin, 'profiles', `SELECT ROWID FROM profiles WHERE user_id = ${uid}`))[0];
    if (!target) throw new HttpError(409, 'the target account has no profile yet: sign in there once first');
    const values = profileFor(b.rows[0] || {});
    if (Object.keys(values).length) await req.admin.datastore().table('profiles').updateRow(Object.assign(values, { ROWID: target.ROWID }));
    console.log(JSON.stringify({ action: 'migrate_write', table: 'profiles', fields: Object.keys(values).length }));
    return res.json({ written: Object.keys(values).length });
  }
  if (!TABLES.includes(b.table)) throw new HttpError(400, 'not a table that is copied');
  let rows;
  try { rows = b.rows.map((r) => rowFor(b.table, r, b.from, uid)).filter(Boolean); }
  catch (e) { throw new HttpError(400, e.message); }
  if (b.table === 'vault_meta' && rows.length && (await rowsOf(req.admin, 'vault_meta', uid, 'ROWID')).length) {
    throw new HttpError(409, 'the target account already has a vault');
  }
  const t = req.admin.datastore().table(b.table);
  // A refused insert says why (a column the target lacks, a value it will not take), for whoever runs the copy.
  try { for (let i = 0; i < rows.length; i += 100) await t.insertRows(rows.slice(i, i + 100)); }
  catch (e) { throw new HttpError(502, `${b.table}: the target refused the rows (${String(e.message || e).slice(0, 200)})`); }
  console.log(JSON.stringify({ action: 'migrate_write', table: b.table, rows: rows.length }));
  res.json({ written: rows.length });
}));

router.post('/migrate/links', guard, wrap(async (req, res) => {
  const b = req.body || {};
  const method = b.method === 'PUT' ? 'PUT' : 'GET';
  const uid = account(b.side, method === 'PUT');
  if (!Array.isArray(b.names) || !b.names.length || b.names.length > MAX_NAMES) throw new HttpError(400, `1–${MAX_NAMES} names`);
  if (b.names.some((n) => !fileName(n))) throw new HttpError(400, 'bad name');
  const bucket = req.admin.stratus().bucket(BUCKET);
  const urls = [];
  for (const name of b.names) {
    const key = `${uid}/${name}`;
    let signed;
    try { signed = await bucket.generatePreSignedUrl(key, method, { expiryIn: SIGN_EXPIRY_S }); }
    catch (_e) { await new Promise((done) => setTimeout(done, 300)); signed = await bucket.generatePreSignedUrl(key, method, { expiryIn: SIGN_EXPIRY_S }); }
    urls.push({ name, url: signed.signature });
  }
  res.json({ method, urls });
}));

module.exports = router;
