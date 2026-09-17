// Admin: approvals and users, error reports, feedback. Every route needs an active admin.
// These are the only routes that read across users.

'use strict';

const express = require('express');
const { admin, wrap, findProfile, STATUSES, PROFILE_COLS } = require('../lib/auth');
const { HttpError, select, needId, bool } = require('../lib/db');

const router = express.Router();

const shapeProfile = (r) => ({
  userId: String(r.user_id), email: r.email, displayName: r.display_name || '', role: r.role, status: r.status, createdAt: r.CREATEDTIME
});

router.get('/admin/profiles', admin, wrap(async (req, res) => {
  const status = req.query.status;
  if (status !== undefined && !STATUSES.includes(status)) throw new HttpError(400, 'unknown status');
  const where = status ? ` WHERE status = '${status}'` : '';
  const rows = await select(req.admin, 'profiles', `SELECT ${PROFILE_COLS} FROM profiles${where} ORDER BY CREATEDTIME DESC LIMIT 200`);
  res.json({ profiles: rows.map(shapeProfile) });
}));

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
