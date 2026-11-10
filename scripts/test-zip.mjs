// The export's zip (src/lib/zip.ts): read back field by field, checksums checked against Node's own CRC-32.
//
//   node --import ./scripts/ts-resolve.mjs scripts/test-zip.mjs

import { crc32 as nodeCrc } from "node:zlib";
import { crc32, makeZip } from "../src/lib/zip.ts";

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log("  ok   " + name); } else { failures.push(name); console.log("  FAIL " + name, detail ?? ""); } };

/** Every file in an archive, read from its central directory the way an unzip tool does. */
function unzip(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const endAt = buf.byteLength - 22;
  if (v.getUint32(endAt, true) !== 0x06054b50) throw new Error("no end record");
  const count = v.getUint16(endAt + 10, true);
  let at = v.getUint32(endAt + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(at, true) !== 0x02014b50) throw new Error("bad central entry " + i);
    const flags = v.getUint16(at + 8, true), method = v.getUint16(at + 10, true), crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 24, true), nameLen = v.getUint16(at + 28, true), localAt = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(buf.subarray(at + 46, at + 46 + nameLen));
    if (v.getUint32(localAt, true) !== 0x04034b50) throw new Error("bad local header " + i);
    const localName = v.getUint16(localAt + 26, true), extra = v.getUint16(localAt + 28, true);
    const data = buf.subarray(localAt + 30 + localName + extra, localAt + 30 + localName + extra + size);
    out.push({ name, flags, method, crc, size, data });
    at += 46 + nameLen;
  }
  return out;
}

console.log("checksums");
check("CRC-32 of nothing is 0", crc32(new Uint8Array(0)) === 0);
check("CRC-32 of the standard check string is cbf43926", crc32(new TextEncoder().encode("123456789")) === 0xcbf43926);
const noise = new Uint8Array(70000).map((_, i) => (i * 2654435761) >>> 24);
check("CRC-32 matches Node's on 70 KB of noise", crc32(noise) === nodeCrc(noise));

console.log("an archive");
const json = JSON.stringify({ app: "Dayhub", note: "Café, 読書, 🧘" }, null, 2);
const audio = new Blob([noise], { type: "audio/mp4" });
const when = new Date(2026, 10, 8, 7, 12, 34);
const zip = await makeZip([
  { name: "dayhub-data.json", data: json, modified: when },
  { name: "recordings/2026-11-08 07.12 Café.m4a", data: audio, modified: when },
  { name: "empty.txt", data: "" },
]);
const buf = new Uint8Array(await zip.arrayBuffer());
const files = unzip(buf);
check("three files, in order", files.length === 3 && files[0].name === "dayhub-data.json" && files[2].name === "empty.txt", files.map((f) => f.name));
check("UTF-8 names survive (flag bit 11 set)", files[1].name === "recordings/2026-11-08 07.12 Café.m4a" && (files[1].flags & 0x0800) !== 0);
check("stored, not compressed", files.every((f) => f.method === 0));
check("the JSON comes back byte for byte", new TextDecoder().decode(files[0].data) === json);
check("the recording comes back byte for byte", files[1].size === noise.length && Buffer.compare(Buffer.from(files[1].data), Buffer.from(noise)) === 0);
check("every checksum matches Node's", files.every((f) => f.crc === nodeCrc(f.data)));
check("an empty file is fine", files[2].size === 0 && files[2].crc === 0);
const v = new DataView(buf.buffer);
const time = v.getUint16(10, true), date = v.getUint16(12, true);
check("the time is kept to the even second", (time >> 11) === 7 && ((time >> 5) & 63) === 12 && (time & 31) * 2 === 34, time);
check("and the date", (date >> 9) + 1980 === 2026 && ((date >> 5) & 15) === 11 && (date & 31) === 8, date);
check("the archive is labelled a zip", zip.type === "application/zip");

let heard = [];
await makeZip([{ name: "a", data: "1" }, { name: "b", data: "2" }], (done, total) => heard.push(`${done}/${total}`));
check("progress is heard after each file", heard.join(",") === "1/2,2/2", heard);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => " - " + f).join("\n")); process.exit(1); }
