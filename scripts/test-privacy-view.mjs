// What Dayhub can see: the lists and words of the Settings screen (src/lib/privacy-view.ts), and what a member may
// read of their own audit (catalyst/functions/soma_api/lib/audit.js forMember). Pure, so both run here.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-privacy-view.mjs

import fs from "node:fs";
import { forMember, MEMBER_ACTIONS } from "../catalyst/functions/soma_api/lib/audit.js";
import { OPS_SEES, readFrom, READABLE, recent, SEALED, sentOut, summaryOf, visitWords, whenOf } from "../src/lib/privacy-view.ts";
import { mergeSettings } from "../src/lib/settings.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail === undefined ? "" : JSON.stringify(detail)); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("what a member reads of their own audit: the looks at their values, with the reason");
const me = "999000000000000001";
const rows = [
  { created_ms: "1700000000500", actor_id: "120000000000000007", action: "values_shown", reason: "fix a wrong weight", detail: '{"days":14}' },
  { created_ms: "1700000000400", actor_id: me, action: "values_shown", reason: "my own, checking", detail: null },
  { created_ms: "1700000000300", actor_id: "120000000000000007", action: "person_viewed", reason: null, detail: null },
  { created_ms: "1700000000250", actor_id: "120000000000000007", action: "issue_handled", reason: null, detail: '{"issue":"gone-quiet:999000000000000001"}' },
  { created_ms: "1700000000200", actor_id: "120000000000000007", action: "profile_status", reason: null, detail: '{"from":"pending","to":"active"}' },
  { created_ms: "1700000000150", actor_id: "120000000000000007", action: "message_sent", reason: null, detail: '{"chars":40}' },
  { created_ms: "1700000000100", actor_id: "120000000000000007", action: "values_shown", reason: "x".repeat(400), detail: null },
];
const got = forMember(rows, me, (id) => (id === "120000000000000007" ? "David F." : "?"));
check("for now, only the looks at their values (David, 2026-11-11)", same(MEMBER_ACTIONS, ["values_shown"]) && same(got.map((r) => r.at), [1700000000500, 1700000000400, 1700000000100]), got.map((r) => r.action));
check("page opens, issues handled, status changes and messages stay in Ops", !got.some((r) => ["person_viewed", "issue_handled", "profile_status", "message_sent"].includes(r.action)));
check("when, what, who and the reason, and never the detail", same(got[0], { at: 1700000000500, action: "values_shown", by: "David F.", reason: "fix a wrong weight" }), got[0]);
check("an admin looking at their own values is 'you'", got[1].by === "you");
check("a reason is cut to what the audit keeps", got[2].reason.length === 255);
check("nothing, or not a list, is an empty record", forMember(null, me, () => "A").length === 0 && forMember("rows", me, () => "A").length === 0);
const route = fs.readFileSync(new URL("../catalyst/functions/soma_api/routes/account.js", import.meta.url), "utf8");
check("the route asks only for the caller's rows of those actions, and never the detail column", /WHERE target_id = \$\{uid\} AND action IN \(\$\{actions\}\)/.test(route) && !/SELECT[^`]*detail[^`]*FROM ops_audit/.test(route));

console.log("the record, in words");
check("a look at the values", visitWords({ at: 0, action: "values_shown", by: "David F.", reason: "x" }) === "David F. looked at your food, weight and activity for the last 14 days");
check("yourself, as an admin", visitWords({ at: 0, action: "values_shown", by: "you", reason: "x" }) === "You looked at your food, weight and activity for the last 14 days");
check("anything else that ever arrives is still said plainly", visitWords({ at: 0, action: "something_new", by: "David F.", reason: null }) === "David F. looked at your account");
const day = (d, h) => new Date(2026, 10, d, h, 0, 0).getTime();
check("newest first as sent, at most twenty", recent(Array.from({ length: 30 }, (_, i) => ({ at: day(28 - (i % 28), 9), action: "values_shown", by: "D", reason: "r" + i }))).length === 20 && recent([]).length === 0);
check("when, short", /^Wed 11 Nov, \d{1,2}:\d{2} (am|pm)$/.test(whenOf(day(11, 14))), whenOf(day(11, 14)));

console.log("what goes out, with their switches as they are");
const plain = mergeSettings({});
const out = sentOut(plain, null);
check("six things can go out", out.length === 6 && same(out.map((o) => o.id), ["estimate", "transcribe", "sayday", "insights", "review", "telegram"]));
check("with Dayhub's defaults only food estimates are on", same(out.filter((o) => o.on).map((o) => o.id), ["estimate"]) && summaryOf(out) === "1 of 6 things that go out is on");
const all = mergeSettings({ foodEstimate: true, cloudTranscription: true, sayDay: true, journalInsights: "claude", weeklyReview: { on: true, consent: true, telegram: true }, brief: { telegram: true } });
check("every switch on shows on, Telegram only once a chat is connected", sentOut(all, false).filter((o) => o.on).length === 5 && sentOut(all, true).filter((o) => o.on).length === 6 && summaryOf(sentOut(all, true)) === "6 of 6 things that go out are on");
check("the week in review counts as going out only when it is on and agreed to", !sentOut(mergeSettings({ weeklyReview: { on: true, consent: false } }), null).find((o) => o.id === "review").on && !sentOut(mergeSettings({ weeklyReview: { on: false, consent: true } }), null).find((o) => o.id === "review").on);
check("Telegram with a chat but no switch on sends nothing", !sentOut(mergeSettings({}), true).find((o) => o.id === "telegram").on);
check("every row names who it goes to and opens a section that exists", out.every((o) => o.to && o.what && ["food", "journal", "review"].includes(o.section)));
check("what Dayhub reads from: Google Health by its status, the others unknown until the links are read", same(readFrom("connected", null).map((l) => l.on), [true, null, null]) && same(readFrom("off", { morgen: { ciphertext: "x" }, todoist: null }).map((l) => l.on), [false, true, false]));

console.log("the lists, against the privacy page");
const page = fs.readFileSync(new URL("../src/app/privacy/page.tsx", import.meta.url), "utf8");
check("the privacy page points to the screen", page.includes("Settings &rarr; What Dayhub can see"));
check("…and says what the administrator sees", page.includes("What the administrator sees") && /never shows a journal or a check-in mood/.test(page));
check("everyone the screen sends to is on the page's list", ["Groq", "Anthropic", "Telegram", "Morgen", "Todoist", "Google"].every((w) => page.includes(w)));
check("the sealed list leads with the journal and says what the server still sees of it", SEALED[0].id === "journal" && /exists, when, and how big/.test(SEALED[0].note));
check("the readable list says who else sees a round", /Other members of a round see your name/.test(READABLE.find((r) => r.id === "rounds").note));
check("Ops never shows a journal or a mood, and says so", /Never your journal, and never your check-in mood/.test(OPS_SEES));
check("the page promises no more than members see: openings are recorded, looks at values are shown", /Every time an administrator opens your account is recorded/.test(page) && /Each time your values were shown, you can see when, by whom and the reason/.test(page));
const person = fs.readFileSync(new URL("../src/components/ops/Person.tsx", import.meta.url), "utf8");
check("Ops tells the admin the reason is read by the person, and no longer says a page open is", /can read that record in Settings → What Dayhub can see/.test(person) && !/sees that in Settings/.test(person));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
