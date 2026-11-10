// The food estimator. You type what you ate in plain words; Claude Haiku answers with calories and the three
// macros, which the browser shows for correction before anything is logged.
//
// The browser asks only for what it cannot answer itself: it matches the plan, the recipe book, the quick snacks
// and the last 60 days of off-plan items first, so repeats never reach this route (docs/HANDOFF.md §6).
//
//   POST /food/estimate   { text }  → { name, kcal, protein, carbs, fat, note }
//   POST /food/describe   { text, known }  → { items: [{ meal, name, kcal, protein, carbs, fat, note }] }
//
// describe takes a whole day said in one go ("bacon, egg and cheese on an everything bagel and small fries for
// breakfast, a burger with a salad for lunch") and splits it into items, each with the meal it was for. `known` is
// the person's own foods (plan, snacks, recent items) so "my shake" comes back with their numbers, not a guess.
//
// Food is server-readable in Dayhub (leaderboards, admin fixes), so the words typed here leave the device like the
// rest of the food log. Journal text never does. The text is not written to any log.

'use strict';

const express = require('express');
const { member, wrap, isTestUser } = require('../lib/auth');
const { HttpError } = require('../lib/db');
const { writeLog } = require('../lib/log');
const { spend } = require('../lib/quota');

const router = express.Router();
// Haiku 5.5 thinks before it answers unless told otherwise, and the thinking counts toward max_tokens: effort low
// keeps a food lookup quick, and the caps leave room for the thinking as well as the answer.
const MODEL = 'claude-haiku-5-5';
const EFFORT = 'low';
const TEXT_MAX = 200;
const MAX_TOKENS = 1500;

const SYSTEM = [
  'You estimate the nutrition of food a person says they ate. Answer with your best single estimate, never a range.',
  'Assume ordinary home or restaurant portions when no amount is given, and say what you assumed in the note.',
  'kcal, protein, carbs and fat are for the whole thing described, not per serving or per 100 g.',
  'name: what they ate, in at most 5 words, in their own words, capitalised normally.',
  'note: at most 12 words on the portion you assumed, or empty when they gave exact amounts.',
  'If the text is not food or drink at all, answer with kcal 0, macros 0, and note "not a food".'
].join(' ');

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    kcal: { type: 'integer' },
    protein: { type: 'integer' },
    carbs: { type: 'integer' },
    fat: { type: 'integer' },
    note: { type: 'string' }
  },
  required: ['name', 'kcal', 'protein', 'carbs', 'fat', 'note'],
  additionalProperties: false
};

/** Nothing the model returns is trusted: clamp to what a single meal can plausibly be, and keep the shape exact. */
function clean(raw, text) {
  const num = (v, max) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0;
  };
  const name = String(raw && raw.name ? raw.name : text).trim().slice(0, 80) || text.slice(0, 80);
  return {
    name,
    kcal: num(raw && raw.kcal, 5000),
    protein: num(raw && raw.protein, 400),
    carbs: num(raw && raw.carbs, 800),
    fat: num(raw && raw.fat, 400),
    note: String((raw && raw.note) || '').trim().slice(0, 100)
  };
}

/** The JSON in a response, whether it came back as a structured output or as text. */
function readJson(message) {
  if (message.parsed_output) return message.parsed_output;
  const text = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new HttpError(502, 'the estimate came back in a form Dayhub could not read');
  try { return JSON.parse(text.slice(start, end + 1)); }
  catch (_e) { throw new HttpError(502, 'the estimate came back in a form Dayhub could not read'); }
}

/** One structured call to Haiku. A model that will not take a schema is asked plainly for JSON instead; a busy or
 *  unreachable model, or a refusal, becomes a sentence the person sees. */
async function ask(req, { system, content, schema, maxTokens, plainShape, event }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(503, 'the food estimator is not set up on the server yet');
  // Required only here, so no other route pays for loading it on a cold start.
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new (Anthropic.default || Anthropic)({ apiKey: key, maxRetries: 1, timeout: 20000 });
  const request = { model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }], output_config: { format: { type: 'json_schema', schema }, effort: EFFORT } };

  let message;
  try {
    message = await client.messages.create(request);
  } catch (e) {
    if (e && e.status === 400) {
      delete request.output_config;
      request.system = system + ' Answer with one JSON object and nothing else: ' + plainShape + '.';
      message = await client.messages.create(request);
    } else if (e && (e.status === 429 || e.status === 529)) {
      await writeLog(req.admin, { level: 'warn', source: 'api', area: 'food', event, message: String(e.message).slice(0, 200), status: e.status, userId: req.user.id, test: isTestUser(req) });
      throw new HttpError(503, 'the estimator is busy; try again in a moment');
    } else {
      throw new HttpError(502, 'the estimator could not be reached');
    }
  }
  if (message.stop_reason === 'refusal') throw new HttpError(422, 'the estimator would not answer that one; type the numbers yourself');
  return message;
}

