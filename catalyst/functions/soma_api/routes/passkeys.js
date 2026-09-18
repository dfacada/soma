// Face ID unlock for the vault, with any passkey provider (Keeper included, which has no WebAuthn PRF).
//
// Two halves open the vault key, and each side holds one:
//   - the device keeps a non-extractable AES key in IndexedDB and the vault key sealed under it and under the share;
//   - this function keeps a random 32-byte share per passkey, and hands it over only for a fresh, valid passkey
//     signature with user verification (Face ID) over a challenge it signed itself.
// So the server alone opens nothing (it never sees the sealed key), and the device alone cannot either (no share
// without Face ID). One row per passkey in vault_tokens (provider 'passkey'); a passkey belongs to one device.
//
//   GET    /vault-passkeys                 { passkeys: [{ id, createdMs, lastUsedMs }] }
//   POST   /vault-passkeys/challenge       { purpose: 'register' | 'unlock' } → { challenge }   (valid 5 minutes)
//   POST   /vault-passkeys/register        { challenge, id, clientDataJSON, publicKey, alg } → { share }
//   POST   /vault-passkeys/unlock          { challenge, id, clientDataJSON, authenticatorData, signature } → { share }
//   DELETE /vault-passkeys/:id             forget one (this device)
//   DELETE /vault-passkeys                 forget them all
// Binary fields are base64url. Nothing here is a login: the Catalyst session already says who is calling.

'use strict';

const crypto = require('crypto');
const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError, select, upsert, needId } = require('../lib/db');
const { writeLog } = require('../lib/log');

const router = express.Router();
const PROVIDER = 'passkey';
const MAX_PASSKEYS = 8;
const TTL_MS = 5 * 60 * 1000;
// The pages allowed to ask. The rp id is the origin's host, as the browser sets it when rp.id is left out.
const ORIGINS = ['https://soma-onkasary.onslate.com', 'http://localhost:3000'];
const ALGS = { '-7': 'sha256', '-257': 'sha256', '-8': null }; // ES256, RS256, Ed25519
const CRED_ID = /^[A-Za-z0-9_-]{16,512}$/;
const B64URL = /^[A-Za-z0-9_-]*$/;

const note = (req, event, message, detail) => writeLog(req.admin, { level: 'warn', source: 'api', area: 'vault', event, message, detail, userId: req.user.id, test: req.user.id === '999000000000000001' });

function secret() {
  const s = process.env.PASSKEY_SECRET;
  if (!s) throw new HttpError(503, 'Face ID unlock is not set up on the server yet');
  return s;
}
const mac = (uid, purpose, exp, nonce) => crypto.createHmac('sha256', secret()).update(`${uid}.${purpose}.${exp}.${nonce}`).digest('base64url');
const b64url = (s, what, max) => {
  if (typeof s !== 'string' || !s || s.length > (max || 4096) || !B64URL.test(s)) throw new HttpError(400, 'bad ' + what);
  return Buffer.from(s, 'base64url');
};
const rowKey = (uid, credId) => needId(uid) + ':' + PROVIDER + ':' + crypto.createHash('sha256').update(credId).digest('hex').slice(0, 40);
const mine = (req) => select(req.admin, 'vault_tokens',
  `SELECT ROWID, ciphertext, created_ms FROM vault_tokens WHERE user_id = ${needId(req.user.id)} AND provider = '${PROVIDER}' LIMIT ${MAX_PASSKEYS + 1}`);
const parse = (row) => { try { return JSON.parse(row.ciphertext); } catch (_e) { return null; } };
const needCredId = (v) => { if (typeof v !== 'string' || !CRED_ID.test(v)) throw new HttpError(400, 'id must be a base64url credential id'); return v; };

/** Checks a challenge this function issued, for this user and purpose, still in date. Returns its expiry. */
function checkChallenge(req, token, purpose) {
  const [exp, nonce, sig, extra] = String(token || '').split('.');
  const ok = exp && nonce && sig && extra === undefined && /^\d{13}$/.test(exp) && B64URL.test(nonce) && sig.length === 43 &&
    crypto.timingSafeEqual(Buffer.from(mac(req.user.id, purpose, exp, nonce)), Buffer.from(sig));
  if (!ok) throw new HttpError(400, 'challenge is not valid');
  if (Number(exp) < Date.now()) throw new HttpError(400, 'challenge expired; try again');
  return Number(exp);
}

/** clientDataJSON must be the browser's record of this exact challenge, on an allowed origin. */
function checkClientData(buf, type, token) {
  let cd;
  try { cd = JSON.parse(buf.toString('utf8')); } catch (_e) { throw new HttpError(400, 'clientDataJSON is not JSON'); }
  if (cd.type !== type) throw new HttpError(400, 'wrong ceremony type');
  if (cd.challenge !== Buffer.from(token, 'utf8').toString('base64url')) throw new HttpError(400, 'challenge does not match');
  if (!ORIGINS.includes(cd.origin)) throw new HttpError(400, 'origin is not allowed');
  return new URL(cd.origin).hostname;
}

