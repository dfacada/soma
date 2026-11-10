// Dayhub Ops: the admin's console for running Dayhub with many people (src/app/ops/). Every route needs an active admin,
// and these are, with routes/admin.js, the only routes that read across members. The rules live in lib/ops.js.
//
//   GET  /ops/badges                   open issues and unanswered messages, for the nav
//   GET  /ops/overview?since=&tz=      today's tiles, 14 days of people, the job's cohorts and funnel
//   GET  /ops/issues?tz=               every issue whose signal is still in the data, with its state
//   POST /ops/issues/:key/handled      { handled } — hide until the signal comes back, or show again
//   GET  /ops/people?q=&offset=&status=
//   GET  /ops/people/:userId?tz=       one person: who, days done or not, issues, errors, messages, AI use
//   POST /ops/people/:userId/reveal    { reason } — their food, weight and activity values, on the record
//   POST /ops/people/:userId/messages  { body } — shows in Dayhub as a message from the admin
//   POST /ops/people/:userId/delete    { confirm: their email, reason } — on their request, on the record
//   GET  /ops/errors                   problems grouped from 24 hours of the log, the alert switches
//   GET  /ops/errors/sample?area=&event=
//   POST /ops/errors/state             { area, event, action: mute | unmute | fixed | unfixed }
//   PUT  /ops/alerts                   { fresh, wide, api, deploy }
//   GET  /ops/support                  one thread a person
//   GET  /ops/audit?before=            what admins did
//
// What a person's page never shows: journal text (sealed with their passphrase; not even the server can open it),
// their check-in mood, and their values unless /reveal is used with a reason, which is written to the audit first.

'use strict';

const express = require('express');
const { admin, wrap, findProfile, isTestId } = require('../lib/auth');
const { HttpError, select, selectAll, needId, upsert, unpackJson } = require('../lib/db');
const { writeLog } = require('../lib/log');
const { LIMITS } = require('../lib/quota');
const { audit } = require('../lib/audit');
const ops = require('../lib/ops');
const { startDeletion } = require('./account');

const router = express.Router();
const { DAY, HOUR } = ops;
const SAFE_KEY = /^[a-z0-9_.:-]{1,120}$/;
const SLUG = /^[a-z0-9_.:-]{1,80}$/;
const BODY_MAX = 2000;
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const num = (v) => Number(v) || 0;
const parse = (text, fallback) => { try { return text ? JSON.parse(text) : fallback; } catch (_e) { return fallback; } };
const ids = (list) => [...new Set(list.map(String).filter((v) => /^\d{1,19}$/.test(v)))];

// ── State (ops_state: one row a key, JSON in value). Keys are read by exact name: Data Store's LIKE is a no-op. ──
async function getStates(req, keys) {
  const out = new Map();
  const safe = [...new Set(keys)].filter((k) => SAFE_KEY.test(k));
  for (let i = 0; i < safe.length; i += 60) {
    const rows = await select(req.admin, 'ops_state', `SELECT skey, value FROM ops_state WHERE skey IN (${safe.slice(i, i + 60).map((k) => `'${k}'`).join(', ')}) LIMIT 300`);
    for (const r of rows) out.set(r.skey, parse(r.value, {}));
  }
  return out;
}
async function setState(req, key, value) {
  if (!SAFE_KEY.test(key)) throw new HttpError(400, 'bad key');
  await upsert(req.admin, 'ops_state', `SELECT ROWID FROM ops_state WHERE skey = '${key}'`, { skey: key, value: JSON.stringify(value).slice(0, 9500), updated_ms: Date.now() });
}

/** user id → { name, email }, for everyone in `list`. */
async function peopleMap(req, list) {
  const out = new Map();
  const all = ids(list);
  for (let i = 0; i < all.length; i += 200) {
    const rows = await select(req.admin, 'profiles', `SELECT user_id, display_name, email FROM profiles WHERE user_id IN (${all.slice(i, i + 200).join(', ')}) LIMIT 300`);
    for (const r of rows) out.set(String(r.user_id), { name: r.display_name || '', email: r.email || '' });
  }
  return out;
}

/** Count rows, with Data Store answering COUNT as a string. */
async function count(req, table, where) {
  const rows = await select(req.admin, table, `SELECT COUNT(ROWID) FROM ${table} WHERE ${where}`);
  return num((rows[0] || {})['COUNT(ROWID)']);
}

