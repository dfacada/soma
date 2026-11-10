// The opening words (src/lib/opening.ts, opening-words.ts): Dayhub's own set, the person's own, or both taking turns.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-opening.mjs

import { phraseFor, PHRASE_MAX, NOTE_MAX } from "../src/lib/opening.ts";
import { SOMA_PHRASES } from "../src/lib/opening-words.ts";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/lib/settings.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };
const texts = (list) => list.map((p) => p.text);

console.log("Dayhub's own words");
check("forty lines, enough for more than a month without a repeat", SOMA_PHRASES.length === 40, SOMA_PHRASES.length);
check("David's first two lead the set", SOMA_PHRASES[0].text === "I can do hard things." && SOMA_PHRASES[1].text.startsWith("What is the story"));
check("every line and note fits what Settings allows", SOMA_PHRASES.every((p) => p.text.length <= PHRASE_MAX && (!p.note || p.note.length <= NOTE_MAX)), SOMA_PHRASES.filter((p) => p.text.length > PHRASE_MAX || (p.note || "").length > NOTE_MAX).map((p) => p.text));
check("every line has a note", SOMA_PHRASES.every((p) => p.note && p.note.trim()));
check("no line twice", new Set(SOMA_PHRASES.map((p) => p.text.toLowerCase())).size === SOMA_PHRASES.length);
check("no quotation marks or attributions: Dayhub's own words only", SOMA_PHRASES.every((p) => !/[“”"]|—\s*[A-Z]/.test(p.text + " " + (p.note || ""))));

console.log("choosing the day's words");
const mine = [{ text: "Breathe." }, { text: "Go for the walk." }];
check("Dayhub's: in order, one a day", texts([0, 1, 2].map((t) => phraseFor(t, "soma", mine))).join("|") === texts(SOMA_PHRASES.slice(0, 3)).join("|"));
check("Dayhub's: round again after the last", phraseFor(SOMA_PHRASES.length, "soma", mine).text === SOMA_PHRASES[0].text);
check("Mine: only my own, in turn", texts([0, 1, 2, 3].map((t) => phraseFor(t, "mine", mine))).join("|") === "Breathe.|Go for the walk.|Breathe.|Go for the walk.");
check("Mine with none of my own still says something (Dayhub's)", phraseFor(0, "mine", []).text === SOMA_PHRASES[0].text);
const both = [0, 1, 2, 3, 4, 5].map((t) => phraseFor(t, "both", mine).text);
check("Both: mine and Dayhub's take turns, a day each", both.join("|") === ["Breathe.", SOMA_PHRASES[0].text, "Go for the walk.", SOMA_PHRASES[1].text, "Breathe.", SOMA_PHRASES[2].text].join("|"), both);
check("Both with none of my own is Dayhub's alone", phraseFor(1, "both", []).text === SOMA_PHRASES[1].text && phraseFor(2, "both", []).text === SOMA_PHRASES[2].text);
const keepsDavids = [{ text: "I can do hard things." }, { text: "What is the story I’m telling myself?" }];
const run = Array.from({ length: 200 }, (_, t) => phraseFor(t, "both", keepsDavids).text.toLowerCase());
check("Both never shows the same line two days running, even when mine are also Dayhub's", run.every((x, i) => i === 0 || x !== run[i - 1]));
check("…and Dayhub's side skips the ones I already keep", run.filter((_, i) => i % 2 === 1).every((x) => !keepsDavids.some((m) => m.text.toLowerCase() === x)));
check("a broken turn counter reads as day one", phraseFor(Number.NaN, "soma", mine).text === SOMA_PHRASES[0].text && phraseFor(-3, "mine", mine).text === "Breathe.");

console.log("settings");
check("a new person starts with both and no phrases of anyone else's", DEFAULT_SETTINGS.opening.source === "both" && DEFAULT_SETTINGS.opening.phrases.length === 0 && DEFAULT_SETTINGS.opening.on === true);
check("someone set up before the choice existed gets Both, their phrases kept", mergeSettings({ opening: { on: true, phrases: mine } }).opening.source === "both" && mergeSettings({ opening: { on: true, phrases: mine } }).opening.phrases.length === 2);
check("a chosen source is kept", mergeSettings({ opening: { on: true, source: "mine", phrases: mine } }).opening.source === "mine");
check("an unknown source falls back to Both", mergeSettings({ opening: { source: "quotes" } }).opening.source === "both");

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => " - " + f).join("\n")); process.exit(1); }