router.get('/vault-passkeys', member, wrap(async (req, res) => {
  const passkeys = (await mine(req)).map((r) => ({ p: parse(r), r })).filter((x) => x.p && x.p.pk)
    .map(({ p, r }) => ({ id: p.id, createdMs: Number(r.created_ms), lastUsedMs: p.used || null }));
  res.json({ passkeys });
}));

router.post('/vault-passkeys/challenge', member, wrap(async (req, res) => {
  const purpose = (req.body || {}).purpose;
  if (purpose !== 'register' && purpose !== 'unlock') throw new HttpError(400, 'purpose must be register or unlock');
  const exp = String(Date.now() + TTL_MS);
  const nonce = crypto.randomBytes(18).toString('base64url');
  res.json({ challenge: `${exp}.${nonce}.${mac(req.user.id, purpose, exp, nonce)}`, expiresMs: Number(exp) });
}));

router.post('/vault-passkeys/register', member, wrap(async (req, res) => {
  const b = req.body || {};
  checkChallenge(req, b.challenge, 'register');
  const id = needCredId(b.id);
  checkClientData(b64url(b.clientDataJSON, 'clientDataJSON'), 'webauthn.create', b.challenge);
  const alg = String(b.alg);
  if (!(alg in ALGS)) throw new HttpError(400, 'unsupported key algorithm ' + alg);
  const der = b64url(b.publicKey, 'publicKey', 2048);
  try { crypto.createPublicKey({ key: der, format: 'der', type: 'spki' }); } catch (_e) { throw new HttpError(400, 'publicKey is not a SPKI key'); }

  const key = rowKey(req.user.id, id);
  const find = `SELECT ROWID FROM vault_tokens WHERE ukey = '${key}'`;
  const exists = (await select(req.admin, 'vault_tokens', find))[0];
  if (!exists && (await mine(req)).length >= MAX_PASSKEYS) throw new HttpError(409, 'too many devices; turn Face ID off on one first');
  const share = crypto.randomBytes(32).toString('base64url');
  await upsert(req.admin, 'vault_tokens', find, {
    user_id: req.user.id, provider: PROVIDER, ukey: key, created_ms: Date.now(),
    ciphertext: JSON.stringify({ id, alg: Number(alg), pk: der.toString('base64url'), share, used: 0 })
  });
  res.json({ share });
}));

router.post('/vault-passkeys/unlock', member, wrap(async (req, res) => {
  const b = req.body || {};
  const exp = checkChallenge(req, b.challenge, 'unlock');
  const id = needCredId(b.id);
  const clientData = b64url(b.clientDataJSON, 'clientDataJSON');
  const authData = b64url(b.authenticatorData, 'authenticatorData');
  const signature = b64url(b.signature, 'signature', 2048);
  const rpId = checkClientData(clientData, 'webauthn.get', b.challenge);

  const row = (await select(req.admin, 'vault_tokens', `SELECT ROWID, ciphertext FROM vault_tokens WHERE ukey = '${rowKey(req.user.id, id)}'`))[0];
  const p = row && parse(row);
  if (!p || !p.pk) throw new HttpError(404, 'this passkey is not set up; set up Face ID again');

  if (authData.length < 37) throw new HttpError(400, 'authenticatorData is too short');
  if (!authData.subarray(0, 32).equals(crypto.createHash('sha256').update(rpId).digest())) throw new HttpError(400, 'wrong relying party');
  const flags = authData[32];
  // User present and user verified: the passkey provider checked Face ID (or its PIN), not just a tap.
  if (!(flags & 0x01) || !(flags & 0x04)) {
    await note(req, 'passkey_no_uv', 'the passkey signed without user verification', { flags });
    throw new HttpError(403, 'the passkey did not check Face ID');
  }
  const signed = Buffer.concat([authData, crypto.createHash('sha256').update(clientData).digest()]);
  const pub = crypto.createPublicKey({ key: Buffer.from(p.pk, 'base64url'), format: 'der', type: 'spki' });
  let valid = false;
  try { valid = crypto.verify(ALGS[String(p.alg)], signed, pub, signature); } catch (_e) { valid = false; }
  if (!valid) {
    await note(req, 'passkey_bad_signature', 'a passkey signature did not verify', { alg: p.alg });
    throw new HttpError(403, 'the passkey signature did not verify');
  }
  // Each challenge opens once: challenges expire in order, so one at or before the last used is a replay.
  if (exp <= (p.used || 0)) throw new HttpError(400, 'challenge already used; try again');
  await req.admin.datastore().table('vault_tokens').updateRow({ ROWID: row.ROWID, ciphertext: JSON.stringify(Object.assign({}, p, { used: exp })) });
  res.json({ share: p.share });
}));

router.delete('/vault-passkeys/:id', member, wrap(async (req, res) => {
  const rows = await select(req.admin, 'vault_tokens', `SELECT ROWID FROM vault_tokens WHERE ukey = '${rowKey(req.user.id, needCredId(req.params.id))}'`);
  for (const r of rows) await req.admin.datastore().table('vault_tokens').deleteRow(r.ROWID);
  res.json({ removed: rows.length });
}));

router.delete('/vault-passkeys', member, wrap(async (req, res) => {
  const rows = await mine(req);
  for (const r of rows) await req.admin.datastore().table('vault_tokens').deleteRow(r.ROWID);
  res.json({ removed: rows.length });
}));

module.exports = router;
