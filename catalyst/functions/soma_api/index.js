// Soma API — Zoho Catalyst Advanced I/O function (Express on the raw (req, res) handler).
// Every route resolves the caller first (lib/auth.js) and every query is scoped by user_id
// (lib/db.js); Catalyst Data Store has no row-level security, so this layer is the security boundary.
//
// Routes follow docs/HANDOFF.md §5. Keep handlers under the 30 s Advanced I/O timeout;
// anything longer becomes a job in soma_jobs.

'use strict';

const express = require('express');
const { withUser } = require('./lib/auth');

const app = express();
app.disable('x-powered-by');

// Catalyst invokes the function at .../server/soma_api/execute[/path]; Express sees '/execute/path'.
app.use((req, _res, next) => {
  if (req.url === '/execute' || req.url.startsWith('/execute/') || req.url.startsWith('/execute?')) {
    req.url = req.url.slice('/execute'.length) || '/';
  }
  next();
});

// No CORS code here on purpose. The Catalyst gateway answers preflights itself and injects the CORS headers
// for every origin in Authentication → Authorized Domains (the Slate URL and localhost:3000 for dev).
// Setting them here as well duplicates the headers, and browsers reject a duplicated Allow-Origin.

app.use(express.json({ limit: '1mb' }));

// Public. Confirms the deploy and the /execute prefix handling.
app.get('/health', (_req, res) => {
  res.json({ ok: true, fn: 'soma_api', node: process.version, at: new Date().toISOString() });
});

// The one route a pending user can call: the app shows "waiting for approval" from profile.status.
app.get('/me', withUser, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, name: req.user.name, profile: req.profile });
});

app.use(require('./routes/me'));
app.use(require('./routes/days'));
app.use(require('./routes/journal'));
app.use(require('./routes/misc'));
app.use(require('./routes/admin'));
app.use('/spike', require('./spike'));

app.use((_req, res) => res.status(404).json({ error: 'no such route' }));
app.use((err, _req, res, _next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'body is not valid JSON' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'body is too large' });
  if (err && err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(JSON.stringify({ action: 'unhandled', error: err.message, stack: err.stack }));
  res.status(500).json({ error: 'internal error' });
});

module.exports = app;
