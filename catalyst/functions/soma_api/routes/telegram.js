// Telegram, for the week in review (David, 2026-10-07: "the whole thing, text and audio") and, since 2026-11-02,
// tomorrow's brief (words only, sent from the phone once it has read the brief). One bot, @Soma_me_bot, and one chat
// per person.
//
// Pairing without a webhook: Settings shows a code, the person sends it to the bot, and this function reads the
// bot's recent updates to find which chat said it. The code is an HMAC of the user id, a ten-minute window and the
// number of pairings the person has made (lib/pair-code.js), so no code is kept between the two calls and a code
// that has connected a chat never works again. The chat id and that count are all that is stored, on the profile.
//
// What goes to Telegram is the person's own weekly review, which is a reading of their journal. That is their
// choice, made in Settings, and worth saying plainly: Telegram keeps whatever is sent to it.
//
//   GET    /telegram            { connected, chat }
//   POST   /telegram/code       → { code, bot, expiresMs }
//   POST   /telegram/pair       { code } → { connected, chat }   (reads getUpdates, finds the chat, says hello)
//   DELETE /telegram            forget the chat
//   POST   /telegram/send       { text, title?, speak?, html? } → { sent, spoke }   html: text is Telegram HTML

'use strict';

const express = require('express');
const { member, wrap, isTestUser } = require('../lib/auth');
const { HttpError, select, needId } = require('../lib/db');
const { writeLog } = require('../lib/log');
const { spend } = require('../lib/quota');
const { join, seconds } = require('../lib/wav');
const { pairCode, WINDOW_MS } = require('../lib/pair-code');

const router = express.Router();
const TEXT_MAX = 3900;        // Telegram's own limit is 4096; leave room for the title
// Measured against the voice on 2026-10-07: 400 and 700 characters are read without complaint, 1,000 and more come
// back as "request too large", and several large pieces in a row trip the per-minute limit for the whole account.
const SPEAK_MAX = 600;
// A Catalyst function has 30 seconds to answer. Stop asking for more speech in time to still send what there is.
const SPEAK_BUDGET_MS = 18000;
const GROQ_SPEECH = 'https://api.groq.com/openai/v1/audio/speech';
const TTS_MODEL = 'canopylabs/orpheus-v1-english';
const TTS_VOICE = 'troy';

const note = (req, event, message, detail, level) => writeLog(req.admin, {
  level: level || 'error', source: 'api', area: 'telegram', event, message, detail,
  userId: req.user.id, test: isTestUser(req)
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

/** A six-character code, true for this person for ten minutes and for one pairing (`seq`, lib/pair-code.js). */
const codeFor = (userId, window, seq) => pairCode(secret(), userId, window, seq);

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
  `SELECT ROWID, telegram_chat, telegram_seq FROM profiles WHERE user_id = ${needId(req.user.id)}`))[0] || null;
const chatOf = (row) => (row && row.telegram_chat ? String(row.telegram_chat) : null);
// How many pairings this person has made. Rows from before the column existed hold nothing, which counts as none.
const seqOf = (row) => { const n = Number(row && row.telegram_seq); return Number.isInteger(n) && n > 0 ? n : 0; };

router.get('/telegram', member, wrap(async (req, res) => {
  const row = await mine(req);
  const chat = chatOf(row);
  res.json({ connected: Boolean(chat), chat: chat ? '…' + chat.slice(-4) : null, configured: Boolean(process.env.TELEGRAM_BOT_TOKEN) });
}));

router.post('/telegram/code', member, wrap(async (req, res) => {
  const window = Math.floor(Date.now() / WINDOW_MS);
  res.json({ code: codeFor(req.user.id, window, seqOf(await mine(req))), bot: 'Soma_me_bot', expiresMs: (window + 1) * WINDOW_MS });
}));

