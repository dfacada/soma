// Telegram, for the week in review (David, 2026-10-07: "the whole thing, text and audio"). One bot, @Soma_me_bot,
// and one chat per person.
//
// Pairing without a webhook or any stored state: Settings shows a code, the person sends it to the bot, and this
// function reads the bot's recent updates to find which chat said it. The code is an HMAC of the user id and a
// ten-minute window (the same trick as the Face ID challenges), so nothing has to be kept between the two calls.
// Only the chat id is stored, on the person's profile.
//
// What goes to Telegram is the person's own weekly review, which is a reading of their journal. That is their
// choice, made in Settings, and worth saying plainly: Telegram keeps whatever is sent to it.
//
//   GET    /telegram            { connected, chat }
//   POST   /telegram/code       → { code, bot, expiresMs }
//   POST   /telegram/pair       { code } → { connected, chat }   (reads getUpdates, finds the chat, says hello)
//   DELETE /telegram            forget the chat
//   POST   /telegram/send       { text, title?, speak? } → { sent, spoke }

'use strict';

const crypto = require('crypto');
const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError, select, needId } = require('../lib/db');
const { writeLog } = require('../lib/log');

const router = express.Router();
const WINDOW_MS = 10 * 60 * 1000;
const TEXT_MAX = 3900;        // Telegram's own limit is 4096; leave room for the title
const SPEAK_MAX = 1800;
const GROQ_SPEECH = 'https://api.groq.com/openai/v1/audio/speech';
const TTS_MODEL = 'canopylabs/orpheus-v1-english';
const TTS_VOICE = 'troy';

const note = (req, event, message, detail, level) => writeLog(req.admin, {
  level: level || 'error', source: 'api', area: 'telegram', event, message, detail,
  userId: req.user.id, test: req.user.id === '999000000000000001'
});

function token() {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new HttpError(503, 'Telegram is not set up on the server yet');
  return t;
}
function secret() {
  const s = process.env.PASSKEY_SECRET;
  if (!s) throw new HttpError(503, 'Telegram pairing is not set up on the server yet');
  return s;
}

/** A six-character code, true for this person for ten minutes, with nothing stored. */
function codeFor(userId, window) {
  const mac = crypto.createHmac('sha256', secret()).update(`telegram:${userId}:${window}`).digest('base64');
  return 'SOMA-' + mac.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
}

async function telegram(method, body, isForm) {
  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
      method: 'POST',
      headers: isForm ? undefined : { 'content-type': 'application/json' },
      body: isForm ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });
  } catch (_e) { throw new HttpError(502, 'Telegram did not answer'); }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.ok !== true) {
    const why = (json && json.description) || ('HTTP ' + res.status);
    const err = new HttpError(502, 'Telegram refused: ' + String(why).slice(0, 120));
    err.telegram = String(why).slice(0, 200);
    throw err;
  }
  return json.result;
}

// The profile with its chat, read here rather than through findProfile: that one selects the columns auth cares
// about and telegram_chat is not among them, which made every send answer "not connected" while the pairing sat
// in the row (David, 2026-10-07).
const mine = async (req) => (await select(req.admin, 'profiles',
  `SELECT ROWID, telegram_chat FROM profiles WHERE user_id = ${needId(req.user.id)}`))[0] || null;
const chatOf = (row) => (row && row.telegram_chat ? String(row.telegram_chat) : null);

router.get('/telegram', member, wrap(async (req, res) => {
  const row = await mine(req);
  const chat = chatOf(row);
  res.json({ connected: Boolean(chat), chat: chat ? '…' + chat.slice(-4) : null, configured: Boolean(process.env.TELEGRAM_BOT_TOKEN) });
}));

router.post('/telegram/code', member, wrap(async (req, res) => {
  const window = Math.floor(Date.now() / WINDOW_MS);
  res.json({ code: codeFor(req.user.id, window), bot: 'Soma_me_bot', expiresMs: (window + 1) * WINDOW_MS });
}));

