// Soma jobs — Catalyst Job function (900 s budget). Dispatches on params.type.
//
//   transcribe   Groq whisper-large-v3-turbo over a plaintext audio object the browser uploaded for this purpose.
//                The audio is deleted as soon as Groq has answered, whatever the answer was. The transcript is
//                written next to it for the browser to collect, encrypt into the entry and delete.
//   nudge        the evening nudge, from a 15-minute cron (nudge.js); with test=1, a test notification for one user.
//   delete_account  every row and file of an account (account.js), queued by soma_api's DELETE /account.
//                The same cron prunes the log and the AI usage counts once a day and sweeps stale transcription
//                jobs once an hour.
//   anything else is logged and dropped: only soma_api submits jobs, and it only submits these.
//
// The jobs row is the contract with soma_api/routes/jobs.js:
//   status      queued → running → done | failed
//   result_ref  'src:<name>' while the audio exists, then the result object's name, or 'error:<code>'

'use strict';

const catalyst = require('zcatalyst-sdk-node');
const nudge = require('./nudge');
const account = require('./account');
const { writeLog } = require('./log');

const RETAIN_DAYS = 30;
// Rides on the 15-minute nudge cron, but only on the first run after 03:00 UTC: once a day keeps the log at a month
// without a job of its own, and without spending a query of the monthly free tier on every run.
async function pruneLogs(app) {
  const now = new Date();
  if (now.getUTCHours() !== 3 || now.getUTCMinutes() >= 15) return;
  for (let i = 0; i < 5; i++) {
    const old = (await app.zcql().executeZCQLQuery(`SELECT ROWID FROM logs WHERE created_ms < ${now.getTime() - RETAIN_DAYS * 86400000} LIMIT 100`)).map((r) => r.logs.ROWID);
    if (old.length) await app.datastore().table('logs').deleteRows(old);
    if (old.length < 100) break;
  }
}

