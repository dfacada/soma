// The fixes of 2026-11-10, each held in place by a check: which addresses a push may be sent to (and that the job
// refuses a bad one that is already stored), that a day's save reads only the body's own keys, that a Telegram
// pairing code works once, and that signing out forgets the vault key the tab was holding.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-security.mjs

import fs from "node:fs";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { SESSION_KEY, forgetVaultKeys } from "../src/lib/vault-session.ts";

const require = createRequire(import.meta.url);
const api = require("../catalyst/functions/soma_api/lib/push-endpoint.js");
const job = require("../catalyst/functions/soma_jobs/push-endpoint.js");
const { dayStore } = require("../catalyst/functions/soma_api/lib/db.js");
const { pairCode, WINDOW_MS } = require("../catalyst/functions/soma_api/lib/pair-code.js");

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail === undefined ? "" : JSON.stringify(detail)); } };
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

console.log("push addresses");
check("soma_api's copy is soma_jobs' copy", read("../catalyst/functions/soma_api/lib/push-endpoint.js") === read("../catalyst/functions/soma_jobs/push-endpoint.js"));
for (const good of [
  "https://web.push.apple.com/QOabc-_123",
  "https://fcm.googleapis.com/fcm/send/abc:APA91b-_x",
  "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
  "https://wns2-by3p.notify.windows.com/w/?token=BQYAAAB%2bx%2f",
]) check("a real one is kept as it is: " + new URL(good).hostname, api.pushEndpoint(good) === good, api.pushEndpoint(good));
check("a host in capitals is stored in the standard spelling", api.pushEndpoint("https://WEB.PUSH.APPLE.COM/x") === "https://web.push.apple.com/x");
// Each of these names a push service to the modern parser and somewhere else (or something else) to the sender.
const bad = {
  "a semicolon ends the host for the sender": "https://evil.example;.push.apple.com/x",
  "so does a brace": "https://evil.example{.push.apple.com/x",
  "a label over 63 characters is cut by the sender": "https://evil.example." + "a".repeat(64) + ".push.apple.com/x",
  "a sign-in part": "https://user:pw@web.push.apple.com/x",
  "a backslash before an @": "https://evil.example\\@web.push.apple.com/x",
  "a port": "https://web.push.apple.com:8443/x",
  "plain http": "http://web.push.apple.com/x",
  "a push host as someone else's subdomain": "https://web.push.apple.com.evil.example/x",
  "a push host in the path": "https://evil.example/web.push.apple.com",
  "a push host after a question mark": "https://evil.example?.push.apple.com",
  "an empty label": "https://a..push.apple.com/x",
  "a trailing dot": "https://web.push.apple.com./x",
  "not an address": "web.push.apple.com/x",
};
for (const [why, address] of Object.entries(bad)) check("refused: " + why, api.pushEndpoint(address) === null, api.pushEndpoint(address));
check("refused: anything that is not text", [null, undefined, 7, {}, ["https://web.push.apple.com/x"]].every((v) => api.pushEndpoint(v) === null));
check("refused: an address over 2,000 characters", api.pushEndpoint("https://web.push.apple.com/" + "a".repeat(2000)) === null);
// A tab is dropped by the modern parser, which leaves a real push.apple.com name: what is kept is that spelling.
check("what is kept is always the standard spelling", api.pushEndpoint("https://evil.example\t.push.apple.com/x") === "https://evil.example.push.apple.com/x");
check("the job's copy answers the same", Object.values(bad).every((v) => job.pushEndpoint(v) === null) && job.pushEndpoint("https://web.push.apple.com/x") === "https://web.push.apple.com/x");

console.log("the job, on what is already stored");
{
  // No network: every request the job would make lands here instead, and "fails".
  const https = require("node:https");
  const real = https.request;
  const asked = [];
  https.request = (options) => {
    asked.push({ hostname: options.hostname, timeout: options.timeout });
    const r = new EventEmitter();
    r.write = () => undefined; r.destroy = () => undefined;
    r.end = () => setImmediate(() => r.emit("error", new Error("no network in tests")));
    return r;
  };
  const webpush = require("../catalyst/functions/soma_jobs/node_modules/web-push");
  const vapid = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = vapid.publicKey; process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  const nudge = require("../catalyst/functions/soma_jobs/nudge.js");
  const uid = "999000000000000001";
  const device = (rowid, endpoint) => ({ ROWID: rowid, user_id: uid, endpoint, p256dh: crypto.createECDH("prime256v1").generateKeys().toString("base64url"), auth_secret: crypto.randomBytes(16).toString("base64url"), tz: "UTC", fails: 0 });
  const subs = [device("1", "https://evil.example;.push.apple.com/x"), device("2", "https://web.push.apple.com/abc")];
  const done = { deleted: [], updated: [], logs: [] };
  const app = {
    zcql: () => ({ executeZCQLQuery: async (sql) => (/FROM push_subs/.test(sql) ? subs.map((s) => ({ push_subs: s })) : /FROM profiles/.test(sql) ? [{ profiles: { user_id: uid, status: "active", settings_json: "{}" } }] : []) }),
    datastore: () => ({ table: (name) => ({
      deleteRow: async (id) => { done.deleted.push(name + ":" + id); },
      updateRow: async (row) => { done.updated.push(name + ":" + row.ROWID); },
      insertRow: async (row) => { if (name === "logs") done.logs.push(row.event); return row; },
    }) }),
  };
  const log = console.log, err = console.error;
  console.log = () => undefined; console.error = () => undefined; // the job's own lines, not this suite's
  try { await nudge.run(app, { type: "nudge", test: "1", user_id: uid }); } finally { console.log = log; console.error = err; https.request = real; }
  check("nothing is sent to an address that is not a push service", !asked.some((a) => a.hostname === "evil.example"), asked);
  check("…its row is removed", done.deleted.includes("push_subs:1"), done.deleted);
  check("…and the log says so", done.logs.includes("endpoint_refused"), done.logs);
  check("a real address is sent to, by its own host", asked.length === 1 && asked[0].hostname === "web.push.apple.com", asked);
  check("…with a time limit", asked.length === 1 && asked[0].timeout === 10000, asked);
  check("…and a send that fails is counted, not thrown", done.updated.includes("push_subs:2") && done.logs.includes("send_failed"), done);
}