const cleanText = (body, max) => {
  const text = String((body || {}).text || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new HttpError(400, 'say what you ate');
  if (text.length > max) throw new HttpError(413, `keep it under ${max} characters`);
  return text;
};

router.post('/food/estimate', member, wrap(async (req, res) => {
  const text = cleanText(req.body, TEXT_MAX);
  await spend(req, 'food');
  const started = Date.now();
  const message = await ask(req, { system: SYSTEM, content: text, schema: SCHEMA, maxTokens: MAX_TOKENS, plainShape: '{"name","kcal","protein","carbs","fat","note"}', event: 'estimate_busy' });
  const out = clean(readJson(message), text);
  const usage = message.usage || {};
  console.log(JSON.stringify({ action: 'food_estimate', ms: Date.now() - started, chars: text.length, in: usage.input_tokens, out: usage.output_tokens, kcal: out.kcal }));
  res.json(out);
}));

// ── A whole day, said in one go.

const DAY_TEXT_MAX = 1500;
const DAY_ITEMS_MAX = 20;
const KNOWN_MAX = 60;
const SLOTS = ['breakfast', 'lunch', 'snack', 'dinner', 'extra'];

const DAY_SYSTEM = [
  'A person tells you, in their own words, what they ate today. Split it into separate items and estimate each one.',
  'One item per dish or drink they name: "a burger with a salad" is two items, "bacon, egg and cheese on an everything bagel" is one.',
  'meal: breakfast, lunch, snack or dinner when they say so or it is plain from what they say ("this morning" is breakfast);',
  'extra when they do not say which meal it was. Never guess a meal from the food alone.',
  'If an item is one of their known foods (listed after KNOWN), use that name and those numbers exactly.',
  'Otherwise give your best single estimate, never a range, for ordinary home or restaurant portions unless they give an amount,',
  'and kcal, protein, carbs and fat for the whole item. name: at most 6 words, their words, capitalised normally.',
  'note: at most 10 words on the portion you assumed, "your usual" for a known food, or empty.',
  'Leave out anything that is not food or drink. If there is no food at all, answer with an empty items list.'
].join(' ');

const DAY_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          meal: { type: 'string', enum: SLOTS },
          name: { type: 'string' },
          kcal: { type: 'integer' },
          protein: { type: 'integer' },
          carbs: { type: 'integer' },
          fat: { type: 'integer' },
          note: { type: 'string' }
        },
        required: ['meal', 'name', 'kcal', 'protein', 'carbs', 'fat', 'note'],
        additionalProperties: false
      }
    }
  },
  required: ['items'],
  additionalProperties: false
};

/** The model's day, made safe: at most 20 items, each clamped like a single estimate, an unknown meal made extra. */
function cleanDay(raw) {
  const items = Array.isArray(raw && raw.items) ? raw.items : [];
  return items.slice(0, DAY_ITEMS_MAX)
    .filter((x) => x && String(x.name || '').trim())
    .map((x) => Object.assign({ meal: SLOTS.includes(x.meal) ? x.meal : 'extra' }, clean(x, '')));
}

/** The person's own foods, one line each for the prompt: names cut short, numbers whole, at most 60. */
function knownLines(known) {
  if (!Array.isArray(known)) return '';
  const n = (v) => Math.min(Math.max(Math.round(Number(v)) || 0, 0), 5000);
  return known.slice(0, KNOWN_MAX)
    .filter((k) => k && typeof k.name === 'string' && k.name.trim())
    .map((k) => `${k.name.replace(/\s+/g, ' ').trim().slice(0, 60)}: ${n(k.kcal)} kcal, ${n(k.protein)} P, ${n(k.carbs)} C, ${n(k.fat)} F`)
    .join('\n');
}

router.post('/food/describe', member, wrap(async (req, res) => {
  const text = cleanText(req.body, DAY_TEXT_MAX);
  const known = knownLines((req.body || {}).known);
  await spend(req, 'food');
  const started = Date.now();
  const message = await ask(req, {
    system: DAY_SYSTEM,
    content: known ? `${text}\n\nKNOWN\n${known}` : text,
    schema: DAY_SCHEMA,
    maxTokens: 4000,
    plainShape: '{"items":[{"meal","name","kcal","protein","carbs","fat","note"}]}',
    event: 'describe_busy'
  });
  const items = cleanDay(readJson(message));
  const usage = message.usage || {};
  console.log(JSON.stringify({ action: 'food_describe', ms: Date.now() - started, chars: text.length, items: items.length, in: usage.input_tokens, out: usage.output_tokens }));
  res.json({ items });
}));

module.exports = router;
module.exports.clean = clean;
module.exports.readJson = readJson;
module.exports.cleanDay = cleanDay;
module.exports.knownLines = knownLines;
