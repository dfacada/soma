// Identity and approval. withUser fails closed; everything after it can trust req.user.id.

'use strict';

const catalyst = require('zcatalyst-sdk-node');
const crypto = require('crypto');
const { select, needId } = require('./db');
const invites = require('./invites');

// Approval lives in our own profiles table: Catalyst sign-up has no "pending" state.
// A user's first authenticated call creates their profile as pending; ADMIN_EMAILS start as active admins, and
// someone whose first call carries a usable invite code (?invite=, lib/invites.js) starts active, let in by it.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((e) => e.trim()).filter(Boolean);
// 'deleting' is set by DELETE /account while soma_jobs removes everything; every member route refuses it.
const STATUSES = ['pending', 'active', 'disabled', 'deleting'];

// Development-only test identities. When TEST_KEY is set (secrets.json) a request carrying it runs as one of three
// fixed synthetic members that own no real data and can never be admins: the first by default, the second with
// `x-test-member: 2` (catalyst/test-api.js uses it to prove one member cannot reach another's rows), and a third,
// `x-test-member: 3`, that the tests fill with data and then delete, account and all. A fourth, `x-test-member: 4`,
// starts out pending like a real sign-up, so the tests can let it in with an invite. The key cannot
// name a user id, so it cannot impersonate anyone. It only works where the gateway says the environment is
// Development (x-zc-environment, the header the SDK itself reads), so a TEST_KEY deployed to Production by mistake
// opens nothing.
const TEST_KEY = process.env.TEST_KEY || '';
const TEST_USERS = {
  1: { id: '999000000000000001', email: 'test@soma.invalid', name: 'Test User' },
  2: { id: '999000000000000002', email: 'test2@soma.invalid', name: 'Test User Two' },
  3: { id: '999000000000000003', email: 'test3@soma.invalid', name: 'Test User Three' },
  4: { id: '999000000000000004', email: 'test4@soma.invalid', name: 'Test User Four', pending: true }
};
const TEST_IDS = new Set(Object.values(TEST_USERS).map((u) => u.id));
function isTestCall(req) {
  const given = req.get('x-test-key') || '';
  const keyOk = TEST_KEY.length >= 32 && given.length === TEST_KEY.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(TEST_KEY));
  return keyOk && String(req.get('x-zc-environment') || '').toLowerCase() === 'development';
}

const PROFILE_COLS = 'ROWID, user_id, email, display_name, role, status, last_seen_ms, invited_by, last_device, CREATEDTIME';

// "Last seen" is the last authenticated call, which is what an admin actually wants: sessions last for weeks, so a
// real sign-in almost never happens. Written at most once an hour per user, because Data Store bills every update
// and one per request would be thousands a day. It never blocks or fails a request.
const SEEN_EVERY_MS = 60 * 60 * 1000;
function touchSeen(admin, row) {
  const now = Date.now();
  if (Number(row.last_seen_ms || 0) > now - SEEN_EVERY_MS) return;
  void admin.datastore().table('profiles').updateRow({ ROWID: row.ROWID, last_seen_ms: now })
    .catch((e) => console.error(JSON.stringify({ action: 'touch_seen', user: String(row.user_id), error: e.message })));
}

async function findProfile(admin, userId) {
  const rows = await select(admin, 'profiles', `SELECT ${PROFILE_COLS} FROM profiles WHERE user_id = ${needId(userId, 'user id')}`);
  return rows[0] || null;
}

// A new sign-up waits for approval, and nothing else tells the admin it is there. Every active admin with a paired
// Telegram chat (routes/telegram.js) gets one line. No name and no email: a person who has only just signed up has
// not agreed to Telegram, so nothing about them goes there. Best effort; it never holds up the request.
const WAITING = 'Someone new signed up for Soma and is waiting for you. Approve them in Settings → Admin.';
const INVITED = 'Someone new joined Soma with an invite link. They are in already; see them in Settings → Admin.';
async function tellAdmins(admin, text = WAITING) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const rows = await select(admin, 'profiles', "SELECT telegram_chat FROM profiles WHERE role = 'admin' AND status = 'active' LIMIT 20");
    const chats = rows.map((r) => r.telegram_chat).filter(Boolean).map(String);
    await Promise.all(chats.map(async (chat) => {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text }),
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) throw new Error('Telegram answered ' + res.status);
    }));
  } catch (e) {
    void require('./log').writeLog(admin, { level: 'warn', source: 'api', area: 'auth', event: 'tell_admins_failed', message: e.message });
  }
}

async function loadProfile(admin, user, startActive, seen, inviteCode) {
  let row = await findProfile(admin, user.id);
  if (!row) {
    const isAdmin = ADMIN_EMAILS.includes(String(user.email || '').toLowerCase());
    // Arriving through an invite link: the code lets this person in at once, if it still can.
    let invite = null;
    if (!isAdmin && !startActive && inviteCode) {
      const inv = await invites.findInvite(admin, inviteCode).catch(() => null);
      if (inv && !(await invites.whyNot(admin, inv).catch(() => 'unreadable'))) invite = inv;
    }
    try {
      row = await admin.datastore().table('profiles').insertRow({
        user_id: user.id,
        email: user.email,
        display_name: (user.name || '').slice(0, 100),
        role: isAdmin ? 'admin' : 'member',
        status: isAdmin || startActive || invite ? 'active' : 'pending',
        invited_by: invite ? String(invite.created_by) : null,
        last_seen_ms: Date.now(),
        created_ms: Date.now()
      });
      console.log(JSON.stringify({ action: 'profile_created', user: user.id, status: row.status, invited: Boolean(invite) }));
      if (invite) {
        await invites.countUse(admin, invite).catch(() => undefined);
        void tellAdmins(admin, INVITED);
      } else if (row.status === 'pending') void tellAdmins(admin);
    } catch (e) {
      // user_id is unique: a concurrent first request won the insert.
      row = await findProfile(admin, user.id);
      if (!row) throw e;
    }
  }
  else if (seen) touchSeen(admin, row);
  return { rowId: String(row.ROWID), displayName: row.display_name || '', role: row.role, status: row.status, lastSeenMs: Number(row.last_seen_ms || 0) || null, invitedBy: row.invited_by ? String(row.invited_by) : null, device: row.last_device || null };
}

// Resolve the signed-in app user for this request.
// User scope is only for identity; data access goes through the admin-scoped app on req.admin.
async function withUser(req, res, next) {
  const test = isTestCall(req);
  try {
    if (test) {
      const which = TEST_USERS[String(req.get('x-test-member') || '1')];
      if (!which) return res.status(401).json({ error: 'not signed in' });
      req.user = { id: which.id, email: which.email, name: which.name };
      req.testPending = Boolean(which.pending);
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
    // The synthetic test identity is not a person: it never moves anyone's last seen.
    req.profile = await loadProfile(req.admin, req.user, test && !req.testPending, !test, invites.cleanCode(req.query && req.query.invite));
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

const isTestId = (id) => TEST_IDS.has(String(id));
const isTestUser = (req) => Boolean(req.user && isTestId(req.user.id));

module.exports = { isTestId, isTestUser, withUser, requireActive, requireAdmin, wrap, member, admin, findProfile, tellAdmins, STATUSES, PROFILE_COLS, SEEN_EVERY_MS };
