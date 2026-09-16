// Soma API — Zoho Catalyst Advanced I/O function (Express on the raw (req, res) handler).
// Every route resolves the caller first and scopes every query by user_id;
// Catalyst Data Store has no row-level security, so this layer is the security boundary.
//
// Spike skeleton: /health, /me and /sign. Grow route by route per docs/HANDOFF.md §5.
// Keep handlers under the 30 s Advanced I/O timeout; anything longer becomes a job.

'use strict';

const express = require('express');
const catalyst = require('zcatalyst-sdk-node');

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
    next();
  } catch (e) {
    res.status(401).json({ error: 'not signed in' });
  }
}

// Public. Lets the spike confirm the deploy and the /execute prefix handling.
app.get('/health', (_req, res) => {
  res.json({ ok: true, fn: 'soma_api', node: process.version, at: new Date().toISOString() });
});

app.get('/me', withUser, (req, res) => {
  res.json(req.user);
});

// Batch pre-signed URLs so 20 MB audio and draft chunks never pass through this function.
// Keys must live under the caller's own prefix. Expiry is 15 minutes.
app.post('/sign', withUser, async (req, res) => {
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

app.use((_req, res) => res.status(404).json({ error: 'no such route' }));
app.use((err, _req, res, _next) => {
  console.error(JSON.stringify({ action: 'unhandled', error: err.message, stack: err.stack }));
  res.status(500).json({ error: 'internal error' });
});

module.exports = app;
