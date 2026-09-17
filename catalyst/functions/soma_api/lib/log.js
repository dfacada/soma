// The one log. Every failure anywhere in Soma ends up as a row in `logs`, whoever noticed it: the browser
// (POST /logs), this API (the error handler and the places that catch and carry on), or a job (soma_jobs has its
// own copy of this file; keep the two the same). David reads it in Settings → Admin → Log.
//
// Rules: writing a log never throws and never blocks a response for long; nothing secret goes in. Anything that
// looks like a token, a key or ciphertext is cut out before it is stored, so a careless caller cannot leak one.

'use strict';

const LEVELS = ['error', 'warn', 'info'];
const SOURCES = ['client', 'api', 'job'];
const DETAIL_MAX = 6000;

// Long unbroken runs of base64/hex are tokens, keys, signed URLs' signatures or ciphertext. Nothing worth reading is lost.
const scrub = (text) => String(text).replace(/[A-Za-z0-9_\-+/=%]{40,}/g, '[redacted]');
const clean = (v, max) => (v === undefined || v === null || v === '' ? null : scrub(typeof v === 'string' ? v : JSON.stringify(v)).slice(0, max));
const slug = (v, max, fallback) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_').slice(0, max) : fallback);

/** entry: { level, source, area, event, message, detail, userId, status, test } */
async function writeLog(admin, entry) {
  try {
    const row = {
      created_ms: Date.now(),
      lvl: LEVELS.includes(entry.level) ? entry.level : 'error',
      source: SOURCES.includes(entry.source) ? entry.source : 'api',
      area: slug(entry.area, 40, 'app'),
      event: slug(entry.event, 80, 'failure'),
      message: clean(entry.message, 255),
      detail: clean(entry.detail, DETAIL_MAX),
      is_test: entry.test ? 'true' : 'false'
    };
    if (/^\d{1,19}$/.test(String(entry.userId || ''))) row.user_id = String(entry.userId);
    if (Number.isInteger(entry.status)) row.http_status = entry.status;
    await admin.datastore().table('logs').insertRow(row);
  } catch (e) {
    // The log of last resort is Catalyst's own function log.
    console.error(JSON.stringify({ action: 'log_write_failed', error: e.message, event: entry && entry.event }));
  }
}

module.exports = { writeLog, scrub, LEVELS, SOURCES };
