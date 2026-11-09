// Moods of your own (src/lib/moods.ts): what is kept, and how a day's mood is read as good, okay or hard once moods
// can be renamed, added and taken out.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-moods.mjs

import { cleanMoods, moodId, moodTone, toneOf, MOODS_MAX } from "../src/lib/moods.ts";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/lib/settings.ts";
import { isGreat } from "../src/lib/great-days.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail === undefined ? "" : JSON.stringify(detail)); } };
const d = DEFAULT_SETTINGS.moods;

console.log("what is kept");
check("nothing stored is Soma's ten", mergeSettings({}).moods.length === 10 && mergeSettings({ moods: [] }).moods.length === 10);
const kept = cleanMoods([
  { id: "great", label: "Brilliant", on: true },
  { id: "own-wired", label: "  Wired  ", on: true, tone: "hard" },
  { id: "own-wired", label: "Again", on: true },
  { id: "own-x", label: "brilliant", on: true },
  { id: "Bad Id", label: "Nope", on: true },
  { id: "own-empty", label: "   ", on: true },
  { id: "own-long", label: "A mood far longer than twenty", on: false, tone: "sideways" },
], d);
check("renamed and new moods are kept; repeats, bad ids and empty words are not", kept.map((m) => m.label).join("|") === "Brilliant|Wired|A mood far longer th", kept);
check("a tone that is not good, okay or hard is dropped", kept[2].tone === undefined && kept[1].tone === "hard");
check("at least one mood stays on", cleanMoods([{ id: "a", label: "A", on: false }, { id: "b", label: "B", on: false }], d)[0].on === true);
check(`at most ${MOODS_MAX}`, cleanMoods(Array.from({ length: 30 }, (_, i) => ({ id: `own-${i}`, label: `M${i}`, on: true })), d).length === MOODS_MAX);
check("a mood of your own gets a unique id", moodId("Wired!", ["own-wired"]) === "own-wired-2");

console.log("good, okay or hard");
check("Soma's own keep what they are by id, whatever they are called", moodTone({ id: "great" }) === "good" && moodTone({ id: "down" }) === "hard" && moodTone({ id: "tired" }) === "okay");
check("a mood of your own is okay until you say", moodTone({ id: "own-wired" }) === "okay" && moodTone({ id: "own-wired", tone: "hard" }) === "hard");
check("what you say wins over Soma's", moodTone({ id: "great", tone: "okay" }) === "okay");
const mine = [{ id: "great", label: "Brilliant", on: true }, { id: "own-wired", label: "Wired", on: true, tone: "hard" }, { id: "own-buzzing", label: "Buzzing", on: true, tone: "good" }];
check("a day logged with a renamed mood reads as before", toneOf("Brilliant", mine) === "good");
check("a day logged before the rename still reads as good (Soma's own words)", toneOf("Great", mine) === "good" && toneOf("Down", mine) === "hard");
check("your own moods read the way you said, in any case", toneOf("wired", mine) === "hard" && toneOf("Buzzing", mine) === "good");
check("words nobody knows are okay; no mood is nothing", toneOf("Meh", mine) === "okay" && toneOf(null, mine) === null);
check("a great day follows your list", isGreat("Buzzing", mine) && isGreat("Brilliant", mine) && !isGreat("Wired", mine) && !isGreat("Meh", mine));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => " - " + f).join("\n")); process.exit(1); }
