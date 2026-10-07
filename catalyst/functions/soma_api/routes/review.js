// The week in review: what the journal said, written up once a week (David, 2026-10-07: "mainly for the journal
// notes, I want them to be analyzed and I want to remember the important things that were mentioned during the week").
//
// The journal is encrypted with the vault key, so the server cannot read it and this cannot be a cron. The browser
// decrypts the week's entries, sends the text here, and this function passes it to Claude and hands the writing
// back. **Nothing of it is stored or logged here**: not the entries, not the review, not a line of either in an
// error. What comes back is encrypted in the browser and stored as ciphertext (`/reviews`), like the journal itself.
// Turning this on is the person's choice (settings.weeklyReview.consent), as with cloud transcription.
//
//   POST /review/write    { entries: [{ day, text }], numbers } → { synopsis, remember[], threads[], noticed[] }
//   POST /review/speak    { text }                             → audio/wav, the review read aloud
//   GET  /reviews?from&to                                      → [{ weekStart, ciphertext, hasAudio, createdMs }]
//   PUT  /reviews/:weekStart  { ciphertext, hasAudio }
//   DELETE /reviews/:weekStart

'use strict';

const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError, select, upsert, needId, needDay, fitText } = require('../lib/db');
const { writeLog } = require('../lib/log');

const router = express.Router();
const MODEL = 'claude-opus-5';
const MAX_CHARS = 60000;      // a week of talking, with room to spare
const MAX_ENTRIES = 60;
// 700 characters is read without complaint; 1,000 comes back as "request too large" (measured 2026-10-07).
const SPEAK_MAX = 700;        // one request of speech; the browser sends the review a piece at a time
const GROQ_SPEECH = 'https://api.groq.com/openai/v1/audio/speech';
const TTS_MODEL = 'canopylabs/orpheus-v1-english';
const TTS_VOICE = 'troy';

const note = (req, event, message, detail, level) => writeLog(req.admin, {
  level: level || 'error', source: 'api', area: 'review', event, message, detail,
  userId: req.user.id, test: req.user.id === '999000000000000001'
});

const SYSTEM = [
  "You write one person's week in review from their own voice journal. You are the only reader they have, and they",
  'asked for this to remember what mattered, so be concrete and specific: names, decisions, plans, numbers and',
  'phrases they used. Write to them as "you", in plain words, warm but unsentimental. Never flatter, never diagnose,',
  'never give medical or therapeutic advice, and never invent anything that is not in the entries.',
  '',
  'synopsis: 2 to 4 short paragraphs telling the week back to them, in the order it happened where that is clear.',
  'remember: the specific things worth keeping, one line each - a decision made, a promise given, a name, an idea,',
  'a date, something they said they would do. Quote their own words where it helps. Leave it empty if there is',
  'genuinely nothing specific.',
  'threads: what came up more than once across the week, one line each, naming which days.',
  'noticed: at most three observations that hold the journal next to the numbers given, said as a pattern in the',
  'record and never as a cause. If the numbers say nothing useful, return none rather than reaching.',
].join(' ');

const SCHEMA = {
  type: 'object',
  properties: {
    synopsis: { type: 'string' },
    remember: { type: 'array', items: { type: 'string' } },
    threads: { type: 'array', items: { type: 'string' } },
    noticed: { type: 'array', items: { type: 'string' } }
  },
  required: ['synopsis', 'remember', 'threads', 'noticed'],
  additionalProperties: false
};

/** Nothing the model returns is trusted: the shape is forced, the lengths are capped. */
function clean(raw) {
  const line = (v) => String(v == null ? '' : v).trim().slice(0, 400);
  const list = (v) => (Array.isArray(v) ? v.map(line).filter(Boolean).slice(0, 12) : []);
  return {
    synopsis: String(raw && raw.synopsis ? raw.synopsis : '').trim().slice(0, 4000),
    remember: list(raw && raw.remember),
    threads: list(raw && raw.threads),
    noticed: list(raw && raw.noticed).slice(0, 3)
  };
}

function readJson(message) {
  if (message.parsed_output) return message.parsed_output;
  const text = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new HttpError(502, 'the review came back in a form Soma could not read');
  try { return JSON.parse(text.slice(start, end + 1)); }
  catch (_e) { throw new HttpError(502, 'the review came back in a form Soma could not read'); }
}

