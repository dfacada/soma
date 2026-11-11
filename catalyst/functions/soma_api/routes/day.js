// Say your day (David, 2026-11-11): one recording that fills in the day. The browser records a journal entry, has
// it written down (routes/jobs.js, entry ids day_…), and sends the words here; Claude Haiku picks out the weight,
// the mood, the habits, the food and the moves, which the browser shows as a list to check. Nothing is logged
// until the person taps Fill in my day, and that goes through the ordinary day routes (routes/days.js).
//
//   POST /day/describe  { text, moods[], habits[], moves[], known[] }
//     → { weight, mood, habits[], counts[], food[], moves[] }
//
// The words are what someone said into their journal, so this is journal text. It comes here only when they have
// switched Say your day on (settings.sayDay, off by default), and that is checked here too, not only in the
// browser. The request to Claude carries Dayhub's own key and nothing about the account: no user id, no metadata.
// **Nothing of it is stored or logged**: not the words, not the answer, not a line of either in an error. What is
// logged is shapes and counts. The words themselves are kept only in the journal entry, which the browser encrypts.
//
// Their own mood words, habit names and move names go along, so "I feel great" comes back as their mood "Great"
// and "forty push-ups" as their move. Nothing the model returns is trusted: every value is checked against those
// lists and clamped to what a day can hold.

'use strict';

const express = require('express');
const { member, wrap, isTestUser } = require('../lib/auth');
const { HttpError, select, needId, unpackJson } = require('../lib/db');
const { writeLog } = require('../lib/log');
const { spend } = require('../lib/quota');
const { cleanDay, knownLines } = require('./food');

const router = express.Router();
// Haiku 5.5 thinks before it answers and the thinking counts toward max_tokens: effort low keeps it quick, and the
// cap leaves room for the thinking as well as a long day's answer.
const MODEL = 'claude-haiku-5-5';
const EFFORT = 'low';
const MAX_TOKENS = 5000;
// About twenty minutes of talking. The browser sends no more than this (src/lib/say-day.ts DAY_TEXT_MAX).
const TEXT_MAX = 20000;
const MOODS_MAX = 16;
const HABITS_MAX = 12;
const MOVES_MAX = 12;
const HEARD_MOVES_MAX = 12;
// How many items of a list sent along are looked at, usable or not.
const LOOK_MAX = 64;
// The most one day can hold, per unit (lib/moves.js says the same when the day is saved).
const AMOUNT_MAX = { km: 500, min: 1440, reps: 100000 };
const MOVE_UNITS = ['reps', 'km', 'min', 'session'];
const OTHER = 'other';

const note = (req, event, message, detail, level) => writeLog(req.admin, {
  level: level || 'error', source: 'api', area: 'day', event, message, detail,
  userId: req.user.id, test: isTestUser(req)
});

const SYSTEM = [
  'A person has talked through one day out loud, usually today, and you are given the transcript.',
  'Pick out only what they plainly say about the things below. Everything else is their private journal: leave it',
  'alone and never comment on it. Leave out what they say about any other day, plans, and things they did not do.',
  'When something is not said, leave it out: an empty answer is a good answer. Never guess.',
  '',
  'weight: their own body weight that day in pounds, when they say it. Kilograms become pounds. 0 when they do not',
  'say it. Never take another number for it.',
  'mood: how they say they feel about the day, as one of their own moods listed after MOODS, spelled exactly as',
  'listed. Only when their words clearly fit one of them; otherwise an empty string.',
  'habits: the ids of the habits listed after HABITS that they say they did. counts: for a habit marked',
  '"a count", how many they say they had.',
  'food: what they say they ate or drank. One item per dish or drink they name: "a burger with a salad" is two',
  'items, "bacon, egg and cheese on a bagel" is one. meal: breakfast, lunch, snack or dinner when they say so or it',
  'is plain from what they say ("this morning" is breakfast); extra when they do not say which meal. Never guess a',
  'meal from the food alone. If an item is one of their known foods (listed after KNOWN), use that name and those',
  'numbers exactly. Otherwise give your best single estimate, never a range, for an ordinary portion unless they',
  'give an amount: kcal, protein, carbs and fat for the whole item. name: at most 6 words, their words,',
  'capitalised normally. note: at most 10 words on the portion you assumed, "your usual" for a known food, or empty.',
  'moves: exercise or activity they say they did. key: the key of the matching move listed after MOVES, or "other"',
  'when it is not on the list. amount and unit as they said it: reps, km (miles become km) or min. When they give',
  'no amount, or the move is a session, unit "session" and amount 1. Never invent an amount, and never count steps.',
  'label: for "other", what it was in at most 3 words; otherwise empty.'
].join('\n');

