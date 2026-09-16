// Soma API — Zoho Catalyst Advanced I/O function (Express).
// Every route resolves the caller first and scopes every query by user_id;
// Catalyst Data Store has no row-level security, so this layer is the security boundary.
//
// Spike skeleton: only /me and /sign are sketched. Grow route by route per docs/HANDOFF.md §5.
// Keep handlers under the 30 s Advanced I/O timeout; anything longer becomes a job.

'use strict';

const express = require('express');
const catalyst = require('zcatalyst-sdk-node');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Resolve the signed-in user for this request. Fails closed.
async function withUser(req, res, next) {
  try {
    const capp = catalyst.initialize(req);
    const user = await capp.userManagement().getCurrentUser();
    if (!user || !user.user_id) return res.status(401).json({ error: 'not signed in' });
    req.capp = capp;
    req.user = { id: String(user.user_id), email: user.email_id, role: user.role_details && user.role_details.role_name };
    next();
  } catch (e) {
    res.status(401).json({ error: 'not signed in' });
  }
}

app.get('/me', withUser, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, role: req.user.role || null });
});

// Batch pre-signed URLs so 20 MB audio and 200 ms draft chunks never pass through this function.
// Spike item 3 fills in the Stratus call; until then this documents the contract.
app.post('/sign', withUser, async (req, res) => {
  const { bucket, keys, method } = req.body || {};
  if (!bucket || !Array.isArray(keys) || keys.length === 0 || keys.length > 100) {
    return res.status(400).json({ error: 'bucket and 1–100 keys required' });
  }
  const prefix = req.user.id + '/';
  if (keys.some((k) => typeof k !== 'string' || !k.startsWith(prefix))) {
    return res.status(403).json({ error: 'keys must live under your own prefix' });
  }
  // TODO(spike): const stratus = req.capp.stratus(); const b = stratus.bucket(bucket);
  // const urls = await Promise.all(keys.map((k) => b.generatePreSignedUrl(k, method === 'GET' ? 'GET' : 'PUT', { expiresIn: 900 })));
  res.status(501).json({ error: 'pre-signed URLs not wired yet; see catalyst/SPIKE.md item 3', bucket, method: method || 'PUT', count: keys.length });
});

app.use((req, res) => res.status(404).json({ error: 'no such route' }));

module.exports = app;