router.post('/telegram/pair', member, wrap(async (req, res) => {
  const window = Math.floor(Date.now() / WINDOW_MS);
  const row = await mine(req);
  if (!row) throw new HttpError(404, 'no profile');
  const seq = seqOf(row);
  // This window and the one before it, so a code typed just as the clock turns still works.
  const codes = [codeFor(req.user.id, window, seq), codeFor(req.user.id, window - 1, seq)];
  // Updates are not acknowledged: a second attempt can still see the message.
  const updates = await telegram('getUpdates', { limit: 100, timeout: 0, allowed_updates: ['message'] });
  const hit = (updates || []).filter((u) => u.message && typeof u.message.text === 'string')
    .reverse()
    .find((u) => codes.some((c) => u.message.text.toUpperCase().includes(c)));
  if (!hit) throw new HttpError(404, 'no message with that code yet. Send the code to the bot, then tap Connect again.');
  // A person's own chat with the bot, never a group or channel: what Dayhub sends is a reading of someone's journal,
  // and a group would hand it to everyone in it (and let the bot be used to post into any group).
  if (!hit.message.chat || hit.message.chat.type !== 'private') {
    throw new HttpError(409, 'that code was sent in a group. Send it to @Soma_me_bot in a private chat, then tap Connect again.');
  }

  // Telegram's chat id is a whole number. It goes into a query below, so it is held to that here.
  const chat = String(hit.message.chat.id);
  if (!/^-?\d{1,20}$/.test(chat)) throw new HttpError(502, 'Telegram sent a chat this cannot use');
  // One chat, one person: if someone else paired this chat, it moves here rather than serving two accounts.
  const others = await select(req.admin, 'profiles', `SELECT ROWID FROM profiles WHERE telegram_chat = '${chat}' AND user_id != ${needId(req.user.id)}`);
  for (const o of others) await req.admin.datastore().table('profiles').updateRow({ ROWID: o.ROWID, telegram_chat: null });
  // The count goes up with the chat, in one write: from here on the code that did this is no longer the code.
  await req.admin.datastore().table('profiles').updateRow({ ROWID: row.ROWID, telegram_chat: chat, telegram_seq: seq + 1 });
  await telegram('sendMessage', { chat_id: chat, text: 'Dayhub is connected. Your week in review, and tomorrow\'s brief when you send it, will arrive here.' }).catch(() => undefined);
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

  // Tomorrow's brief comes formatted (bold headings, monospace times) and asks for HTML; the phone escapes every word
  // in it. Anything else goes as plain text, as it always has.
  await telegram('sendMessage', Object.assign({ chat_id: chat, text, disable_web_page_preview: true }, b.html === true ? { parse_mode: 'HTML' } : {}));

  // The spoken version is a nicety: a week that cannot be read aloud still arrives as words.
  // The voice takes a few hundred characters at a time and the function has 30 seconds to answer, so the reading
  // is made in small pieces inside a time budget, joined into one file, and whatever was finished is sent.
  let spoke = false, said = 0;
  const speakable = String(b.speak_text || text).trim();
  // Past the day's cap for reading aloud the words still go; only the voice is left out (quota.js logs the cap).
  const maySpeak = b.speak === true && Boolean(process.env.GROQ_API_KEY) && Boolean(speakable) &&
    await spend(req, 'speech', speakable.length).then(() => true, () => false);
  if (maySpeak) {
    const until = Date.now() + SPEAK_BUDGET_MS;
    const pieces = [];
    try {
      for (const piece of split(speakable, SPEAK_MAX)) {
        if (Date.now() > until) break;
        const answer = await fetch(GROQ_SPEECH, {
          method: 'POST',
          headers: { authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: piece, response_format: 'wav' }),
          signal: AbortSignal.timeout(20000)
        });
        // The status only: the service's message can quote the text it was given.
        if (!answer.ok) throw new Error('speech service answered ' + answer.status);
        pieces.push(Buffer.from(await answer.arrayBuffer()));
        said += piece.length;
      }
      const audio = join(pieces);
      if (!audio) throw new Error('nothing readable came back');
      const form = new FormData();
      form.append('chat_id', chat);
      form.append('title', String(b.title || 'Week in review').slice(0, 60));
      form.append('audio', new Blob([audio], { type: 'audio/wav' }), 'week-in-review.wav');
      await telegram('sendAudio', form, true);
      spoke = true;
      console.log(JSON.stringify({ action: 'telegram_audio', pieces: pieces.length, said, bytes: audio.length, seconds: Math.round(seconds(audio)) }));
    } catch (e) {
      // The words are already there; only the reading is missing, and the log says why.
      await note(req, 'speak_failed', String(e.message || e).slice(0, 200), { chars: speakable.length, pieces: pieces.length }, 'warn');
    }
  }
  console.log(JSON.stringify({ action: 'telegram_sent', user: req.user.id, chars: text.length, spoke }));
  res.json({ sent: true, spoke });
}));

/** Break the text for the voice, on sentence ends where they fall near the limit. */
function split(text, max) {
  const out = [];
  let rest = String(text).trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('\n'), window.lastIndexOf('! '), window.lastIndexOf('? '));
    const at = cut > max * 0.5 ? cut + 1 : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

module.exports = router;
module.exports.split = split;
module.exports.codeFor = codeFor;