console.log("a day's save reads the body's own keys");
{
  const field = (col) => ({ col, in: (v) => v, out: (v) => v });
  const store = dayStore("activity", { pushups: field("pushups"), roundPushups: field("round_pushups") });
  const written = [];
  const admin = {
    zcql: () => ({ executeZCQLQuery: async () => [] }),
    datastore: () => ({ table: () => ({ insertRow: async (row) => { written.push(row); return row; }, updateRow: async (row) => { written.push(row); return row; } }) }),
  };
  // What Object.assign({}, body) makes of a JSON body that carries a "__proto__" key: the fields arrive inherited.
  const smuggled = Object.assign({}, JSON.parse('{"pushups":5,"__proto__":{"roundPushups":999}}'));
  check("the trick still works on a plain copy (so this check means something)", smuggled.roundPushups === 999 && !Object.hasOwn(smuggled, "roundPushups"));
  await store.put(admin, "1", "2001-02-03", smuggled);
  check("an inherited field is not written", written.length === 1 && written[0].pushups === 5 && !("round_pushups" in written[0]), written);
  written.length = 0;
  await store.put(admin, "1", "2001-02-03", { pushups: 6, roundPushups: 7 });
  check("the body's own fields still are (the route decides which may be there)", written.length === 1 && written[0].round_pushups === 7, written);
  let refused = null;
  try { await store.put(admin, "1", "2001-02-03", Object.create({ pushups: 5 })); } catch (e) { refused = e.status; }
  check("a body with nothing of its own saves nothing", refused === 400, refused);
}

console.log("the Telegram pairing code");
{
  const secret = "s".repeat(40), w = Math.floor(Date.parse("2026-11-10T20:00:00Z") / WINDOW_MS);
  const code = pairCode(secret, "101", w, 0);
  check("it reads DAYHUB- and six characters", /^DAYHUB-[A-Z0-9]{6}$/.test(code), code);
  check("the same person, window and count give the same code", pairCode(secret, "101", w, 0) === code);
  check("once it has connected a chat it is not the code any more", pairCode(secret, "101", w, 1) !== code);
  check("…and never comes back as the count goes on", new Set([0, 1, 2, 3, 4, 5].map((n) => pairCode(secret, "101", w, n))).size === 6);
  check("it is another person's code for nobody", pairCode(secret, "102", w, 0) !== code);
  check("it changes with the ten-minute window", pairCode(secret, "101", w + 1, 0) !== code);
  check("a profile from before the count reads as none", pairCode(secret, "101", w, null) === code && pairCode(secret, "101", w, undefined) === code && pairCode(secret, "101", w, "") === code);
}

console.log("signing out");
{
  const fake = (init) => { const m = new Map(Object.entries(init)); return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, removeItem: (k) => { m.delete(k); }, names: () => [...m.keys()] }; };
  const tab = fake({ [SESSION_KEY + "101"]: "key-one", "soma-vault-asked.101": "1", [SESSION_KEY + "202"]: "key-two", "soma-gh-state": "x" });
  check("every vault key in the tab goes, whoever's it is", forgetVaultKeys(tab) === 2 && !tab.names().some((n) => n.startsWith(SESSION_KEY)), tab.names());
  check("nothing else in the tab is touched", tab.names().join(",") === "soma-vault-asked.101,soma-gh-state", tab.names());
  check("nothing to forget is fine", forgetVaultKeys(tab) === 0 && forgetVaultKeys(fake({})) === 0);
  check("no storage at all is fine (a private window)", forgetVaultKeys(null) === 0);
  check("storage that throws is fine", forgetVaultKeys({ get length() { throw new Error("denied"); }, key: () => null, removeItem: () => undefined }) === 0);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => " - " + f).join("\n")); process.exit(1); }
