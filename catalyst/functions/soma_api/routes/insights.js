// Insights: the tone of journal days, read by Claude (David, 2026-11-02: "when Claude reads them, there's no
// correlation to who they are"). Only when the person has chosen it (settings.journalInsights === 'claude'); the
// default reads the journal on the phone and never calls this.
//
// What arrives here has already been made anonymous in the browser (src/lib/journal-read.ts): names, emails, phone
// numbers, addresses and links are taken out, and the days come shuffled under random labels with no dates. This
// function adds nothing about the person: the request to Claude carries Soma's own key, no user id, no metadata,
// nothing from the account. **Nothing of it is stored or logged**: not the text, not the answer, not a word of
// either in an error. What goes back is a number and a few generic theme words per label, which the browser
// encrypts with the vault key before keeping.
//
//   POST /insights/journal-tone  { items: [{ id, text }] } → { items: [{ id, tone, themes[] }] }

'use strict';

const express = require('express');
const { member, wrap, isTestUser } = require('../lib/auth');
const { HttpError, select, needId, unpackJson } = require('../lib/db');
const { writeLog } = require('../lib/log');
const { spend } = require('../lib/quota');

const router = express.Router();
const MODEL = 'claude-haiku-5-5'; // thinks first unless told otherwise: effort low, and max_tokens with room for it
const MAX_ITEMS = 30;
const MAX_TEXT = 3000;
const MAX_CHARS = 60000;

const note = (req, event, message, detail, level) => writeLog(req.admin, {
  level: level || 'error', source: 'api', area: 'insights', event, message, detail,
  userId: req.user.id, test: isTestUser(req)
});

const SYSTEM = [
  'You read short, anonymous diary passages, each under a label, and say how each one sounds.',
  'tone: from -1 (a heavy, hard day) through 0 (flat or mixed) to 1 (a bright, good day), judged from how the writer',
  'sounds about their own day.',
  'themes: up to three topics the passage is about, each one to three plain lowercase words, the kind anyone could',
  'have written: "work", "family", "training", "sleep", "friends", "money", "a deadline". Never a name of a person,',
  'place, company or product, never a number, never a quote, never anything that could identify the writer. Text in',
  'square brackets was removed on purpose; do not guess what it was. Answer for every label you were given.',
].join(' ');

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, tone: { type: 'number' }, themes: { type: 'array', items: { type: 'string' } } },
        required: ['id', 'tone', 'themes'],
        additionalProperties: false
      }
    }
  },
  required: ['items'],
  additionalProperties: false
};

/** Only the labels that were sent, a clamped number, and themes that are plain words. */
function clean(raw, ids) {
  const out = [];
  for (const it of (raw && Array.isArray(raw.items) ? raw.items : [])) {
    const id = String(it && it.id || '');
    if (!ids.has(id)) continue;
    const tone = Math.max(-1, Math.min(1, Number(it.tone)));
    if (!Number.isFinite(tone)) continue;
    const themes = (Array.isArray(it.themes) ? it.themes : [])
      .map((t) => String(t || '').toLowerCase().trim())
      .filter((t) => /^[a-z][a-z' -]{1,30}$/.test(t) && t.split(' ').length <= 3)
      .slice(0, 3);
    out.push({ id, tone: Math.round(tone * 100) / 100, themes });
  }
  return out;
}

router.post('/insights/journal-tone', member, wrap(async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(503, 'journal insights are not set up on the server yet');

  // The choice is checked here too, not only in the browser.
  const rows = await select(req.admin, 'profiles', `SELECT ROWID, settings_json FROM profiles WHERE user_id = ${needId(req.user.id)}`);
  const settings = unpackJson(rows[0] && rows[0].settings_json, {});
  if (settings.journalInsights !== 'claude') throw new HttpError(403, 'reading the journal with Claude is switched off in Settings');

  const body = req.body || {};
  const given = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  const ids = new Set();
  const items = [];
  let total = 0;
  for (const it of given) {
    const id = String(it && it.id || '');
    const text = String(it && it.text || '').trim().slice(0, MAX_TEXT);
    if (!/^[a-z0-9]{1,8}$/.test(id) || !text || ids.has(id)) continue;
    total += text.length;
    if (total > MAX_CHARS) break;
    ids.add(id);
    items.push({ id, text });
  }
  if (!items.length) throw new HttpError(400, 'nothing to read');
  await spend(req, 'tone');

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new (Anthropic.default || Anthropic)({ apiKey: key, maxRetries: 1, timeout: 60000 });
  let message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: items.map((x) => `[${x.id}]\n${x.text}`).join('\n\n') }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA }, effort: 'low' }
    });
  } catch (e) {
    const status = e && e.status;
    // Only the shape, never the words.
    await note(req, 'tone_failed', 'Claude could not read the journal days', { status: status || null, items: items.length, chars: total }, status === 429 || status === 529 ? 'warn' : 'error');
    if (status === 429 || status === 529) throw new HttpError(503, 'busy; try again in a moment');
    throw new HttpError(502, 'the journal could not be read just now');
  }
  if (message.stop_reason === 'refusal') {
    await note(req, 'tone_refused', 'the model declined', { items: items.length }, 'warn');
    throw new HttpError(422, 'these days could not be read');
  }
  let raw = message.parsed_output;
  if (!raw) {
    const text = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    try { raw = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch (_e) { raw = null; }
  }
  const out = clean(raw, ids);
  if (!out.length) {
    await note(req, 'tone_unreadable', 'the answer had nothing usable', { items: items.length }, 'warn');
    throw new HttpError(502, 'the journal could not be read just now');
  }
  res.json({ items: out });
}));

module.exports = router;
module.exports.clean = clean;
