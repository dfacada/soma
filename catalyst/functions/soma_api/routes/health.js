// Google Health (what the Fitbit Web API became in 2026). Steps only, read-only.
//
// Google will not issue or refresh a token without the client secret, so those calls have to happen here. What
// this function never does is keep a token: the refresh token goes straight back to the browser, which encrypts
// it with the vault key and stores only the ciphertext (vault_tokens). To sync, the browser decrypts it and
// sends it with the request; it is used for that one request and dropped. Nothing here logs a token.
//
//   GET    /google-health              { configured, link: { ciphertext, createdMs } | null }
//   POST   /google-health/auth-url     { redirectUri, state } → { url }
//   POST   /google-health/exchange     { code, redirectUri } → { refreshToken }
//   PUT    /google-health/link         { ciphertext }
//   POST   /google-health/sync         { refreshToken, from, to } → { days: [{ day, steps }] }
//   POST   /google-health/disconnect   { refreshToken? }   revokes at Google when it can, always forgets the link

'use strict';

const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError, select, upsert, needId, needDay, fitText } = require('../lib/db');

const router = express.Router();
const PROVIDER = 'google-health';
const SCOPE = 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const STEPS_URL = 'https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp';
// Must match the OAuth client's Authorized redirect URIs exactly. A Production hostname joins this list.
const REDIRECTS = ['https://soma-onkasary.onslate.com/settings/', 'http://localhost:3000/settings/'];
const MAX_DAYS = 85; // dailyRollUp allows 90 for steps; stay clear of the edge

const config = () => {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new HttpError(503, 'Google Health is not set up on the server yet');
  return { id, secret };
};
const needRedirect = (v) => { if (!REDIRECTS.includes(v)) throw new HttpError(400, 'redirectUri is not allowed'); return v; };
const needSecretText = (v, what) => { if (typeof v !== 'string' || v.length < 10 || v.length > 2048) throw new HttpError(400, 'bad ' + what); return v; };
const ukey = (userId) => needId(userId) + ':' + PROVIDER;
const findLink = (req) => select(req.admin, 'vault_tokens', `SELECT ROWID, ciphertext, created_ms FROM vault_tokens WHERE ukey = '${ukey(req.user.id)}'`);

async function google(url, init) {
  let res;
  try { res = await fetch(url, Object.assign({ signal: AbortSignal.timeout(20000) }, init)); }
  catch (_e) { throw new HttpError(502, 'Google did not answer'); }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_e) { /* an HTML error page */ }
  return { ok: res.ok, status: res.status, json };
}
const form = (values) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values).toString() });

router.get('/google-health', member, wrap(async (req, res) => {
  const rows = await findLink(req);
  res.json({
    configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    link: rows[0] ? { ciphertext: rows[0].ciphertext, createdMs: Number(rows[0].created_ms) || 0 } : null
  });
}));

router.post('/google-health/auth-url', member, wrap(async (req, res) => {
  const b = req.body || {};
  if (typeof b.state !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(b.state)) throw new HttpError(400, 'bad state');
  const redirect = needRedirect(b.redirectUri);
  const q = new URLSearchParams({
    client_id: config().id, redirect_uri: redirect, response_type: 'code', scope: SCOPE, state: b.state,
    // offline + consent: Google only hands out a refresh token when it shows the consent screen.
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false'
  });
  res.json({ url: AUTH_URL + '?' + q.toString() });
}));

