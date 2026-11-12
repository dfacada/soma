// Insights: what comes with great days, how the window went, the journal's tone, and the privacy of reading it.
//   node --import ./scripts/ts-resolve.mjs scripts/test-great-days.mjs
import { greatDays, journalTone, progress, weekCompare } from "../src/lib/great-days.ts";
import { mainOf } from "../src/lib/moves.ts";
import { deidentify, phoneTone, shuffleForSending, fingerprint } from "../src/lib/journal-read.ts";
import { DEFAULT_SETTINGS } from "../src/lib/settings.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail === undefined ? "" : JSON.stringify(detail)); } };

const days = Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
const meal = { name: "x", kcal: 500, protein: 60, carbs: 50, fat: 10 };
const map = {};
// Six days with a walk and Read ticked, all Great; six without, all Tired. Meditate is ticked on every other day either way.
days.forEach((day, i) => {
  const good = i < 6;
  map[day] = {
    checkin: { day, mood: good ? "Great" : "Tired", habits: { read: good, meditate: i % 2 === 0 }, counts: { drinks: good ? 1 : 6 } },
    activity: good ? { day, pushups: 0, types: { walk: true } } : undefined,
    log: { day, meals: { breakfast: meal, lunch: meal, snack: meal, dinner: meal }, extras: [] },
    entries: 1,
  };
});

console.log("great days");
const main = { move: mainOf(DEFAULT_SETTINGS), goal: 100 };
const g = greatDays(map, days, DEFAULT_SETTINGS, main, null);
check("counts the checked-in and great days", g.checkedIn === 12 && g.great === 6, g);
const top = g.lifts.map((d) => d.key);
check("moving, reading and staying under the drinks limit come with great days", ["active", "habit:read", "limit:drinks"].every((k) => top.includes(k)), top);
check("a habit spread evenly over both kinds of day is not a finding", !top.includes("habit:meditate"));
check("something done every day has no other side to compare", !top.includes("meals") && !top.includes("journal"));
check("a lift is the share of great days when done minus when not", g.lifts.find((d) => d.key === "active").lift === 1);
const few = greatDays(map, days.slice(0, 4), DEFAULT_SETTINGS, main, null);
check("too few days on a side shows nothing", few.lifts.length === 0 && few.drags.length === 0, few);

console.log("journal tone");
const tones = Object.fromEntries(days.map((d, i) => [d, i < 6 ? 0.6 : -0.2]));
const themes = Object.fromEntries(days.map((d, i) => [d, i < 6 ? ["family", "training"] : ["work"]]));
const t = journalTone(map, days, DEFAULT_SETTINGS, main, null, tones, themes);
check("the mean tone of the window", Math.abs(t.mean - 0.2) < 1e-9, t.mean);
check("days you moved sound brighter", t.brighter[0] && t.brighter[0].lift > 0.7 && ["active", "habit:read", "limit:drinks"].includes(t.brighter[0].key), t.brighter[0]);
check("bright days bring up their own themes, not the ones from heavier days", t.brightThemes.includes("family") && !t.brightThemes.includes("work"), t.brightThemes);

console.log("progress");
const p = progress(map, days, DEFAULT_SETTINGS);
check("no day closes without weight", p.closed === 0 && p.weakest === "weight", p);
check("each task's rate", p.rates.find((r) => r.key === "activity").rate === 0.5 && p.rates.find((r) => r.key === "food").rate === 1);
const early = ["2026-09-28", "2026-09-29", "2026-09-30", ...days];
check("counted from the first day anything was logged", progress(map, early, DEFAULT_SETTINGS).days === 12);

console.log("this week against last");
const wk = {};
for (let i = 0; i < 14; i++) { const d = new Date("2026-10-14T12:00:00"); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10);
  wk[k] = { weight: i < 7 ? 205 : 203, entries: 0, activity: i >= 7 ? { day: k, pushups: 0, types: { walk: true } } : undefined,
    log: { day: k, meals: { breakfast: { ...meal, kcal: i < 7 ? 800 : 500 }, lunch: meal, snack: meal, dinner: meal }, extras: [] } }; }
const wc = weekCompare(wk, DEFAULT_SETTINGS, "2026-10-14");
check("the weight, this week against last", wc.weight && wc.weight.now === 205 && wc.weight.before === 203, wc.weight);
check("calories a day, side by side", wc.rows[0].now === 2300 && wc.rows[0].before === 2000, wc.rows[0]);
check("active days dropped from seven to none", wc.rows.find((r) => r.label === "Active days").now === 0 && wc.rows.find((r) => r.label === "Active days").before === 7);

console.log("reading privately");
const said = "Had coffee with Sarah Jenkins at Blue Bottle. Sarah said call her on 415 555 0199 or sarah.j@gmail.com. Lives at 22 Pine Street. Mark from Acme visited. Great day on Monday, I felt good.";
const clean = deidentify(said, ["David Facada"]);
check("names in the middle of a sentence go", !/Jenkins|Blue|Bottle|Acme/.test(clean), clean);
check("a name at the start of a sentence goes once it is seen elsewhere", !/Sarah/.test(clean), clean);
check("a name only ever at the start of a sentence goes too", !/Mark/.test(clean), clean);
check("ordinary openers and feeling words at the start stay", /Had coffee/.test(clean) && /Great day/.test(clean), clean);
check("phone numbers, emails and addresses go", !/415|555|gmail|Pine/.test(clean), clean);
check("days, I and ordinary words stay", /Monday/.test(clean) && /I felt good/.test(clean), clean);
check("the person's own name goes wherever it is", deidentify("david here, Facada again", ["David Facada"]) === "[name] here, [name] again");
check("bright words read bright", phoneTone("Such a good day, I feel calm and grateful") > 0.4);
check("heavy words read heavy", phoneTone("Tired and stressed, a rough day") < -0.4);
check("not good is not good", phoneTone("It was not good") < 0);
check("no feeling words, no tone", phoneTone("Went to the shop and came back") === null);
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const sent = shuffleForSending(days.slice(0, 6).map((day) => ({ day, text: day })), rnd);
check("labels carry no date and map back on the phone", sent.items.every((x) => !/2026/.test(x.id)) && sent.items.every((x) => sent.back[x.id] === x.text));
check("the order is shuffled", sent.items.map((x) => x.text).join() !== days.slice(0, 6).join());
check("a fingerprint changes with the words", fingerprint("a b") !== fingerprint("a c") && fingerprint("a b") === fingerprint("a b"));

console.log("no food targets (someone on their own meals)");
const noTargets = { ...DEFAULT_SETTINGS, goals: { ...DEFAULT_SETTINGS.goals, kcal: 0, protein: 0, carbs: 0, fat: 0 } };
const lowProtein = Object.fromEntries(Object.entries(map).map(([k, d], i) => [k, { ...d, log: { ...d.log, meals: { ...d.log.meals, breakfast: { ...meal, protein: i < 6 ? 200 : 0 } } } }]));
check("with a target, protein can be a finding", [...greatDays(lowProtein, days, DEFAULT_SETTINGS, main, null).lifts].some((d) => d.key === "protein"));
check("without one, protein is never a finding", ![...greatDays(lowProtein, days, noTargets, main, null).lifts, ...greatDays(lowProtein, days, noTargets, main, null).drags].some((d) => d.key === "protein"));
check("…and the week's comparison has no protein row", !weekCompare(wk, noTargets, "2026-10-14").rows.some((r) => r.label === "Protein goal hit"));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
