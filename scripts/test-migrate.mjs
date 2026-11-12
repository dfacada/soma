// The account copy's rules (catalyst/functions/soma_api/lib/migrate.js), offline: what travels, how ids are swapped,
// and what is refused. Temporary, like the copy itself (move day, 2026-11-18).
//
//   node scripts/test-migrate.mjs

import { createRequire } from "node:module";
const { TABLES, fileName, rowFor, profileFor } = createRequire(import.meta.url)("../catalyst/functions/soma_api/lib/migrate.js");

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const A = "111000000000000001", B = "222000000000000002";

console.log("rows");
const day = rowFor("checkins", { ROWID: "9", CREATORID: "1", CREATEDTIME: "x", MODIFIEDTIME: "y", user_id: A, day: "2026-11-01", ukey: `${A}:2026-11-01`, mood: "Great", habits_json: "{}" }, A, B);
check("a day row gets the new id and ukey", day.user_id === B && day.ukey === `${B}:2026-11-01` && day.day === "2026-11-01", day);
check("Catalyst's own columns are dropped", !("ROWID" in day) && !("CREATORID" in day) && !("CREATEDTIME" in day) && !("MODIFIEDTIME" in day), day);
check("the person's values travel unchanged", day.mood === "Great" && day.habits_json === "{}", day);
const month = rowFor("health_months", { user_id: A, ym: "2026-10", ukey: `${A}:2026-10`, ciphertext: "abc" }, A, B);
check("a sealed month keeps its ciphertext, under the new ukey", month.ciphertext === "abc" && month.ukey === `${B}:2026-10`, month);
const entry = rowFor("entries", { user_id: A, entry_id: "e_abc12345", has_audio: "true", created_ms: "1700000000000" }, A, B);
check("an entry keeps its id and flags", entry.entry_id === "e_abc12345" && entry.has_audio === "true" && entry.user_id === B, entry);
check("the Google Health link travels", rowFor("vault_tokens", { user_id: A, provider: "google-health", ukey: `${A}:google-health`, ciphertext: "c" }, A, B)?.ukey === `${B}:google-health`);
check("so do Morgen and Todoist", rowFor("vault_tokens", { user_id: A, provider: "morgen", ukey: `${A}:morgen` }, A, B) !== null && rowFor("vault_tokens", { user_id: A, provider: "todoist", ukey: `${A}:todoist` }, A, B) !== null);
check("a Face ID passkey stays behind", rowFor("vault_tokens", { user_id: A, provider: "passkey", ukey: `${A}:k1`, ciphertext: "c" }, A, B) === null);
check("a table that does not travel is refused", throws(() => rowFor("messages", { user_id: A }, A, B)));
check("so are rounds", throws(() => rowFor("round_members", { user_id: A }, A, B)) && !TABLES.includes("rounds"));
check("another person's row is refused", throws(() => rowFor("weight", { user_id: B, day: "2026-11-01", ukey: `${B}:2026-11-01` }, A, B)));
check("a ukey of someone else is refused", throws(() => rowFor("weight", { user_id: A, ukey: `${B}:2026-11-01` }, A, B)));
check("a nested value is refused", throws(() => rowFor("checkins", { user_id: A, habits_json: { a: 1 } }, A, B)));
check("ids must be digits", throws(() => rowFor("weight", { user_id: A }, "x", B)) && throws(() => rowFor("weight", { user_id: A }, A, "1 OR 1=1")));
check("a ukey that only starts with the same digits is refused", throws(() => rowFor("weight", { user_id: A, ukey: `${A}0:2026-11-01` }, A, B)));
check("a row without a ukey keeps none", !("ukey" in rowFor("recipes", { user_id: A, payload_json: "{}" }, A, B)));

console.log("profile");
const p = profileFor({ display_name: "D", settings_json: "{}", created_ms: "1", closed_json: "[]", email: "x@y", role: "admin", status: "active" });
check("only what the person made travels", Object.keys(p).sort().join() === "closed_json,created_ms,display_name,settings_json", p);
check("an empty source gives nothing", Object.keys(profileFor({})).length === 0);

console.log("files");
check("a recording travels", fileName("audio/e_1.enc") === "audio/e_1.enc");
check("an entry, a photo and a draft segment travel", fileName("entries/e_1.enc") && fileName("photos/p.enc") && fileName("drafts/cs-draft_1700000000000-00000.enc"));
check("transcription's plain audio stays", fileName("drafts/tx-e_1.wav") === null);
check("a path out of the folder is refused", fileName("../x") === null && fileName("audio/../x") === null && fileName("audio/a/b") === null);
check("an unknown kind is refused", fileName("secrets/x.enc") === null && fileName("x.enc") === null);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
