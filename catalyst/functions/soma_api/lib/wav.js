// Joining WAV pieces into one file.
//
// The voice will only read a few hundred characters at a time (Groq refuses more, and refuses again if asked too
// often in a minute), so a spoken review arrives in pieces. Telegram should still get one audio file, and a
// function has 30 seconds to answer, so the pieces are joined here rather than uploaded one by one.
//
// Only the shape of a WAV matters for this: a 'RIFF' header, a 'fmt ' chunk saying how the samples are encoded,
// and a 'data' chunk of samples. Pieces that do not agree on the format are not joined; the first one wins and the
// rest are dropped, because playing them back to back would be noise.

'use strict';

/** The format bytes and the samples of one WAV, or null when it is not a WAV this understands. */
function parse(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let at = 12, fmt = null, data = null;
  while (at + 8 <= buf.length) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    const body = buf.subarray(at + 8, Math.min(at + 8 + size, buf.length));
    if (id === 'fmt ') fmt = body;
    else if (id === 'data') data = body;
    at += 8 + size + (size % 2); // chunks are padded to an even length
  }
  return fmt && data ? { fmt, data } : null;
}

/** One WAV from several, in order. Returns null when nothing could be read. */
function join(buffers) {
  const parts = [];
  let fmt = null;
  for (const buf of buffers) {
    const piece = parse(buf);
    if (!piece) continue;
    if (!fmt) fmt = piece.fmt;
    else if (!fmt.equals(piece.fmt)) continue; // a piece in another format would just be noise
    parts.push(piece.data);
  }
  if (!fmt || !parts.length) return null;

  const data = Buffer.concat(parts);
  const head = Buffer.alloc(12 + 8 + fmt.length + 8);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(head.length - 8 + data.length, 4);
  head.write('WAVE', 8, 'ascii');
  head.write('fmt ', 12, 'ascii');
  head.writeUInt32LE(fmt.length, 16);
  fmt.copy(head, 20);
  head.write('data', 20 + fmt.length, 'ascii');
  head.writeUInt32LE(data.length, 24 + fmt.length);
  return Buffer.concat([head, data]);
}

/** How long a joined WAV runs, in seconds, for the log. */
function seconds(buf) {
  const piece = parse(buf);
  if (!piece || piece.fmt.length < 16) return 0;
  const bytesPerSecond = piece.fmt.readUInt32LE(8);
  return bytesPerSecond ? piece.data.length / bytesPerSecond : 0;
}

module.exports = { parse, join, seconds };
