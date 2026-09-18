// Unlock the vault with Face ID (Touch ID, Windows Hello) through any passkey provider, Keeper included.
//
// Keeper, like most third-party managers, has no WebAuthn PRF, so no secret can come out of the passkey itself.
// Instead the vault key is sealed on this device twice (vault-crypto.ts `sealForDevice`): under a device key that
// cannot be exported, kept in this browser's IndexedDB, and under a share the server releases only for a valid
// passkey signature with user verification over a challenge it issued (catalyst routes/passkeys.js). The server
// never sees the sealed key; the device cannot get the share without Face ID. One passkey per device, no sync.
//
// iOS gives WebAuthn only a short window after a tap, so the challenge is fetched ahead (`prepareChallenge`) when
// the unlock sheet or the Settings row appears, and the tap goes straight to the passkey prompt.

import { api, ApiError } from "./api";
import { checkKey, newDeviceKey, openOnDevice, sealForDevice, type VaultMeta } from "./vault-crypto";

/** A failure with a sentence for the person. `cancelled` is their choice (or a timeout) and is not a fault. */
export class PasskeyError extends Error {
  constructor(public code: "cancelled" | "unsupported" | "no_uv" | "stale" | "failed", message: string) { super(message); }
}

/** What this device keeps. `userHandle` is reused on a new set-up so the manager replaces its old passkey. */
type DeviceRecord = { userId: string; credId: string; userHandle: string; sealed: string; deviceKey: CryptoKey; createdMs: number };

const DB_NAME = "soma-faceid";
const STORE = "devices";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "userId" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const r = work(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result as T);
      t.onerror = () => reject(t.error);
    });
  } finally { d.close(); }
}
const readRecord = (userId: string) => idb<DeviceRecord | undefined>("readonly", (s) => s.get(userId));
const writeRecord = (r: DeviceRecord) => idb<unknown>("readwrite", (s) => s.put(r));
const dropRecord = (userId: string) => idb<unknown>("readwrite", (s) => s.delete(userId));

const b64url = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...(buf instanceof Uint8Array ? buf : new Uint8Array(buf)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

/** What the person will see on the button: the name their device uses for it. */
export function passkeyName(): string {
  if (typeof navigator === "undefined") return "passkey";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "Face ID";
  if (/Macintosh/.test(ua)) return "Touch ID";
  if (/Windows/.test(ua)) return "Windows Hello";
  return "passkey";
}

/** True when this browser has a platform authenticator (a password manager counts) and IndexedDB. */
export async function passkeySupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials || !window.indexedDB) return false;
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}

/** Whether Face ID is set up on this device for this person. Never throws: unknown reads as no. */
export async function enrolledHere(userId: string): Promise<boolean> {
  try { return Boolean(await readRecord(userId)); } catch { return false; }
}

// ── Challenges, fetched ahead of the tap ──
type Purpose = "register" | "unlock";
const ready: Partial<Record<Purpose, Promise<{ challenge: string; expiresMs: number }>>> = {};
export function prepareChallenge(purpose: Purpose) {
  const p = api<{ challenge: string; expiresMs: number }>("POST", "/vault-passkeys/challenge", { purpose });
  ready[purpose] = p;
  p.catch(() => { if (ready[purpose] === p) delete ready[purpose]; });
}
async function takeChallenge(purpose: Purpose): Promise<string> {
  let c = await ready[purpose]?.catch(() => null);
  if (!c || c.expiresMs < Date.now() + 20000) c = await api<{ challenge: string; expiresMs: number }>("POST", "/vault-passkeys/challenge", { purpose });
  delete ready[purpose];
  prepareChallenge(purpose); // one ready for the next tap
  return c.challenge;
}

