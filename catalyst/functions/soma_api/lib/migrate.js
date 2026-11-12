// Copying one person's account between two Catalyst projects (move day, 2026-11-18: soma → Dayhub). The rules live
// here, pure, so scripts/test-migrate.mjs can hold them; routes/migrate.js does the reading and writing. Temporary:
// remove both after the move.

'use strict';

/** What is copied, table by table. Everything else stays behind: rounds and invites (the beta starts fresh ones, and
 *  a round's id is its ROWID), messages, feedback, logs, usage counts, jobs, Ops' own records, and whatever belongs to
 *  a device or to the old address (push subscriptions, Telegram pairing, Face ID passkeys). */
const TABLES = ['checkins', 'day_logs', 'weight', 'activity', 'entries', 'reviews', 'health_months', 'recipes', 'vault_meta', 'vault_tokens'];
/** Of the vault tokens, the links sealed with the person's vault. A passkey row belongs to one device and one address. */
const TOKEN_PROVIDERS = ['google-health', 'morgen', 'todoist']; // routes/health.js PROVIDER, routes/links.js PROVIDERS
/** From the profile, only what the person made. Who they are (email, role, status) is the new account's own. */
const PROFILE_FIELDS = ['display_name', 'settings_json', 'created_ms', 'closed_json'];
/** Catalyst's own columns: the target makes its own. */
const SYSTEM = new Set(['ROWID', 'CREATORID', 'CREATEDTIME', 'MODIFIEDTIME']);
/** A file travels by its place under the account's folder: a kind, then one flat name (routes/journal.js KINDS, NAME).
 *  Transcription's tx- objects are plain audio waiting for Groq and live an hour at most, so they never travel. */
const KINDS = ['entries', 'audio', 'photos', 'drafts'];
const NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$/;

const isId = (v) => /^\d{1,19}$/.test(String(v));
const plain = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);

/** "audio/e_1.enc" if it is a file to copy, else null. */
function fileName(rel) {
  if (typeof rel !== 'string') return null;
  const parts = rel.split('/');
  if (parts.length !== 2 || !KINDS.includes(parts[0]) || !NAME.test(parts[1]) || parts[1].includes('..')) return null;
  if (parts[0] === 'drafts' && parts[1].startsWith('tx-')) return null;
  return rel;
}

/** One row as the target stores it, or null when the row does not travel (a passkey). Catalyst's columns are dropped,
 *  the person's id is swapped, and a ukey that starts with the old id is rewritten. Anything that is not a plain value,
 *  or a ukey that belongs to someone else, is refused: nothing is guessed. */
function rowFor(table, row, from, to) {
  if (!TABLES.includes(table)) throw new Error('not a table that is copied: ' + table);
  if (!isId(from) || !isId(to)) throw new Error('from and to must be user ids');
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('a row must be an object');
  if (table === 'vault_tokens' && !TOKEN_PROVIDERS.includes(row.provider)) return null;
  const out = {};
  for (const k of Object.keys(row)) {
    if (SYSTEM.has(k)) continue;
    if (!plain(row[k])) throw new Error(`${table}.${k} is not a plain value`);
    out[k] = row[k];
  }
  if (out.user_id !== undefined && String(out.user_id) !== String(from)) throw new Error(`${table}: a row of another person`);
  out.user_id = String(to);
  if (out.ukey !== undefined && out.ukey !== null) {
    const key = String(out.ukey);
    if (!key.startsWith(from + ':')) throw new Error(`${table}: a ukey that is not the person's`);
    out.ukey = to + key.slice(String(from).length);
  }
  return out;
}

/** The profile fields that travel, as present in the source row. */
function profileFor(row) {
  const out = {};
  for (const k of PROFILE_FIELDS) if (row && Object.hasOwn(row, k) && row[k] !== undefined) {
    if (!plain(row[k])) throw new Error(`profiles.${k} is not a plain value`);
    out[k] = row[k];
  }
  return out;
}

module.exports = { TABLES, TOKEN_PROVIDERS, PROFILE_FIELDS, KINDS, isId, fileName, rowFor, profileFor };
