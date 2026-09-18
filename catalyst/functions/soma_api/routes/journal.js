// Journal: vault metadata, entry metadata and pre-signed Stratus URLs.
// The server never sees plaintext: entries, audio and photos are AES-256-GCM objects in Stratus
// (`<user_id>/<entry_id>.enc`), encrypted in the browser. These rows are the index, nothing more.

'use strict';

const crypto = require('crypto');
const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError, select, upsert, needId, needToken, fitText, bool } = require('../lib/db');

// One bucket, one key layout: <user_id>/<kind>/<name>. Bucket CORS is console-only and per bucket, so a single
// bucket means one allow-list per origin instead of four. (The bucket's name predates this; it holds every kind.)
const BUCKET = 'soma-drafts';
const KINDS = ['entries', 'audio', 'photos', 'drafts'];
const ENTRY_KINDS = ['entries', 'audio', 'photos'];
const NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$/;
const LEGACY_BUCKETS = ['soma-entries', 'soma-audio', 'soma-photos', 'soma-drafts']; // spike page only
const SIGN_EXPIRY_S = 900;
const TRANSCRIPT = ['none', 'pending', 'done', 'failed'];
const B64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

const router = express.Router();

// ── Vault metadata: salt + verifier so any device can derive and check the key ──
const VAULT_COLS = 'ROWID, salt, verifier_iv, verifier_ct, MODIFIEDTIME';
router.get('/vault-meta', member, wrap(async (req, res) => {
  const rows = await select(req.admin, 'vault_meta', `SELECT ${VAULT_COLS} FROM vault_meta WHERE user_id = ${needId(req.user.id)}`);
  // Not having a vault yet is a normal state for a new user, not an error: answer 200 so it never shows as one.
  if (!rows[0]) return res.json({ exists: false });
  res.json({ exists: true, salt: rows[0].salt, verifierIv: rows[0].verifier_iv, verifierCt: rows[0].verifier_ct, updatedAt: rows[0].MODIFIEDTIME });
}));
// Creating is free; overwriting orphans every existing entry unless the client re-encrypted them,
// so it has to be asked for explicitly with { replace: true } (the change-passphrase flow).
router.put('/vault-meta', member, wrap(async (req, res) => {
  const b = req.body || {};
  const values = {
    user_id: req.user.id,
    salt: fitText('salt', b.salt, 64),
    verifier_iv: fitText('verifierIv', b.verifierIv, 32),
    verifier_ct: fitText('verifierCt', b.verifierCt, 255)
  };
  for (const k of ['salt', 'verifier_iv', 'verifier_ct']) {
    if (!values[k] || !B64.test(values[k])) throw new HttpError(400, k + ' must be base64');
  }
  const find = `SELECT ROWID FROM vault_meta WHERE user_id = ${needId(req.user.id)}`;
  const existing = (await select(req.admin, 'vault_meta', find))[0];
  if (existing && b.replace !== true) throw new HttpError(409, 'vault already exists');
  await upsert(req.admin, 'vault_meta', find, values);
  res.json({ ok: true, replaced: Boolean(existing) });
}));

// ── Passkey unlock (Face ID, Touch ID): the vault key wrapped by a key only one passkey can produce (WebAuthn PRF).
// Stored in vault_tokens (provider 'passkey', one row per passkey). The credential id and the wrapped bytes open
// nothing without the passkey itself, which never leaves the person's devices.
//   GET    /vault-passkeys    { passkeys: [{ id, wrapped, createdMs }] }
//   PUT    /vault-passkeys    { id, wrapped }
//   DELETE /vault-passkeys    forgets them all (the passkeys stay in the person's keychain, unused)
const PASSKEY = 'passkey';
const MAX_PASSKEYS = 8;
const CRED_ID = /^[A-Za-z0-9_-]{16,512}$/;
const passkeyUkey = (userId, credId) => needId(userId) + ':' + PASSKEY + ':' + crypto.createHash('sha256').update(credId).digest('hex').slice(0, 40);
const myPasskeys = (req) => select(req.admin, 'vault_tokens',
  `SELECT ROWID, ciphertext, created_ms FROM vault_tokens WHERE user_id = ${needId(req.user.id)} AND provider = '${PASSKEY}' LIMIT ${MAX_PASSKEYS + 1}`);