// ── Issues ──
async function loadIssues(req, now, tz, uid = null) {
  const only = uid ? ` AND user_id = ${needId(uid)}` : '';
  const areas = [...new Set(ops.ISSUE_EVENTS.map(([a]) => a))], events = [...new Set(ops.ISSUE_EVENTS.map(([, e]) => e))];
  const wanted = new Set(ops.ISSUE_EVENTS.map(([a, e]) => a + '.' + e));
  const [logsRaw, groups, pending, quiet, messages, feedback] = await Promise.all([
    selectAll(req.admin, 'logs', `SELECT user_id, area, event, lvl, created_ms, message, detail, http_status FROM logs WHERE created_ms > ${now - 14 * DAY} AND is_test = false AND area IN (${areas.map((a) => `'${a}'`).join(', ')}) AND event IN (${events.map((e) => `'${e}'`).join(', ')})${only} ORDER BY created_ms DESC`, 1500),
    selectAll(req.admin, 'logs', `SELECT user_id, area, event, COUNT(ROWID), MIN(created_ms), MAX(created_ms) FROM logs WHERE lvl = 'error' AND is_test = false AND created_ms > ${now - DAY}${only} GROUP BY user_id, area, event ORDER BY user_id`, 1500),
    select(req.admin, 'profiles', `SELECT user_id, display_name, email, created_ms, CREATEDTIME, last_seen_ms FROM profiles WHERE status = 'pending'${only} LIMIT 300`),
    selectAll(req.admin, 'profiles', `SELECT user_id, closed_json, last_seen_ms FROM profiles WHERE status = 'active' AND closed_json IS NOT NULL AND last_seen_ms < ${now - 5 * DAY}${only} ORDER BY ROWID`, 3000),
    selectAll(req.admin, 'messages', `SELECT ROWID, user_id, body, created_ms FROM messages WHERE sender = 'member' AND read_ms IS NULL${only} ORDER BY created_ms DESC`, 900),
    select(req.admin, 'feedback', `SELECT ROWID, user_id, body, CREATEDTIME FROM feedback WHERE acknowledged = false${only} ORDER BY CREATEDTIME DESC LIMIT 200`)
  ]);
  const logs = logsRaw.filter((r) => wanted.has(r.area + '.' + r.event));
  const spread = new Map();
  const repeats = [];
  for (const g of groups) {
    const id = g.area + '.' + g.event;
    spread.set(id, (spread.get(id) || 0) + 1);
    const n = num(g['COUNT(ROWID)']);
    if (n >= 10 && g.user_id) repeats.push({ user_id: String(g.user_id), area: g.area, event: g.event, n, first: num(g['MIN(created_ms)']), last: num(g['MAX(created_ms)']) });
  }
  // Reminders need to know whether a dropped phone was replaced, and whether the nudge is still wanted.
  const goneIds = ids(logs.filter((r) => r.event === 'subscription_gone').map((r) => r.user_id));
  const subs = new Set(), nudgeOn = new Set();
  if (goneIds.length) {
    const [s, p] = await Promise.all([
      select(req.admin, 'push_subs', `SELECT user_id FROM push_subs WHERE user_id IN (${goneIds.join(', ')}) LIMIT 300`),
      select(req.admin, 'profiles', `SELECT user_id, settings_json FROM profiles WHERE user_id IN (${goneIds.join(', ')}) LIMIT 300`)
    ]);
    s.forEach((r) => subs.add(String(r.user_id)));
    p.forEach((r) => { const set = unpackJson(r.settings_json, {}); if (set && set.nudge && set.nudge.on === true) nudgeOn.add(String(r.user_id)); });
  }
  const people = await peopleMap(req, [...logs, ...repeats, ...pending, ...quiet, ...messages, ...feedback].map((r) => r.user_id));
  for (const p of pending) people.set(String(p.user_id), { name: p.display_name || '', email: p.email || '' });
  const src = { logs, repeats, spread, pending, quiet, messages, feedback, subs, nudgeOn, people, states: new Map() };
  const first = ops.detectIssues(src, now, tz);
  const states = await getStates(req, first.map((it) => 'issue:' + it.key));
  src.states = new Map([...states].map(([k, v]) => [k.slice(6), v]));
  return { issues: ops.detectIssues(src, now, tz), partial: logsRaw.length >= 1500 || groups.length >= 1500 };
}

