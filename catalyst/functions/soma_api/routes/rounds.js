// Push-up rounds. A round is a date window with rest days and scoring knobs; membership carries each person's
// own flat daily target. There is no per-round log table: the board reads the same `activity` rows Today writes,
// so the two can never disagree. Rules (streaks, points, ranks) are computed by the client from src/lib/round.ts;
// this file only stores and serves.

'use strict';

const express = require('express');
const { member, admin, wrap, isTestUser } = require('../lib/auth');
const { HttpError, select, selectAll, upsert, needId, needDay, packJson, unpackJson, fitText, bool } = require('../lib/db');

const router = express.Router();
const ROUND_COLS = 'ROWID, name, start_date, length_days, rest_days_json, bonus_hit, bonus_streak, badge_streak, badge_hits, join_open, archived';
const MEMBER_COLS = 'ROWID, round_id, user_id, daily_target, start_day, status, join_seq';

const num = (v, fallback) => (v === null || v === undefined || v === '' ? fallback : Number(v));
const shapeRound = (r) => ({
  id: String(r.ROWID), name: r.name, startDate: r.start_date, lengthDays: Number(r.length_days),
  restDays: unpackJson(r.rest_days_json, []),
  bonusHit: num(r.bonus_hit, 30), bonusStreak: num(r.bonus_streak, 10), badgeStreak: num(r.badge_streak, 7), badgeHits: num(r.badge_hits, 30),
  joinOpen: bool(r.join_open), archived: bool(r.archived)
});
const shapeMember = (m) => ({ userId: String(m.user_id), dailyTarget: Number(m.daily_target), startDay: Number(m.start_day), joinSeq: Number(m.join_seq), status: m.status });

function int(name, v, min, max) {
  if (!Number.isInteger(v) || v < min || v > max) throw new HttpError(400, `${name} must be a whole number from ${min} to ${max}`);
  return v;
}

// Civil-date arithmetic in UTC so daylight saving can never move a day.
const utc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const addDays = (iso, n) => new Date(utc(iso) + n * 86400000).toISOString().slice(0, 10);
const dayIndex = (start, iso) => Math.round((utc(iso) - utc(start)) / 86400000) + 1;

/** Validates whichever round fields are present. `creating` makes the core three mandatory. */
function roundValues(b, creating, currentLength) {
  const v = {};
  if (creating || b.name !== undefined) {
    const name = fitText('name', b.name, 100);
    if (!name || !name.trim()) throw new HttpError(400, 'name is required');
    v.name = name.trim();
  }
  if (creating || b.startDate !== undefined) v.start_date = needDay(b.startDate);
  if (creating || b.lengthDays !== undefined) v.length_days = int('lengthDays', b.lengthDays, 1, 366);
  if (b.restDays !== undefined) {
    const length = v.length_days || currentLength;
    if (!Array.isArray(b.restDays) || b.restDays.some((d) => !Number.isInteger(d) || d < 1 || d > length)) throw new HttpError(400, 'restDays must be day numbers inside the round');
    v.rest_days_json = packJson('restDays', [...new Set(b.restDays)].sort((x, y) => x - y));
  }
  for (const [field, col, max] of [['bonusHit', 'bonus_hit', 1000], ['bonusStreak', 'bonus_streak', 1000], ['badgeStreak', 'badge_streak', 366], ['badgeHits', 'badge_hits', 366]]) {
    if (b[field] !== undefined) v[col] = int(field, b[field], 0, max);
  }
  if (b.joinOpen !== undefined) v.join_open = b.joinOpen ? 'true' : 'false';
  if (b.archived !== undefined) v.archived = b.archived ? 'true' : 'false';
  return v;
}

async function findRound(req, id) {
  const rows = await select(req.admin, 'rounds', `SELECT ${ROUND_COLS} FROM rounds WHERE ROWID = ${needId(id, 'round id')}`);
  if (!rows[0]) throw new HttpError(404, 'no such round');
  return rows[0];
}
const membership = (req, roundId, userId) => select(req.admin, 'round_members',
  `SELECT ${MEMBER_COLS} FROM round_members WHERE ukey = '${needId(roundId)}:${needId(userId)}'`).then((r) => r[0] || null);

// ── Rounds ──
// Every round that is not archived, plus archived ones the caller was in. Each carries the caller's membership.
router.get('/rounds', member, wrap(async (req, res) => {
  const [rounds, mine] = await Promise.all([
    select(req.admin, 'rounds', `SELECT ${ROUND_COLS} FROM rounds ORDER BY start_date DESC LIMIT 100`),
    select(req.admin, 'round_members', `SELECT ${MEMBER_COLS} FROM round_members WHERE user_id = ${needId(req.user.id)} LIMIT 300`)
  ]);
  const byRound = new Map(mine.map((m) => [String(m.round_id), shapeMember(m)]));
  // Rounds named __like_this__ are fixtures for catalyst/test-api.js and only the test identity sees them.
  const visible = (r) => isTestUser(req) || !r.name.startsWith('__');
  res.json({ rounds: rounds.map(shapeRound).filter(visible).filter((r) => !r.archived || byRound.has(r.id) || req.profile.role === 'admin').map((r) => ({ ...r, me: byRound.get(r.id) || null })) });
}));

router.post('/rounds', admin, wrap(async (req, res) => {
  const v = roundValues(req.body || {}, true);
  if (v.rest_days_json === undefined) v.rest_days_json = '[]';
  const row = await req.admin.datastore().table('rounds').insertRow({ bonus_hit: 30, bonus_streak: 10, badge_streak: 7, badge_hits: 30, join_open: 'true', archived: 'false', ...v, created_by: req.user.id });
  res.status(201).json(shapeRound(row));
}));

