// Vault crypto checks, plus one end-to-end pass through the real Development API and Stratus:
// passphrase → key → encrypt → signed PUT → signed GET → decrypt. Runs the app's own src/lib/vault-crypto.ts.
//
//   node scripts/test-vault.mjs

import fs from "node:fs";
import { createVault, unlockVault, encryptBytes, decryptBytes, encryptJson, decryptJson, exportKey, importKey } from "../src/lib/vault-crypto.ts";

const BASE = "https://soma-939530195.development.catalystserverless.com/server/soma_api/execute";
const KEY = JSON.parse(fs.readFileSync(new URL("../catalyst/secrets.json", import.meta.url), "utf8")).soma_api.TEST_KEY;
let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };
const call = async (method, route, body) => {
  const res = await fetch(BASE + route, { method, headers: { "x-test-key": KEY, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

console.log("crypto");
const { key, meta } = await createVault("correct horse battery staple");
check("meta fits the vault_meta columns", meta.salt.length <= 64 && meta.verifierIv.length <= 32 && meta.verifierCt.length <= 255, meta);
check("right passphrase unlocks", (await unlockVault("correct horse battery staple", meta)) !== null);
check("wrong passphrase returns null", (await unlockVault("correct horse battery stapl", meta)) === null);

const entry = { id: "e_1", transcript: "Walk before noon. 🧘 Café. 読書.", mood: "Focused", createdAt: new Date().toISOString() };
const packed = await encryptJson(key, entry);
check("binary format: [0x01][iv 12][ct + 16 tag]", packed[0] === 1 && packed.length === 13 + new TextEncoder().encode(JSON.stringify(entry)).length + 16);
check("json round-trips, unicode intact", JSON.stringify(await decryptJson(key, packed)) === JSON.stringify(entry));
check("a fresh IV every time", !sameBytes((await encryptJson(key, entry)).slice(1, 13), packed.slice(1, 13)));
const tampered = packed.slice(); tampered[tampered.length - 1] ^= 1;
check("tampered ciphertext is rejected", await decryptBytes(key, tampered).then(() => false, () => true));
const other = (await createVault("someone else")).key;
check("another key cannot decrypt", await decryptBytes(other, packed).then(() => false, () => true));
check("plaintext does not appear in the ciphertext", !Buffer.from(packed).toString("latin1").includes("Walk"));
const again = await importKey(await exportKey(key));
check("session-cached key still decrypts", JSON.stringify(await decryptJson(again, packed)) === JSON.stringify(entry));

console.log("end to end: API + Stratus");
let r = await call("PUT", "/vault-meta", { ...meta, replace: true });
check("vault meta saves", r.status === 200, r.json);
r = await call("GET", "/vault-meta");
const fresh = await unlockVault("correct horse battery staple", r.json);
check("a second device unlocks from the server's meta", fresh !== null);

const audio = crypto.getRandomValues(new Uint8Array(65536)); // stand-in for a recording
const big = new Uint8Array(1024 * 1024); for (let i = 0; i < big.length; i += 65536) big.set(audio, i);
const enc = await encryptBytes(key, big);
r = await call("POST", "/sign", { kind: "audio", method: "PUT", names: ["vault-test-0001.enc"] });
const put = await fetch(r.json.urls[0].url, { method: "PUT", body: enc, headers: { "Content-Type": "application/octet-stream" } });
check("encrypted 1 MB uploads to Stratus", put.status === 200, put.status);
r = await call("POST", "/sign", { kind: "audio", method: "GET", names: ["vault-test-0001.enc"] });
const down = new Uint8Array(await (await fetch(r.json.urls[0].url)).arrayBuffer());
check("what Stratus holds is ciphertext", sameBytes(down, enc) && !sameBytes(down.slice(13, 13 + 64), big.slice(0, 64)));
check("the other device decrypts it byte for byte", sameBytes(new Uint8Array(await decryptBytes(fresh, down)), big));

// cleanup: an entry row is what owns the object, so create one and delete it
await call("PUT", "/entries/vault-test-0001", { createdMs: 981158400000, hasAudio: true });
r = await call("DELETE", "/entries/vault-test-0001");
check("cleanup removed the object", r.status === 200 && r.json.objects.includes("audio"), r.json);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