router.get('/ops/badges', admin, wrap(async (req, res) => {
  const { issues } = await loadIssues(req, Date.now(), ops.zoneOr(req.query.tz));
  const c = ops.issueCounts(issues);
  res.json({ needs: c.needs, open: c.open, unanswered: c.byKind.Messages || 0, byKind: c.byKind, env: req.get('x-zc-environment') || null, release: process.env.SOMA_RELEASE || null });
}));

router.get('/ops/issues', admin, wrap(async (req, res) => {
  const now = Date.now();
  const { issues, partial } = await loadIssues(req, now, ops.zoneOr(req.query.tz));
  res.json({ issues, counts: ops.issueCounts(issues), partial, at: now });
}));

router.post('/ops/issues/:key/handled', admin, wrap(async (req, res) => {
  const key = String(req.params.key || '');
  if (!SAFE_KEY.test(key) || key.length > 110) throw new HttpError(400, 'bad issue');
  const handled = req.body && req.body.handled === true;
  await setState(req, 'issue:' + key, handled ? { handledAt: Date.now(), by: req.user.id } : { handledAt: 0, by: req.user.id });
  void audit(req, handled ? 'issue_handled' : 'issue_reopened', key.split(':')[1], null, { issue: key });
  res.json({ key, handled });
}));

// ── Overview ──
router.get('/ops/overview', admin, wrap(async (req, res) => {
  const now = Date.now();
  const since = /^\d{12,14}$/.test(String(req.query.since || '')) && num(req.query.since) > now - 2 * DAY ? num(req.query.since) : now - (now % DAY);
  const today = utcDay(now), yesterday = utcDay(now - DAY);
  const days = Array.from({ length: 14 }, (_, i) => utcDay(now - (13 - i) * DAY));
  const errWhere = (from, to) => `lvl = 'error' AND is_test = false AND created_ms > ${from} AND created_ms <= ${to}`;
  const [seenToday, seenWeek, members, newest, errors24, e1, e2, e3, ai, states] = await Promise.all([
    count(req, 'profiles', `status = 'active' AND last_seen_ms >= ${since}`),
    count(req, 'profiles', `status = 'active' AND last_seen_ms >= ${now - 7 * DAY}`),
    count(req, 'profiles', "status = 'active'"),
    select(req.admin, 'profiles', 'SELECT user_id, created_ms, CREATEDTIME, invited_by, status FROM profiles ORDER BY CREATEDTIME DESC LIMIT 300'),
    count(req, 'logs', errWhere(now - DAY, now)),
    count(req, 'logs', errWhere(now - 8 * DAY, now - 7 * DAY)),
    count(req, 'logs', errWhere(now - 15 * DAY, now - 14 * DAY)),
    count(req, 'logs', errWhere(now - 22 * DAY, now - 21 * DAY)),
    select(req.admin, 'ai_usage', `SELECT kind, SUM(amount) FROM ai_usage WHERE day = '${today}' GROUP BY kind`),
    getStates(req, ['cohorts', ...days.map((d) => 'day:' + d)])
  ]);
  const week = newest.filter((p) => ops.createdMs(p) >= now - 7 * DAY && p.status !== 'deleting');
  const usage = {};
  for (const r of ai) usage[r.kind] = num(r['SUM(amount)']);
  const y = states.get('day:' + yesterday) || null;
  const normal = [e1, e2, e3].filter((n) => n > 0);
  res.json({
    at: now,
    tiles: {
      seenToday, seenWeek, members,
      signupsWeek: week.length, signupsCapped: week.length >= 300, invitedWeek: week.filter((p) => p.invited_by).length,
      closedYesterday: y && typeof y.closed === 'number' ? { closed: y.closed, of: y.seen || y.logged || 0, logged: y.logged || 0 } : null,
      errors24, errorsNormal: normal.length ? Math.round(normal.reduce((a, b) => a + b, 0) / normal.length) : null,
      ai: usage, limits: Object.fromEntries(Object.entries(LIMITS).map(([k, v]) => [k, v.max])),
      release: process.env.SOMA_RELEASE || null
    },
    days: days.map((d) => { const s = states.get('day:' + d) || {}; return { day: d, seen: d === today ? Math.max(seenToday, num(s.seen)) : (typeof s.seen === 'number' ? s.seen : null), closed: typeof s.closed === 'number' ? s.closed : null, logged: typeof s.logged === 'number' ? s.logged : null, signups: typeof s.signups === 'number' ? s.signups : null }; }),
    cohorts: states.get('cohorts') || null
  });
}));