router.post('/google-health/exchange', member, wrap(async (req, res) => {
  const b = req.body || {};
  const code = needSecretText(b.code, 'code'), redirect = needRedirect(b.redirectUri);
  const { id, secret } = config();
  const r = await google(TOKEN_URL, form({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' }));
  if (!r.ok) {
    console.error(JSON.stringify({ action: 'gh_exchange', status: r.status, error: r.json && r.json.error }));
    throw new HttpError(r.status === 400 ? 400 : 502, 'Google refused the sign-in code; try connecting again');
  }
  if (!r.json.refresh_token) throw new HttpError(502, 'Google sent no refresh token; remove Soma under myaccount.google.com/connections and connect again');
  if (!String(r.json.scope || '').split(' ').includes(SCOPE)) throw new HttpError(409, 'the activity permission was not ticked on Google\'s screen; connect again and allow it');
  res.json({ refreshToken: r.json.refresh_token });
}));

router.put('/google-health/link', member, wrap(async (req, res) => {
  const ciphertext = fitText('ciphertext', (req.body || {}).ciphertext, 4000);
  if (!ciphertext || !/^[A-Za-z0-9+/=]{40,}$/.test(ciphertext)) throw new HttpError(400, 'ciphertext must be base64');
  const key = ukey(req.user.id);
  await upsert(req.admin, 'vault_tokens', `SELECT ROWID FROM vault_tokens WHERE ukey = '${key}'`, { user_id: req.user.id, provider: PROVIDER, ukey: key, ciphertext, created_ms: Date.now() });
  res.json({ ok: true });
}));

// A rollup point covers one civil day. Field casing differs between Google's docs and its JSON mapping, so read both.
function readPoint(p) {
  const at = p.civilStartTime || p.civil_start_time || {};
  const date = at.date || at;
  const y = Number(date.year), m = Number(date.month), d = Number(date.day);
  if (!y || !m || !d) return null;
  const s = p.steps || {};
  const steps = Math.round(Number(s.countSum !== undefined ? s.countSum : s.count_sum !== undefined ? s.count_sum : s.count));
  if (!Number.isFinite(steps) || steps < 0) return null;
  return { day: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, steps: Math.min(steps, 1000000) };
}
const civil = (day) => ({ year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)), day: Number(day.slice(8, 10)) });

router.post('/google-health/sync', member, wrap(async (req, res) => {
  const b = req.body || {};
  const from = needDay(b.from), to = needDay(b.to);
  if (from > to) throw new HttpError(400, 'from is after to');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 >= MAX_DAYS) throw new HttpError(400, `at most ${MAX_DAYS} days a sync`);
  const refreshToken = needSecretText(b.refreshToken, 'refreshToken');
  const { id, secret } = config();

  const t = await google(TOKEN_URL, form({ refresh_token: refreshToken, client_id: id, client_secret: secret, grant_type: 'refresh_token' }));
  // invalid_grant: revoked, expired (7 days while the consent screen is in Testing), or the password changed.
  if (!t.ok) {
    if (t.json && t.json.error === 'invalid_grant') throw new HttpError(409, 'reconnect');
    console.error(JSON.stringify({ action: 'gh_refresh', status: t.status, error: t.json && t.json.error }));
    throw new HttpError(502, 'Google would not refresh the connection');
  }

  // The end of a civil range is exclusive, so ask for one day past `to`.
  const end = new Date(Date.parse(to) + 86400000).toISOString().slice(0, 10);
  const points = [];
  let pageToken;
  for (let page = 0; page < 5; page++) {
    const r = await google(STEPS_URL, { method: 'POST', headers: { authorization: 'Bearer ' + t.json.access_token, 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ range: { start: civil(from), end: civil(end) }, windowSizeDays: 1, pageSize: 200 }, pageToken ? { pageToken } : {})) });
    if (!r.ok) {
      const message = r.json && r.json.error && r.json.error.message;
      console.error(JSON.stringify({ action: 'gh_steps', status: r.status, error: message }));
      if (r.status === 401 || r.status === 403) throw new HttpError(409, 'reconnect');
      throw new HttpError(502, 'Google Health did not return steps' + (message ? ': ' + String(message).slice(0, 200) : ''));
    }
    points.push(...((r.json && (r.json.rollupDataPoints || r.json.rollup_data_points)) || []));
    pageToken = r.json && r.json.nextPageToken;
    if (!pageToken) break;
  }
  const days = points.map(readPoint).filter((p) => p && p.day >= from && p.day <= to);

  // One read, then two bulk writes: a 60-day backfill must fit well inside the 30 s limit.
  const uid = needId(req.user.id);
  const existing = await select(req.admin, 'activity', `SELECT ROWID, day, steps FROM activity WHERE user_id = ${uid} AND day >= '${from}' AND day <= '${to}' LIMIT 300`);
  const byDay = new Map(existing.map((r) => [r.day, r]));
  const inserts = [], updates = [];
  for (const p of days) {
    const row = byDay.get(p.day);
    if (row) {
      const had = row.steps === null || row.steps === '' || row.steps === undefined ? null : Number(row.steps);
      if (had !== p.steps && !(had === null && p.steps === 0)) updates.push({ ROWID: row.ROWID, steps: p.steps });
    }
    else if (p.steps > 0) inserts.push({ user_id: req.user.id, day: p.day, ukey: uid + ':' + p.day, steps: p.steps });
  }
  const table = req.admin.datastore().table('activity');
  if (updates.length) await table.updateRows(updates);
  if (inserts.length) {
    try { await table.insertRows(inserts); }
    catch (_e) {
      // Lost a race with a push-up save creating the same day: fall back to one upsert a row.
      for (const v of inserts) await upsert(req.admin, 'activity', `SELECT ROWID FROM activity WHERE ukey = '${v.ukey}'`, v);
    }
  }
  res.json({ days, written: updates.length + inserts.length });
}));

router.post('/google-health/disconnect', member, wrap(async (req, res) => {
  const token = (req.body || {}).refreshToken;
  let revoked = false;
  if (token !== undefined && token !== null) {
    const r = await google(REVOKE_URL, form({ token: needSecretText(token, 'refreshToken') })).catch(() => null);
    revoked = Boolean(r && r.ok);
  }
  const rows = await findLink(req);
  if (rows[0]) await req.admin.datastore().table('vault_tokens').deleteRow(rows[0].ROWID);
  res.json({ removed: Boolean(rows[0]), revoked });
}));

module.exports = router;
