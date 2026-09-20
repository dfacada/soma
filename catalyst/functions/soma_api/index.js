// Soma API — Zoho Catalyst Advanced I/O function (Express on the raw (req, res) handler).
// Every route resolves the caller first (lib/auth.js) and every query is scoped by user_id
// (lib/db.js); Catalyst Data Store has no row-level security, so this layer is the security boundary.
//
// Routes follow docs/HANDOFF.md §5. Keep handlers under the 30 s Advanced I/O timeout;
// anything longer becomes a job in soma_jobs.

'use strict';

const express = require('express');
const { withUser } = require('./lib/auth');
const catalyst = require('zcatalyst-sdk-node');
const { HttpError } = require('./lib/db');
const { writeLog } = require('./lib/log');

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
app.use(require('./routes/passkeys'));
app.use(require('./routes/food'));
app.use(require('./routes/misc'));
app.use(require('./routes/rounds'));
app.use(require('./routes/jobs'));
app.use(require('./routes/health'));
app.use(require('./routes/push'));
app.use(require('./routes/logs'));
app.use(require('./routes/admin'));
app.use('/spike', require('./spike'));

app.use((_req, res) => res.status(404).json({ error: 'no such route' }));
// Anything that ends as a 5xx goes into the log: a crash (500) and the 502/503s this API raises on purpose when
// Google, Groq or the job queue lets it down. 4xx are the caller's mistakes and are reported by the browser.
function logFailure(req, err, status) {
  let admin = req.admin;
  try { admin = admin || catalyst.initialize(req, { scope: 'admin' }); } catch (_e) { return; }
  const area = (req.path.split('/')[1] || 'api').replace(/[^a-z0-9-]/gi, '');
  void writeLog(admin, {
    level: 'error', source: 'api', area, event: status === 500 ? 'crash' : 'http_' + status, status,
    message: err.message, detail: { method: req.method, path: req.path, stack: status === 500 ? String(err.stack || '').split('\n').slice(0, 8).join('\n') : undefined },
    userId: req.user && req.user.id, test: Boolean(req.user && req.user.id === '999000000000000001')
  });
}

app.use((err, req, res, _next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'body is not valid JSON' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'body is too large' });
  // An HttpError is a message written for the caller, whatever its status (502 and 503 included).
  if (err instanceof HttpError || (err && err.status && err.status < 500)) {
    if (err.status >= 500) logFailure(req, err, err.status);
    return res.status(err.status).json({ error: err.message });
  }
  logFailure(req, err, 500);
  console.error(JSON.stringify({ action: 'unhandled', error: err.message, stack: err.stack }));
  res.status(500).json({ error: 'internal error' });
});

module.exports = app;