// ── People ──
const shapePerson = (r) => ({
  userId: String(r.user_id), name: r.display_name || '', email: r.email || '', role: r.role, status: r.status,
  joinedMs: ops.createdMs(r) || null, lastSeenMs: num(r.last_seen_ms) || null, invitedBy: r.invited_by ? String(r.invited_by) : null, device: r.last_device || null
});
const LIST_COLS = 'user_id, display_name, email, role, status, last_seen_ms, invited_by, created_ms, CREATEDTIME, last_device';

router.get('/ops/people', admin, wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const status = req.query.status;
  if (status !== undefined && !['pending', 'active', 'disabled', 'deleting'].includes(status)) throw new HttpError(400, 'unknown status');
  const where = status ? ` WHERE status = '${status}'` : '';
  if (/^\d{6,19}$/.test(q)) {
    const rows = await select(req.admin, 'profiles', `SELECT ${LIST_COLS} FROM profiles WHERE user_id = ${q}`);
    return res.json({ people: rows.map(shapePerson), more: false, scanned: rows.length });
  }
  if (q) {
    // Data Store has no working LIKE: read names and emails a page at a time and match here, at most 3,000 people.
    const rows = await selectAll(req.admin, 'profiles', `SELECT ${LIST_COLS} FROM profiles${where} ORDER BY ROWID DESC`, 3000);
    const hit = rows.filter((r) => ops.matches(r, q)).slice(0, 100);
    return res.json({ people: hit.map(shapePerson), more: false, scanned: rows.length, partial: rows.length >= 3000 });
  }
  const offset = Math.max(0, Math.min(num(req.query.offset), 30000));
  const rows = await select(req.admin, 'profiles', `SELECT ${LIST_COLS} FROM profiles${where} ORDER BY CREATEDTIME DESC LIMIT ${offset}, 100`);
  res.json({ people: rows.map(shapePerson), more: rows.length === 100, next: offset + rows.length });
}));

/** Move names, without their goals: Ops shows what someone chose to track, never how much. */
const MOVE_NAMES = { pushups: 'push-ups', run: 'run', walk: 'walk', steps: 'steps', cycle: 'cycle', yoga: 'yoga', swim: 'swim', gym: 'gym', sport: 'sport' };
function movesOf(settings) {
  const list = Array.isArray(settings.moves) ? settings.moves : null;
  if (!list) return { moves: ['push-ups'], legacy: true };
  const main = settings.mainMove;
  return { moves: list.filter((m) => m && typeof m.key === 'string').slice(0, 12).map((m) => (MOVE_NAMES[m.key] || String(m.name || 'own move').slice(0, 30)) + (m.key === main ? ' (main)' : '')), legacy: false };
}

async function personRow(req) {
  const uid = needId(req.params.userId, 'user id');
  const rows = await select(req.admin, 'profiles', `SELECT ROWID, ${LIST_COLS}, settings_json, closed_json FROM profiles WHERE user_id = ${uid}`);
  if (!rows[0]) throw new HttpError(404, 'no such person');
  return rows[0];
}

/** The person's own clock, if a phone of theirs told us (push_subs.tz); the admin's otherwise. */
async function zoneOf(req, uid, fallback) {
  const rows = await select(req.admin, 'push_subs', `SELECT tz FROM push_subs WHERE user_id = ${uid} LIMIT 5`);
  return ops.zoneOr(rows.map((r) => r.tz).find(Boolean) || fallback);
}

