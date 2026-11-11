// Your own data, all of it: take it with you, or delete it (2026-11-08, getting ready for people David doesn't
// know: "deletion and export that people can do themselves").
//
//   GET    /account/export                   everything the server holds for the caller, as one document. The parts
//                                            that are vault ciphertext come back exactly as stored; the browser opens
//                                            them with the vault key before it saves the file.
//   GET    /account/audit                    each time an admin looked at this account's values, with the reason
//                                            (lib/audit.js forMember), newest first, for Settings → What Dayhub can
//                                            see. Only rows about the caller.
//   DELETE /account   { confirm: 'DELETE' }  deletes the account. The sign-in goes at once, so nothing more can be
//                                            done as this person; the rows and files go in a background job
//                                            (soma_jobs, type delete_account), because a long history takes longer
//                                            to delete than the 30 s this function has. Until the job finishes the
//                                            profile says status 'deleting', which every member route refuses, and
//                                            soma_jobs' hourly sweep finishes any deletion a job left half done.
//
// An admin account cannot delete itself here: it would take the last admin with it (ADMIN_EMAILS would make a fresh
// one on the next sign-in, empty). David removes an admin by hand if he ever needs to.

'use strict';

const express = require('express');
const catalyst = require('zcatalyst-sdk-node');
const { withUser, member, wrap, isTestUser } = require('../lib/auth');
const { HttpError, select, selectAll, needId, unpackJson, bool } = require('../lib/db');
const { writeLog } = require('../lib/log');
const { forMember, MEMBER_ACTIONS } = require('../lib/audit');
const { shortName } = require('../lib/ops');

const router = express.Router();
const POOL = 'soma_jobs';
const num = (v) => (v === null || v === '' || v === undefined ? null : Number(v));

router.get('/account/export', member, wrap(async (req, res) => {
  const uid = needId(req.user.id);
  const by = `WHERE user_id = ${uid}`;
  const [profiles, checkins, dayLogs, activity, weight, recipes, entries, reviews, months, memberships, feedback, tokens, messages] = await Promise.all([
    select(req.admin, 'profiles', `SELECT email, display_name, role, status, settings_json, CREATEDTIME FROM profiles ${by}`),
    selectAll(req.admin, 'checkins', `SELECT day, mood, habits_json, counts_json FROM checkins ${by} ORDER BY day ASC`),
    selectAll(req.admin, 'day_logs', `SELECT day, meals_json, extras_json FROM day_logs ${by} ORDER BY day ASC`),
    selectAll(req.admin, 'activity', `SELECT day, pushups, types_json, steps FROM activity ${by} ORDER BY day ASC`),
    selectAll(req.admin, 'weight', `SELECT day, value FROM weight ${by} ORDER BY day ASC`),
    selectAll(req.admin, 'recipes', `SELECT payload_json, CREATEDTIME FROM recipes ${by} ORDER BY CREATEDTIME ASC`),
    selectAll(req.admin, 'entries', `SELECT entry_id, created_ms, has_audio, audio_size, audio_mime, has_photo, photo_size, photo_mime, transcript_status FROM entries ${by} ORDER BY created_ms ASC`),
    selectAll(req.admin, 'reviews', `SELECT week_start, ciphertext, has_audio, created_ms FROM reviews ${by} ORDER BY week_start ASC`),
    selectAll(req.admin, 'health_months', `SELECT ym, ciphertext FROM health_months ${by} ORDER BY ym ASC`),
    select(req.admin, 'round_members', `SELECT round_id, daily_target, start_day, status FROM round_members ${by} LIMIT 300`),
    selectAll(req.admin, 'feedback', `SELECT body, CREATEDTIME FROM feedback ${by} ORDER BY CREATEDTIME ASC`),
    select(req.admin, 'vault_tokens', `SELECT provider, created_ms FROM vault_tokens ${by} LIMIT 100`),
    selectAll(req.admin, 'messages', `SELECT sender, body, created_ms FROM messages ${by} ORDER BY created_ms ASC`)
  ]);
  const roundIds = [...new Set(memberships.map((m) => needId(m.round_id)))];
  const rounds = roundIds.length ? await select(req.admin, 'rounds', `SELECT ROWID, name, start_date, length_days FROM rounds WHERE ROWID IN (${roundIds.join(', ')}) LIMIT 300`) : [];
  const roundOf = new Map(rounds.map((r) => [String(r.ROWID), r]));
  const p = profiles[0] || {};

  res.json({
    app: 'Dayhub',
    exportedAt: new Date().toISOString(),
    account: { email: p.email || req.user.email, displayName: p.display_name || '', role: p.role, joined: p.CREATEDTIME || null },
    settings: unpackJson(p.settings_json, {}),
    checkins: checkins.map((r) => ({ day: r.day, mood: r.mood || null, habits: unpackJson(r.habits_json, {}), counts: unpackJson(r.counts_json, {}) })),
    meals: dayLogs.map((r) => ({ day: r.day, meals: unpackJson(r.meals_json, {}), extras: unpackJson(r.extras_json, []) })),
    activity: activity.map((r) => ({ day: r.day, pushups: num(r.pushups), moves: unpackJson(r.types_json, {}), steps: num(r.steps) })),
    weight: weight.map((r) => ({ day: r.day, value: Number(r.value) })),
    recipes: recipes.map((r) => unpackJson(r.payload_json, {})),
    rounds: memberships.map((m) => {
      const r = roundOf.get(String(m.round_id));
      return { name: r ? r.name : null, startDate: r ? r.start_date : null, lengthDays: r ? Number(r.length_days) : null, dailyTarget: Number(m.daily_target), status: m.status };
    }),
    journal: entries.map((r) => ({
      id: r.entry_id, createdMs: Number(r.created_ms), transcriptStatus: r.transcript_status || 'none',
      hasAudio: bool(r.has_audio), audioBytes: num(r.audio_size) || 0, audioType: r.audio_mime || null,
      hasPhoto: bool(r.has_photo), photoBytes: num(r.photo_size) || 0, photoType: r.photo_mime || null
    })),
    reviews: reviews.map((r) => ({ weekStart: r.week_start, ciphertext: r.ciphertext, hasAudio: bool(r.has_audio), createdMs: num(r.created_ms) })),
    sleep: months.map((r) => ({ month: r.ym, ciphertext: r.ciphertext })),
    feedback: feedback.map((r) => ({ body: r.body, sent: r.CREATEDTIME })),
    messages: messages.map((r) => ({ from: r.sender === 'admin' ? 'Dayhub' : 'you', body: r.body, sentMs: num(r.created_ms) })),
    // Which services are linked, never the tokens: they are vault ciphertext that only opens on a device.
    linked: tokens.map((r) => ({ service: r.provider, since: num(r.created_ms) }))
  });
}));

