// Soma API — Zoho Catalyst Advanced I/O function (Express on the raw (req, res) handler).
// Every route resolves the caller first and scopes every query by user_id;
// Catalyst Data Store has no row-level security, so this layer is the security boundary.
//
// So far: /health, /me, /sign and /admin/profiles. Grow route by route per docs/HANDOFF.md §5.
// Keep handlers under the 30 s Advanced I/O timeout; anything longer becomes a job.

'use strict';

const express = require('express');
const catalyst = require('zcatalyst-sdk-node');
const crypto = require('crypto');

const BUCKETS = ['soma-entries', 'soma-audio', 'soma-photos', 'soma-drafts'];
const SIGN_EXPIRY_S = 900;

const app = express();
app.disable('x-powered-by');

// Catalyst invokes the function at .../server/soma_api/execute[/path]; Express sees '/execute/path'.
app.use((req, _res, next) => {
  if (req.url === '/execute' || req.url.startsWith('/execute/') || req.url.startsWith('/execute?')) {
    req.url = req.url.slice('/execute'.length) || '/';
  }
  next();
});

// CORS only for local dev. In Development/Production the gateway injects CORS for Authorized Domains;
// adding headers here as well would duplicate them and break every browser call.
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  next();
});

app.use(express.json({ limit: '1mb' }));

// Resolve the signed-in app user for this request. Fails closed.
// User scope is only for identity; data access goes through the admin-scoped app on req.admin.
async function withUser(req, res, next) {
  try {
    const userApp = catalyst.initialize(req);
    const user = await userApp.userManagement().getCurrentUser();
    if (!user || !user.user_id) return res.status(401).json({ error: 'not signed in' });
    req.user = {
      id: String(user.user_id),
      email: user.email_id,
      name: [user.first_name, user.last_name].filter(Boolean).join(' '),
      role: (user.role_details && user.role_details.role_name) || null,
      status: user.status || null
    };
    req.admin = catalyst.initialize(req, { scope: 'admin' });
  } catch (e) {
    return res.status(401).json({ error: 'not signed in' });
  }
  try {
    req.profile = await loadProfile(req.admin, req.user);
    next();
  } catch (e) {
    console.error(JSON.stringify({ action: 'load_profile', user: req.user.id, error: e.message }));
    res.status(500).json({ error: 'internal error' });
  }
}

// Approval lives in our own profiles table: Catalyst sign-up has no "pending" state.
// A user's first authenticated call creates their profile as pending; ADMIN_EMAILS start as active admins.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((e) => e.trim()).filter(Boolean);
const STATUSES = ['pending', 'active', 'disabled'];
const isId = (v) => /^\d{1,19}$/.test(String(v));

async function findProfile(admin, userId) {
  if (!isId(userId)) throw new Error('bad user id');
  const rows = await admin.zcql().executeZCQLQuery(
    'SELECT ROWID, user_id, email, display_name, role, status, CREATEDTIME FROM profiles WHERE user_id = ' + userId
  );
  return rows.length ? rows[0].profiles : null;
}

async function loadProfile(admin, user) {
  let row = await findProfile(admin, user.id);
  if (!row) {
    const isAdmin = ADMIN_EMAILS.includes(String(user.email || '').toLowerCase());
    try {
      row = await admin.datastore().table('profiles').insertRow({
        user_id: user.id,
        email: user.email,
        display_name: (user.name || '').slice(0, 100),
        role: isAdmin ? 'admin' : 'member',
        status: isAdmin ? 'active' : 'pending'
      });
      console.log(JSON.stringify({ action: 'profile_created', user: user.id, status: row.status }));
    } catch (e) {
      // user_id is unique: a concurrent first request won the insert.
      row = await findProfile(admin, user.id);
      if (!row) throw e;
    }
  }
  return { rowId: String(row.ROWID), displayName: row.display_name || '', role: row.role, status: row.status };
}

// Express 4 does not route a rejected async handler to the error middleware on its own.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

function requireActive(req, res, next) {
  if (req.profile.status !== 'active') return res.status(403).json({ error: 'account ' + req.profile.status, status: req.profile.status });
  next();
}
function requireAdmin(req, res, next) {
  if (req.profile.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  next();
}

// Public. Lets the spike confirm the deploy and the /execute prefix handling.
app.get('/health', (_req, res) => {
  res.json({ ok: true, fn: 'soma_api', node: process.version, at: new Date().toISOString() });
});

// The one route a pending user can call: the app shows "waiting for approval" from profile.status.
app.get('/me', withUser, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, name: req.user.name, profile: req.profile });
});