router.get('/ops/people/:userId', admin, wrap(async (req, res) => {
  const now = Date.now(), tzAdmin = ops.zoneOr(req.query.tz);
  const p = await personRow(req);
  const uid = String(p.user_id);
  const tz = await zoneOf(req, uid, tzAdmin);
  const days = Array.from({ length: 14 }, (_, i) => ops.dayIn(now - i * DAY, tz));
  const from = days[days.length - 1];
  const fromMs = Date.parse(from + 'T00:00:00Z') - 14 * HOUR;
  const settings = unpackJson(p.settings_json, {}) || {};
  const [weight, checkins, logs, activity, entries, entryCount, errors, msgs, fb, ai, issuesOut, inviter] = await Promise.all([
    select(req.admin, 'weight', `SELECT day FROM weight WHERE user_id = ${uid} AND day >= '${from}' LIMIT 60`),
    select(req.admin, 'checkins', `SELECT day, mood FROM checkins WHERE user_id = ${uid} AND day >= '${from}' LIMIT 60`),
    select(req.admin, 'day_logs', `SELECT day, meals_json FROM day_logs WHERE user_id = ${uid} AND day >= '${from}' LIMIT 60`),
    select(req.admin, 'activity', `SELECT day, pushups, types_json, steps FROM activity WHERE user_id = ${uid} AND day >= '${from}' LIMIT 60`),
    select(req.admin, 'entries', `SELECT created_ms FROM entries WHERE user_id = ${uid} AND created_ms >= ${fromMs} ORDER BY created_ms DESC LIMIT 300`),
    select(req.admin, 'entries', `SELECT COUNT(ROWID), MAX(created_ms) FROM entries WHERE user_id = ${uid}`),
    select(req.admin, 'logs', `SELECT created_ms, lvl, source, area, event, message, detail, http_status FROM logs WHERE user_id = ${uid} AND lvl IN ('error', 'warn') AND created_ms > ${now - 7 * DAY} ORDER BY created_ms DESC LIMIT 50`),
    select(req.admin, 'messages', `SELECT ROWID, sender, author_id, body, created_ms, read_ms FROM messages WHERE user_id = ${uid} ORDER BY created_ms DESC LIMIT 100`),
    select(req.admin, 'feedback', `SELECT ROWID, body, acknowledged, CREATEDTIME FROM feedback WHERE user_id = ${uid} ORDER BY CREATEDTIME DESC LIMIT 50`),
    select(req.admin, 'ai_usage', `SELECT kind, SUM(amount) FROM ai_usage WHERE user_id = ${uid} AND day = '${utcDay(now)}' GROUP BY kind`),
    loadIssues(req, now, tzAdmin, uid),
    p.invited_by ? findProfile(req.admin, String(p.invited_by)).catch(() => null) : Promise.resolve(null)
  ]);
  void audit(req, 'person_viewed', uid, null, null);
  const grid = ops.doneGrid({ weight, checkins, logs, activity, entries }, days, settings, (ms) => ops.dayIn(ms, tz));
  const used = {};
  for (const r of ai) used[r.kind] = num(r['SUM(amount)']);
  const authors = await peopleMap(req, msgs.filter((m) => m.sender === 'admin').map((m) => m.author_id));
  const thread = msgs.map((m) => ({ at: num(m.created_ms), sender: m.sender === 'admin' ? 'admin' : 'member', who: m.sender === 'admin' ? ops.shortName((authors.get(String(m.author_id)) || {}).name, (authors.get(String(m.author_id)) || {}).email) : null, body: m.body || '', read: Boolean(num(m.read_ms)) }))
    .concat(fb.map((f) => ({ at: ops.createdMs(f), sender: 'member', who: null, body: f.body || '', read: f.acknowledged === true || f.acknowledged === 'true', feedback: true })))
    .sort((a, b) => a.at - b.at);
  res.json({
    person: Object.assign(shapePerson(p), {
      shortName: ops.shortName(p.display_name, p.email), first: ops.firstName(p.display_name, p.email),
      invitedByName: inviter ? ops.shortName(inviter.display_name, inviter.email) : null,
      zone: tz, moves: movesOf(settings), requireWeight: grid.requireWeight
    }),
    days: grid.days, closed: grid.days.filter((d) => d.closed).length, streak: ops.streakOf(grid.days),
    journal: { entries: num((entryCount[0] || {})['COUNT(ROWID)']), lastMs: num((entryCount[0] || {})['MAX(created_ms)']) || null },
    issues: issuesOut.issues,
    errors: errors.map((r) => { const d = parse(r.detail, {}); return { at: num(r.created_ms), level: r.lvl, source: r.source, area: r.area, event: r.event, message: r.message || '', status: r.http_status ? num(r.http_status) : null, screen: typeof d.screen === 'string' ? d.screen.slice(0, 40) : null, device: d.ua ? ops.deviceOf(d.ua) : null }; }),
    thread,
    ai: Object.entries(LIMITS).map(([kind, l]) => ({ kind, what: l.what, used: used[kind] || 0, max: l.max })),
    self: uid === req.user.id
  });
}));