// The looks at the caller's own values, with their reasons (2026-11-11, privacy people can see; only these for now,
// lib/audit.js says why). Selected by the caller's own id and those actions, nothing else, so no one reads another
// person's. The admins' names are as Ops shortens them ("David F.").
router.get('/account/audit', member, wrap(async (req, res) => {
  const uid = needId(req.user.id);
  const actions = MEMBER_ACTIONS.map((a) => `'${a}'`).join(', ');
  const rows = await select(req.admin, 'ops_audit', `SELECT created_ms, actor_id, action, reason FROM ops_audit WHERE target_id = ${uid} AND action IN (${actions}) ORDER BY created_ms DESC LIMIT 100`);
  const ids = [...new Set(rows.map((r) => String(r.actor_id)).filter((id) => /^\d{1,19}$/.test(id) && id !== uid))];
  const people = ids.length ? await select(req.admin, 'profiles', `SELECT user_id, display_name, email FROM profiles WHERE user_id IN (${ids.join(', ')}) LIMIT 50`) : [];
  const names = new Map(people.map((p) => [String(p.user_id), shortName(p.display_name, p.email)]));
  res.json({ items: forMember(rows, uid, (id) => names.get(String(id)) || 'An admin who has since left') });
}));

// withUser rather than member: a deletion that was started and interrupted can be asked for again while the
// profile says 'deleting'. Pending and disabled accounts can delete themselves too; it is their data.
router.delete('/account', withUser, wrap(async (req, res) => {
  if (!req.body || req.body.confirm !== 'DELETE') throw new HttpError(400, 'type DELETE to confirm');
  if (req.profile.role === 'admin') throw new HttpError(403, "an admin account can't be deleted from the app");
  res.status(202).json(await startDeletion(req, { uid: needId(req.user.id), rowId: req.profile.rowId, test: isTestUser(req) }));
}));

/** Begin deleting an account: mark it 'deleting', remove the sign-in, queue the job. Used by DELETE /account (your own)
 *  and by Dayhub Ops (an admin, on the person's written request, recorded in the audit first). */
async function startDeletion(req, { uid, rowId, test }) {
  await req.admin.datastore().table('profiles').updateRow({ ROWID: rowId, status: 'deleting' });

  // The sign-in first: from here on nobody can act as this person, and the job's work cannot be undone by a new
  // request recreating rows. The synthetic test members have no sign-in to delete. A failure is the job's to retry.
  let signInGone = Boolean(test);
  if (!signInGone) {
    try { signInGone = Boolean(await catalyst.initialize(req, { scope: 'admin' }).userManagement().deleteUser(uid)); }
    catch (e) { void writeLog(req.admin, { level: 'warn', source: 'api', area: 'account', event: 'sign_in_delete_failed', message: e.message, userId: uid }); }
  }

  let queued = true;
  try {
    await req.admin.jobScheduling().job().submitJob({
      job_name: 'del_' + uid.slice(-12),
      target_type: 'Function',
      target_name: 'soma_jobs',
      jobpool_name: POOL,
      params: { type: 'delete_account', user_id: uid, sign_in_gone: signInGone ? '1' : '0', test: test ? '1' : '0' }
    });
  } catch (e) {
    // The profile already says 'deleting', so the hourly sweep will do it; only the wait is longer.
    queued = false;
    void writeLog(req.admin, { level: 'warn', source: 'api', area: 'account', event: 'delete_queue_failed', message: e.message, userId: uid });
  }
  console.log(JSON.stringify({ action: 'account_delete_started', user: uid, queued, signInGone, by: req.user.id === uid ? 'self' : 'admin' }));
  return { deleting: true, queued, signInGone };
}

module.exports = router;
module.exports.startDeletion = startDeletion;
