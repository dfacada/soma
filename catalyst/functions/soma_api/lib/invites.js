// Invite codes (2026-11-08: invite links instead of David approving every sign-up, and private rounds instead of one
// round everybody sees). One table, two uses:
//   - a round's invite link (round_id set): anyone with it can join that private round, and a person signing up
//     through it is let in without waiting;
//   - an admin's sign-up code (no round): lets a person in, for a beta tester David hands it to.
// A code lets new people in only while it is usable: not turned off, not expired, not used up, and its maker still
// an active member. `uses` counts the people it let in, not the members who used it to join a round.
//
// Codes are 10 characters of Crockford base32 from 50 random bits: nobody finds one by guessing.

'use strict';

const crypto = require('crypto');
const { select, needId, bool } = require('./db');

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE = /^[0-9A-HJKMNP-TV-Z]{10}$/;
const COLS = 'ROWID, code, created_by, round_id, max_uses, uses, expires_ms, revoked, CREATEDTIME';

function newCode() {
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += ALPHABET[bytes[i] & 31];
  return out;
}

/** A code as typed or pasted: any case, spaces and dashes ignored, O as 0 and I or L as 1. Null when malformed. */
function cleanCode(v) {
  const c = String(v || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return CODE.test(c) ? c : null;
}

async function findInvite(admin, code) {
  const c = cleanCode(code);
  if (!c) return null;
  return (await select(admin, 'invites', `SELECT ${COLS} FROM invites WHERE code = '${c}'`))[0] || null;
}

/** Why an invite cannot let anyone in, in words for the person holding it; null when it can. Reads the maker. */
async function whyNot(admin, inv) {
  if (!inv) return 'That invite code is not one Soma knows.';
  if (bool(inv.revoked)) return 'That invite was turned off by the person who made it.';
  if (inv.expires_ms && Number(inv.expires_ms) < Date.now()) return 'That invite has expired. Ask for a new one.';
  if (inv.max_uses !== null && inv.max_uses !== undefined && inv.max_uses !== '' && Number(inv.uses || 0) >= Number(inv.max_uses)) return 'That invite has been used up. Ask for a new one.';
  const maker = (await select(admin, 'profiles', `SELECT status FROM profiles WHERE user_id = ${needId(inv.created_by)}`))[0];
  if (!maker || maker.status !== 'active') return 'That invite no longer works.';
  // A round's link lives as long as its round: gone, archived, or past its last day (a day's grace for time zones),
  // it lets nobody in. That is a round link's expiry, and it follows the round if its dates change.
  if (inv.round_id) {
    const round = (await select(admin, 'rounds', `SELECT start_date, length_days, archived FROM rounds WHERE ROWID = ${needId(inv.round_id)}`))[0];
    if (!round || bool(round.archived)) return 'That round has ended.';
    const [y, m, d] = String(round.start_date).split('-').map(Number);
    const lastDayEnds = Date.UTC(y, m - 1, d) + (Number(round.length_days) + 1) * 86400000;
    if (Date.now() > lastDayEnds) return 'That round has ended.';
  }
  return null;
}

/** Every link of a round, turned off (the round was archived). */
async function revokeRound(admin, roundId) {
  const live = await select(admin, 'invites', `SELECT ROWID FROM invites WHERE round_id = ${needId(roundId)} AND (revoked = false OR revoked IS NULL) LIMIT 50`);
  for (const o of live) await admin.datastore().table('invites').updateRow({ ROWID: o.ROWID, revoked: 'true' });
}

/** One more person let in. Read then write: two sign-ups on the last place at the same moment can both get in,
 *  which is the worst a race can do here. */
async function countUse(admin, inv) {
  await admin.datastore().table('invites').updateRow({ ROWID: inv.ROWID, uses: Number(inv.uses || 0) + 1 });
}

/** A new code for a round (the round's maker is its inviter) or for the admin's sign-ups. Turns off the round's
 *  older links, so "a new link" really replaces the old one. */
async function makeInvite(admin, { createdBy, roundId = null, maxUses, expiresMs = null }) {
  if (roundId) await revokeRound(admin, roundId);
  for (let attempt = 0; ; attempt++) {
    try {
      return await admin.datastore().table('invites').insertRow({
        code: newCode(), created_by: String(createdBy), round_id: roundId ? String(roundId) : null,
        max_uses: maxUses, uses: 0, expires_ms: expiresMs, revoked: 'false'
      });
    } catch (e) {
      if (attempt >= 2) throw e; // code is unique: a collision (one in a quadrillion) just draws again
    }
  }
}

/** The round's current link, if it has one that still works for joining. */
async function roundInvite(admin, roundId) {
  return (await select(admin, 'invites', `SELECT ${COLS} FROM invites WHERE round_id = ${needId(roundId)} AND (revoked = false OR revoked IS NULL) ORDER BY CREATEDTIME DESC LIMIT 1`))[0] || null;
}

const shapeInvite = (r) => ({
  code: r.code, roundId: r.round_id ? String(r.round_id) : null, createdBy: String(r.created_by),
  maxUses: r.max_uses === null || r.max_uses === undefined || r.max_uses === '' ? null : Number(r.max_uses),
  uses: Number(r.uses || 0), expiresMs: r.expires_ms ? Number(r.expires_ms) : null, revoked: bool(r.revoked), createdAt: r.CREATEDTIME
});

module.exports = { cleanCode, findInvite, whyNot, countUse, makeInvite, revokeRound, roundInvite, shapeInvite, COLS };
