// The vault recovery code (src/lib/vault-crypto.ts, "The recovery code"): making one, typing it back, and choosing a
// new passphrase with it. Runs the app's own file in Node; offline.
//
//   node scripts/test-recovery.mjs

import { createVault, unlockVault, encryptJson, decryptJson, checkKey, newRecoveryCode, parseRecoveryCode, sealForRecovery, openWithRecovery, wrapForPassphrase } from "../src/lib/vault-crypto.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

console.log("the code");
const code = newRecoveryCode();
check("eight groups of four", /^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/.test(code), code);
check("no I, L, O or U in it", !/[ILOU]/.test(code), code);
check("a new one every time", newRecoveryCode() !== code);
const bytes = parseRecoveryCode(code);
check("reads back as 20 bytes", bytes && bytes.length === 20);
check("lower case, spaces and no dashes read the same", sameBytes(parseRecoveryCode(code.toLowerCase().replace(/-/g, " ")), bytes));
const zeros = "0000-0000-0000-0000-0000-0000-0000-0000";
check("O is read as 0, I and L as 1", sameBytes(parseRecoveryCode(zeros.replace(/0/g, "O")), parseRecoveryCode(zeros)) && sameBytes(parseRecoveryCode(zeros.replace(/0/g, "1")), parseRecoveryCode(zeros.replace(/0/g, "I"))) && sameBytes(parseRecoveryCode(zeros.replace(/0/g, "L")), parseRecoveryCode(zeros.replace(/0/g, "1"))));
check("one character short is not a code", parseRecoveryCode(code.slice(0, -1)) === null);
check("a character outside the alphabet is not a code", parseRecoveryCode(code.slice(0, -1) + "U") === null);
check("all ones decode to all 0xff", parseRecoveryCode("Z".repeat(32)).every((b) => b === 255));

console.log("opening the vault with it");
const first = "a first passphrase for the test";
const { key, meta } = await createVault(first);
const entry = { transcript: "Walk before noon. Café." };
const packed = await encryptJson(key, entry);
const recoveryKey = await sealForRecovery(key, code);
check("the sealed copy fits the column", recoveryKey.length <= 120, recoveryKey.length);
const withCode = { ...meta, recoveryKey };
const opened = await openWithRecovery(code, withCode);
check("the code opens the vault", opened !== null && (await checkKey(opened, meta)));
check("…and what was written before reads back", opened && JSON.stringify(await decryptJson(opened, packed)) === JSON.stringify(entry));
check("typed loosely, it still opens", (await openWithRecovery(code.toLowerCase().replace(/-/g, "  "), withCode)) !== null);
const other = newRecoveryCode();
check("another code does not", (await openWithRecovery(other, withCode)) === null);
const typo = code.slice(0, 5) + (code[5] === "A" ? "B" : "A") + code.slice(6);
check("one wrong character does not", (await openWithRecovery(typo, withCode)) === null);
check("no code made yet: nothing opens", (await openWithRecovery(code, meta)) === null);
const otherVault = await createVault("someone else entirely");
check("a copy sealed for another vault fails its verifier", (await openWithRecovery(code, { ...otherVault.meta, recoveryKey })) === null);

console.log("a new passphrase");
const fresh = "the new passphrase after forgetting";
const wrap = await wrapForPassphrase(opened, fresh);
check("the seal fits the columns", wrap.wrapSalt.length <= 64 && wrap.wrappedKey.length <= 120, wrap);
const after = { ...withCode, ...wrap };
const k2 = await unlockVault(fresh, after);
check("the new passphrase opens the same vault", k2 !== null && JSON.stringify(await decryptJson(k2, packed)) === JSON.stringify(entry));
check("the forgotten one no longer opens it here", (await unlockVault(first, after)) === null);
check("a wrong one is still wrong", (await unlockVault("not it at all", after)) === null);
check("the recovery code still works after the reset", (await openWithRecovery(code, after)) !== null);
check("before any reset, the first passphrase opens it as always", (await unlockVault(first, withCode)) !== null);
const again = await wrapForPassphrase(k2, "a third, later on");
check("a second reset replaces the first", (await unlockVault("a third, later on", { ...after, ...again })) !== null && (await unlockVault(fresh, { ...after, ...again })) === null);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => " - " + f).join("\n")); process.exit(1); }