router.get('/vault-passkeys', member, wrap(async (req, res) => {
  const rows = await myPasskeys(req);
  const passkeys = [];
  for (const r of rows) {
    try { const p = JSON.parse(r.ciphertext); passkeys.push({ id: p.id, wrapped: p.wrapped, createdMs: Number(r.created_ms) }); }
    catch (_e) { /* a row this code did not write */ }
  }
  res.json({ passkeys });
}));

router.put('/vault-passkeys', member, wrap(async (req, res) => {
  const b = req.body || {};
  if (typeof b.id !== 'string' || !CRED_ID.test(b.id)) throw new HttpError(400, 'id must be a base64url credential id');
  if (typeof b.wrapped !== 'string' || b.wrapped.length > 200 || !B64.test(b.wrapped)) throw new HttpError(400, 'wrapped must be base64');
  const key = passkeyUkey(req.user.id, b.id);
  const find = `SELECT ROWID FROM vault_tokens WHERE ukey = '${key}'`;
  const exists = (await select(req.admin, 'vault_tokens', find))[0];
  if (!exists && (await myPasskeys(req)).length >= MAX_PASSKEYS) throw new HttpError(409, 'too many passkeys; turn passkey unlock off and on again');
  await upsert(req.admin, 'vault_tokens', find, { user_id: req.user.id, provider: PASSKEY, ukey: key, ciphertext: JSON.stringify({ id: b.id, wrapped: b.wrapped }), created_ms: Date.now() });
  res.json({ ok: true });
}));

router.delete('/vault-passkeys', member, wrap(async (req, res) => {
  const rows = await myPasskeys(req);
  for (const r of rows) await req.admin.datastore().table('vault_tokens').deleteRow(r.ROWID);
  res.json({ removed: rows.length });
}));

// ── Entry metadata ──
const ENTRY_COLS = 'ROWID, user_id, entry_id, created_ms, has_audio, audio_size, audio_mime, has_photo, photo_size, photo_mime, transcript_status';
const shapeEntry = (r) => ({
  id: r.entry_id, createdMs: Number(r.created_ms),
  hasAudio: bool(r.has_audio), audioSize: r.audio_size ? Number(r.audio_size) : 0, audioMime: r.audio_mime || null,
  hasPhoto: bool(r.has_photo), photoSize: r.photo_size ? Number(r.photo_size) : 0, photoMime: r.photo_mime || null,
  transcriptStatus: r.transcript_status || 'none'
});
function size(name, v) {
  if (v === undefined || v === null) return 0;
  if (!Number.isInteger(v) || v < 0 || v > 200 * 1024 * 1024) throw new HttpError(400, name + ' must be a byte count');
  return v;
}

// Newest first, 100 a page. Page with ?before=<createdMs of the last row>.
router.get('/entries', member, wrap(async (req, res) => {
  const before = req.query.before === undefined ? '' : ` AND created_ms < ${needId(req.query.before, 'before')}`;
  const rows = await select(req.admin, 'entries',
    `SELECT ${ENTRY_COLS} FROM entries WHERE user_id = ${needId(req.user.id)}${before} ORDER BY created_ms DESC LIMIT 100`);
  res.json({ entries: rows.map(shapeEntry), more: rows.length === 100 });
}));