router.put('/rounds/:id', admin, wrap(async (req, res) => {
  const current = await findRound(req, req.params.id);
  const v = roundValues(req.body || {}, false, Number(current.length_days));
  if (!Object.keys(v).length) throw new HttpError(400, 'nothing to change');
  // Shortening a round must not strand rest days beyond its new end.
  if (v.length_days !== undefined && v.rest_days_json === undefined) {
    v.rest_days_json = packJson('restDays', unpackJson(current.rest_days_json, []).filter((d) => d <= v.length_days));
  }
  await req.admin.datastore().table('rounds').updateRow({ ROWID: current.ROWID, ...v });
  res.json(shapeRound(await findRound(req, req.params.id)));
}));

// ── Membership ──
// `today` is the caller's own calendar date: the server does no timezone maths. It only sets where a mid-round
// joiner starts being counted, and it is clamped to the round, so a wrong value cannot reach outside it.
router.post('/rounds/:id/join', member, wrap(async (req, res) => {
  const round = await findRound(req, req.params.id);
  const b = req.body || {};
  if (bool(round.archived)) throw new HttpError(409, 'this round is archived');
  if (!bool(round.join_open) && req.profile.role !== 'admin') throw new HttpError(403, 'this round is not open to join');
  const dailyTarget = int('dailyTarget', b.dailyTarget, 1, 10000);
  const startDay = Math.min(Math.max(dayIndex(round.start_date, needDay(b.today)), 1), Number(round.length_days));

  const roundId = String(round.ROWID);
  const existing = await membership(req, roundId, req.user.id);
  if (existing && existing.status === 'active') throw new HttpError(409, 'you are already in this round');
  let joinSeq = existing ? Number(existing.join_seq) : null;
  if (joinSeq === null) {
    const all = await select(req.admin, 'round_members', `SELECT join_seq FROM round_members WHERE round_id = ${roundId} LIMIT 300`);
    joinSeq = all.reduce((n, m) => Math.max(n, Number(m.join_seq)), 0) + 1;
  }
  const ukey = `${roundId}:${req.user.id}`;
  await upsert(req.admin, 'round_members', `SELECT ROWID FROM round_members WHERE ukey = '${ukey}'`,
    { round_id: roundId, user_id: req.user.id, ukey, daily_target: dailyTarget, start_day: existing ? Number(existing.start_day) : startDay, status: 'active', join_seq: joinSeq });
  res.status(201).json(shapeMember(await membership(req, roundId, req.user.id)));
}));

router.put('/rounds/:id/me', member, wrap(async (req, res) => {
  const round = await findRound(req, req.params.id);
  const mine = await membership(req, String(round.ROWID), req.user.id);
  if (!mine || mine.status !== 'active') throw new HttpError(404, 'you are not in this round');
  await req.admin.datastore().table('round_members').updateRow({ ROWID: mine.ROWID, daily_target: int('dailyTarget', (req.body || {}).dailyTarget, 1, 10000) });
  res.json(shapeMember(await membership(req, String(round.ROWID), req.user.id)));
}));

async function remove(req, res, userId) {
  const round = await findRound(req, req.params.id);
  const row = await membership(req, String(round.ROWID), userId);
  if (!row) throw new HttpError(404, 'not a member');
  await req.admin.datastore().table('round_members').updateRow({ ROWID: row.ROWID, status: 'removed' });
  res.json({ userId: String(userId), status: 'removed' });
}
router.delete('/rounds/:id/me', member, wrap((req, res) => remove(req, res, req.user.id)));
router.delete('/rounds/:id/members/:userId', admin, wrap((req, res) => remove(req, res, needId(req.params.userId, 'user id'))));

// ── The board: round + members + everyone's push-ups inside the round's dates ──
// Members see each other's daily counts. That is what a leaderboard is; nothing else about a member is exposed.
router.get('/rounds/:id/board', member, wrap(async (req, res) => {
  const round = await findRound(req, req.params.id);
  const roundId = String(round.ROWID);
  const members = await select(req.admin, 'round_members', `SELECT ${MEMBER_COLS} FROM round_members WHERE round_id = ${roundId} ORDER BY join_seq ASC LIMIT 300`);
  if (req.profile.role !== 'admin' && !members.some((m) => String(m.user_id) === req.user.id)) throw new HttpError(403, 'join the round to see its board');

  const ids = members.map((m) => needId(m.user_id));
  const logs = {};
  let names = new Map();
  if (ids.length) {
    const end = addDays(round.start_date, Number(round.length_days) - 1);
    const [rows, profiles] = await Promise.all([
      // round_pushups, not pushups: a backfill logged more than two days late is the member's record, not the round's.
      selectAll(req.admin, 'activity', `SELECT user_id, day, round_pushups FROM activity WHERE day >= '${round.start_date}' AND day <= '${end}' AND user_id IN (${ids.join(', ')}) ORDER BY ROWID ASC`),
      select(req.admin, 'profiles', `SELECT user_id, display_name FROM profiles WHERE user_id IN (${ids.join(', ')}) LIMIT 300`)
    ]);
    names = new Map(profiles.map((p) => [String(p.user_id), p.display_name || 'Member']));
    for (const r of rows) {
      // No push-up count means only other activity was logged that day: not a push-up log at all.
      if (r.round_pushups === null || r.round_pushups === undefined || r.round_pushups === '') continue;
      (logs[String(r.user_id)] ||= {})[dayIndex(round.start_date, r.day)] = Number(r.round_pushups);
    }
  }
  res.json({ round: shapeRound(round), members: members.map((m) => ({ ...shapeMember(m), displayName: names.get(String(m.user_id)) || 'Member' })), logs });
}));

module.exports = router;
