// Temporary spike routes; delete with catalyst/SPIKE.md cleanup. Gated by SPIKE_KEY from secrets.json.

'use strict';

const express = require('express');
const catalyst = require('zcatalyst-sdk-node');
const crypto = require('crypto');

const router = express.Router();
const SIGN_EXPIRY_S = 900;

const SPIKE_KEY = process.env.SPIKE_KEY || '';
function spikeGate(req, res, next) {
  const given = req.get('x-spike-key') || (req.query && req.query.spike);
  if (!SPIKE_KEY || given !== SPIKE_KEY) return res.status(404).json({ error: 'no such route' });
  next();
}
const adminApp = (req) => catalyst.initialize(req, { scope: 'admin' });
const SPIKE_BUCKET = 'soma-drafts';

// Item 3: mint a PUT and a GET URL for a throwaway key so a browser page can upload straight to Stratus.
router.post('/sign', spikeGate, async (req, res) => {
  try {
    const key = 'spike/' + crypto.randomUUID() + '.bin';
    const b = adminApp(req).stratus().bucket(SPIKE_BUCKET);
    const put = await b.generatePreSignedUrl(key, 'PUT', { expiryIn: SIGN_EXPIRY_S });
    const get = await b.generatePreSignedUrl(key, 'GET', { expiryIn: SIGN_EXPIRY_S });
    res.json({ bucket: SPIKE_BUCKET, key, put: put.signature, get: get.signature, expiresIn: SIGN_EXPIRY_S });
  } catch (e) {
    console.error(JSON.stringify({ action: 'spike_sign', error: e.message }));
    res.status(502).json({ error: e.message });
  }
});

// Item 4: submit a job to soma_jobs and read its status plus the result object it writes.
router.post('/job', spikeGate, async (req, res) => {
  const sleepMs = Number((req.body && req.body.sleepMs) || 90000);
  const pool = (req.body && req.body.pool) || 'soma_jobs';
  const key = 'spike/job-' + Date.now() + '.json';
  try {
    const a = adminApp(req);
    // user_id 0: spike rows belong to nobody. Real /jobs inserts req.user.id.
    const row = await a.datastore().table('jobs').insertRow({ user_id: 0, type: 'spike', status: 'queued' });
    const job = await a.jobScheduling().job().submitJob({
      job_name: 'spike_' + Date.now().toString(36),
      target_type: 'Function',
      target_name: 'soma_jobs',
      jobpool_name: pool,
      params: { sleep_ms: String(sleepMs), result_key: key, row_id: String(row.ROWID) }
    });
    res.json({ jobId: job.job_id, status: job.job_status, key, rowId: String(row.ROWID) });
  } catch (e) {
    console.error(JSON.stringify({ action: 'spike_job_submit', error: e.message }));
    res.status(502).json({ error: e.message });
  }
});
router.get('/job/:id', spikeGate, async (req, res) => {
  try {
    const a = adminApp(req);
    const job = await a.jobScheduling().job().getJob(req.params.id);
    let result = null;
    if (req.query.key) {
      try {
        const stream = await a.stratus().bucket(SPIKE_BUCKET).getObject(String(req.query.key));
        const chunks = [];
        for await (const c of stream) chunks.push(c);
        result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch (_e) { result = null; }
    }
    let row = null;
    if (/^\d+$/.test(String(req.query.row || ''))) {
      const rows = await a.zcql().executeZCQLQuery('SELECT ROWID, status, result_ref, MODIFIEDTIME FROM jobs WHERE ROWID = ' + req.query.row);
      row = (rows[0] && rows[0].jobs) || null;
    }
    res.json({ job: { id: job.job_id, status: job.job_status, executionMs: job.execution_time, dispatchDelayMs: job.dispatch_delay }, result, row });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Data Store Text limit: insert n characters into spike_text.body and report what happens.
router.post('/text', spikeGate, async (req, res) => {
  const n = Math.min(Number((req.body && req.body.n) || 10001), 200000);
  try {
    const table = adminApp(req).datastore().table('spike_text');
    const row = await table.insertRow({ body: 'x'.repeat(n - 1) + 'Z' });
    const back = await table.getRow(row.ROWID);
    const stored = String(back.body || '');
    res.json({ n, ok: true, rowId: String(row.ROWID), echoedLength: String(row.body || '').length, storedLength: stored.length, lastChar: stored.slice(-1) });
  } catch (e) {
    res.json({ n, ok: false, error: e.message });
  }
});

module.exports = router;