router.put('/entries/:id', member, wrap(async (req, res) => {
  const id = needToken(req.params.id, 'entry id');
  const b = req.body || {};
  const find = `SELECT ${ENTRY_COLS} FROM entries WHERE entry_id = '${id}'`;
  const existing = (await select(req.admin, 'entries', find))[0];
  // entry_id is unique across users, so an id that exists under someone else is simply unavailable.
  if (existing && String(existing.user_id) !== req.user.id) throw new HttpError(409, 'entry id is taken');
  if (!existing && !Number.isInteger(b.createdMs)) throw new HttpError(400, 'createdMs is required for a new entry');
  if (b.transcriptStatus !== undefined && !TRANSCRIPT.includes(b.transcriptStatus)) throw new HttpError(400, 'unknown transcriptStatus');

  const values = { user_id: req.user.id, entry_id: id };
  if (Number.isInteger(b.createdMs)) values.created_ms = needId(b.createdMs, 'createdMs');
  if (b.hasAudio !== undefined) values.has_audio = b.hasAudio ? 'true' : 'false';
  if (b.audioSize !== undefined) values.audio_size = size('audioSize', b.audioSize);
  if (b.audioMime !== undefined) values.audio_mime = fitText('audioMime', b.audioMime, 60);
  if (b.hasPhoto !== undefined) values.has_photo = b.hasPhoto ? 'true' : 'false';
  if (b.photoSize !== undefined) values.photo_size = size('photoSize', b.photoSize);
  if (b.photoMime !== undefined) values.photo_mime = fitText('photoMime', b.photoMime, 60);
  if (b.transcriptStatus !== undefined) values.transcript_status = b.transcriptStatus;

  await upsert(req.admin, 'entries', find, values);
  res.json(shapeEntry((await select(req.admin, 'entries', find))[0]));
}));

// Deletes the index row and the three ciphertext objects. A missing object is not an error.
router.delete('/entries/:id', member, wrap(async (req, res) => {
  const id = needToken(req.params.id, 'entry id');
  const rows = await select(req.admin, 'entries',
    `SELECT ROWID FROM entries WHERE entry_id = '${id}' AND user_id = ${needId(req.user.id)}`);
  if (!rows[0]) throw new HttpError(404, 'not found');
  const bucket = req.admin.stratus().bucket(BUCKET);
  const objects = await Promise.all(ENTRY_KINDS.map((kind) =>
    bucket.deleteObject(`${req.user.id}/${kind}/${id}.enc`).then(() => kind, () => null)));
  await req.admin.datastore().table('entries').deleteRow(rows[0].ROWID);
  res.json({ deleted: true, objects: objects.filter(Boolean) });
}));

// ── Batch pre-signed URLs so audio and draft chunks never pass through this function ──
//   { kind: 'audio', names: ['e_123.enc'], method: 'PUT' | 'GET' }  →  <user_id>/audio/e_123.enc
// The caller never supplies a path, only a kind and flat file names, so it cannot reach outside its own prefix.
router.post('/sign', member, wrap(async (req, res) => {
  const b = req.body || {};
  const action = b.method === 'GET' ? 'GET' : 'PUT';
  let bucketName = BUCKET;
  let keys;
  if (b.kind !== undefined) {
    if (!KINDS.includes(b.kind)) throw new HttpError(400, 'unknown kind');
    if (!Array.isArray(b.names) || b.names.length === 0 || b.names.length > 100) throw new HttpError(400, '1–100 names required');
    if (b.names.some((n) => typeof n !== 'string' || !NAME.test(n) || n.includes('..'))) throw new HttpError(400, 'bad name');
    keys = b.names.map((n) => `${req.user.id}/${b.kind}/${n}`);
  } else {
    // Legacy form used by public/spike.html; goes away with the spike cleanup.
    if (!LEGACY_BUCKETS.includes(b.bucket)) throw new HttpError(400, 'unknown bucket');
    if (!Array.isArray(b.keys) || b.keys.length === 0 || b.keys.length > 100) throw new HttpError(400, '1–100 keys required');
    const prefix = req.user.id + '/';
    if (b.keys.some((k) => typeof k !== 'string' || k.length > 200 || !k.startsWith(prefix) || k.includes('..'))) {
      throw new HttpError(403, 'keys must live under your own prefix');
    }
    bucketName = b.bucket;
    keys = b.keys;
  }
  const bucket = req.admin.stratus().bucket(bucketName);
  const urls = await Promise.all(keys.map(async (k, i) => {
    const r = await bucket.generatePreSignedUrl(k, action, { expiryIn: SIGN_EXPIRY_S });
    return { name: b.names ? b.names[i] : undefined, key: k, url: r.signature };
  }));
  res.json({ method: action, expiresIn: SIGN_EXPIRY_S, urls });
}));

module.exports = router;
