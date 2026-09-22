// Admin: approvals and users, error reports, feedback. Every route needs an active admin.
// These are the only routes that read across users.

'use strict';

const express = require('express');
const { admin, wrap, findProfile, STATUSES, PROFILE_COLS } = require('../lib/auth');
const { HttpError, select, needId, bool } = require('../lib/db');

const router = express.Router();

const shapeProfile = (r) => ({
  userId: String(r.user_id), email: r.email, displayName: r.display_name || '', role: r.role, status: r.status,
  createdAt: r.CREATEDTIME, lastSeenMs: Number(r.last_seen_ms || 0) || null
});

router.get('/admin/profiles', admin, wrap(async (req, res) => {
  const status = req.query.status;
  if (status !== undefined && !STATUSES.includes(status)) throw new HttpError(400, 'unknown status');
  const where = status ? ` WHERE status = '${status}'` : '';
  const rows = await select(req.admin, 'profiles', `SELECT ${PROFILE_COLS} FROM profiles${where} ORDER BY CREATEDTIME DESC LIMIT 200`);
  res.json({ profiles: rows.map(shapeProfile) });
}));

// What one member has been doing lately, for the admin's activity view. Counts and dates only: no journal text ever
// leaves the vault, and only the fact that an entry exists is read here. Five reads, on demand, never on a list.
router.get('/admin/profiles/:userId/activity', admin, wrap(async (req, res) => {
  const row = await findProfile(req.admin, needId(req.params.userId, 'user id'));
  if (!row) throw new HttpError(404, 'no such user');
  const uid = needId(String(row.user_id));
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 60);
  const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const fromMs = Date.parse(from + 'T00:00:00Z') - 14 * 3600 * 1000;

  const [checkins, logs, activity, weight, entries] = await Promise.all([
    select(req.admin, 'checkins', `SELECT day, mood FROM checkins WHERE user_id = ${uid} AND day >= '${from}' ORDER BY day DESC LIMIT 60`),
    select(req.admin, 'day_logs', `SELECT day, meals_json FROM day_logs WHERE user_id = ${uid} AND day >= '${from}' ORDER BY day DESC LIMIT 60`),
    select(req.admin, 'activity', `SELECT day, pushups, types_json, steps FROM activity WHERE user_id = ${uid} AND day >= '${from}' ORDER BY day DESC LIMIT 60`),
    select(req.admin, 'weight', `SELECT day FROM weight WHERE user_id = ${uid} AND day >= '${from}' ORDER BY day DESC LIMIT 60`),
    select(req.admin, 'entries', `SELECT created_ms FROM entries WHERE user_id = ${uid} AND created_ms >= ${fromMs} ORDER BY created_ms DESC LIMIT 300`)
  ]);

  res.json(Object.assign({ userId: String(row.user_id), lastSeenMs: Number(row.last_seen_ms || 0) || null },
    summarize({ checkins, logs, activity, weight, entries }, days)));
}));

/** The rows a member wrote → one line a day, newest first, plus the totals. Pure, so the tests can run it. */
function summarize(rows, days) {
  const byDay = {};
  const dayRow = (day) => (byDay[day] ||= { day, weight: false, checkin: false, meals: 0, activity: false, entries: 0 });
  for (const r of rows.weight) dayRow(r.day).weight = true;
  for (const r of rows.checkins) if (r.mood) dayRow(r.day).checkin = true;
  for (const r of rows.logs) {
    const meals = parseJson(r.meals_json) || {};
    const eaten = ['breakfast', 'lunch', 'snack', 'dinner'].filter((m) => meals[m]).length;
    if (eaten) dayRow(r.day).meals = eaten;
  }
  for (const r of rows.activity) {
    const types = parseJson(r.types_json) || {};
    if (Number(r.pushups) > 0 || Object.values(types).some(Boolean)) dayRow(r.day).activity = true;
  }
  // The entry's local day is unknown here (the client owns time zones); its UTC day is close enough for a monitor.
  for (const r of rows.entries) dayRow(new Date(Number(r.created_ms)).toISOString().slice(0, 10)).entries += 1;

  const list = Object.values(byDay).sort((a, b) => (a.day < b.day ? 1 : -1));
  return {
    days,
    lastLoggedDay: list[0] ? list[0].day : null,
    activeDays: list.length,
    entries: rows.entries.length,
    steps: rows.activity.reduce((n, r) => n + (Number(r.steps) || 0), 0),
    pushups: rows.activity.reduce((n, r) => n + (Number(r.pushups) || 0), 0),
    recent: list.slice(0, days)
  };
}

