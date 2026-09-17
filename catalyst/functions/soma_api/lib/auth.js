// Identity and approval. withUser fails closed; everything after it can trust req.user.id.

'use strict';

const catalyst = require('zcatalyst-sdk-node');
const crypto = require('crypto');
const { select, needId } = require('./db');

// Approval lives in our own profiles table: Catalyst sign-up has no "pending" state.
// A user's first authenticated call creates their profile as pending; ADMIN_EMAILS start as active admins.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((e) => e.trim()).filter(Boolean);
const STATUSES = ['pending', 'active', 'disabled'];

// Development-only test identity. When TEST_KEY is set (secrets.json, never Production) a request
// carrying it runs as a fixed synthetic member that owns no real data and can never be an admin.
// It cannot name a user id, so it cannot impersonate anyone.
const TEST_KEY = process.env.TEST_KEY || '';
const TEST_USER = { id: '999000000000000001', email: 'test@soma.invalid', name: 'Test User' };
function isTestCall(req) {
  const given = req.get('x-test-key') || '';
  return TEST_KEY.length >= 32 && given.length === TEST_KEY.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(TEST_KEY));
}

const PROFILE_COLS = 'ROWID, user_id, email, display_name, role, status, CREATEDTIME';

async function findProfile(admin, userId) {
  const rows = await select(admin, 'profiles', `SELECT ${PROFILE_COLS} FROM profiles WHERE user_id = ${needId(userId, 'user id')}`);
  return rows[0] || null;
}

async function loadProfile(admin, user, startActive) {
  let row = await findProfile(admin, user.id);
  if (!row) {
    const isAdmin = ADMIN_EMAILS.includes(String(user.email || '').toLowerCase());
    try {
      row = await admin.datastore().table('profiles').insertRow({
        user_id: user.id,
        email: user.email,
        display_name: (user.name || '').slice(0, 100),
        role: isAdmin ? 'admin' : 'member',
        status: isAdmin || startActive ? 'active' : 'pending'
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

// Resolve the signed-in app user for this request.
// User scope is only for identity; data access goes through the admin-scoped app on req.admin.
async function withUser(req, res, next) {
  const test = isTestCall(req);
  try {
    if (test) {
      req.user = Object.assign({}, TEST_USER);
    } else {
      const user = await catalyst.initialize(req).userManagement().getCurrentUser();
      if (!user || !user.user_id) return res.status(401).json({ error: 'not signed in' });
      req.user = {
        id: String(user.user_id),
        email: user.email_id,
        name: [user.first_name, user.last_name].filter(Boolean).join(' ')
      };
    }
    req.admin = catalyst.initialize(req, { scope: 'admin' });
  } catch (e) {
    return res.status(401).json({ error: 'not signed in' });
  }
  try {
    req.profile = await loadProfile(req.admin, req.user, test);
    if (test) req.profile.role = 'member';
    next();
  } catch (e) {
    console.error(JSON.stringify({ action: 'load_profile', user: req.user.id, error: e.message }));
    void require('./log').writeLog(req.admin, { source: 'api', area: 'auth', event: 'profile_load_failed', message: e.message, userId: req.user.id, status: 500 });
    res.status(500).json({ error: 'internal error' });
  }
}

function requireActive(req, res, next) {
  if (req.profile.status !== 'active') return res.status(403).json({ error: 'account ' + req.profile.status, status: req.profile.status });
  next();
}
function requireAdmin(req, res, next) {
  if (req.profile.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  next();
}

// Express 4 does not route a rejected async handler to the error middleware on its own.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const member = [withUser, requireActive];
const admin = [withUser, requireActive, requireAdmin];

const isTestUser = (req) => req.user && req.user.id === TEST_USER.id;

module.exports = { isTestUser, withUser, requireActive, requireAdmin, wrap, member, admin, findProfile, STATUSES, PROFILE_COLS };
