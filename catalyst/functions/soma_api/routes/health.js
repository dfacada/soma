// Google Health (what the Fitbit Web API became in 2026). Steps and sleep, read-only.
// Steps are activity: stored in activity.steps, server-readable. Sleep is health data: this function reads it from
// Google and hands it to the browser, which stores it as vault ciphertext, one blob a month (health_months).
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
//   POST   /google-health/sync         { refreshToken, from, to } → { days: [{ day, steps }], sleep: [night] | null }
//                                       sleep is null when the sleep permission was not granted; nothing of it is stored here
//   GET    /health-months?from=YYYY-MM&to=YYYY-MM   [{ month, ciphertext }]
//   PUT    /health-months/:month       { ciphertext }
//   DELETE /health-months/:month
//   POST   /google-health/disconnect   { refreshToken? }   revokes at Google when it can, always forgets the link

'use strict';

const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError, select, upsert, needId, needDay, fitText } = require('../lib/db');
const { writeLog } = require('../lib/log');

const note = (req, event, message, detail, level) => writeLog(req.admin, { level: level || 'error', source: 'api', area: 'google-health', event, message, detail, userId: req.user.id, test: req.user.id === '999000000000000001' });

const router = express.Router();
const PROVIDER = 'google-health';
const SCOPE = 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly';
// Asked for, but not required: Google lets people untick a permission, and steps still work without this one.
const SLEEP_SCOPE = 'https://www.googleapis.com/auth/googlehealth.sleep.readonly';
const SLEEP_URL = 'https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints';
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
    client_id: config().id, redirect_uri: redirect, response_type: 'code', scope: SCOPE + ' ' + SLEEP_SCOPE, state: b.state,
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
    await note(req, 'exchange_refused', 'Google refused the sign-in code', { status: r.status, error: r.json && r.json.error }, 'warn');
    throw new HttpError(r.status === 400 ? 400 : 502, 'Google refused the sign-in code; try connecting again');
  }
  if (!r.json.refresh_token) throw new HttpError(502, 'Google sent no refresh token; remove Soma under myaccount.google.com/connections and connect again');
  if (!String(r.json.scope || '').split(' ').includes(SCOPE)) throw new HttpError(409, 'the activity permission was not ticked on Google\'s screen; connect again and allow it');
  res.json({ refreshToken: r.json.refresh_token, sleep: String(r.json.scope || '').split(' ').includes(SLEEP_SCOPE) });
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
// CivilDateTime is { date: { year, month, day }, time? }. A bare { year, month, day } is a 400 (found on the first real sync).
// One sleep session → the night it belongs to: the local day you woke up on. Naps are left out.
// Shape as Google's own CLI reads it: sleep.interval, sleep.metadata.nap, sleep.summary.{minutesAsleep,…,stagesSummary[]}.
function readNight(p) {
  const s = p.sleep || {};
  const iv = s.interval || {}, sum = s.summary || {};
  if ((s.metadata && s.metadata.nap) || !iv.endTime) return null;
  const local = (iso, offset) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t + (parseInt(offset, 10) || 0) * 1000).toISOString() : null; };
  const end = local(iv.endTime, iv.endUtcOffset), start = local(iv.startTime, iv.startUtcOffset);
  const asleep = Math.round(Number(sum.minutesAsleep));
  if (!end || !Number.isFinite(asleep) || asleep <= 0) return null;
  const stage = (name) => Math.round((sum.stagesSummary || []).filter((x) => String(x.type || '').toUpperCase().includes(name)).reduce((n, x) => n + (Number(x.minutes) || 0), 0));
  return {
    day: end.slice(0, 10), asleep, awake: Math.round(Number(sum.minutesAwake)) || 0, inBed: Math.round(Number(sum.minutesInSleepPeriod)) || 0,
    deep: stage('DEEP'), rem: stage('REM'), light: stage('LIGHT'), start: start ? start.slice(11, 16) : '', end: end.slice(11, 16)
  };
}
// Two sessions ending on one day (woke at 4, slept again) are one night: minutes add up, the clock runs first start to last end.
function mergeNights(list) {
  const byDay = new Map();
  for (const n of list.sort((a, b) => (a.day + a.end < b.day + b.end ? -1 : 1))) {
    const had = byDay.get(n.day);
    if (!had) { byDay.set(n.day, n); continue; }
    for (const f of ['asleep', 'awake', 'inBed', 'deep', 'rem', 'light']) had[f] += n[f];
    had.end = n.end;
  }
  return [...byDay.values()];
}

// Returns null when the token has no sleep permission: the caller treats that as "not granted", not as a failure.
async function fetchSleep(accessToken, from, end) {
  const filter = `sleep.interval.civil_end_time >= "${from}T00:00:00" AND sleep.interval.civil_end_time < "${end}T00:00:00"`;
  const points = [];
  let pageToken;
  for (let page = 0; page < 8; page++) {
    // Google caps sleep at 25 sessions a page.
    const q = new URLSearchParams(Object.assign({ filter, pageSize: '25' }, pageToken ? { pageToken } : {}));
    const r = await google(SLEEP_URL + '?' + q.toString(), { headers: { authorization: 'Bearer ' + accessToken, accept: 'application/json' } });
    if (r.status === 401 || r.status === 403) return null;
    if (!r.ok) {
      const e = r.json && r.json.error;
      console.error(JSON.stringify({ action: 'gh_sleep', status: r.status, error: e && e.message, details: e && e.details, from, end }));
      throw new HttpError(502, 'Google Health did not return sleep' + (e && e.message ? ': ' + String(e.message).slice(0, 200) : ''));
    }
    points.push(...((r.json && r.json.dataPoints) || []));
    pageToken = r.json && r.json.nextPageToken;
    if (!pageToken) break;
  }
  const nights = points.map(readNight).filter(Boolean);
  if (points.length && !nights.length) {
    const s = points[0].sleep || {};
    console.error(JSON.stringify({ action: 'gh_sleep_shape', keys: Object.keys(points[0]), sleep: Object.keys(s), interval: Object.keys(s.interval || {}), summary: Object.keys(s.summary || {}) }));
  }
  return mergeNights(nights);
}

