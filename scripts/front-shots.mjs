// The three screens on Dayhub's front page (src/components/app/Front.tsx). They are made from a capture of the
// screenshot rig, whose member is made up (scripts/shots/world.ts), so they never show anyone's real data:
//
//   npm run shots -- --only today,moment-day-check,insights --themes night --out shots/front
//   node scripts/front-shots.mjs shots/front
//
// Each is scaled to 480 px wide and saved as WebP in src/components/app/front/, where Front.tsx imports it (so the
// build gives it a hashed name the service worker can keep). Run it again when those screens change.

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const SHOTS = [["today.night.png", "today.webp"], ["moment-day-check.night.png", "say-day.webp"], ["insights.night.png", "insights.webp"]];
const WIDTH = 480, QUALITY = 0.8;

const from = process.argv[2];
if (!from) { console.error("Usage: node scripts/front-shots.mjs <capture dir>"); process.exit(2); }
const out = path.join(process.cwd(), "src", "components", "app", "front");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: process.env.BROWSER || "msedge", headless: true });
try {
  const page = await browser.newPage();
  for (const [src, name] of SHOTS) {
    const file = path.join(from, src);
    if (!fs.existsSync(file)) throw new Error(`${file} is missing: shoot it first (see the top of this file)`);
    const data = await page.evaluate(async ([png, width, quality]) => {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/png;base64," + png; });
      const c = document.createElement("canvas");
      c.width = width; c.height = Math.round((img.height * width) / img.width);
      const x = c.getContext("2d");
      x.imageSmoothingQuality = "high";
      x.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/webp", quality).split(",")[1];
    }, [fs.readFileSync(file).toString("base64"), WIDTH, QUALITY]);
    const bytes = Buffer.from(data, "base64");
    fs.writeFileSync(path.join(out, name), bytes);
    console.log(`${name}: ${Math.round(bytes.length / 1024)} KB`);
  }
} finally { await browser.close(); }
