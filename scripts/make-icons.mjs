// Draws the app icons: the four-segment day ring (check-in, journal, food, activity) on ink.
// No image library: each pixel is tested against the ring geometry, 4×4 supersampled, and written as a PNG
// with Node's zlib.   node scripts/make-icons.mjs
import fs from "node:fs";
import zlib from "node:zlib";

const INK = [0x1b, 0x1a, 0x17], TRACK = [0x3a, 0x37, 0x33];
const SEGMENTS = [[0x5f, 0x5b, 0xbf], [0x8f, 0x8c, 0xd3], [0x2c, 0x8a, 0x5e], [0xb7, 0x69, 0x2a]];
const GAP_DEG = 9;

function colorAt(x, y, size) {
  // Ring centred, outer radius 34% of the icon so it stays inside the maskable safe zone (40%).
  const c = size / 2, dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
  const outer = size * 0.34, inner = size * 0.215;
  if (r > outer || r < inner) return INK;
  const deg = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; // 0° at 12 o'clock, clockwise
  const within = deg % 90;
  if (within < GAP_DEG / 2 || within > 90 - GAP_DEG / 2) return TRACK;
  return SEGMENTS[Math.floor(deg / 90)];
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}

function png(size) {
  const SS = 4, raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const p = colorAt(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size);
        sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round(sum[0] / 16); raw[o + 1] = Math.round(sum[1] / 16); raw[o + 2] = Math.round(sum[2] / 16);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  const out = new URL("../public/" + name, import.meta.url);
  fs.writeFileSync(out, png(size));
  console.log(name, size + "px", fs.statSync(out).size + " bytes");
}
