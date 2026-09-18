// Vault crypto, ported from Glimpse: AES-256-GCM with a key derived in the browser from the vault
// passphrase (PBKDF2-SHA256, 310,000 iterations). The passphrase and the key never leave the device;
// the server stores a salt and a small encrypted verifier so any device can check a passphrase.
//
// Everything is stored in Glimpse's compact binary form: [0x01 version][iv: 12 bytes][ciphertext + tag].
// No imports on purpose: this file runs unchanged in Node for tests (scripts/test-vault.mjs).

const VERSION = 0x01;
const ITERATIONS = 310000;
const VERIFIER = "soma-vault-v1";

export type VaultMeta = { salt: string; verifierIv: string; verifierCt: string };

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
  if (bytes.length < 13 + 16 || bytes[0] !== VERSION) throw new Error("not a Soma vault object");
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

/** Returns the key, or null when the passphrase is wrong. */
export async function unlockVault(passphrase: string, meta: VaultMeta): Promise<CryptoKey | null> {
  const key = await deriveKey(passphrase, fromB64(meta.salt));
  return (await checkKey(key, meta)) ? key : null;
}

export async function exportKey(key: CryptoKey) { return toB64(new Uint8Array(await crypto.subtle.exportKey("raw", key))); }
export function importKey(b64: string) { return crypto.subtle.importKey("raw", fromB64(b64) as BufferSource, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]); }

// ── Passkey unlock. A passkey's PRF output (32 secret bytes, released only after Face ID or Touch ID) is stretched
// with HKDF into a wrapping key, and the vault key is stored encrypted under it, in the same [0x01][iv][ct] form.
// The passphrase stays the root: this is a second way to reach the same key, never a replacement for it.

const WRAP_INFO = "soma-vault-passkey-wrap-v1";

async function wrappingKey(secret: Uint8Array): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("passkey secret is too short");
  const base = await crypto.subtle.importKey("raw", secret as BufferSource, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(WRAP_INFO) }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** The vault key encrypted under a passkey's PRF secret, as base64 (84 chars). */
export async function wrapVaultKey(key: CryptoKey, secret: Uint8Array): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return toB64(await encryptBytes(await wrappingKey(secret), raw));
}

/** Throws when the secret is not the one the key was wrapped with. */
export async function unwrapVaultKey(wrapped: string, secret: Uint8Array): Promise<CryptoKey> {
  const raw = await decryptBytes(await wrappingKey(secret), fromB64(wrapped));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
