// Soma jobs — Catalyst Job function (900 s budget). Dispatches on params.type.
//
//   transcribe   Groq whisper-large-v3-turbo over a plaintext audio object the browser uploaded for this purpose.
//                The audio is deleted as soon as Groq has answered, whatever the answer was. The transcript is
//                written next to it for the browser to collect, encrypt into the entry and delete.
//   (none)       the spike's sleep-and-write job, kept until the spike routes are removed.
//
// The jobs row is the contract with soma_api/routes/jobs.js:
//   status      queued → running → done | failed
//   result_ref  'src:<name>' while the audio exists, then the result object's name, or 'error:<code>'

'use strict';

const catalyst = require('zcatalyst-sdk-node');

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

  await table.updateRow({ ROWID: rowId, status: 'running' });
  try {
    const audio = await readObject(bucket, prefix + params.source).catch(() => { throw new JobError('source_missing', 'the uploaded audio was not found'); });
    const result = await groq(audio, params.source);
    const name = 'tx-result-' + rowId + '.json';
    await bucket.putObject(prefix + name, JSON.stringify(result), { contentType: 'application/json', overwrite: true });
    await table.updateRow({ ROWID: rowId, status: 'done', result_ref: name });
    console.log(JSON.stringify({ action: 'transcribe_done', row: rowId, bytes: audio.length, chars: result.text.length, ms: Date.now() - started }));
  } catch (e) {
    const code = e instanceof JobError ? e.code : 'internal';
    await table.updateRow({ ROWID: rowId, status: 'failed', result_ref: 'error:' + code }).catch(() => undefined);
    console.error(JSON.stringify({ action: 'transcribe_failed', row: rowId, code, error: e.message, ms: Date.now() - started }));
  } finally {
    // The plaintext audio never outlives the attempt.
    await shred(bucket, prefix + params.source);
  }
}

async function spike(app, params, context, started) {
  const sleepMs = Math.max(0, parseInt(params.sleep_ms || '90000', 10));
  const key = params.result_key || ('spike/job-' + started + '.json');
  await new Promise((r) => setTimeout(r, sleepMs));
  const body = JSON.stringify({ ok: true, sleptMs: Date.now() - started, maxExecutionMs: context.getMaxExecutionTimeMs(), node: process.version, finishedAt: new Date().toISOString() });
  await app.stratus().bucket(BUCKET).putObject(key, body, { contentType: 'application/json', overwrite: true });
  if (params.row_id) await app.datastore().table('jobs').updateRow({ ROWID: params.row_id, status: 'done', result_ref: key });
}

module.exports = async (jobRequest, context) => {
  const started = Date.now();
  const app = catalyst.initialize(context, { scope: 'admin' });
  try {
    const params = jobRequest.getAllJobParams() || {};
    if (params.type === 'transcribe') await transcribe(app, params);
    else await spike(app, params, context, started);
    // A failed transcription is a handled outcome recorded on the row, not a failed job: retrying it would
    // find the audio already deleted.
    context.closeWithSuccess();
  } catch (e) {
    console.error(JSON.stringify({ action: 'job_crashed', error: e.message, ms: Date.now() - started }));
    context.closeWithFailure();
  }
};
