// The code a person sends to the Telegram bot to prove a chat is theirs (routes/telegram.js).
//
// A keyed hash, so nothing has to be stored for it. It is true for one person, for one ten-minute window, and for
// one pairing: `seq` is how many pairings that person has made so far (profiles.telegram_seq, raised each time a
// chat is connected), so the code that has just connected a chat is never the code again, and the next one can be
// asked for straight away. Before 2026-11-10 a code stayed good for its whole window.

'use strict';

const crypto = require('crypto');

const WINDOW_MS = 10 * 60 * 1000;

/** `DAYHUB-` and six characters. `secret` is the server's key; `window` is Math.floor(now / WINDOW_MS). */
function pairCode(secret, userId, window, seq) {
  const mac = crypto.createHmac('sha256', secret).update(`telegram:${userId}:${window}:${Number(seq) || 0}`).digest('base64');
  return 'DAYHUB-' + mac.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
}

module.exports = { pairCode, WINDOW_MS };
