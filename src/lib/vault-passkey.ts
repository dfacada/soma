// Unlock the vault with a passkey (Face ID, Touch ID, Windows Hello) through the WebAuthn PRF extension.
// A passkey evaluated with a fixed salt returns the same 32 secret bytes every time, and only after the person
// verifies on the device. Those bytes wrap the vault key (vault-crypto.ts); the server keeps the credential id and
// the wrapped key (/vault-passkeys) and can open neither. iCloud Keychain syncs the passkey, so one set-up on the
// iPhone also works on the person's Mac and iPad. Nothing here is a login: the challenge is random and nobody
// verifies the assertion, because the only thing wanted from it is the PRF output.

import { api } from "./api";
import { checkKey, unwrapVaultKey, wrapVaultKey, type VaultMeta } from "./vault-crypto";

export type StoredPasskey = { id: string; wrapped: string; createdMs: number };

/** A failure with a sentence for the person. `cancelled` is their choice (or a timeout) and is not a fault. */
export class PasskeyError extends Error {
  constructor(public code: "cancelled" | "unsupported" | "already" | "no_match" | "stale" | "failed", message: string) { super(message); }
}

// The PRF extension is newer than the DOM typings in use; these are the only parts read.
type PrfOutput = { enabled?: boolean; results?: { first?: BufferSource } };
type WithPrf = { prf?: PrfOutput };

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const toBytes = (b: BufferSource) => (b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
// Fixed on purpose: the same passkey must give the same secret on every device it syncs to.
const prfSalt = async () => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("soma-vault-prf-v1")));

/** What the person will see on the button: the name their device uses for it. */
export function passkeyName(): string {
  if (typeof navigator === "undefined") return "passkey";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "Face ID";
  if (/Macintosh/.test(ua)) return "Touch ID";
  if (/Windows/.test(ua)) return "Windows Hello";
  return "passkey";
}

/** True when this browser has a platform authenticator and does not say it lacks PRF. The set-up still checks. */
export async function passkeySupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials) return false;
  const pkc = PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> };
  if (pkc.getClientCapabilities) {
    try { if ((await pkc.getClientCapabilities())["extension:prf"] === false) return false; } catch { /* unknown: try */ }
  }
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}

export async function listPasskeys(): Promise<StoredPasskey[]> {
  return (await api<{ passkeys: StoredPasskey[] }>("GET", "/vault-passkeys")).passkeys;
}

export const forgetPasskeys = () => api<{ removed: number }>("DELETE", "/vault-passkeys");

function asPasskeyError(e: unknown): PasskeyError {
  if (e instanceof PasskeyError) return e;
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") return new PasskeyError("cancelled", "Cancelled");
  if (name === "InvalidStateError") return new PasskeyError("already", "This device already has your Soma passkey.");
  if (name === "NotSupportedError" || name === "SecurityError") return new PasskeyError("unsupported", "This browser can't unlock with a passkey.");
  return new PasskeyError("failed", "Something went wrong with the passkey. Try again.");
}

/** One Face ID prompt: evaluate the PRF on whichever of `ids` the device has, and say which one answered. */
async function evaluate(ids: string[]): Promise<{ id: string; secret: Uint8Array }> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      allowCredentials: ids.map((id) => ({ type: "public-key" as const, id: fromB64url(id) })),
      userVerification: "required",
      timeout: 60000,
      extensions: { prf: { eval: { first: await prfSalt() } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new PasskeyError("cancelled", "Cancelled");
  const first = (cred.getClientExtensionResults() as WithPrf).prf?.results?.first;
  if (!first) throw new PasskeyError("unsupported", "This passkey can't unlock the vault in this browser.");
  return { id: b64url(cred.rawId), secret: toBytes(first) };
}

/**
 * Create a passkey on this device and store the vault key wrapped by it. `existing` goes in as excludeCredentials,
 * so a device that already holds a synced Soma passkey is told so instead of getting a second one.
 * Needs a tap (the browser requires one) and the open vault's key.
 */
export async function enrolPasskey(key: CryptoKey, user: { id: string; email: string; name: string }, existing: StoredPasskey[]): Promise<StoredPasskey> {
  try {
    const salt = await prfSalt();
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: "Soma" },
        user: { id: new TextEncoder().encode(user.id), name: user.email || "Soma", displayName: user.name || user.email || "Soma" },
        challenge: random(32),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
        excludeCredentials: existing.map((p) => ({ type: "public-key" as const, id: fromB64url(p.id) })),
        timeout: 60000,
        extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new PasskeyError("cancelled", "Cancelled");
    const id = b64url(cred.rawId);
    const prf = (cred.getClientExtensionResults() as WithPrf).prf;
    if (!prf?.enabled && !prf?.results?.first) {
      // The passkey exists but cannot give a secret here. Ask the browser to hide it where it can.
      const signal = (PublicKeyCredential as unknown as { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> }).signalUnknownCredential;
      void signal?.call(PublicKeyCredential, { rpId: location.hostname, credentialId: id }).catch(() => undefined);
      throw new PasskeyError("unsupported", "This browser made the passkey but can't use it to unlock. Use your passphrase here.");
    }
    // Some browsers return the secret at creation; Safari asks once more.
    const secret = prf.results?.first ? toBytes(prf.results.first) : (await evaluate([id])).secret;
    const stored = { id, wrapped: await wrapVaultKey(key, secret), createdMs: Date.now() };
    await api("PUT", "/vault-passkeys", { id: stored.id, wrapped: stored.wrapped });
    return stored;
  } catch (e) { throw asPasskeyError(e); }
}

/** Face ID → the vault key, checked against the vault's verifier before it is handed back. */
export async function unlockWithPasskey(passkeys: StoredPasskey[], meta: VaultMeta): Promise<CryptoKey> {
  try {
    const { id, secret } = await evaluate(passkeys.map((p) => p.id));
    const row = passkeys.find((p) => p.id === id);
    if (!row) throw new PasskeyError("no_match", "That passkey isn't set up for this vault.");
    const key = await unwrapVaultKey(row.wrapped, secret).catch(() => { throw new PasskeyError("stale", "That passkey no longer opens the vault. Use your passphrase, then set it up again."); });
    if (!(await checkKey(key, meta))) throw new PasskeyError("stale", "That passkey no longer opens the vault. Use your passphrase, then set it up again.");
    return key;
  } catch (e) { throw asPasskeyError(e); }
}