// Admin: list profiles (optionally by status) and move a user between pending, active and disabled.
app.get('/admin/profiles', withUser, requireActive, requireAdmin, wrap(async (req, res) => {
  const status = req.query.status;
  if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'unknown status' });
  const where = status ? " WHERE status = '" + status + "'" : '';
  const rows = await req.admin.zcql().executeZCQLQuery(
    'SELECT ROWID, user_id, email, display_name, role, status, CREATEDTIME FROM profiles' + where + ' ORDER BY CREATEDTIME DESC LIMIT 200'
  );
  res.json({ profiles: rows.map((r) => ({
    userId: String(r.profiles.user_id), email: r.profiles.email, displayName: r.profiles.display_name || '',
    role: r.profiles.role, status: r.profiles.status, createdAt: r.profiles.CREATEDTIME
  })) });
}));

app.post('/admin/profiles/:userId/status', withUser, requireActive, requireAdmin, wrap(async (req, res) => {
  const status = req.body && req.body.status;
  if (!isId(req.params.userId)) return res.status(400).json({ error: 'bad user id' });
  if (!STATUSES.includes(status) || status === 'pending') return res.status(400).json({ error: 'status must be active or disabled' });
  if (req.params.userId === req.user.id) return res.status(409).json({ error: 'you cannot change your own status' });
  const target = await findProfile(req.admin, req.params.userId);
  if (!target) return res.status(404).json({ error: 'no such user' });
  await req.admin.datastore().table('profiles').updateRow({ ROWID: target.ROWID, status });
  console.log(JSON.stringify({ action: 'profile_status', by: req.user.id, user: req.params.userId, from: target.status, to: status }));
  res.json({ userId: req.params.userId, status });
}));

// Batch pre-signed URLs so 20 MB audio and draft chunks never pass through this function.
// Keys must live under the caller's own prefix. Expiry is 15 minutes.
app.post('/sign', withUser, requireActive, async (req, res) => {
  const { bucket, keys, method } = req.body || {};
  if (!BUCKETS.includes(bucket)) return res.status(400).json({ error: 'unknown bucket' });
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 100) {
    return res.status(400).json({ error: '1–100 keys required' });
  }
  const prefix = req.user.id + '/';
  if (keys.some((k) => typeof k !== 'string' || !k.startsWith(prefix) || k.includes('..'))) {
    return res.status(403).json({ error: 'keys must live under your own prefix' });
  }
  const action = method === 'GET' ? 'GET' : 'PUT';
  try {
    const b = req.admin.stratus().bucket(bucket);
    const urls = await Promise.all(keys.map(async (k) => {
      const r = await b.generatePreSignedUrl(k, action, { expiryIn: SIGN_EXPIRY_S });
      return { key: k, url: r.signature };
    }));
    res.json({ bucket, method: action, expiresIn: SIGN_EXPIRY_S, urls });
  } catch (e) {
    console.error(JSON.stringify({ action: 'sign', error: e.message }));
    res.status(502).json({ error: 'could not sign', detail: e.message });
  }
});

// ── Spike routes (temporary; delete after catalyst/SPIKE.md items 3 and 4 pass) ──
// Gated by SPIKE_KEY from catalyst-config.json env_variables, which also proves env vars reach process.env.
const SPIKE_KEY = process.env.SPIKE_KEY || '';
function spikeGate(req, res, next) {
  const given = req.get('x-spike-key') || (req.query && req.query.spike);
  if (!SPIKE_KEY || given !== SPIKE_KEY) return res.status(404).json({ error: 'no such route' });
  next();
}
const adminApp = (req) => catalyst.initialize(req, { scope: 'admin' });
const SPIKE_BUCKET = 'soma-drafts';

// Item 3: mint a PUT and a GET URL for a throwaway key so a browser page can upload straight to Stratus.
app.post('/spike/sign', spikeGate, async (req, res) => {
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
app.post('/spike/job', spikeGate, async (req, res) => {
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
app.get('/spike/job/:id', spikeGate, async (req, res) => {
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
app.post('/spike/text', spikeGate, async (req, res) => {
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

app.use((_req, res) => res.status(404).json({ error: 'no such route' }));
app.use((err, _req, res, _next) => {
  console.error(JSON.stringify({ action: 'unhandled', error: err.message, stack: err.stack }));
  res.status(500).json({ error: 'internal error' });
});

module.exports = app;
