// Vault crypto, ported from Glimpse: AES-256-GCM with a key derived in the browser from the vault
// passphrase (PBKDF2-SHA256, 310,000 iterations). The passphrase and the key never leave the device;
// the server stores a salt and a small encrypted verifier so any device can check a passphrase.
//
// Everything is stored in Glimpse's compact binary form: [0x01 version][iv: 12 bytes][ciphertext + tag].
// No imports on purpose: this file runs unchanged in Node for tests (scripts/test-vault.mjs).

const VERSION = 0x01;
const ITERATIONS = 310000;
const VERIFIER = "soma-vault-v1";

/** The vault as the server describes it. `wrapSalt`/`wrappedKey` exist once a passphrase was reset with the
 *  recovery code; `recoveryKey` once a recovery code was made (see the end of this file). */
export type VaultMeta = {
  salt: string; verifierIv: string; verifierCt: string;
  wrapSalt?: string | null; wrappedKey?: string | null; recoveryKey?: string | null; recoveryMs?: number | null;
};

export const toB64 = (bytes: Uint8Array) => { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); };
export const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  // Extractable so the key can be cached in sessionStorage for the life of the tab, as Glimpse did.
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" }, raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/** Encrypt bytes → [0x01][iv 12][ciphertext]. A fresh random IV every call. */
export async function encryptBytes(key: CryptoKey, plain: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain as BufferSource));
  const out = new Uint8Array(13 + ct.length);
  out[0] = VERSION;
  out.set(iv, 1);
  out.set(ct, 13);
  return out;
}

/** Throws on a wrong key or tampered data: AES-GCM authenticates. */
export async function decryptBytes(key: CryptoKey, packed: ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
  const bytes = packed instanceof Uint8Array ? packed : new Uint8Array(packed);
  if (bytes.length < 13 + 16 || bytes[0] !== VERSION) throw new Error("not a Dayhub vault object");
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(1, 13) }, key, bytes.slice(13));
}

export const encryptJson = (key: CryptoKey, value: unknown) => encryptBytes(key, new TextEncoder().encode(JSON.stringify(value)));
export async function decryptJson<T>(key: CryptoKey, packed: ArrayBuffer | Uint8Array): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await decryptBytes(key, packed))) as T;
}

/** New vault: random salt, derived key, and the verifier the server keeps. */
export async function createVault(passphrase: string): Promise<{ key: CryptoKey; meta: VaultMeta }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const packed = await encryptBytes(key, new TextEncoder().encode(VERIFIER));
  return { key, meta: { salt: toB64(salt), verifierIv: toB64(packed.slice(1, 13)), verifierCt: toB64(packed.slice(13)) } };
}

/** True when this key opens the vault the meta describes. */
export async function checkKey(key: CryptoKey, meta: VaultMeta): Promise<boolean> {
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(meta.verifierIv) as BufferSource }, key, fromB64(meta.verifierCt) as BufferSource);
    return new TextDecoder().decode(plain) === VERIFIER;
  } catch {
    return false;
  }
}

/** Returns the key, or null when the passphrase is wrong. After a reset with the recovery code the passphrase opens
 *  the wrapped copy of the key instead (see the end of this file); the first passphrase then no longer works here. */
export async function unlockVault(passphrase: string, meta: VaultMeta): Promise<CryptoKey | null> {
  if (meta.wrapSalt && meta.wrappedKey) {
    const kek = await wrappingKey(passphrase, fromB64(meta.wrapSalt));
    try {
      const key = await importKey(toB64(new Uint8Array(await decryptBytes(kek, fromB64(meta.wrappedKey)))));
      return (await checkKey(key, meta)) ? key : null;
    } catch { return null; }
  }
  const key = await deriveKey(passphrase, fromB64(meta.salt));
  return (await checkKey(key, meta)) ? key : null;
}

export async function exportKey(key: CryptoKey) { return toB64(new Uint8Array(await crypto.subtle.exportKey("raw", key))); }
export function importKey(b64: string) { return crypto.subtle.importKey("raw", fromB64(b64) as BufferSource, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]); }

// ── Face ID unlock (vault-passkey.ts). The vault key is sealed twice on the device: first under a device key that
// cannot be exported (it lives in this browser's IndexedDB), then under a 32-byte share the server releases only for
// a valid Face ID signature. Neither half opens it alone. The passphrase stays the root: this is a second way to the
// same key, never a replacement for it.

const SHARE_INFO = "soma-vault-device-share-v1";