const FOOD_ITEM = {
  type: 'object',
  properties: {
    meal: { type: 'string', enum: ['breakfast', 'lunch', 'snack', 'dinner', 'extra'] },
    name: { type: 'string' },
    kcal: { type: 'integer' },
    protein: { type: 'integer' },
    carbs: { type: 'integer' },
    fat: { type: 'integer' },
    note: { type: 'string' }
  },
  required: ['meal', 'name', 'kcal', 'protein', 'carbs', 'fat', 'note'],
  additionalProperties: false
};

const SCHEMA = {
  type: 'object',
  properties: {
    weight: { type: 'number' },
    mood: { type: 'string' },
    habits: { type: 'array', items: { type: 'string' } },
    counts: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, n: { type: 'integer' } }, required: ['id', 'n'], additionalProperties: false }
    },
    food: { type: 'array', items: FOOD_ITEM },
    moves: {
      type: 'array',
      items: {
        type: 'object',
        properties: { key: { type: 'string' }, amount: { type: 'number' }, unit: { type: 'string', enum: MOVE_UNITS }, label: { type: 'string' } },
        required: ['key', 'amount', 'unit', 'label'],
        additionalProperties: false
      }
    }
  },
  required: ['weight', 'mood', 'habits', 'counts', 'food', 'moves'],
  additionalProperties: false
};

const line = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

/** What they said, as one line of text. Empty is a 400 and too long a 413: the browser cuts before it sends. */
function cleanText(body) {
  const text = typeof (body || {}).text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
  if (!text) throw new HttpError(400, 'there were no words in that');
  if (text.length > TEXT_MAX) throw new HttpError(413, `keep it under ${TEXT_MAX} characters`);
  return text;
}

/** The person's own lists as sent, made safe to put in a prompt and to check the answer against: short plain
 *  lines, known shapes, no repeats. Anything odd is left out, never an error. */
function cleanLists(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const moods = [];
  for (const m of list(b.moods, LOOK_MAX)) {
    const label = line(m, 20);
    if (label && !moods.some((x) => x.toLowerCase() === label.toLowerCase())) moods.push(label);
    if (moods.length >= MOODS_MAX) break;
  }
  const habits = [];
  for (const h of list(b.habits, LOOK_MAX)) {
    if (!h || typeof h !== 'object' || Array.isArray(h)) continue;
    const id = typeof h.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/.test(h.id) ? h.id : '';
    const label = line(h.label, 40);
    if (id && label && !habits.some((x) => x.id === id)) habits.push({ id, label, counter: h.counter === true });
    if (habits.length >= HABITS_MAX) break;
  }
  const moves = [];
  for (const m of list(b.moves, LOOK_MAX)) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
    const key = typeof m.key === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(m.key) ? m.key : '';
    const name = line(m.name, 30);
    // Steps arrive from a tracker and "other" is the catch-all: neither is a move to match words against.
    if (!key || key === OTHER || key === 'steps' || !name || !MOVE_UNITS.includes(m.unit) || moves.some((x) => x.key === key)) continue;
    moves.push({ key, name, unit: m.unit });
    if (moves.length >= MOVES_MAX) break;
  }
  return { moods, habits, moves };
}

/** The lists as the prompt carries them, one per line under a heading. */
function listLines({ moods, habits, moves }) {
  const parts = [];
  parts.push('MOODS\n' + (moods.length ? moods.join('\n') : '(none)'));
  parts.push('HABITS\n' + (habits.length ? habits.map((h) => `${h.id}: ${h.label}${h.counter ? ' (a count)' : ''}`).join('\n') : '(none)'));
  parts.push('MOVES\n' + (moves.length ? moves.map((m) => `${m.key}: ${m.name} (${m.unit === 'session' ? 'a session' : m.unit})`).join('\n') : '(none)'));
  return parts.join('\n\n');
}

/**
 * The model's answer, made safe. A weight outside what a person weighs is dropped; a mood must be one of theirs,
 * and comes back in their spelling; a habit must be one of theirs, of the right kind; food is cleaned like a day
 * said on Food; a move not on their list becomes "other", an amount is kept inside what a day can hold, and no
 * amount means it was done and no more than that.
 */
