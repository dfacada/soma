// Per-person daily caps on the features that cost money every time they run: Claude (food estimates, journal
// readings, the weekly review) and Groq (transcription, reading aloud). An honest day never comes near them; they
// are there so one account, or a script holding one, cannot run up the bill for everyone.
//
// Counting is race-free without a lock. Each call first inserts its own row into ai_usage, then adds up the whole
// day, its own row included, and goes ahead only if the total is within the cap. Rows only ever accumulate, so the
// calls let through can never add up to more than the cap: the last of them to add up would have seen all of them.
// A burst of a hundred calls at once therefore lets through at most the cap's worth, never a hundred.
//
// Admins are counted but never refused (David's own use should never be stopped by a counter). A failure to count
// lets the call through and is logged: a Data Store hiccup must not take the features down with it. soma_jobs
// deletes rows older than three days.

'use strict';

const { HttpError, select, needId } = require('./db');
const { writeLog } = require('./log');
const { isTestUser } = require('./auth');

const LIMITS = {
  food: { max: 60, what: 'food estimates' },
  tone: { max: 20, what: 'journal readings' },
  review: { max: 6, what: 'weekly reviews' },
  speech: { max: 15000, what: 'reading aloud' }, // characters, not calls: the voice is priced by the character
  transcribe: { max: 40, what: 'transcriptions' }
};

const utcDay = () => new Date().toISOString().slice(0, 10);

/** Today's total for one kind (the Data Store answers SUM as a string, or null when there are no rows). */
async function used(admin, userId, kind, day) {
  const rows = await select(admin, 'ai_usage',
    `SELECT SUM(amount) FROM ai_usage WHERE user_id = ${needId(userId)} AND kind = '${kind}' AND day = '${day}'`);
  return Number((rows[0] || {})['SUM(amount)']) || 0;
}

// catalyst/test-api.js proves the refusal without paying for a single model call: the synthetic test members (and
// only they, so only in Development) may lower their own cap with x-test-cap; 0 refuses the first call of the day.
function capFor(req, kind) {
  const asked = isTestUser(req) ? req.get('x-test-cap') : undefined;
  return asked !== undefined && /^\d{1,6}$/.test(asked) ? Number(asked) : LIMITS[kind].max;
}

/**
 * Count `amount` (1 a call, or characters for speech) against the caller's cap for `kind`. Throws a 429 the person
 * can read, carrying { limit: kind }, when the day's cap is reached. Call it once the request is known to be valid,
 * right before the paid call.
 */
async function spend(req, kind, amount = 1) {
  const limit = LIMITS[kind];
  if (!limit) throw new Error('unknown usage kind ' + kind);
  const n = Math.max(1, Math.ceil(Number(amount) || 1));
  const day = utcDay();
  let total;
  try {
    await req.admin.datastore().table('ai_usage').insertRow({ user_id: req.user.id, kind, day, amount: n });
    total = await used(req.admin, req.user.id, kind, day);
  } catch (e) {
    void writeLog(req.admin, { level: 'warn', source: 'api', area: 'quota', event: 'count_failed', message: e.message, detail: { kind }, userId: req.user.id, test: isTestUser(req) });
    return;
  }
  if (total <= capFor(req, kind) || req.profile.role === 'admin') return;
  void writeLog(req.admin, { level: 'info', source: 'api', area: 'quota', event: 'cap_reached', message: 'reached the daily cap for ' + limit.what, detail: { kind, max: limit.max }, userId: req.user.id, test: isTestUser(req) });
  throw new HttpError(429, `That's the daily limit for ${limit.what}. Try again tomorrow.`, { limit: kind });
}

module.exports = { spend, LIMITS };