function parseJson(text) { try { return text ? JSON.parse(text) : null; } catch (_e) { return null; } }

async function target(req) {
  const userId = needId(req.params.userId, 'user id');
  if (userId === req.user.id) throw new HttpError(409, 'you cannot change your own account here');
  const row = await findProfile(req.admin, userId);
  if (!row) throw new HttpError(404, 'no such user');
  return row;
}

// pending → active is approval; active ↔ disabled is disable / re-enable. Nothing goes back to pending.
router.post('/admin/profiles/:userId/status', admin, wrap(async (req, res) => {
  const status = req.body && req.body.status;
  if (status !== 'active' && status !== 'disabled') throw new HttpError(400, 'status must be active or disabled');
  const row = await target(req);
  await req.admin.datastore().table('profiles').updateRow({ ROWID: row.ROWID, status });
  console.log(JSON.stringify({ action: 'profile_status', by: req.user.id, user: String(row.user_id), from: row.status, to: status }));
  res.json({ userId: String(row.user_id), status });
}));

// An admin cannot demote themselves (target() refuses self), so the last admin can never be removed.
router.post('/admin/profiles/:userId/role', admin, wrap(async (req, res) => {
  const role = req.body && req.body.role;
  if (role !== 'admin' && role !== 'member') throw new HttpError(400, 'role must be admin or member');
  const row = await target(req);
  await req.admin.datastore().table('profiles').updateRow({ ROWID: row.ROWID, role });
  console.log(JSON.stringify({ action: 'profile_role', by: req.user.id, user: String(row.user_id), from: row.role, to: role }));
  res.json({ userId: String(row.user_id), role });
}));

// ── Error reports and feedback ──
function inbox(path, table, cols, flag, shape) {
  router.get(path, admin, wrap(async (req, res) => {
    const open = req.query.all === '1' ? '' : ` WHERE ${flag} = false`;
    const rows = await select(req.admin, table, `SELECT ${cols} FROM ${table}${open} ORDER BY CREATEDTIME DESC LIMIT 200`);
    res.json({ items: rows.map(shape) });
  }));
  router.post(path + '/:id/' + (flag === 'resolved' ? 'resolve' : 'acknowledge'), admin, wrap(async (req, res) => {
    const id = needId(req.params.id);
    const rows = await select(req.admin, table, `SELECT ROWID FROM ${table} WHERE ROWID = ${id}`);
    if (!rows[0]) throw new HttpError(404, 'not found');
    await req.admin.datastore().table(table).updateRow({ ROWID: id, [flag]: 'true' });
    res.json({ id, [flag]: true });
  }));
}
inbox('/admin/errors', 'errors', 'ROWID, user_id, message, context, detail, resolved, CREATEDTIME', 'resolved', (r) => ({
  id: String(r.ROWID), userId: String(r.user_id), message: r.message, context: r.context || null, detail: r.detail || null,
  resolved: bool(r.resolved), createdAt: r.CREATEDTIME
}));
inbox('/admin/feedback', 'feedback', 'ROWID, user_id, body, acknowledged, CREATEDTIME', 'acknowledged', (r) => ({
  id: String(r.ROWID), userId: String(r.user_id), body: r.body, acknowledged: bool(r.acknowledged), createdAt: r.CREATEDTIME
}));

module.exports = router;
module.exports.summarize = summarize;
