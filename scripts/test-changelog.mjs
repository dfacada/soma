// The changelog: which releases someone is shown on opening, and that the list itself stays well formed.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-changelog.mjs

import { CHANGES, seenMark, splitChange, unseen } from "../src/lib/changelog.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };

const list = [
  { id: "c", date: "2026-09-21", title: "C", items: ["c"] },
  { id: "b", date: "2026-09-18", title: "B", items: ["b"] },
  { id: "a", date: "2026-09-01", title: "A", items: ["a"] },
];

console.log("what someone is shown");
check("what is remembered: the newest id and its line count", seenMark(list) === "c#1" && seenMark([]) === "");
check("seen the newest with all its lines: nothing", unseen("c#1", "2026-09-21", list).length === 0);
const grown = [{ ...list[0], items: ["c3", "c2", "c"] }, ...list.slice(1)];
const later = unseen("c#1", "2026-09-21", grown);
check("lines added to the newest since: just those lines", later.length === 1 && later[0].id === "c" && later[0].items.join() === "c3,c2", later);
check("seen with more lines than it has now (one was taken out): nothing", unseen("c#5", "2026-09-21", list).length === 0);
check("a bare id of the newest (saved before lines were counted): the whole release again", unseen("c", "2026-09-21", grown).map((r) => r.items.length).join() === "3");
check("a bare id of an older release: everything newer, as before", unseen("b", "2026-09-21", list).map((r) => r.id).join() === "c");
check("a count that is not a number: the whole release again", unseen("c#x", "2026-09-21", grown).map((r) => r.items.length).join() === "3");
check("seen an older one: everything newer, newest first", unseen("a", "2026-09-21", list).map((r) => r.id).join() === "c,b");
check("never seen anything: the last week's only", unseen("", "2026-09-21", list).map((r) => r.id).join() === "c,b");
check("never seen, nothing this week: just the newest", unseen("", "2026-10-30", list).map((r) => r.id).join() === "c");
check("an id this build does not know: just the newest", unseen("zzz", "2026-09-21", list).map((r) => r.id).join() === "c");
check("an empty changelog: nothing", unseen("", "2026-09-21", []).length === 0);

console.log("the changelog itself");
const ids = CHANGES.map((r) => r.id);
check("ids are unique", new Set(ids).size === ids.length, ids);
check("newest first", CHANGES.every((r, i) => i === 0 || CHANGES[i - 1].date >= r.date), CHANGES.map((r) => r.date));
check("dates are YYYY-MM-DD", CHANGES.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)));
check("every release has a title and at least one item", CHANGES.every((r) => r.title.trim() && r.items.length && r.items.every((x) => x.trim())));

console.log("scanning a change");
const f = splitChange("Fixed: past about sixteen entries the Journal stopped loading. Storage would only hand out so many links.");
check("a Fixed line gets its tag, a headline and the rest", f.tag === "Fixed" && f.lead === "Past about sixteen entries the Journal stopped loading." && f.rest === "Storage would only hand out so many links.", f);
const area = splitChange("Food: today's calories in big numbers. Each meal card has its icon.");
check("an area name is a tag too", area.tag === "Food" && area.lead.startsWith("Today's calories"), area);
const one = splitChange("The Run button on the Activity card now shows someone running, instead of a stopwatch.");
check("one sentence: no tag, no detail", one.tag === null && one.rest === "" && one.lead.endsWith("stopwatch."), one);
const colon = splitChange("Food has a new box at the top: tell it your whole day at once, like \"a bagel\". Tap Speak to say it.");
check("a colon mid-sentence is not a tag", colon.tag === null && colon.lead.startsWith("Food has a new box"), colon);
check("a full stop inside a number does not end the headline", splitChange("Weight: nudge by 0.2 or drag the ruler. More here.").lead === "Nudge by 0.2 or drag the ruler.");
check("every shipped line splits into a headline", CHANGES.every((r) => r.items.every((x) => splitChange(x).lead.length > 0)));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
