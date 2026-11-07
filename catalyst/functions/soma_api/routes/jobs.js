// Background jobs. Anything that can outlast the 30 s Advanced I/O limit is queued here and run by soma_jobs.
//
// transcribe: the one place plaintext leaves the device, and only when the user has switched it on. The browser
// uploads the decrypted audio to <user_id>/drafts/tx-<entry>.<ext>, queues a job, polls it, reads the transcript
// from <user_id>/drafts/<result>, then DELETEs the job, which removes both objects. The job itself deletes the
// audio the moment Groq has answered, success or failure.
//
// Nothing readable is left behind on any path: an upload this route refuses (switched off, too many running, the
// queue down) is shredded here; a job the browser never collected (the tab closed mid-way) is found by created_ms
// and shredded by soma_jobs' hourly sweep.

'use strict';

const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError, select, needId, needToken, unpackJson } = require('../lib/db');
const { writeLog } = require('../lib/log');

const router = express.Router();
const BUCKET = 'soma-drafts';
const POOL = 'soma_jobs';
const SOURCE = /^tx-[A-Za-z0-9_-]{8,40}\.(webm|m4a|mp4|ogg|wav)$/;
const MAX_OPEN = 5;
const COLS = 'ROWID, user_id, type, status, result_ref, CREATEDTIME';

const shape = (r) => {
  const ref = r.result_ref || '';
  return { id: String(r.ROWID), type: r.type, status: r.status, error: ref.startsWith('error:') ? ref.slice(6) : null, result: ref && !ref.startsWith('error:') && !ref.startsWith('src:') ? ref : null };
};

async function mine(req, id) {
  const rows = await select(req.admin, 'jobs', `SELECT ${COLS} FROM jobs WHERE ROWID = ${needId(id, 'job id')} AND user_id = ${needId(req.user.id)}`);
  if (!rows[0]) throw new HttpError(404, 'no such job');
  return rows[0];
}

// Blank, then delete: a Stratus delete alone leaves the object readable for a minute or more.
async function shred(bucket, key) {
  await bucket.putObject(key, ' ', { contentType: 'application/octet-stream', overwrite: true }).catch(() => null);
  await bucket.deleteObject(key).catch(() => null);
}

router.post('/jobs', member, wrap(async (req, res) => {
  const b = req.body || {};
  if (b.type !== 'transcribe') throw new HttpError(400, 'unknown job type');
  needToken(b.entryId, 'entry id');
  if (typeof b.source !== 'string' || !SOURCE.test(b.source)) throw new HttpError(400, 'bad source name');
  const bucket = req.admin.stratus().bucket(BUCKET);
  const source = `${req.user.id}/drafts/${b.source}`;

  // A journal recording leaves the device only with cloud transcription switched on (Settings → Journal & vault).
  // The browser asks first; this is the server keeping the same promise. Food said aloud (entry ids food_…) is a tap
  // of its own on Food, not the journal.
  if (!b.entryId.startsWith('food_')) {
    const rows = await select(req.admin, 'profiles', `SELECT settings_json FROM profiles WHERE user_id = ${needId(req.user.id)}`);
    if (unpackJson(rows[0] && rows[0].settings_json, {}).cloudTranscription !== true) {
      await shred(bucket, source);
      throw new HttpError(403, 'cloud transcription is switched off in Settings');
    }
  }

  const open = await select(req.admin, 'jobs', `SELECT ROWID FROM jobs WHERE user_id = ${needId(req.user.id)} AND status IN ('queued', 'running') LIMIT ${MAX_OPEN + 1}`);
  if (open.length >= MAX_OPEN) {
    await shred(bucket, source);
    throw new HttpError(429, 'too many jobs in progress; wait for one to finish');
  }

  // The source name rides in result_ref until the job replaces it, so a DELETE can always find what to clean up;
  // created_ms is what the hourly sweep in soma_jobs reads to find a job nobody came back for.
  const row = await req.admin.datastore().table('jobs').insertRow({ user_id: req.user.id, type: 'transcribe', status: 'queued', result_ref: 'src:' + b.source, created_ms: Date.now() });
  try {
    await req.admin.jobScheduling().job().submitJob({
      job_name: 'tx_' + String(row.ROWID).slice(-12),
      target_type: 'Function',
      target_name: 'soma_jobs',
      jobpool_name: POOL,
      params: { type: 'transcribe', row_id: String(row.ROWID), user_id: req.user.id, source: b.source }
    });
  } catch (e) {
    // No job will ever read the audio, and the row is about to forget its name: shred it now.
    await shred(bucket, source);
    await req.admin.datastore().table('jobs').updateRow({ ROWID: row.ROWID, status: 'failed', result_ref: 'error:queue_unavailable' });
    console.error(JSON.stringify({ action: 'job_submit', error: e.message }));
    await writeLog(req.admin, { source: 'api', area: 'jobs', event: 'queue_unavailable', message: e.message, userId: req.user.id });
    throw new HttpError(502, 'could not queue the job');
  }
  res.status(201).json(shape(row));
}));

router.get('/jobs/:id', member, wrap(async (req, res) => {
  res.json(shape(await mine(req, req.params.id)));
}));

// Removes the row and anything the job left in Stratus. Safe to call at any point; a missing object is fine.
router.delete('/jobs/:id', member, wrap(async (req, res) => {
  const row = await mine(req, req.params.id);
  const ref = row.result_ref || '';
  const names = [];
  if (ref.startsWith('src:')) names.push(ref.slice(4));
  else if (ref && !ref.startsWith('error:')) names.push(ref);
  const bucket = req.admin.stratus().bucket(BUCKET);
  await Promise.all(names.map((n) => shred(bucket, `${req.user.id}/drafts/${n}`)));
  await req.admin.datastore().table('jobs').deleteRow(row.ROWID);
  res.json({ deleted: true });
}));

module.exports = router;