const civil = (day) => ({ date: { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)), day: Number(day.slice(8, 10)) } });

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
    if (t.json && t.json.error === 'invalid_grant') { await note(req, 'token_dead', 'Google ended the connection (revoked, expired, or 7-day Testing limit)', { error: 'invalid_grant' }, 'warn'); throw new HttpError(409, 'reconnect'); }
    console.error(JSON.stringify({ action: 'gh_refresh', status: t.status, error: t.json && t.json.error }));
    throw new HttpError(502, 'Google would not refresh the connection');
  }

  // The end of a civil range is exclusive, so ask for one day past `to`.
  const end = new Date(Date.parse(to) + 86400000).toISOString().slice(0, 10);
  // Sleep runs alongside the steps pages. Its failure must not cost the steps, so it is settled, not awaited bare.
  const sleeping = fetchSleep(t.json.access_token, from, end).then((nights) => ({ nights }), (error) => ({ error }));
  const points = [];
  let pageToken;
  for (let page = 0; page < 5; page++) {
    const r = await google(STEPS_URL, { method: 'POST', headers: { authorization: 'Bearer ' + t.json.access_token, 'content-type': 'application/json' },
      // The same body Google's own CLI sends. windowSizeDays is "optional" but the live API 400s without it, and a
      // pageSize here was answered with a bare "Invalid argument".
      body: JSON.stringify(Object.assign({ range: { start: civil(from), end: civil(end) }, windowSizeDays: 1 }, pageToken ? { pageToken } : {})) });
    if (!r.ok) {
      const message = r.json && r.json.error && r.json.error.message;
      console.error(JSON.stringify({ action: 'gh_steps', status: r.status, error: message, details: r.json && r.json.error && r.json.error.details, from, end }));
      await note(req, 'steps_failed', message || 'Google Health did not return steps', { status: r.status, details: r.json && r.json.error && r.json.error.details, from, end });
      if (r.status === 401 || r.status === 403) throw new HttpError(409, 'reconnect');
      throw new HttpError(502, 'Google Health did not return steps' + (message ? ': ' + String(message).slice(0, 200) : ''));
    }
    points.push(...((r.json && (r.json.rollupDataPoints || r.json.rollup_data_points)) || []));
    pageToken = r.json && r.json.nextPageToken;
    if (!pageToken) break;
  }
  const days = points.map(readPoint).filter((p) => p && p.day >= from && p.day <= to);
  if (points.length && !days.length) console.error(JSON.stringify({ action: 'gh_shape', keys: Object.keys(points[0]), start: Object.keys(points[0].civilStartTime || {}), steps: Object.keys(points[0].steps || {}) }));

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
  const slept = await sleeping;
  if (slept.error) await note(req, 'sleep_failed', slept.error.message, { from, end });
  if (points.length && !days.length) await note(req, 'steps_unreadable', 'Google returned step points that could not be read', { keys: Object.keys(points[0]) });
  res.json({ days, written: updates.length + inserts.length, sleep: slept.error ? null : slept.nights, sleepError: slept.error ? slept.error.message : null });
}));

// ── Encrypted health data, one blob per user per month. The server cannot read these and never tries. ──
const needMonth = (v) => { if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw new HttpError(400, 'month must be YYYY-MM'); return v; };

router.get('/health-months', member, wrap(async (req, res) => {
  const from = needMonth(req.query.from), to = needMonth(req.query.to);
  if (from > to) throw new HttpError(400, 'from is after to');
  const rows = await select(req.admin, 'health_months', `SELECT ym, ciphertext FROM health_months WHERE user_id = ${needId(req.user.id)} AND ym >= '${from}' AND ym <= '${to}' ORDER BY ym ASC LIMIT 36`);
  res.json({ months: rows.map((r) => ({ month: r.ym, ciphertext: r.ciphertext })) });
}));

router.put('/health-months/:month', member, wrap(async (req, res) => {
  const month = needMonth(req.params.month);
  const ciphertext = fitText('ciphertext', (req.body || {}).ciphertext);
  if (!ciphertext || !/^[A-Za-z0-9+/=]{40,}$/.test(ciphertext)) throw new HttpError(400, 'ciphertext must be base64');
  const key = needId(req.user.id) + ':' + month;
  await upsert(req.admin, 'health_months', `SELECT ROWID FROM health_months WHERE ukey = '${key}'`, { user_id: req.user.id, ym: month, ukey: key, ciphertext });
  res.json({ ok: true });
}));

router.delete('/health-months/:month', member, wrap(async (req, res) => {
  const rows = await select(req.admin, 'health_months', `SELECT ROWID FROM health_months WHERE ukey = '${needId(req.user.id)}:${needMonth(req.params.month)}'`);
  if (rows[0]) await req.admin.datastore().table('health_months').deleteRow(rows[0].ROWID);
  res.json({ deleted: Boolean(rows[0]) });
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
// For scripts/test-health-parse.mjs: the parsers are pure.
module.exports.parse = { readPoint, readNight, mergeNights };
