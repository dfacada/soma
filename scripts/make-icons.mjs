// Draws the app icons: the five-segment day ring (weight, check-in, journal, food, activity, in card order) with
// rounded ends, on a warm ink gradient. No image library: each pixel is tested against the ring geometry,
// 4×4 supersampled, and written as a PNG with Node's zlib.   node scripts/make-icons.mjs
import fs from "node:fs";
import zlib from "node:zlib";

const TOP = [0x2b, 0x28, 0x23], BOTTOM = [0x12, 0x11, 0x0f];
const SEGMENTS = [[0x8b, 0xc4, 0xa6], [0x5f, 0x5b, 0xbf], [0x8f, 0x8c, 0xd3], [0x2c, 0x8a, 0x5e], [0xb7, 0x69, 0x2a]];
const GAP_DEG = 7;  // clear space between the rounded ends

// `scale` is the ring's outer radius as a share of the icon. Maskable icons keep it inside the 40% safe zone;
// iOS crops nothing but its own corner radius, so the home-screen icon can carry a bigger ring.
function colorAt(x, y, size, scale) {
  const c = size / 2, dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
  const t = y / size;
  const bg = TOP.map((v, i) => v + (BOTTOM[i] - v) * t);
  const outer = size * scale, inner = outer * 0.73, mid = (outer + inner) / 2, half = (outer - inner) / 2;
  if (r > outer + 1 || r < inner - 1) return bg;
  const deg = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; // 0° at 12 o'clock, clockwise
  const span = 360 / SEGMENTS.length;
  // Each arc is shortened by the gap plus the cap's own angular radius; the caps then round it back out.
  const capDeg = Math.atan2(half, mid) * 180 / Math.PI;
  for (let i = 0; i < SEGMENTS.length; i++) {
    const from = i * span + GAP_DEG / 2 + capDeg, to = (i + 1) * span - GAP_DEG / 2 - capDeg;
    if (r <= outer && r >= inner && deg >= from && deg <= to) return SEGMENTS[i];
    for (const a of [from, to]) {
      const rad = a * Math.PI / 180;
      if (Math.hypot(dx - Math.sin(rad) * mid, dy + Math.cos(rad) * mid) <= half) return SEGMENTS[i];
    }
  }
  return bg;
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}

function png(size, scale) {
  const SS = 4, raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const p = colorAt(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size, scale);
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

// public/: the manifest icons (also used as "maskable", so the ring stays in the safe zone) and the iOS home-screen icon.
// src/app/: what Next turns into <link rel="icon"> and <link rel="apple-touch-icon">.
for (const [file, size, scale] of [["public/icon-192.png", 192, 0.36], ["public/icon-512.png", 512, 0.36], ["public/apple-touch-icon.png", 180, 0.4], ["src/app/apple-icon.png", 180, 0.4], ["src/app/icon.png", 192, 0.42]]) {
  const out = new URL("../" + file, import.meta.url);
  fs.writeFileSync(out, png(size, scale));
  console.log(file, size + "px", fs.statSync(out).size + " bytes");
}
