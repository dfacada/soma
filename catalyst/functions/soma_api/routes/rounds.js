// Push-up rounds. A round is a date window with rest days and scoring knobs; membership carries each person's
// own flat daily target. There is no per-round log table: the board reads the same `activity` rows Today writes,
// so the two can never disagree. Rules (streaks, points, ranks) are computed by the client from src/lib/round.ts;
// this file only stores and serves.
//
// Two kinds (2026-11-08, before Soma opens to people who don't know each other):
//   open rounds      made by an admin; every member sees them and can join (as before).
//   private rounds   invite_only: made by any member, or by an admin who ticks private. Only their members see
//                    them; joining takes the round's invite link (lib/invites.js), which also lets a new person in
//                    without waiting for approval. The maker (created_by) manages it: edits, the link, removals.

'use strict';

const express = require('express');
const { member, admin, wrap, isTestUser } = require('../lib/auth');
const { HttpError, select, selectAll, upsert, needId, needDay, packJson, unpackJson, fitText, bool } = require('../lib/db');
const { writeLog } = require('../lib/log');
const invites = require('../lib/invites');

const router = express.Router();
const ROUND_COLS = 'ROWID, name, start_date, length_days, rest_days_json, bonus_hit, bonus_streak, badge_streak, badge_hits, join_open, archived, invite_only, created_by';
const MEMBER_COLS = 'ROWID, round_id, user_id, daily_target, start_day, status, join_seq';
const OWN_ROUNDS_MAX = 3;      // live private rounds one member can run at once
const ROUND_MEMBERS_MAX = 50;  // people in one private round
const LINK_USES = 25;          // new people one round link can let in before the maker makes another

