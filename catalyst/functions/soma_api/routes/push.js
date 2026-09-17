// Web Push subscriptions for the evening nudge. One row per device. The sending is done by soma_jobs/nudge.js,
// on a cron; this file only keeps the list of devices and can ask for a test notification.
//
//   GET    /push                  { configured, publicKey }   the VAPID public key the browser subscribes with
//   PUT    /push/subscription     { endpoint, keys: { p256dh, auth }, tz }
//   DELETE /push/subscription     { endpoint }
//   POST   /push/test             queues a test notification to every device of the caller

'use strict';

const crypto = require('crypto');
const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError, select, upsert, needId } = require('../lib/db');

const router = express.Router();
const MAX_DEVICES = 8;
// The server will POST to whatever endpoint it is given, so only real push services are accepted.
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

function needEndpoint(v) {
  let url;
  try { url = new URL(v); } catch (_e) { throw new HttpError(400, 'bad endpoint'); }
  if (typeof v !== 'string' || v.length > 2000 || url.protocol !== 'https:' || !PUSH_HOSTS.some((h) => h.test(url.hostname))) throw new HttpError(400, 'endpoint is not a known push service');
  return v;
}
const needKey = (v, what) => { if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{16,200}={0,2}$/.test(v)) throw new HttpError(400, 'bad ' + what); return v; };
function needZone(v) {
  try { new Intl.DateTimeFormat('en', { timeZone: v }); } catch (_e) { throw new HttpError(400, 'unknown time zone'); }
  if (typeof v !== 'string' || v.length > 64) throw new HttpError(400, 'unknown time zone');
  return v;
}
const keyOf = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex');

router.get('/push', member, wrap(async (_req, res) => {
  res.json({ configured: Boolean(process.env.VAPID_PUBLIC_KEY), publicKey: process.env.VAPID_PUBLIC_KEY || null });
}));

router.put('/push/subscription', member, wrap(async (req, res) => {
  const b = req.body || {};
  const endpoint = needEndpoint(b.endpoint);
  const values = { user_id: req.user.id, ukey: keyOf(endpoint), endpoint, p256dh: needKey(b.keys && b.keys.p256dh, 'p256dh'), auth_secret: needKey(b.keys && b.keys.auth, 'auth'), tz: needZone(b.tz), fails: 0 };
  const mine = await select(req.admin, 'push_subs', `SELECT ROWID, ukey FROM push_subs WHERE user_id = ${needId(req.user.id)} LIMIT ${MAX_DEVICES + 1}`);
  if (mine.length >= MAX_DEVICES && !mine.some((r) => r.ukey === values.ukey)) throw new HttpError(409, 'too many devices; turn the nudge off on one first');
  // A device that changes hands (signs in as someone else) takes its subscription with it.
  await upsert(req.admin, 'push_subs', `SELECT ROWID FROM push_subs WHERE ukey = '${values.ukey}'`, values);
  res.json({ ok: true });
}));

router.delete('/push/subscription', member, wrap(async (req, res) => {
  const rows = await select(req.admin, 'push_subs', `SELECT ROWID FROM push_subs WHERE ukey = '${keyOf(needEndpoint((req.body || {}).endpoint))}' AND user_id = ${needId(req.user.id)}`);
  if (rows[0]) await req.admin.datastore().table('push_subs').deleteRow(rows[0].ROWID);
  res.json({ deleted: Boolean(rows[0]) });
}));

router.post('/push/test', member, wrap(async (req, res) => {
  const mine = await select(req.admin, 'push_subs', `SELECT ROWID FROM push_subs WHERE user_id = ${needId(req.user.id)} LIMIT 1`);
  if (!mine.length) throw new HttpError(409, 'no device has notifications on yet');
  try {
    await req.admin.jobScheduling().job().submitJob({ job_name: 'nt_' + Date.now().toString(36), target_type: 'Function', target_name: 'soma_jobs', jobpool_name: 'soma_jobs', params: { type: 'nudge', test: '1', user_id: req.user.id } });
  } catch (e) {
    console.error(JSON.stringify({ action: 'push_test', error: e.message }));
    throw new HttpError(502, 'could not queue the test');
  }
  res.status(202).json({ queued: true });
}));

module.exports = router;
