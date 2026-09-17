// The log's guard rails (catalyst/functions/soma_api/lib/log.js).  node scripts/test-log.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { writeLog, scrub } = require("../catalyst/functions/soma_api/lib/log.js");

let passed = 0; const failures = [];
const check = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, "\n       got ", JSON.stringify(got), "\n       want", JSON.stringify(want)); } };

const rows = [];
const admin = { datastore: () => ({ table: () => ({ insertRow: async (r) => { rows.push(r); } }) }) };
const token = "ya29." + "A".repeat(60);

check("a token inside a message is cut", scrub("refresh failed for " + token), "refresh failed for ya29.[redacted]");
check("ordinary text, paths and stack frames are left alone", scrub("TypeError: x is undefined at Player (JournalScreen.tsx:152:18) /entries/e_1789_ab12cd"), "TypeError: x is undefined at Player (JournalScreen.tsx:152:18) /entries/e_1789_ab12cd");

await writeLog(admin, { level: "loud", source: "martian", area: "Google Health!", event: "Steps Failed", message: "too long ".repeat(50), detail: { token, status: 400 }, userId: "12345", status: 400 });
const r = rows[0];
check("unknown level and source fall back; area and event become codes", [r.lvl, r.source, r.area, r.event], ["error", "api", "google_health_", "steps_failed"]);
check("message is clipped to the column", r.message.length, 255);
check("objects are stored as JSON with secrets cut", r.detail, '{"token":"ya29.[redacted]","status":400}');
check("user and status are kept, test flag defaults off", [r.user_id, r.http_status, r.is_test], ["12345", 400, "false"]);

await writeLog(admin, { area: "x", event: "y", userId: "not-an-id" });
check("a bad user id is dropped, not stored", "user_id" in rows[1], false);

const broken = { datastore: () => ({ table: () => ({ insertRow: async () => { throw new Error("datastore down"); } }) }) };
const quiet = console.error; console.error = () => undefined;
check("a failing write never throws", await writeLog(broken, { area: "x", event: "y" }).then(() => "ok", () => "threw"), "ok");
console.error = quiet;

check("the jobs copy is the same file", fs.readFileSync(new URL("../catalyst/functions/soma_jobs/log.js", import.meta.url), "utf8") === fs.readFileSync(new URL("../catalyst/functions/soma_api/lib/log.js", import.meta.url), "utf8"), true);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