const num = (v, fallback) => (v === null || v === undefined || v === '' ? fallback : Number(v));
const shapeRound = (r) => ({
  id: String(r.ROWID), name: r.name, startDate: r.start_date, lengthDays: Number(r.length_days),
  restDays: unpackJson(r.rest_days_json, []),
  bonusHit: num(r.bonus_hit, 30), bonusStreak: num(r.bonus_streak, 10), badgeStreak: num(r.badge_streak, 7), badgeHits: num(r.badge_hits, 30),
  joinOpen: bool(r.join_open), archived: bool(r.archived), inviteOnly: bool(r.invite_only), ownerId: String(r.created_by)
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

const isOwner = (req, round) => String(round.created_by) === req.user.id;

// A member's round starts near now: a week back at most (to count days already done), three months ahead. Its board
// shows its members' push-ups between its dates, so a member must not be able to stretch those dates back over
// months of other people's record; an admin's rounds are not fenced.
function needStartNearNow(startDate) {
  const today = new Date().toISOString().slice(0, 10);
  if (startDate < addDays(today, -8) || startDate > addDays(today, 92)) throw new HttpError(400, 'a round starts within a week before today and three months after it');
}
/** Admins manage every round; a member manages the private rounds they made. */
const canManage = (req, round) => req.profile.role === 'admin' || (bool(round.invite_only) && isOwner(req, round));
function needManage(req, round) { if (!canManage(req, round)) throw new HttpError(403, 'only the person who made this round can change it'); }

// ── Rounds ──
// Open rounds, plus the private rounds the caller is in or made. Each carries the caller's membership. Archived
// rounds show only to someone who was in them (and to an admin, for open rounds).
router.get('/rounds', member, wrap(async (req, res) => {
  const uid = needId(req.user.id);
  const mine = await select(req.admin, 'round_members', `SELECT ${MEMBER_COLS} FROM round_members WHERE user_id = ${uid} LIMIT 300`);
  const memberOf = [...new Set(mine.map((m) => needId(m.round_id)))];
  const [open, joined, owned] = await Promise.all([
    select(req.admin, 'rounds', `SELECT ${ROUND_COLS} FROM rounds WHERE invite_only = false OR invite_only IS NULL ORDER BY start_date DESC LIMIT 100`),
    memberOf.length ? select(req.admin, 'rounds', `SELECT ${ROUND_COLS} FROM rounds WHERE ROWID IN (${memberOf.join(', ')}) LIMIT 300`) : [],
    select(req.admin, 'rounds', `SELECT ${ROUND_COLS} FROM rounds WHERE created_by = ${uid} AND invite_only = true LIMIT 50`)
  ]);
  const byRound = new Map(mine.map((m) => [String(m.round_id), shapeMember(m)]));
  const all = new Map();
  for (const r of [...open, ...joined, ...owned]) all.set(String(r.ROWID), shapeRound(r));
  // Rounds named __like_this__ are fixtures for catalyst/test-api.js and only the test identities see them.
  const fixture = (r) => !isTestUser(req) && r.name.startsWith('__');
  const visible = (r) => {
    if (fixture(r)) return false;
    const me = byRound.get(r.id);
    // A private round: its members, and its maker while it runs (a maker who left an archived one is done with it).
    if (r.inviteOnly) return Boolean(me && me.status === 'active') || (r.ownerId === req.user.id && !r.archived);
    return !r.archived || Boolean(me) || req.profile.role === 'admin';
  };
  const list = [...all.values()].filter(visible).sort((x, y) => (x.startDate < y.startDate ? 1 : -1));
  res.json({ rounds: list.map((r) => ({ ...r, me: byRound.get(r.id) || null })) });
}));

// An admin makes an open round (or a private one, with inviteOnly). A member makes a private round, joins it with
// their own target, and gets its invite link back to share.
router.post('/rounds', member, wrap(async (req, res) => {
  const b = req.body || {};
  const isAdmin = req.profile.role === 'admin';
  const v = roundValues(b, true);
  if (v.rest_days_json === undefined) v.rest_days_json = '[]';
  const inviteOnly = isAdmin ? b.inviteOnly === true : true;
  if (!isAdmin) {
    needStartNearNow(v.start_date);
    const live = await select(req.admin, 'rounds', `SELECT ROWID FROM rounds WHERE created_by = ${needId(req.user.id)} AND invite_only = true AND (archived = false OR archived IS NULL) LIMIT ${OWN_ROUNDS_MAX + 1}`);
    if (live.length >= OWN_ROUNDS_MAX) throw new HttpError(409, `you can run ${OWN_ROUNDS_MAX} rounds at once; archive one first`);
  }
  const row = await req.admin.datastore().table('rounds').insertRow({
    bonus_hit: 30, bonus_streak: 10, badge_streak: 7, badge_hits: 30, join_open: 'true', archived: 'false', ...v,
    invite_only: inviteOnly ? 'true' : 'false', created_by: req.user.id
  });
  const out = shapeRound(row);
  if (inviteOnly) {
    const roundId = String(row.ROWID);
    const target = b.dailyTarget === undefined ? null : int('dailyTarget', b.dailyTarget, 1, 10000);
    if (target !== null) {
      const startDay = Math.min(Math.max(dayIndex(out.startDate, needDay(b.today)), 1), out.lengthDays);
      const ukey = `${roundId}:${req.user.id}`;
      await upsert(req.admin, 'round_members', `SELECT ROWID FROM round_members WHERE ukey = '${ukey}'`,
        { round_id: roundId, user_id: req.user.id, ukey, daily_target: target, start_day: startDay, status: 'active', join_seq: 1 });
    }
    const invite = await invites.makeInvite(req.admin, { createdBy: req.user.id, roundId, maxUses: LINK_USES });
    out.invite = { code: invite.code };
  }
  res.status(201).json(out);
}));

router.put('/rounds/:id', member, wrap(async (req, res) => {
  const current = await findRound(req, req.params.id);
  needManage(req, current);
  const b = req.body || {};
  const v = roundValues(b, false, Number(current.length_days));
  // Only an admin turns a round private or open; a member's round is private for good.
  if (b.inviteOnly !== undefined && req.profile.role === 'admin') v.invite_only = b.inviteOnly ? 'true' : 'false';
  if (!Object.keys(v).length) throw new HttpError(400, 'nothing to change');
  // The dates a member's round was joined for are the dates its people agreed to share: once anyone else is in it,
  // they are fixed. Before that its maker can move them, inside the same window as when it was made.
  const datesChange = (v.start_date !== undefined && v.start_date !== current.start_date) || (v.length_days !== undefined && v.length_days !== Number(current.length_days));
  if (datesChange && req.profile.role !== 'admin') {
    if (v.start_date !== undefined) needStartNearNow(v.start_date);
    const others = await select(req.admin, 'round_members', `SELECT ROWID FROM round_members WHERE round_id = ${needId(current.ROWID)} AND user_id != ${needId(req.user.id)} AND status = 'active' LIMIT 1`);
    if (others.length) throw new HttpError(409, "a round's dates are fixed once someone else has joined it");
  }
  // Shortening a round must not strand rest days beyond its new end.
  if (v.length_days !== undefined && v.rest_days_json === undefined) {
    v.rest_days_json = packJson('restDays', unpackJson(current.rest_days_json, []).filter((d) => d <= v.length_days));
  }
  await req.admin.datastore().table('rounds').updateRow({ ROWID: current.ROWID, ...v });
  // An archived round lets nobody in any more: its links are turned off with it.
  if (v.archived === 'true') await invites.revokeRound(req.admin, String(current.ROWID));
  res.json(shapeRound(await findRound(req, req.params.id)));
}));

// ── Membership ──
// `today` is the caller's own calendar date: the server does no timezone maths. It only sets where a mid-round
// joiner starts being counted, and it is clamped to the round, so a wrong value cannot reach outside it.
async function joinRound(req, round, dailyTarget, today) {
  const roundId = String(round.ROWID);
  if (bool(round.archived)) throw new HttpError(409, 'this round is archived');
  const startDay = Math.min(Math.max(dayIndex(round.start_date, needDay(today)), 1), Number(round.length_days));
  const existing = await membership(req, roundId, req.user.id);
  if (existing && existing.status === 'active') return { member: shapeMember(existing), already: true };
  // Leaving is undone by joining again; being taken out by the admin or the round's maker is not.
  if (existing && existing.status === 'banned' && !canManage(req, round)) throw new HttpError(403, 'you were taken out of this round');
  let joinSeq = existing ? Number(existing.join_seq) : null;
  if (joinSeq === null) {
    const all = await select(req.admin, 'round_members', `SELECT join_seq, status FROM round_members WHERE round_id = ${roundId} LIMIT 300`);
    if (bool(round.invite_only) && all.filter((m) => m.status === 'active').length >= ROUND_MEMBERS_MAX) throw new HttpError(409, `this round is full (${ROUND_MEMBERS_MAX} people)`);
    joinSeq = all.reduce((n, m) => Math.max(n, Number(m.join_seq)), 0) + 1;
  }
  const ukey = `${roundId}:${req.user.id}`;
  await upsert(req.admin, 'round_members', `SELECT ROWID FROM round_members WHERE ukey = '${ukey}'`,
    { round_id: roundId, user_id: req.user.id, ukey, daily_target: dailyTarget, start_day: existing ? Number(existing.start_day) : startDay, status: 'active', join_seq: joinSeq });
  return { member: shapeMember(await membership(req, roundId, req.user.id)), already: false };
}

router.post('/rounds/:id/join', member, wrap(async (req, res) => {
  const round = await findRound(req, req.params.id);
  const b = req.body || {};
  const dailyTarget = int('dailyTarget', b.dailyTarget, 1, 10000);
  if (bool(round.invite_only) && !canManage(req, round)) {
    // A private round takes its current link; an old link the maker replaced opens nothing.
    const inv = await invites.findInvite(req.admin, b.code);
    if (!inv || String(inv.round_id) !== String(round.ROWID) || bool(inv.revoked)) throw new HttpError(403, 'this round is private: join it with its invite link');
  } else if (!bool(round.join_open) && !canManage(req, round)) throw new HttpError(403, 'this round is not open to join');
  const { member: m, already } = await joinRound(req, round, dailyTarget, b.today);
  if (already) throw new HttpError(409, 'you are already in this round');
  res.status(201).json(m);
}));

router.put('/rounds/:id/me', member, wrap(async (req, res) => {
  const round = await findRound(req, req.params.id);
  const mine = await membership(req, String(round.ROWID), req.user.id);
  if (!mine || mine.status !== 'active') throw new HttpError(404, 'you are not in this round');
  await req.admin.datastore().table('round_members').updateRow({ ROWID: mine.ROWID, daily_target: int('dailyTarget', (req.body || {}).dailyTarget, 1, 10000) });
  res.json(shapeMember(await membership(req, String(round.ROWID), req.user.id)));
}));

// 'removed' when a member leaves (they may join again), 'banned' when the admin or the round's maker takes them out
// (only they can put them back). A banned member leaving changes nothing.
async function remove(req, res, userId, status) {
  const round = await findRound(req, req.params.id);
  const row = await membership(req, String(round.ROWID), userId);
  if (!row) throw new HttpError(404, 'not a member');
  if (row.status !== 'banned' || status === 'banned') await req.admin.datastore().table('round_members').updateRow({ ROWID: row.ROWID, status });
  if (status === 'banned') void writeLog(req.admin, { level: 'info', source: 'api', area: req.profile.role === 'admin' ? 'admin' : 'rounds', event: 'round_member_removed', message: 'took a member out of a round', detail: { round: String(round.ROWID), user: String(userId) }, userId: req.user.id });
  res.json({ userId: String(userId), status: row.status === 'banned' ? 'banned' : status });
}
router.delete('/rounds/:id/me', member, wrap((req, res) => remove(req, res, req.user.id, 'removed')));
router.delete('/rounds/:id/members/:userId', member, wrap(async (req, res) => {
  const round = await findRound(req, req.params.id);
  needManage(req, round);
  const userId = needId(req.params.userId, 'user id');
  if (userId === req.user.id) throw new HttpError(409, 'leave the round instead');
  return remove(req, res, userId, 'banned');
}));

// ── A private round's invite link ──
// Any member of the round can fetch it to pass on; the maker (or an admin) can replace it, which turns the old one off.
router.get('/rounds/:id/invite', member, wrap(async (req, res) => {
  const round = await findRound(req, req.params.id);
  if (!bool(round.invite_only)) throw new HttpError(409, 'an open round needs no invite');
  const mine = await membership(req, String(round.ROWID), req.user.id);
  if (!canManage(req, round) && !(mine && mine.status === 'active')) throw new HttpError(403, 'join the round to share it');
  let inv = await invites.roundInvite(req.admin, String(round.ROWID));
  if (!inv) inv = await invites.makeInvite(req.admin, { createdBy: String(round.created_by), roundId: String(round.ROWID), maxUses: LINK_USES });
  res.json({ code: inv.code, uses: Number(inv.uses || 0), maxUses: inv.max_uses === null || inv.max_uses === undefined ? null : Number(inv.max_uses) });
}));
router.post('/rounds/:id/invite', member, wrap(async (req, res) => {
  const round = await findRound(req, req.params.id);
  if (!bool(round.invite_only)) throw new HttpError(409, 'an open round needs no invite');
  needManage(req, round);
  const inv = await invites.makeInvite(req.admin, { createdBy: String(round.created_by), roundId: String(round.ROWID), maxUses: LINK_USES });
  res.status(201).json({ code: inv.code, uses: 0, maxUses: LINK_USES });
}));

// ── The board: round + members + everyone's push-ups inside the round's dates ──
// Members see each other's daily counts. That is what a leaderboard is; nothing else about a member is exposed.
router.get('/rounds/:id/board', member, wrap(async (req, res) => {
  const round = await findRound(req, req.params.id);
  const roundId = String(round.ROWID);
  // Only the people in it now: someone who left, or was taken out, stops sharing their name and counts.
  const members = (await select(req.admin, 'round_members', `SELECT ${MEMBER_COLS} FROM round_members WHERE round_id = ${roundId} ORDER BY join_seq ASC LIMIT 300`)).filter((m) => m.status === 'active');
  const inIt = members.some((m) => String(m.user_id) === req.user.id);
  if (!inIt && !canManage(req, round)) throw new HttpError(403, 'join the round to see its board');

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
module.exports.joinRound = joinRound;
module.exports.shapeRound = shapeRound;
module.exports.findRoundRow = findRound;