// The person's values for the last 14 days, for a support reason. The look is written to the audit before anything is
// read; if the audit cannot be written, nothing is shown. Check-in moods and the journal are never part of this.
router.post('/ops/people/:userId/reveal', admin, wrap(async (req, res) => {
  const reason = String((req.body && req.body.reason) || '').trim();
  if (reason.length < 4 || reason.length > 200) throw new HttpError(400, 'say why you need to see them, in a few words');
  const p = await personRow(req);
  const uid = String(p.user_id);
  try { await audit(req, 'values_shown', uid, reason, { days: 14 }, true); }
  catch (_e) { throw new HttpError(503, "Couldn't write the audit, so nothing was shown. Try again."); }
  const tz = await zoneOf(req, uid, ops.zoneOr(req.query.tz));
  const from = ops.dayIn(Date.now() - 13 * DAY, tz);
  const settings = unpackJson(p.settings_json, {}) || {};
  const [weight, logs, activity] = await Promise.all([
    select(req.admin, 'weight', `SELECT day, value FROM weight WHERE user_id = ${uid} AND day >= '${from}' ORDER BY day DESC LIMIT 60`),
    select(req.admin, 'day_logs', `SELECT day, meals_json, extras_json FROM day_logs WHERE user_id = ${uid} AND day >= '${from}' ORDER BY day DESC LIMIT 60`),
    select(req.admin, 'activity', `SELECT day, pushups, types_json, steps FROM activity WHERE user_id = ${uid} AND day >= '${from}' ORDER BY day DESC LIMIT 60`)
  ]);
  const meal = (v) => (v && typeof v === 'object' ? { name: String(v.name || 'meal').slice(0, 60), kcal: num(v.kcal) || null } : v ? { name: 'eaten', kcal: null } : null);
  res.json({
    reason, unit: settings.units === 'kg' ? 'kg' : 'lb',
    weight: weight.map((r) => ({ day: r.day, value: num(r.value) })),
    food: logs.map((r) => { const m = parse(r.meals_json, {}); return { day: r.day, meals: Object.fromEntries(['breakfast', 'lunch', 'snack', 'dinner'].map((k) => [k, meal(m[k])])) }; }),
    activity: activity.map((r) => ({ day: r.day, pushups: num(r.pushups), steps: num(r.steps), types: parse(r.types_json, {}) }))
  });
}));

router.post('/ops/people/:userId/messages', admin, wrap(async (req, res) => {
  const body = String((req.body && req.body.body) || '').trim();
  if (!body) throw new HttpError(400, 'write something first');
  if (body.length > BODY_MAX) throw new HttpError(413, `keep it under ${BODY_MAX} characters`);
  const p = await personRow(req);
  const uid = String(p.user_id);
  if (p.status === 'deleting') throw new HttpError(409, 'this account is being deleted');
  const now = Date.now();
  const row = await req.admin.datastore().table('messages').insertRow({ user_id: uid, sender: 'admin', author_id: req.user.id, body, created_ms: now });
  // A reply answers what they wrote: their messages are read and their old feedback acknowledged.
  const [open, fb] = await Promise.all([
    select(req.admin, 'messages', `SELECT ROWID FROM messages WHERE user_id = ${uid} AND sender = 'member' AND read_ms IS NULL LIMIT 200`),
    select(req.admin, 'feedback', `SELECT ROWID FROM feedback WHERE user_id = ${uid} AND acknowledged = false LIMIT 200`)
  ]);
  if (open.length) await req.admin.datastore().table('messages').updateRows(open.map((r) => ({ ROWID: r.ROWID, read_ms: now }))).catch((e) => writeLog(req.admin, { level: 'warn', source: 'api', area: 'ops', event: 'mark_read_failed', message: e.message }));
  if (fb.length) await req.admin.datastore().table('feedback').updateRows(fb.map((r) => ({ ROWID: r.ROWID, acknowledged: 'true' }))).catch((e) => writeLog(req.admin, { level: 'warn', source: 'api', area: 'ops', event: 'ack_failed', message: e.message }));
  void audit(req, 'message_sent', uid, null, { chars: body.length });
  res.status(201).json({ id: String(row.ROWID), at: now, sender: 'admin', body });
}));