function asPasskeyError(e: unknown): PasskeyError {
  if (e instanceof PasskeyError) return e;
  if (e instanceof ApiError) {
    if (e.status === 403 && /Face ID/.test(e.message)) return new PasskeyError("no_uv", "Your password manager signed without checking Face ID. Turn on Face ID (or biometrics) in Keeper's settings, then try again.");
    if (e.status === 404) return new PasskeyError("stale", "Face ID was turned off for this device. Use your passphrase, then set it up again in Settings.");
    return new PasskeyError("failed", "Could not reach the server. Try again.");
  }
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") return new PasskeyError("cancelled", "Cancelled");
  if (name === "NotSupportedError" || name === "SecurityError" || name === "InvalidStateError") return new PasskeyError("unsupported", "This browser can't use a passkey here.");
  return new PasskeyError("failed", "Something went wrong with Face ID. Try again.");
}

/**
 * Set up Face ID on this device: a new passkey, its public key registered with the server, which answers with the
 * share; the vault key is sealed under the share and a new device key. Needs the open vault's key and a tap.
 */
export async function enrolPasskey(key: CryptoKey, user: { id: string; email: string; name: string }): Promise<void> {
  try {
    const challenge = await takeChallenge("register");
    const old = await readRecord(user.id).catch(() => undefined);
    const userHandle = old?.userHandle || b64url(crypto.getRandomValues(new Uint8Array(16)));
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: "Soma" },
        user: { id: fromB64url(userHandle), name: user.email || "Soma", displayName: `Soma vault · ${user.name || user.email}` },
        challenge: new TextEncoder().encode(challenge),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -8 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
        attestation: "none",
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new PasskeyError("cancelled", "Cancelled");
    const res = cred.response as AuthenticatorAttestationResponse;
    const spki = res.getPublicKey?.();
    if (!spki) throw new PasskeyError("unsupported", "This passkey uses a key type Soma can't check.");
    const credId = b64url(cred.rawId);
    const { share } = await api<{ share: string }>("POST", "/vault-passkeys/register", {
      challenge, id: credId, clientDataJSON: b64url(res.clientDataJSON), publicKey: b64url(spki), alg: res.getPublicKeyAlgorithm(),
    });
    const deviceKey = await newDeviceKey();
    const sealed = await sealForDevice(key, deviceKey, fromB64url(share));
    await writeRecord({ userId: user.id, credId, userHandle, sealed, deviceKey, createdMs: Date.now() });
    // The manager replaced the old passkey (same user handle); its server row can go.
    if (old && old.credId !== credId) void api("DELETE", "/vault-passkeys/" + old.credId).catch(() => undefined);
  } catch (e) { throw asPasskeyError(e); }
}

/** Face ID → the vault key, checked against the vault's verifier before it is handed back. */
export async function unlockWithPasskey(userId: string, meta: VaultMeta): Promise<CryptoKey> {
  try {
    const rec = await readRecord(userId);
    if (!rec) throw new PasskeyError("stale", "Face ID isn't set up on this device. Use your passphrase.");
    const challenge = await takeChallenge("unlock");
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: new TextEncoder().encode(challenge),
        allowCredentials: [{ type: "public-key", id: fromB64url(rec.credId) }],
        userVerification: "required",
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new PasskeyError("cancelled", "Cancelled");
    const res = cred.response as AuthenticatorAssertionResponse;
    let share: string;
    try {
      ({ share } = await api<{ share: string }>("POST", "/vault-passkeys/unlock", {
        challenge, id: b64url(cred.rawId), clientDataJSON: b64url(res.clientDataJSON), authenticatorData: b64url(res.authenticatorData), signature: b64url(res.signature),
      }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) await dropRecord(userId).catch(() => undefined);
      throw e;
    }
    const stale = new PasskeyError("stale", "Face ID no longer opens the vault. Use your passphrase, then set it up again.");
    const key = await openOnDevice(rec.sealed, rec.deviceKey, fromB64url(share)).catch(() => { throw stale; });
    if (!(await checkKey(key, meta))) throw stale;
    return key;
  } catch (e) { throw asPasskeyError(e); }
}

/** Turn Face ID off on this device: the server forgets its share, the device its sealed key. */
export async function forgetThisDevice(userId: string): Promise<void> {
  const rec = await readRecord(userId);
  if (rec) {
    await api("DELETE", "/vault-passkeys/" + rec.credId);
    await dropRecord(userId);
  }
}