router.post('/telegram/pair', member, wrap(async (req, res) => {
  const window = Math.floor(Date.now() / WINDOW_MS);
  // This window and the one before it, so a code typed just as the clock turns still works.
  const codes = [codeFor(req.user.id, window), codeFor(req.user.id, window - 1)];
  // Updates are not acknowledged: a second attempt can still see the message.
  const updates = await telegram('getUpdates', { limit: 100, timeout: 0, allowed_updates: ['message'] });
  const hit = (updates || []).filter((u) => u.message && typeof u.message.text === 'string')
    .reverse()
    .find((u) => codes.some((c) => u.message.text.toUpperCase().includes(c)));
  if (!hit) throw new HttpError(404, 'no message with that code yet. Send the code to the bot, then tap Connect again.');

  const chat = String(hit.message.chat.id).slice(0, 32);
  const row = await mine(req);
  if (!row) throw new HttpError(404, 'no profile');
  // One chat, one person: if someone else paired this chat, it moves here rather than serving two accounts.
  const others = await select(req.admin, 'profiles', `SELECT ROWID FROM profiles WHERE telegram_chat = '${chat}' AND user_id != ${needId(req.user.id)}`);
  for (const o of others) await req.admin.datastore().table('profiles').updateRow({ ROWID: o.ROWID, telegram_chat: null });
  await req.admin.datastore().table('profiles').updateRow({ ROWID: row.ROWID, telegram_chat: chat });
  await telegram('sendMessage', { chat_id: chat, text: 'Soma is connected. Your week in review will arrive here.' }).catch(() => undefined);
  console.log(JSON.stringify({ action: 'telegram_paired', user: req.user.id }));
  res.json({ connected: true, chat: '…' + chat.slice(-4) });
}));

router.delete('/telegram', member, wrap(async (req, res) => {
  const row = await mine(req);
  if (row && chatOf(row)) await req.admin.datastore().table('profiles').updateRow({ ROWID: row.ROWID, telegram_chat: null });
  res.json({ connected: false });
}));

/** The review, as a message and (when asked, and when the voice is available) as audio read aloud. */
router.post('/telegram/send', member, wrap(async (req, res) => {
  const row = await mine(req);
  const chat = chatOf(row);
  if (!chat) throw new HttpError(409, 'Telegram is not connected');
  const b = req.body || {};
  const text = String(b.text || '').trim();
  if (!text) throw new HttpError(400, 'nothing to send');
  if (text.length > TEXT_MAX) throw new HttpError(413, `keep it under ${TEXT_MAX} characters`);

  await telegram('sendMessage', { chat_id: chat, text, disable_web_page_preview: true });

  // The spoken version is a nicety: a week that cannot be read aloud still arrives as words.
  let spoke = false;
  if (b.speak === true && process.env.GROQ_API_KEY) {
    try {
      const said = text.slice(0, SPEAK_MAX);
      const answer = await fetch(GROQ_SPEECH, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: said, response_format: 'wav' }),
        signal: AbortSignal.timeout(90000)
      });
      if (!answer.ok) throw new Error('speech ' + answer.status + ' ' + (await answer.text().catch(() => '')).slice(0, 120));
      const audio = Buffer.from(await answer.arrayBuffer());
      const form = new FormData();
      form.append('chat_id', chat);
      form.append('title', String(b.title || 'Week in review').slice(0, 60));
      form.append('audio', new Blob([audio], { type: 'audio/wav' }), 'week-in-review.wav');
      await telegram('sendAudio', form, true);
      spoke = true;
    } catch (e) {
      await note(req, 'speak_failed', String(e.message || e).slice(0, 200), { chars: text.length }, 'warn');
    }
  }
  console.log(JSON.stringify({ action: 'telegram_sent', user: req.user.id, chars: text.length, spoke }));
  res.json({ sent: true, spoke });
}));

module.exports = router;
module.exports.codeFor = codeFor;