function cleanHeard(raw, lists) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const w = Math.round(Number(r.weight) * 10) / 10;
  const weight = Number.isFinite(w) && w >= 50 && w <= 700 ? w : null;

  const said = line(r.mood, 40).toLowerCase();
  const mood = (said && lists.moods.find((m) => m.toLowerCase() === said)) || null;

  const daily = new Set(lists.habits.filter((h) => !h.counter).map((h) => h.id));
  const counters = new Set(lists.habits.filter((h) => h.counter).map((h) => h.id));
  const habits = [];
  for (const id of list(r.habits, HABITS_MAX * 2)) if (typeof id === 'string' && daily.has(id) && !habits.includes(id)) habits.push(id);
  const counts = [];
  for (const c of list(r.counts, HABITS_MAX * 2)) {
    const id = c && typeof c.id === 'string' ? c.id : '';
    const n = Math.round(Number(c && c.n));
    // A check-in counter runs from 1 to 9 (Today's chip wraps at ten).
    if (counters.has(id) && Number.isFinite(n) && n >= 1 && !counts.some((x) => x.id === id)) counts.push({ id, n: Math.min(n, 9) });
  }

  const food = cleanDay({ items: r.food });

  const moves = [];
  for (const x of list(r.moves, HEARD_MOVES_MAX * 2)) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
    const given = line(x.key, 40);
    const g = given.toLowerCase();
    if (!g || g === 'steps') continue;
    // By its key, or by its name when the model answered with that instead.
    const mine = lists.moves.find((m) => m.key === g) || lists.moves.find((m) => m.name.toLowerCase() === g);
    const key = mine ? mine.key : OTHER;
    if (key !== OTHER && moves.some((m) => m.key === key)) continue;
    let u = MOVE_UNITS.includes(x.unit) ? x.unit : 'session';
    let n = Number(x.amount);
    if (u === 'session' || !Number.isFinite(n) || n <= 0) { u = 'session'; n = null; }
    else {
      n = Math.min(u === 'km' ? Math.round(n * 100) / 100 : Math.round(n), AMOUNT_MAX[u]);
      if (!n) { u = 'session'; n = null; }
    }
    // A move that is not on their list is named by its label, or by what the model called it.
    const label = key === OTHER ? (line(x.label, 40) || (g === OTHER ? '' : given)) : '';
    moves.push({ key, n, u, label });
    if (moves.length >= HEARD_MOVES_MAX) break;
  }
  return { weight, mood, habits, counts, food, moves };
}

/** The JSON in the answer, whether it came back as a structured output or as text. Null when there is none. */
function readJson(message) {
  if (message.parsed_output) return message.parsed_output;
  const text = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch (_e) { return null; }
}

router.post('/day/describe', member, wrap(async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(503, 'Say your day is not set up on the server yet');

  // The switch is checked here too, not only in the browser: no journal words go to Claude without it.
  const rows = await select(req.admin, 'profiles', `SELECT settings_json FROM profiles WHERE user_id = ${needId(req.user.id)}`);
  if ((unpackJson(rows[0] && rows[0].settings_json, {}) || {}).sayDay !== true) throw new HttpError(403, 'Say your day is switched off in Settings');

  const text = cleanText(req.body);
  const lists = cleanLists(req.body);
  const known = knownLines((req.body || {}).known);
  await spend(req, 'day');

  const content = `${listLines(lists)}${known ? '\n\nKNOWN\n' + known : ''}\n\nWHAT THEY SAID\n${text}`;
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new (Anthropic.default || Anthropic)({ apiKey: key, maxRetries: 1, timeout: 24000 });
  const started = Date.now();
  let message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA }, effort: EFFORT }
    });
  } catch (e) {
    const status = e && e.status;
    const busy = status === 429 || status === 529;
    // The request carries the person's own words, and an error can quote them: only its shape is ever logged.
    await note(req, 'describe_failed', 'Claude could not read the day', { status: status || null, chars: text.length, ms: Date.now() - started }, busy ? 'warn' : 'error');
    if (busy) throw new HttpError(503, 'busy; try again in a moment');
    throw new HttpError(502, 'that could not be read just now');
  }
  if (message.stop_reason === 'refusal') {
    await note(req, 'describe_refused', 'the model declined', { chars: text.length }, 'warn');
    throw new HttpError(422, 'that one could not be read. Fill the day in by hand');
  }
  const raw = readJson(message);
  if (!raw) {
    await note(req, 'describe_unreadable', 'the answer was not JSON', { chars: text.length, stop: String(message.stop_reason || '').slice(0, 20) }, 'warn');
    throw new HttpError(502, 'that could not be read just now');
  }
  const out = cleanHeard(raw, lists);
  const usage = message.usage || {};
  console.log(JSON.stringify({
    action: 'day_describe', ms: Date.now() - started, chars: text.length, weight: out.weight !== null, mood: out.mood !== null,
    habits: out.habits.length + out.counts.length, food: out.food.length, moves: out.moves.length, in: usage.input_tokens, out: usage.output_tokens
  }));
  res.json(out);
}));

module.exports = router;
module.exports.cleanText = cleanText;
module.exports.cleanLists = cleanLists;
module.exports.listLines = listLines;
module.exports.cleanHeard = cleanHeard;
module.exports.TEXT_MAX = TEXT_MAX;
