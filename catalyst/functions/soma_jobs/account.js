// Deleting an account, all of it. soma_api/routes/account.js marks the profile 'deleting', deletes the sign-in and
// queues this; the hourly sweep in index.js runs it again for any profile still marked 'deleting', so a job that
// failed or never started still finishes. It is safe to run twice: a second run finds nothing left and completes.
//
// Order: the sign-in (if the API could not), the files, every row the person owns, then the profile last, so that
// as long as anything is left the profile still says 'deleting' and the sweep will come back for it.

'use strict';

const { writeLog } = require('./log');

const BUCKET = process.env.STRATUS_BUCKET || 'soma-drafts'; // each project's own (deploy.js, catalyst/targets.js)
// Every table with a user_id column. ai_usage and logs included: nothing that names the person stays behind.
const BY_USER = ['checkins', 'day_logs', 'activity', 'weight', 'entries', 'recipes', 'reviews', 'health_months',
  'vault_tokens', 'vault_meta', 'push_subs', 'jobs', 'round_members', 'feedback', 'errors', 'ai_usage', 'logs', 'messages'];
const isId = (v) => /^\d{1,19}$/.test(String(v));

async function ids(app, table, where) {
  const rows = await app.zcql().executeZCQLQuery(`SELECT ROWID FROM ${table} WHERE ${where} LIMIT 300`);
  return rows.map((r) => r[table] && r[table].ROWID).filter(Boolean);
}

/** Deletes every row matching `where`, 300 found and 100 deleted at a time. Returns how many went. */
async function purge(app, table, where) {
  let removed = 0;
  for (let round = 0; round < 200; round++) {
    const found = await ids(app, table, where);
    for (let from = 0; from < found.length; from += 100) await app.datastore().table(table).deleteRows(found.slice(from, from + 100));
    removed += found.length;
    if (found.length < 300) break;
  }
  return removed;
}

/** A group the person made passes to whoever joined it next; one nobody else is in goes with them. */
async function handOver(app, uid) {
  const owned = (await app.zcql().executeZCQLQuery(`SELECT ROWID FROM rounds WHERE created_by = ${uid} LIMIT 300`)).map((r) => r.rounds.ROWID);
  let passed = 0, removed = 0;
  for (const roundId of owned) {
    const next = (await app.zcql().executeZCQLQuery(
      `SELECT user_id FROM round_members WHERE round_id = ${roundId} AND user_id != ${uid} AND status = 'active' ORDER BY join_seq ASC LIMIT 1`
    )).map((r) => r.round_members.user_id)[0];
    if (next) {
      await app.datastore().table('rounds').updateRow({ ROWID: roundId, created_by: String(next) });
      passed++;
    } else {
      await purge(app, 'invites', `round_id = ${roundId}`);
      await purge(app, 'round_members', `round_id = ${roundId}`);
      await app.datastore().table('rounds').deleteRow(roundId);
      removed++;
    }
  }
  return { passed, removed };
}

/** params: { user_id, sign_in_gone: '1' | '0', test: '1' | '0' } */
async function deleteAccount(app, params) {
  const uid = String(params.user_id || '');
  if (!isId(uid)) throw new Error('delete_account without a user id');
  const test = params.test === '1' || /^99900000000000000\d$/.test(uid);
  const failures = [];
  const counts = {};
  const step = async (name, work) => {
    try { counts[name] = await work(); }
    catch (e) { failures.push(name); console.error(JSON.stringify({ action: 'delete_step_failed', step: name, error: e.message })); }
  };

  // The sign-in, if the API could not delete it. A failure here does not hold up the rest: the data still goes, and
  // the log tells David to remove the sign-in in the console (signing in again would only find an empty account).
  if (params.sign_in_gone !== '1' && !test) {
    try { counts.sign_in = await app.userManagement().deleteUser(uid); }
    catch (e) {
      const gone = /not\s*found|does not exist|no such|invalid/i.test(e.message);
      counts.sign_in = gone ? 'already gone' : 'not deleted';
      if (!gone) {
        await writeLog(app, { level: 'error', source: 'job', area: 'account', event: 'sign_in_delete_failed', message: 'the sign-in of a deleted account could not be removed; remove it in the Catalyst console', detail: { error: String(e.message).slice(0, 200) }, userId: uid, test });
      }
    }
  }

  // Files: the journal, recordings, photos and drafts are vault ciphertext. A tx- transcription object is plain text
  // for its few seconds of life, so any left over is blanked before the folder goes (a Stratus delete takes a while
  // to land; an overwrite is immediate).
  await step('files', async () => {
    const bucket = app.stratus().bucket(BUCKET);
    let token, blanked = 0;
    do {
      const page = await bucket.listPagedObjects({ prefix: `${uid}/drafts/`, maxKeys: 1000, continuationToken: token });
      for (const o of (page.contents || []).map((x) => x.keyDetails || x)) {
        if (!/\/drafts\/tx-[^/]+$/.test(String(o.key || ''))) continue;
        await bucket.putObject(o.key, ' ', { contentType: 'application/octet-stream', overwrite: true }).catch(() => undefined);
        blanked++;
      }
      token = String(page.truncated) === 'true' ? page.next_continuation_token : undefined;
    } while (token);
    await bucket.deletePath(`${uid}/`);
    return { blanked };
  });

  await step('groups', () => handOver(app, uid));
  await step('invites', () => purge(app, 'invites', `created_by = ${uid}`));
  for (const table of BY_USER) await step(table, () => purge(app, table, `user_id = ${uid}`));

  if (failures.length) {
    // The profile stays 'deleting'; the hourly sweep runs this again.
    await writeLog(app, { level: 'error', source: 'job', area: 'account', event: 'delete_incomplete', message: 'an account deletion stopped part way; it will be tried again within the hour', detail: { failed: failures }, userId: uid, test });
    return false;
  }
  await purge(app, 'profiles', `user_id = ${uid}`);
  console.log(JSON.stringify({ action: 'account_deleted', user: uid, counts }));
  // The one line left about them: that the account is gone, and how much went with it. No name, no email.
  await writeLog(app, { level: 'info', source: 'job', area: 'account', event: 'account_deleted', message: 'a member deleted their account', detail: counts, userId: uid, test });
  return true;
}

/** For the hourly sweep: every profile still marked 'deleting', a few at a time. */
async function finishDeletions(app) {
  const rows = (await app.zcql().executeZCQLQuery("SELECT user_id FROM profiles WHERE status = 'deleting' LIMIT 5")).map((r) => r.profiles.user_id);
  for (const uid of rows) await deleteAccount(app, { user_id: String(uid), sign_in_gone: '0' });
  return rows.length;
}

module.exports = { deleteAccount, finishDeletions };