async function shareKey(share: Uint8Array): Promise<CryptoKey> {
  if (share.length < 32) throw new Error("share is too short");
  const base = await crypto.subtle.importKey("raw", share as BufferSource, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(SHARE_INFO) }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** A fresh device key: AES-256-GCM, not extractable, so it can be used here but never read out. */
export const newDeviceKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

/** The vault key sealed under the device key, then under the server's share. Base64. */
export async function sealForDevice(key: CryptoKey, deviceKey: CryptoKey, share: Uint8Array): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return toB64(await encryptBytes(await shareKey(share), await encryptBytes(deviceKey, raw)));
}

/** Throws when either half is not the one the key was sealed with. */
export async function openOnDevice(sealed: string, deviceKey: CryptoKey, share: Uint8Array): Promise<CryptoKey> {
  const inner = await decryptBytes(await shareKey(share), fromB64(sealed));
  const raw = await decryptBytes(deviceKey, inner);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

// ── The recovery code (2026-11-08, before Dayhub opens to people David doesn't know: a stranger who forgets their
// passphrase would otherwise lose their journal for good).
//
// The vault key comes straight from the first passphrase, and everything is encrypted with it, so a forgotten
// passphrase cannot be "reset" by making a new key without re-encrypting the whole journal. Instead:
//   - The recovery code is 20 random bytes (160 bits), shown once as 32 letters and digits. A key made from it with
//     HKDF seals a copy of the vault key, which the server keeps (vault_meta.recovery_key). The code itself is never
//     stored anywhere; Dayhub cannot show it again.
//   - Forgot the passphrase: the code opens that copy, and the person chooses a new passphrase, which seals the same
//     vault key again (wrap_salt, wrapped_key: PBKDF2 like the first). From then on unlockVault uses the new one.
// Nothing is re-encrypted, so the old passphrase still derives the key mathematically. That is fine for someone who
// forgot it; it is not a way to lock out someone who learned it, and the app never offers it as one.

/** Crockford's base32: no I, L, O or U, so the code reads aloud and copies by hand without confusion. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_BYTES = 20;
const RECOVERY_INFO = "soma-vault-recovery-v1";

/** A new code: 20 random bytes as 32 characters in eight groups of four, like 7K2M-QX4P-…. */
export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_BYTES));
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = ((value << 8) | b) & 0xfff; bits += 8;
    while (bits >= 5) { out += CROCKFORD[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out.match(/.{4}/g)!.join("-");
}

/** The code's bytes, or null when it is not a whole code. Forgiving the way Crockford intends: any case, spaces and
 *  dashes ignored, O read as 0 and I or L as 1. */
export function parseRecoveryCode(text: string): Uint8Array | null {
  const clean = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (clean.length !== (RECOVERY_BYTES * 8) / 5) return null;
  const out = new Uint8Array(RECOVERY_BYTES);
  let bits = 0, value = 0, at = 0;
  for (const ch of clean) {
    const v = CROCKFORD.indexOf(ch);
    if (v < 0) return null;
    value = ((value << 5) | v) & 0xffff; bits += 5;
    if (bits >= 8) { out[at++] = (value >>> (bits - 8)) & 0xff; bits -= 8; }
  }
  return out;
}

async function recoveryKek(code: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", code as BufferSource, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(RECOVERY_INFO) }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** The vault key sealed under a recovery code, base64, for the server to keep. */
export async function sealForRecovery(key: CryptoKey, code: string): Promise<string> {
  const bytes = parseRecoveryCode(code);
  if (!bytes) throw new Error("not a recovery code");
  return toB64(await encryptBytes(await recoveryKek(bytes), new Uint8Array(await crypto.subtle.exportKey("raw", key))));
}

/** The vault key from a recovery code, checked against the verifier; null for a wrong or mistyped code. */
export async function openWithRecovery(code: string, meta: VaultMeta): Promise<CryptoKey | null> {
  const bytes = parseRecoveryCode(code);
  if (!bytes || !meta.recoveryKey) return null;
  try {
    const raw = await decryptBytes(await recoveryKek(bytes), fromB64(meta.recoveryKey));
    const key = await importKey(toB64(new Uint8Array(raw)));
    return (await checkKey(key, meta)) ? key : null;
  } catch { return null; }
}

/** A key to seal with, from a new passphrase: PBKDF2 as for the first, but it never leaves this function's caller. */
function wrappingKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]).then((raw) =>
    crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" }, raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]));
}

/** The vault key sealed under a new passphrase, for the server to keep in place of the first passphrase. */
export async function wrapForPassphrase(key: CryptoKey, passphrase: string): Promise<{ wrapSalt: string; wrappedKey: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await wrappingKey(passphrase, salt);
  return { wrapSalt: toB64(salt), wrappedKey: toB64(await encryptBytes(kek, new Uint8Array(await crypto.subtle.exportKey("raw", key)))) };
}
