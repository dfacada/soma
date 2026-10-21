// Recording streamed to the cloud while it is made (src/lib/draft-stream.ts), end to end against the Development
// API and Stratus, as the synthetic test member: segments encrypted and uploaded in order, listed by GET /drafts,
// rebuilt byte for byte, then deleted by DELETE /drafts/:id. Runs the app's own draft-stream.ts and vault-crypto.ts.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-drafts.mjs

import fs from "node:fs";
import { createVault } from "../src/lib/vault-crypto.ts";
import { DraftStream, rebuildDraft, segmentName } from "../src/lib/draft-stream.ts";

const BASE = "https://soma-939530195.development.catalystserverless.com/server/soma_api/execute";
const KEY = JSON.parse(fs.readFileSync(new URL("../catalyst/secrets.json", import.meta.url), "utf8")).soma_api.TEST_KEY;
let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };
const call = async (method, route, body) => {
  const res = await fetch(BASE + route, { method, headers: { "x-test-key": KEY, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const net = {
  sign: async (method, names) => { const r = await call("POST", "/sign", { kind: "drafts", method, names }); if (r.status !== 200) throw new Error("sign " + r.status); return new Map(r.json.urls.map((u) => [u.name, u.url])); },
  put: async (url, bytes) => { const r = await fetch(url, { method: "PUT", body: bytes, headers: { "Content-Type": "application/octet-stream", overwrite: "true" } }); if (!r.ok) throw new Error("put " + r.status); },
  get: async (url) => { const r = await fetch(url); if (!r.ok) throw new Error("get " + r.status); return r.arrayBuffer(); },
};

const { key } = await createVault("draft test");
const draftId = "draft_" + Date.now();
// A fake MP4: "ftyp" at bytes 4–7, then varied bytes, in slices like the recorder's.
const total = new Uint8Array(40000).map((_, i) => (i * 7 + 3) % 251);
total.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70], 0);
const slices = []; for (let i = 0; i < total.length; i += 3000) slices.push(total.slice(i, i + 3000));

console.log("streaming");
const errors = [];
const stream = new DraftStream(key, draftId, net, (e, seq) => errors.push([seq, String(e)]));
// Three segments: push slices, with the clock made to pass five seconds between groups.
const realNow = Date.now; let fake = realNow();
Date.now = () => fake;
slices.forEach((s, i) => { stream.push(new Blob([s])); if (i % 5 === 4) fake += 5001; });
Date.now = realNow;
await stream.finish();
check("no segment failed", errors.length === 0 && !stream.broken, errors);
check("nothing left behind", stream.behind === 0, stream.behind);

const listed = await call("GET", "/drafts");
const mine = listed.json?.drafts?.find((d) => d.draftId === draftId);
check("GET /drafts lists the draft", listed.status === 200 && !!mine, listed);
check("segments come back in order", mine && mine.segments.every((n, i) => n === segmentName(draftId, i)), mine?.segments);
check("ciphertext only: bytes exceed the plaintext", mine && mine.bytes > total.length, mine?.bytes);

console.log("rebuilding");
const got = await rebuildDraft(key, draftId, mine.segments, net);
const joined = new Uint8Array(await new Blob(got.parts).arrayBuffer());
check("rebuilt byte for byte", joined.length === total.length && joined.every((v, i) => v === total[i]), joined.length);
check("type read from the first bytes", got.mime === "audio/mp4", got.mime);
check("complete when no segment is missing", got.complete === true);
const gap = await rebuildDraft(key, draftId, mine.segments.filter((_, i) => i !== 1), net);
check("a gap stops the rebuild at the prefix", gap.segments === 1 && gap.complete === false, gap && { segments: gap.segments, complete: gap.complete });
const other = (await createVault("someone else")).key;
check("another key cannot rebuild it", await rebuildDraft(other, draftId, mine.segments, net).then(() => false, () => true));

console.log("cleaning up");
const del = await call("DELETE", `/drafts/${draftId}`);
check("DELETE removes every segment", del.status === 200 && del.json.deleted === mine.segments.length, del);
// Stratus may take a moment to drop deleted objects from a listing.
let gone = false, waited = 0;
for (; waited <= 90000 && !gone; waited += 5000) {
  gone = !(await call("GET", "/drafts")).json.drafts.some((d) => d.draftId === draftId);
  if (!gone) await new Promise((r) => setTimeout(r, 5000));
}
check(`the draft is gone (listed until ~${waited / 1000 - 5}s)`, gone);
check("a bad draft id is refused", (await call("DELETE", "/drafts/..%2Fentries")).status === 400);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
