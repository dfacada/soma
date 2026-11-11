// What Dayhub can see: the lists and words of the Settings screen (src/lib/privacy-view.ts), and what a member may
// read of their own audit (catalyst/functions/soma_api/lib/audit.js forMember). Pure, so both run here.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-privacy-view.mjs

import fs from "node:fs";
import { forMember, ISSUE_KINDS, MEMBER_ACTIONS } from "../catalyst/functions/soma_api/lib/audit.js";
import { KINDS, keyOf } from "../catalyst/functions/soma_api/lib/ops.js";
import { groupVisits, OPS_SEES, readFrom, READABLE, SEALED, sentOut, summaryOf, visitWords, whenOf } from "../src/lib/privacy-view.ts";
import { mergeSettings } from "../src/lib/settings.ts";
import { ACTION_WORDS } from "../src/lib/ops.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail === undefined ? "" : JSON.stringify(detail)); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("what a member reads of their own audit");
const me = "999000000000000001";
const rows = [
  { created_ms: "1700000000500", actor_id: "120000000000000007", action: "values_shown", reason: "fix a wrong weight", detail: '{"days":14}' },
  { created_ms: "1700000000400", actor_id: me, action: "person_viewed", reason: null, detail: null },
  { created_ms: "1700000000300", actor_id: "120000000000000007", action: "issue_handled", reason: null, detail: '{"issue":"gone-quiet:999000000000000001"}' },
  { created_ms: "1700000000200", actor_id: "120000000000000007", action: "profile_status", reason: null, detail: '{"from":"pending","to":"active"}' },
  { created_ms: "1700000000100", actor_id: "120000000000000007", action: "alerts_changed", reason: null, detail: '{"newProblem":true}' },
  { created_ms: "1700000000050", actor_id: "120000000000000007", action: "issue_reopened", reason: "x".repeat(400), detail: '{"issue":"errors:999000000000000001:<script>"}' },
];
const got = forMember(rows, me, (id) => (id === "120000000000000007" ? "David F." : "?"));
check("only the actions about a person are theirs to read", same(got.map((r) => r.action), ["values_shown", "person_viewed", "issue_handled", "profile_status", "issue_reopened"]), got.map((r) => r.action));
check("when, what, who and the reason, and nothing else", same(got[0], { at: 1700000000500, action: "values_shown", by: "David F.", reason: "fix a wrong weight", about: null }), got[0]);
check("an admin looking at their own page is 'you'", got[1].by === "you");
check("of the detail, only which kind of issue it was", got[2].about === "gone-quiet" && !JSON.stringify(got[2]).includes("999000000000000001"), got[2]);
check("…or what a status became", got[3].about === "active", got[3]);
check("an issue key's other parts never reach the member, and a reason is cut to what the audit keeps", got[4].about === "errors" && !JSON.stringify(got[4]).includes("script") && got[4].reason.length === 255, got[4]);
check("detail that is not JSON, or not an object, is nothing", forMember([{ action: "issue_handled", detail: "nope" }, { action: "profile_role", detail: '"admin"' }], me, () => "A").every((r) => r.about === null));
check("nothing, or not a list, is an empty record", forMember(null, me, () => "A").length === 0 && forMember("rows", me, () => "A").length === 0);
check("every issue kind Ops can raise has a word for the member", same([...KINDS.map((k) => keyOf(k).split(":")[0])].sort(), [...ISSUE_KINDS].sort()), KINDS.map((k) => keyOf(k)));
check("every action a member reads is one Ops' own audit words too", MEMBER_ACTIONS.every((a) => ACTION_WORDS[a]), MEMBER_ACTIONS.filter((a) => !ACTION_WORDS[a]));

console.log("the record, in words");
check("every action a member reads has its own sentence", MEMBER_ACTIONS.every((action) => !visitWords({ at: 0, action, by: "David F.", reason: null, about: null }).includes("did something")));
check("…and an unknown one is still said plainly", visitWords({ at: 0, action: "something_new", by: "David F.", reason: null, about: null }) === "David F. did something on your account");
check("opening the page", visitWords({ at: 0, action: "person_viewed", by: "David F.", reason: null, about: null }) === "David F. opened your page in Dayhub Ops");
check("looking at the values", visitWords({ at: 0, action: "values_shown", by: "David F.", reason: "x", about: null }) === "David F. looked at your food, weight and activity for the last 14 days");
check("an issue handled says which", visitWords({ at: 0, action: "issue_handled", by: "David F.", reason: null, about: "gone-quiet" }) === "David F. marked as handled that you hadn't opened Dayhub for a while");
check("every issue kind reads as a sentence", ISSUE_KINDS.every((about) => !visitWords({ at: 0, action: "issue_handled", by: "D", reason: null, about }).includes("something")));
check("an approval, a role", visitWords({ at: 0, action: "profile_status", by: "David F.", reason: null, about: "active" }) === "David F. let your account in" && visitWords({ at: 0, action: "profile_role", by: "David F.", reason: null, about: "admin" }) === "David F. made you an admin");
check("yourself, as an admin", visitWords({ at: 0, action: "person_viewed", by: "you", reason: null, about: null }) === "You opened your page in Dayhub Ops");

const day = (d, h) => new Date(2026, 10, d, h, 0, 0).getTime();
const v = (at, action = "person_viewed", reason = null, by = "David F.") => ({ at, action, by, reason, about: null });
const groups = groupVisits([v(day(11, 10)), v(day(11, 9)), v(day(11, 8), "values_shown", "a fix"), v(day(11, 7)), v(day(10, 9)), v(day(10, 8), "person_viewed", null, "Sam K.")]);
check("the same look by the same admin on one day is one line, counted", groups[0].times === 2 && groups[0].at === day(11, 10), groups);
check("a look with a reason always stands alone, with its reason", groups[1].reason === "a fix" && groups[1].times === 1);
check("…and does not swallow the looks around it", groups[2].times === 1 && groups[2].at === day(11, 7));
check("another day, or another admin, is another line", groups.length === 5 && groups[4].words.startsWith("Sam K."), groups.map((g) => g.words));
check("at most twenty lines", groupVisits(Array.from({ length: 50 }, (_, i) => v(day(1 + (i % 28), 9), "values_shown", "r" + i))).length === 20);
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

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
