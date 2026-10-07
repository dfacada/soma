// Joining the spoken pieces of a review into one file (soma_api/lib/wav.js).
//
//   node scripts/test-wav.mjs

import { join, parse, seconds } from "../catalyst/functions/soma_api/lib/wav.js";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };

/** A WAV of `samples` 16-bit mono samples at 24 kHz, the shape the voice returns. */
function wav(samples, rate = 24000, extra = false) {
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE((i % 100) - 50, i * 2);
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(rate, 4);
  fmt.writeUInt32LE(rate * 2, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14);
  const chunks = [Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.from("fmt "), size(fmt.length), fmt];
  // Some encoders put a LIST chunk between fmt and data; the parser must step over it.
  if (extra) { const note = Buffer.from("INFOhello!!!"); chunks.push(Buffer.from("LIST"), size(note.length), note); }
  chunks.push(Buffer.from("data"), size(data.length), data);
  const out = Buffer.concat(chunks);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}
const size = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };

console.log("reading one");
check("a WAV is understood", parse(wav(100)) !== null);
check("samples come back whole", parse(wav(100)).data.length === 200);
check("a chunk in between is stepped over", parse(wav(100, 24000, true))?.data.length === 200);
check("something that is not a WAV is not guessed at", parse(Buffer.from("hello there, this is not audio at all")) === null);
check("a truncated file is not a WAV", parse(wav(100).subarray(0, 20)) === null);

console.log("joining");
const one = join([wav(100), wav(50), wav(25)]);
check("the samples of every piece are kept, in order", parse(one).data.length === (100 + 50 + 25) * 2, parse(one).data.length);
check("the header says how long the file really is", one.readUInt32LE(4) === one.length - 8);
check("the format is carried over", parse(one).fmt.readUInt32LE(4) === 24000);
check("the duration adds up", Math.abs(seconds(one) - 175 / 24000) < 0.0001, seconds(one));
check("one piece joins to itself", parse(join([wav(10)])).data.length === 20);
check("a piece in another format is dropped, not mixed in", parse(join([wav(100), wav(50, 16000)])).data.length === 200);
check("rubbish among good pieces is ignored", parse(join([wav(100), Buffer.from("nope"), wav(50)])).data.length === 300);
check("nothing readable gives nothing back", join([Buffer.from("nope")]) === null);
check("an empty list gives nothing back", join([]) === null);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