router.post('/ops/people/:userId/delete', admin, wrap(async (req, res) => {
  const b = req.body || {};
  const reason = String(b.reason || '').trim();
  const p = await personRow(req);
  const uid = String(p.user_id);
  if (uid === req.user.id) throw new HttpError(409, 'you cannot delete your own account here');
  if (p.role === 'admin') throw new HttpError(409, 'make them a member first: an admin account cannot be deleted');
  if (p.status === 'deleting') throw new HttpError(409, 'this account is already being deleted');
  if (String(b.confirm || '').trim().toLowerCase() !== String(p.email || '').toLowerCase() || !p.email) throw new HttpError(400, 'type their email exactly to confirm');
  if (reason.length < 4 || reason.length > 200) throw new HttpError(400, 'say whose request this is, in a few words');
  // Nothing that names them stays in the audit once their account is gone: the id and the reason, not the email.
  try { await audit(req, 'account_deleted', uid, reason, null, true); }
  catch (_e) { throw new HttpError(503, "Couldn't write the audit, so nothing was deleted. Try again."); }
  res.status(202).json(await startDeletion(req, { uid, rowId: String(p.ROWID), test: false }));
}));

// ── Errors ──
router.get('/ops/errors', admin, wrap(async (req, res) => {
  const now = Date.now();
  const lv = "lvl IN ('error', 'warn') AND is_test = false";
  const [rows, history, alerts, e1, e2, e3] = await Promise.all([
    selectAll(req.admin, 'logs', `SELECT area, event, lvl, user_id, created_ms, message, detail FROM logs WHERE ${lv} AND created_ms > ${now - DAY} ORDER BY created_ms DESC`, 3000),
    select(req.admin, 'logs', `SELECT area, event, MIN(created_ms) FROM logs WHERE ${lv} GROUP BY area, event LIMIT 300`),
    getStates(req, ['alerts']),
    count(req, 'logs', `lvl = 'error' AND is_test = false AND created_ms > ${now - 8 * DAY} AND created_ms <= ${now - 7 * DAY}`),
    count(req, 'logs', `lvl = 'error' AND is_test = false AND created_ms > ${now - 15 * DAY} AND created_ms <= ${now - 14 * DAY}`),
    count(req, 'logs', `lvl = 'error' AND is_test = false AND created_ms > ${now - 22 * DAY} AND created_ms <= ${now - 21 * DAY}`)
  ]);
  const keys = [...new Set(rows.map((r) => `err:${r.area}.${r.event}`))];
  const states = await getStates(req, keys);
  const problems = ops.groupProblems(rows, history.map((h) => ({ area: h.area, event: h.event, first: h['MIN(created_ms)'] })), new Map([...states].map(([k, v]) => [k.slice(4), v])), now);
  const normal = [e1, e2, e3].filter((n) => n > 0);
  res.json({
    at: now, problems, errors24: rows.filter((r) => r.lvl === 'error').length, warnings24: rows.filter((r) => r.lvl === 'warn').length, capped: rows.length >= 3000,
    normal: normal.length ? Math.round(normal.reduce((a, b) => a + b, 0) / normal.length) : null,
    alerts: Object.assign({ fresh: true, wide: true, api: true, deploy: false }, alerts.get('alerts') || {}),
    retentionDays: 30
  });
}));

router.get('/ops/errors/sample', admin, wrap(async (req, res) => {
  const area = String(req.query.area || ''), event = String(req.query.event || '');
  if (!SLUG.test(area) || !SLUG.test(event)) throw new HttpError(400, 'bad problem');
  const rows = await select(req.admin, 'logs', `SELECT created_ms, lvl, source, message, detail, http_status FROM logs WHERE area = '${area}' AND event = '${event}' AND is_test = false ORDER BY created_ms DESC LIMIT 1`);
  const r = rows[0];
  res.json({ sample: r ? { at: num(r.created_ms), level: r.lvl, source: r.source, message: r.message || '', detail: r.detail || null, status: r.http_status ? num(r.http_status) : null } : null });
}));

