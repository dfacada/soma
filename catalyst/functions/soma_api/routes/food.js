// The food estimator. You type what you ate in plain words; Claude Haiku answers with calories and the three
// macros, which the browser shows for correction before anything is logged.
//
// The browser asks only for what it cannot answer itself: it matches the plan, the recipe book, the quick snacks
// and the last 60 days of off-plan items first, so repeats never reach this route (docs/HANDOFF.md §6).
//
//   POST /food/estimate   { text }  → { name, kcal, protein, carbs, fat, note }
//
// Food is server-readable in Soma (leaderboards, admin fixes), so the words typed here leave the device like the
// rest of the food log. Journal text never does. The text is not written to any log.

'use strict';

const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError } = require('../lib/db');
const { writeLog } = require('../lib/log');

const router = express.Router();
const MODEL = 'claude-haiku-4-5';
const TEXT_MAX = 200;
const MAX_TOKENS = 400;

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
  if (start < 0 || end < start) throw new HttpError(502, 'the estimate came back in a form Soma could not read');
  try { return JSON.parse(text.slice(start, end + 1)); }
  catch (_e) { throw new HttpError(502, 'the estimate came back in a form Soma could not read'); }
}

router.post('/food/estimate', member, wrap(async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(503, 'the food estimator is not set up on the server yet');
  const text = String((req.body || {}).text || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new HttpError(400, 'say what you ate');
  if (text.length > TEXT_MAX) throw new HttpError(413, `keep it under ${TEXT_MAX} characters`);

  // Required only here, so no other route pays for loading it on a cold start.
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new (Anthropic.default || Anthropic)({ apiKey: key, maxRetries: 1, timeout: 20000 });
  const request = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    messages: [{ role: 'user', content: text }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } }
  };

  const started = Date.now();
  let message;
  try {
    message = await client.messages.create(request);
  } catch (e) {
    // A model that will not take a schema still answers JSON when asked plainly; anything else is a real failure.
    if (e && e.status === 400) {
      delete request.output_config;
      request.system = SYSTEM + ' Answer with one JSON object and nothing else: {"name","kcal","protein","carbs","fat","note"}.';
      message = await client.messages.create(request).catch((e2) => { throw e2; });
    } else if (e && (e.status === 429 || e.status === 529)) {
      await writeLog(req.admin, { level: 'warn', source: 'api', area: 'food', event: 'estimate_busy', message: String(e.message).slice(0, 200), status: e.status, userId: req.user.id, test: req.user.id === '999000000000000001' });
      throw new HttpError(503, 'the estimator is busy; try again in a moment');
    } else {
      throw new HttpError(502, 'the estimator could not be reached');
    }
  }

  if (message.stop_reason === 'refusal') throw new HttpError(422, 'the estimator would not answer that one; type the numbers yourself');
  const out = clean(readJson(message), text);
  const usage = message.usage || {};
  console.log(JSON.stringify({ action: 'food_estimate', ms: Date.now() - started, chars: text.length, in: usage.input_tokens, out: usage.output_tokens, kcal: out.kcal }));
  res.json(out);
}));

module.exports = router;
module.exports.clean = clean;
module.exports.readJson = readJson;
