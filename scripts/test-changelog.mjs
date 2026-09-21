// The changelog: which releases someone is shown on opening, and that the list itself stays well formed.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-changelog.mjs

import { CHANGES, unseen } from "../src/lib/changelog.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };

const list = [
  { id: "c", date: "2026-09-21", title: "C", items: ["c"] },
  { id: "b", date: "2026-09-18", title: "B", items: ["b"] },
  { id: "a", date: "2026-09-01", title: "A", items: ["a"] },
];

console.log("what someone is shown");
check("seen the newest: nothing", unseen("c", "2026-09-21", list).length === 0);
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

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
