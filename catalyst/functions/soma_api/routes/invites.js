// Invite links (lib/invites.js). The link is https://<app>/join/?c=CODE.
//
//   GET    /invites/:code                     public: what the link is for, so /join can say it before sign-in.
//                                             The round's name and the first name of whoever made the link; nothing
//                                             else, and nothing at all for a code that does not exist.
//   POST   /invites/:code/accept              signed in, approved or not: lets a waiting person in (if the code still
//          { dailyTarget?, today }            can) and joins the link's round. A first sign-in through a link is let
//                                             in by lib/auth.js already; this then only joins the round.
//   POST   /admin/invites { maxUses, days }   an admin's sign-up code, for people with no round to join yet
//   GET    /admin/invites                     the admin's sign-up codes and how far each has been used
//   DELETE /admin/invites/:code               turns one off

'use strict';

const express = require('express');
const catalyst = require('zcatalyst-sdk-node');
const { withUser, admin, wrap, tellAdmins } = require('../lib/auth');
const { HttpError, select, needId, needDay, unpackJson, bool } = require('../lib/db');
const { writeLog } = require('../lib/log');
const invites = require('../lib/invites');
const { joinRound, shapeRound, findRoundRow } = require('./rounds');

const router = express.Router();

// No sign-in here: the person holding the link usually has no account yet. The function reads as admin, as always.
router.get('/invites/:code', wrap(async (req, res) => {
  const app = catalyst.initialize(req, { scope: 'admin' });
  const inv = await invites.findInvite(app, req.params.code);
  if (!inv) throw new HttpError(404, 'That invite code is not one Soma knows.');
  const [why, maker, round] = await Promise.all([
    invites.whyNot(app, inv),
    select(app, 'profiles', `SELECT display_name FROM profiles WHERE user_id = ${needId(inv.created_by)}`).then((r) => r[0] || null),
    inv.round_id ? select(app, 'rounds', `SELECT name, start_date, length_days, archived FROM rounds WHERE ROWID = ${needId(inv.round_id)}`).then((r) => r[0] || null) : null
  ]);
  const ended = inv.round_id && (!round || bool(round.archived));
  res.json({
    ok: !why && !ended,
    reason: why || (ended ? 'That round has ended.' : null),
    from: maker ? String(maker.display_name || '').trim().split(/\s+/)[0] || null : null,
    round: round && !ended ? { name: round.name, startDate: round.start_date, lengthDays: Number(round.length_days) } : null
  });
}));

router.post('/invites/:code/accept', withUser, wrap(async (req, res) => {
  const status = req.profile.status;
  if (status === 'disabled' || status === 'deleting') throw new HttpError(403, 'account ' + status);
  const inv = await invites.findInvite(req.admin, req.params.code);
  const b = req.body || {};

  let approved = false;
  if (status === 'pending') {
    const why = await invites.whyNot(req.admin, inv);
    if (why) throw new HttpError(410, why);
    await req.admin.datastore().table('profiles').updateRow({ ROWID: req.profile.rowId, status: 'active', invited_by: String(inv.created_by) });
    await invites.countUse(req.admin, inv);
    req.profile.status = 'active';
    approved = true;
    void tellAdmins(req.admin, 'Someone waiting for approval used an invite link and is in now. See them in Settings → Admin.');
    void writeLog(req.admin, { level: 'info', source: 'api', area: 'invites', event: 'invite_approved', message: 'an invite let someone in', detail: { round: inv.round_id ? String(inv.round_id) : null }, userId: req.user.id });
  } else if (!inv || bool(inv.revoked)) {
    // Already a member: joining a round only needs the link to be the round's current one.
    throw new HttpError(410, inv ? 'That invite was turned off by the person who made it.' : 'That invite code is not one Soma knows.');
  }

  let round = null, already = false;
  if (inv.round_id) {
    const row = await findRoundRow(req, String(inv.round_id)).catch(() => null);
    if (row && !bool(row.archived)) {
      // The person's own daily push-up target unless they chose one here.
      let target = b.dailyTarget;
      if (target === undefined) {
        const s = await select(req.admin, 'profiles', `SELECT settings_json FROM profiles WHERE user_id = ${needId(req.user.id)}`);
        target = Number(unpackJson(s[0] && s[0].settings_json, {}).pushupTarget) || 100;
      }
      if (!Number.isInteger(target) || target < 1 || target > 10000) throw new HttpError(400, 'dailyTarget must be a whole number from 1 to 10000');
      const joined = await joinRound(req, row, target, needDay(b.today));
      already = joined.already;
      round = shapeRound(row);
    }
  }
  res.json({ approved, round, already });
}));

// ── An admin's sign-up codes ──
router.post('/admin/invites', admin, wrap(async (req, res) => {
  const b = req.body || {};
  const maxUses = b.maxUses === undefined ? 10 : b.maxUses;
  const days = b.days === undefined ? 30 : b.days;
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 500) throw new HttpError(400, 'maxUses must be a whole number from 1 to 500');
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new HttpError(400, 'days must be a whole number from 1 to 365');
  const inv = await invites.makeInvite(req.admin, { createdBy: req.user.id, maxUses, expiresMs: Date.now() + days * 86400000 });
  void writeLog(req.admin, { level: 'info', source: 'api', area: 'admin', event: 'invite_made', message: 'made a sign-up invite', detail: { maxUses, days }, userId: req.user.id });
  res.status(201).json(invites.shapeInvite(inv));
}));

router.get('/admin/invites', admin, wrap(async (req, res) => {
  const rows = await select(req.admin, 'invites', `SELECT ${invites.COLS} FROM invites WHERE round_id IS NULL ORDER BY CREATEDTIME DESC LIMIT 100`);
  res.json({ invites: rows.map(invites.shapeInvite) });
}));

router.delete('/admin/invites/:code', admin, wrap(async (req, res) => {
  const inv = await invites.findInvite(req.admin, req.params.code);
  if (!inv || inv.round_id) throw new HttpError(404, 'no such sign-up invite');
  await req.admin.datastore().table('invites').updateRow({ ROWID: inv.ROWID, revoked: 'true' });
  res.json({ code: inv.code, revoked: true });
}));

module.exports = router;