router.post('/review/write', member, wrap(async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(503, 'the weekly review is not set up on the server yet');
  const body = req.body || {};
  const entries = Array.isArray(body.entries) ? body.entries.slice(0, MAX_ENTRIES) : [];
  if (!entries.length) throw new HttpError(400, 'no entries to review');

  let total = 0;
  const written = [];
  for (const e of entries) {
    const day = typeof e.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.day) ? e.day : null;
    const text = String(e.text || '').trim();
    if (!day || !text) continue;
    total += text.length;
    if (total > MAX_CHARS) break;
    written.push({ day, text, mood: typeof e.mood === 'string' ? e.mood.slice(0, 20) : null });
  }
  if (!written.length) throw new HttpError(400, 'those entries have nothing written in them yet');

  const numbers = body.numbers && typeof body.numbers === 'object' ? JSON.stringify(body.numbers).slice(0, 2000) : '{}';
  const diary = written.map((e) => `[${e.day}${e.mood ? ' · felt ' + e.mood : ''}]\n${e.text}`).join('\n\n');

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new (Anthropic.default || Anthropic)({ apiKey: key, maxRetries: 1, timeout: 120000 });
  const started = Date.now();
  let message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Here is my week. The numbers are from the app, the entries are mine.\n\nNumbers: ${numbers}\n\nEntries:\n\n${diary}` }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA }, effort: 'medium' }
    });
  } catch (e) {
    const status = e && e.status;
    // The message carries the person's own words; only its shape is ever logged.
    await note(req, 'write_failed', 'Claude could not write the review', { status: status || null, entries: written.length, chars: total }, status === 429 || status === 529 ? 'warn' : 'error');
    if (status === 429 || status === 529) throw new HttpError(503, 'the writer is busy; try again in a moment');
    throw new HttpError(502, 'the review could not be written just now');
  }

  if (message.stop_reason === 'refusal') {
    await note(req, 'write_refused', 'the model declined to write this week', { entries: written.length }, 'warn');
    throw new HttpError(422, 'the writer would not take this week on. Nothing was saved.');
  }
  const out = clean(readJson(message));
  if (!out.synopsis) throw new HttpError(502, 'the review came back empty');
  const usage = message.usage || {};
  console.log(JSON.stringify({ action: 'review_write', ms: Date.now() - started, entries: written.length, chars: total, in: usage.input_tokens, out: usage.output_tokens }));
  res.json(out);
}));

router.post('/review/speak', member, wrap(async (req, res) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new HttpError(503, 'reading aloud is not set up on the server yet');
  const text = String((req.body || {}).text || '').trim();
  if (!text) throw new HttpError(400, 'nothing to read');
  if (text.length > SPEAK_MAX) throw new HttpError(413, `send at most ${SPEAK_MAX} characters at a time`);

  let answer;
  try {
    answer = await fetch(GROQ_SPEECH, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: text, response_format: 'wav' }),
      signal: AbortSignal.timeout(90000)
    });
  } catch (_e) {
    await note(req, 'speak_unreachable', 'the speech service did not answer', { chars: text.length });
    throw new HttpError(502, 'the voice could not be reached');
  }
  if (!answer.ok) {
    const detail = (await answer.text().catch(() => '')).slice(0, 200);
    await note(req, 'speak_failed', 'the speech service refused', { status: answer.status, detail }, answer.status === 429 ? 'warn' : 'error');
    throw new HttpError(answer.status === 429 ? 503 : 502, answer.status === 429 ? 'the voice is busy; try again in a moment' : 'the voice could not read that');
  }
  const audio = Buffer.from(await answer.arrayBuffer());
  console.log(JSON.stringify({ action: 'review_speak', chars: text.length, bytes: audio.length }));
  res.set('Content-Type', 'audio/wav').send(audio);
}));

// ── The reviews themselves: ciphertext in, ciphertext out. ──
const B64 = /^[A-Za-z0-9+/=]+$/;
const ukey = (userId, week) => needId(userId) + ':' + week;

router.get('/reviews', member, wrap(async (req, res) => {
  const { from, to } = req.query;
  const where = from && to ? ` AND week_start >= '${needDay(from)}' AND week_start <= '${needDay(to)}'` : '';
  const rows = await select(req.admin, 'reviews',
    `SELECT week_start, ciphertext, has_audio, created_ms FROM reviews WHERE user_id = ${needId(req.user.id)}${where} ORDER BY week_start DESC LIMIT 60`);
  res.json({ reviews: rows.map((r) => ({ weekStart: r.week_start, ciphertext: r.ciphertext, hasAudio: r.has_audio === true || r.has_audio === 'true', createdMs: Number(r.created_ms) || null })) });
}));

router.put('/reviews/:weekStart', member, wrap(async (req, res) => {
  const week = needDay(req.params.weekStart);
  const b = req.body || {};
  const ciphertext = fitText('ciphertext', b.ciphertext, 10000);
  if (!ciphertext || !B64.test(ciphertext)) throw new HttpError(400, 'ciphertext must be base64');
  const key = ukey(req.user.id, week);
  await upsert(req.admin, 'reviews', `SELECT ROWID FROM reviews WHERE ukey = '${key}'`, {
    user_id: req.user.id, week_start: week, ukey: key, ciphertext,
    has_audio: b.hasAudio === true ? 'true' : 'false', created_ms: Date.now()
  });
  res.json({ ok: true, weekStart: week });
}));

router.delete('/reviews/:weekStart', member, wrap(async (req, res) => {
  const rows = await select(req.admin, 'reviews', `SELECT ROWID FROM reviews WHERE ukey = '${ukey(req.user.id, needDay(req.params.weekStart))}'`);
  for (const r of rows) await req.admin.datastore().table('reviews').deleteRow(r.ROWID);
  res.json({ removed: rows.length });
}));

module.exports = router;
module.exports.clean = clean;
module.exports.readJson = readJson;