router.post('/ops/errors/state', admin, wrap(async (req, res) => {
  const b = req.body || {};
  const area = String(b.area || ''), event = String(b.event || '');
  if (!SLUG.test(area) || !SLUG.test(event)) throw new HttpError(400, 'bad problem');
  const key = `err:${area}.${event}`;
  const cur = (await getStates(req, [key])).get(key) || {};
  const now = Date.now();
  const next = b.action === 'mute' ? Object.assign({}, cur, { mutedUntil: now + DAY })
    : b.action === 'unmute' ? Object.assign({}, cur, { mutedUntil: 0 })
      : b.action === 'fixed' ? Object.assign({}, cur, { fixedAt: now, mutedUntil: 0 })
        : b.action === 'unfixed' ? Object.assign({}, cur, { fixedAt: 0 }) : null;
  if (!next) throw new HttpError(400, 'action must be mute, unmute, fixed or unfixed');
  await setState(req, key, next);
  void audit(req, 'error_' + b.action, null, null, { problem: `${area}.${event}` });
  res.json({ problem: `${area}.${event}`, mutedUntil: next.mutedUntil || null, fixedAt: next.fixedAt || null });
}));

router.put('/ops/alerts', admin, wrap(async (req, res) => {
  const b = req.body || {};
  const next = {};
  for (const k of ['fresh', 'wide', 'api', 'deploy']) if (typeof b[k] === 'boolean') next[k] = b[k];
  if (!Object.keys(next).length) throw new HttpError(400, 'nothing to change');
  const cur = (await getStates(req, ['alerts'])).get('alerts') || {};
  const value = Object.assign({ fresh: true, wide: true, api: true, deploy: false }, cur, next);
  await setState(req, 'alerts', value);
  void audit(req, 'alerts_changed', null, null, next);
  res.json({ alerts: value });
}));

// ── Support ──
router.get('/ops/support', admin, wrap(async (req, res) => {
  const now = Date.now();
  const [msgs, fb] = await Promise.all([
    selectAll(req.admin, 'messages', `SELECT user_id, sender, body, created_ms, read_ms FROM messages WHERE created_ms > ${now - 90 * DAY} ORDER BY created_ms DESC`, 1500),
    select(req.admin, 'feedback', 'SELECT user_id, body, acknowledged, CREATEDTIME FROM feedback ORDER BY CREATEDTIME DESC LIMIT 200')
  ]);
  // The synthetic test members write on every test run; their threads are not anyone's to answer.
  const real = (r) => !isTestId(r.user_id);
  const list = ops.threads(msgs.filter(real), fb.filter(real).filter((f) => !(f.acknowledged === true || f.acknowledged === 'true') || ops.createdMs(f) > now - 90 * DAY));
  const people = await peopleMap(req, list.map((t) => t.userId));
  res.json({ threads: list.slice(0, 200).map((t) => { const p = people.get(t.userId) || { name: '', email: '' }; return Object.assign(t, { person: ops.shortName(p.name, p.email), email: p.email }); }) });
}));

// ── Audit ──
router.get('/ops/audit', admin, wrap(async (req, res) => {
  const before = /^\d{12,14}$/.test(String(req.query.before || '')) ? num(req.query.before) : Date.now() + 1;
  const rows = await select(req.admin, 'ops_audit', `SELECT created_ms, actor_id, action, target_id, reason, detail FROM ops_audit WHERE created_ms < ${before} ORDER BY created_ms DESC LIMIT 100`);
  const people = await peopleMap(req, rows.flatMap((r) => [r.actor_id, r.target_id]).filter(Boolean));
  const name = (id) => { if (!id) return null; const p = people.get(String(id)); return p ? ops.shortName(p.name, p.email) : 'someone since deleted'; };
  res.json({
    items: rows.map((r) => ({ at: num(r.created_ms), actor: name(r.actor_id), actorId: String(r.actor_id), action: r.action, target: name(r.target_id), targetId: r.target_id ? String(r.target_id) : null, reason: r.reason || null, detail: parse(r.detail, null) })),
    more: rows.length === 100
  });
}));

module.exports = router;
