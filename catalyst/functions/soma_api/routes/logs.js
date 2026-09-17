// The log's two doors: members' browsers report failures in, the admin reads everything out.
//
//   POST /logs                { level?, area, event, message?, detail? }     any signed-in member; rate limited
//   POST /errors              the older shape { message, context, detail }, kept so a cached old build still reports
//   GET  /admin/logs          ?level=error|warn|info &source=client|api|job &area= &user= &before=<ms> &test=1 &limit=
//   GET  /admin/logs/summary  counts for the last 24 hours and 7 days, by level and by area

'use strict';

const express = require('express');
const { member, admin, wrap, isTestUser } = require('../lib/auth');
const { HttpError, select, needId, bool } = require('../lib/db');
const { writeLog, LEVELS, SOURCES } = require('../lib/log');

const router = express.Router();
const PER_HOUR = 120; // a broken loop in one browser must not be able to fill the table

async function accept(req, entry) {
  const since = Date.now() - 3600000;
  const recent = await select(req.admin, 'logs', `SELECT ROWID FROM logs WHERE user_id = ${needId(req.user.id)} AND created_ms > ${since} LIMIT ${PER_HOUR}`);
  if (recent.length >= PER_HOUR) return false;
  await writeLog(req.admin, Object.assign(entry, { source: 'client', userId: req.user.id, test: isTestUser(req) }));
  return true;
}

router.post('/logs', member, wrap(async (req, res) => {
  const b = req.body || {};
  if (typeof b.event !== 'string' || !b.event.trim()) throw new HttpError(400, 'event is required');
  const stored = await accept(req, { level: b.level, area: b.area, event: b.event, message: b.message, detail: b.detail, status: Number.isInteger(b.status) ? b.status : undefined });
  res.status(stored ? 201 : 429).json({ ok: stored });
}));

router.post('/errors', member, wrap(async (req, res) => {
  const b = req.body || {};
  if (typeof b.message !== 'string' || !b.message) throw new HttpError(400, 'message is required');
  await accept(req, { level: 'error', area: String(b.context || 'app').split('.')[0], event: b.message, message: b.context, detail: b.detail });
  res.status(201).json({ ok: true });
}));

const shape = (r, who) => ({
  id: String(r.ROWID), at: Number(r.created_ms), level: r.lvl, source: r.source, area: r.area, event: r.event,
  message: r.message || null, detail: r.detail || null, status: r.http_status === null || r.http_status === '' || r.http_status === undefined ? null : Number(r.http_status),
  userId: r.user_id ? String(r.user_id) : null, user: r.user_id ? who.get(String(r.user_id)) || null : null, test: bool(r.is_test)
});

router.get('/admin/logs', admin, wrap(async (req, res) => {
  const q = req.query;
  const where = [];
  if (q.level !== undefined) { if (!LEVELS.includes(q.level)) throw new HttpError(400, 'unknown level'); where.push(`lvl = '${q.level}'`); }
  if (q.source !== undefined) { if (!SOURCES.includes(q.source)) throw new HttpError(400, 'unknown source'); where.push(`source = '${q.source}'`); }
  if (q.area !== undefined) { if (!/^[a-z0-9_.:-]{1,40}$/.test(q.area)) throw new HttpError(400, 'bad area'); where.push(`area = '${q.area}'`); }
  if (q.user !== undefined) where.push(`user_id = ${needId(q.user, 'user')}`);
  if (q.before !== undefined) where.push(`created_ms < ${needId(q.before, 'before')}`);
  if (q.test !== '1') where.push('is_test = false');
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 100, 1), 200);
  const rows = await select(req.admin, 'logs',
    `SELECT ROWID, created_ms, lvl, source, area, event, message, detail, user_id, http_status, is_test FROM logs${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY created_ms DESC LIMIT ${limit}`);

  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean).map(String))];
  const who = new Map();
  if (ids.length) {
    const people = await select(req.admin, 'profiles', `SELECT user_id, email, display_name FROM profiles WHERE user_id IN (${ids.map((i) => needId(i)).join(', ')}) LIMIT 300`);
    people.forEach((p) => who.set(String(p.user_id), p.display_name || p.email));
  }
  res.json({ items: rows.map((r) => shape(r, who)), more: rows.length === limit });
}));

router.get('/admin/logs/summary', admin, wrap(async (req, res) => {
  const now = Date.now();
  const rows = await select(req.admin, 'logs', `SELECT lvl, area, created_ms FROM logs WHERE created_ms > ${now - 7 * 86400000} AND is_test = false ORDER BY created_ms DESC LIMIT 300`);
  const day = rows.filter((r) => Number(r.created_ms) > now - 86400000);
  const count = (list, level) => list.filter((r) => r.lvl === level).length;
  const areas = {};
  rows.filter((r) => r.lvl === 'error').forEach((r) => { areas[r.area] = (areas[r.area] || 0) + 1; });
  res.json({
    day: { error: count(day, 'error'), warn: count(day, 'warn') }, week: { error: count(rows, 'error'), warn: count(rows, 'warn') },
    capped: rows.length === 300, areas: Object.entries(areas).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([area, errors]) => ({ area, errors }))
  });
}));

module.exports = router;