// soma_api/lib/quota.js counts every paid AI call as a row of ai_usage and only ever reads today's. Rows from before
// yesterday are kept three days, for a look at the admin log if a cap ever trips, then deleted here in the same
// daily window as the log. Bounded per run; a backlog is finished over the following days.
const USAGE_KEEP_DAYS = 3;
async function pruneUsage(app) {
  const now = new Date();
  if (now.getUTCHours() !== 3 || now.getUTCMinutes() >= 15) return;
  const before = new Date(now.getTime() - USAGE_KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  let removed = 0;
  for (let i = 0; i < 20; i++) {
    const old = (await app.zcql().executeZCQLQuery(`SELECT ROWID FROM ai_usage WHERE day < '${before}' LIMIT 100`)).map((r) => r.ai_usage.ROWID);
    if (old.length) await app.datastore().table('ai_usage').deleteRows(old);
    removed += old.length;
    if (old.length < 100) break;
  }
  if (removed) console.log(JSON.stringify({ action: 'usage_pruned', rows: removed }));
}

const BUCKET = 'soma-drafts';
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_LIMIT = 25 * 1024 * 1024;
const MIME = { webm: 'audio/webm', m4a: 'audio/mp4', mp4: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav' };

class JobError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

// Stratus deletes are scheduled, not immediate: a deleted object stays downloadable for a minute or more
// (measured; see catalyst/SPIKE.md). An overwrite is immediate. So anything sensitive is blanked first, then deleted.
async function shred(bucket, key) {
  await bucket.putObject(key, ' ', { contentType: 'application/octet-stream', overwrite: true }).catch(() => undefined);
  await bucket.deleteObject(key).catch(() => undefined);
}

async function readObject(bucket, key) {
  const stream = await bucket.getObject(key);
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

async function groq(audio, fileName) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new JobError('not_configured', 'GROQ_API_KEY is not set');
  if (audio.length > GROQ_LIMIT) throw new JobError('too_large', 'audio is over 25 MB');

  const ext = fileName.split('.').pop();
  const form = new FormData();
  // Groq picks its decoder from the file name, so it has to carry the real extension (iOS records m4a).
  form.append('file', new Blob([audio], { type: MIME[ext] || 'application/octet-stream' }), 'audio.' + ext);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'verbose_json');
  form.append('language', 'en');

  let res;
  try { res = await fetch(GROQ_URL, { method: 'POST', headers: { authorization: 'Bearer ' + key }, body: form, signal: AbortSignal.timeout(120000) }); }
  catch (e) { throw new JobError('provider_unreachable', e.message); }
  if (res.status === 401) throw new JobError('provider_auth', 'Groq rejected the API key');
  if (res.status === 429) throw new JobError('rate_limited', 'Groq rate limit');
  if (res.status === 413) throw new JobError('too_large', 'Groq refused the size');
  if (!res.ok) throw new JobError('provider_error', 'Groq ' + res.status + ': ' + (await res.text().catch(() => '')).slice(0, 200));
  const body = await res.json();
  return { text: String(body.text || '').trim(), language: body.language || null, duration: body.duration || null };
}

async function transcribe(app, params) {
  const rowId = params.row_id;
  const table = app.datastore().table('jobs');
  const bucket = app.stratus().bucket(BUCKET);
  if (!/^\d{1,19}$/.test(String(params.user_id)) || !/^tx-[A-Za-z0-9_-]{8,40}\.[a-z0-9]{2,4}$/.test(String(params.source))) throw new JobError('bad_params');
  const prefix = params.user_id + '/drafts/';
  const started = Date.now();

  try {
    // Inside the try, so a row the browser already deleted (it gave up waiting) still ends with the audio shredded.
    await table.updateRow({ ROWID: rowId, status: 'running' }).catch(() => { throw new JobError('row_gone', 'the job was cancelled before it started'); });
    const audio = await readObject(bucket, prefix + params.source).catch(() => { throw new JobError('source_missing', 'the uploaded audio was not found'); });
    const result = await groq(audio, params.source);
    const name = 'tx-result-' + rowId + '.json';
    await bucket.putObject(prefix + name, JSON.stringify(result), { contentType: 'application/json', overwrite: true });
    // The transcript is plain text until the browser collects it. If nobody is coming for it (the row is gone),
    // it must not stay behind.
    try { await table.updateRow({ ROWID: rowId, status: 'done', result_ref: name }); }
    catch (_e) { await shred(bucket, prefix + name); throw new JobError('row_gone', 'the job was cancelled before the transcript was ready'); }
    console.log(JSON.stringify({ action: 'transcribe_done', row: rowId, bytes: audio.length, chars: result.text.length, ms: Date.now() - started }));
  } catch (e) {
    const code = e instanceof JobError ? e.code : 'internal';
    await table.updateRow({ ROWID: rowId, status: 'failed', result_ref: 'error:' + code }).catch(() => undefined);
    console.error(JSON.stringify({ action: 'transcribe_failed', row: rowId, code, error: e.message, ms: Date.now() - started }));
    await writeLog(app, { level: code === 'row_gone' ? 'warn' : 'error', source: 'job', area: 'transcribe', event: code, message: e.message, detail: { row: rowId, ms: Date.now() - started }, userId: params.user_id, test: /^99900000000000000[123]$/.test(String(params.user_id)) });
  } finally {
    // The plaintext audio never outlives the attempt.
    await shred(bucket, prefix + params.source);
  }
}

// The backstop for plain text left on the server. A transcription the browser never came back for (the tab closed,
// the phone locked mid-way) leaves its row, and with it the uploaded audio or the finished transcript. The browser
// and soma_api clean up on every path they can see; this catches the rest, so nothing readable outlives an hour.
// Hourly, on the first run of the 15-minute cron in each hour, so it costs one query an hour when there is nothing to do.
const STALE_MS = 60 * 60 * 1000;
const TX_NAME = /^tx-[A-Za-z0-9_-][A-Za-z0-9_.-]{0,80}$/;
async function sweepJobs(app) {
  const now = Date.now();
  if (new Date(now).getUTCMinutes() >= 15) return;
  // created_ms IS NULL: rows from before the column existed, all long stale.
  const rows = (await app.zcql().executeZCQLQuery(
    `SELECT ROWID, user_id, result_ref FROM jobs WHERE type = 'transcribe' AND (created_ms < ${now - STALE_MS} OR created_ms IS NULL) LIMIT 100`
  )).map((r) => r.jobs).filter(Boolean);
  if (!rows.length) return;
  const bucket = app.stratus().bucket(BUCKET);
  for (const row of rows) {
    const ref = String(row.result_ref || '');
    const name = ref.startsWith('src:') ? ref.slice(4) : ref.startsWith('error:') ? '' : ref;
    // Only ever a tx- object in that member's own drafts folder.
    if (/^\d{1,19}$/.test(String(row.user_id)) && TX_NAME.test(name) && !name.includes('..')) await shred(bucket, `${row.user_id}/drafts/${name}`);
    await app.datastore().table('jobs').deleteRow(row.ROWID);
  }
  console.log(JSON.stringify({ action: 'jobs_swept', rows: rows.length }));
  await writeLog(app, { level: 'info', source: 'job', area: 'transcribe', event: 'swept', message: `shredded what ${rows.length} unfinished transcription${rows.length === 1 ? '' : 's'} left behind`, detail: { rows: rows.length } });
}

module.exports = async (jobRequest, context) => {
  const started = Date.now();
  const app = catalyst.initialize(context, { scope: 'admin' });
  try {
    const params = jobRequest.getAllJobParams() || {};
    if (params.type === 'transcribe') await transcribe(app, params);
    else if (params.type === 'delete_account') await account.deleteAccount(app, params);
    else if (params.type === 'nudge') {
      await nudge.run(app, params);
      if (params.test !== '1') {
        await sweepJobs(app).catch((e) => writeLog(app, { source: 'job', area: 'transcribe', event: 'sweep_failed', message: e.message }));
        await pruneLogs(app).catch(() => undefined);
        await pruneUsage(app).catch((e) => writeLog(app, { level: 'warn', source: 'job', area: 'quota', event: 'prune_failed', message: e.message }));
        // Hourly, like the job sweep: finish any account deletion a job left half done (or never started).
        if (new Date().getUTCMinutes() < 15) await account.finishDeletions(app).catch((e) => writeLog(app, { source: 'job', area: 'account', event: 'finish_failed', message: e.message }));
      }
    } else {
      await writeLog(app, { level: 'warn', source: 'job', area: 'jobs', event: 'unknown_type', message: 'a job with no known type was dropped', detail: { type: String(params.type || '').slice(0, 40) } });
    }
    // A failed transcription is a handled outcome recorded on the row, not a failed job: retrying it would
    // find the audio already deleted.
    context.closeWithSuccess();
  } catch (e) {
    console.error(JSON.stringify({ action: 'job_crashed', error: e.message, ms: Date.now() - started }));
    await writeLog(app, { source: 'job', area: 'jobs', event: 'crash', message: e.message, detail: { stack: String(e.stack || '').split(String.fromCharCode(10)).slice(0, 8).join(' | ') } });
    context.closeWithFailure();
  }
};
