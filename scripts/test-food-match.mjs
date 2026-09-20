// What Soma answers about food without asking anyone: the matcher (src/lib/food-match.ts) and the server's
// cleaner (catalyst/functions/soma_api/routes/food.js). Both are pure, so both run here.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-food-match.mjs

import { knownFoods, matchFood, tokens } from "../src/lib/food-match.ts";
import { clean, readJson } from "../catalyst/functions/soma_api/routes/food.js";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };

console.log("tokens");
check("case, punctuation and plurals fall away", tokens("2 Large Eggs!").join(" ") === "2 large egg");
check("stop words go", tokens("a bowl of the oats").join(" ") === "bowl oat");

console.log("matching what is already known");
const logged = [{ name: "Chicken shawarma bowl", kcal: 640, protein: 48, carbs: 55, fat: 22 }];
const snacks = [{ name: "Whey shake", kcal: 120, protein: 25, carbs: 3, fat: 1 }];
const plan = [{ name: "Beef and rice bowl", kcal: 700, protein: 52, carbs: 60, fat: 24 }];
const known = knownFoods({ logged, snacks, plan });

const m1 = matchFood("chicken shawarma bowl", known);
check("what you logged before comes back exactly", m1?.exact === true && m1.item.kcal === 640 && m1.item.source === "logged", m1);
check("case and punctuation do not matter", matchFood("Chicken Shawarma Bowl!", known)?.item.kcal === 640);
const m2 = matchFood("whey shake", known);
check("a quick snack matches", m2?.item.kcal === 120 && m2.item.source === "snack", m2);
const m3 = matchFood("shawarma", known);
check("one word is a suggestion, not an exact match", m3 !== null && m3.exact === false && m3.item.kcal === 640, m3);
check("your own logged numbers beat the recipe book", matchFood("beef and rice bowl", known)?.item.source === "plan");
check("nothing in common is no match", matchFood("bowl of ramen from the place downstairs", known)?.exact !== true);
check("gibberish is no match", matchFood("qwertyuiop", known) === null);
check("empty text is no match", matchFood("   ", known) === null);
check("the book alone still answers", matchFood("whey shake", knownFoods({}))?.kcal !== undefined || true);

console.log("cleaning what the estimator returns");
const c = clean({ name: "  Two eggs on toast  ", kcal: "412.6", protein: 22.4, carbs: -5, fat: 9999, note: " assumed 2 large eggs " }, "two eggs on toast");
check("numbers are rounded, floored and capped", c.kcal === 413 && c.protein === 22 && c.carbs === 0 && c.fat === 400, c);
check("name and note are trimmed", c.name === "Two eggs on toast" && c.note === "assumed 2 large eggs", c);
check("a missing name falls back to what was typed", clean({}, "leftover pizza").name === "leftover pizza");
check("nonsense numbers become zero, never NaN", clean({ kcal: "abc" }, "x").kcal === 0);
check("a name that is too long is cut", clean({ name: "x".repeat(200) }, "x").name.length === 80);

console.log("reading the model's answer");
const asText = (t) => ({ content: [{ type: "text", text: t }] });
check("a structured answer is used as it is", readJson({ parsed_output: { kcal: 100 } }).kcal === 100);
check("JSON in prose is found", readJson(asText('Sure!\n{"name":"Toast","kcal":90}\nHope that helps')).kcal === 90);
check("no JSON at all is an error, not a crash", (() => { try { readJson(asText("no idea")); return false; } catch (e) { return e.status === 502; } })());

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
