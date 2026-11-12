// The real screens on Dayhub's landing page (site/public/index.html). They come from the screenshot rig, whose member
// is made up (scripts/shots/world.ts), so they never show anyone's real data. Shoot them, then turn them into WebP:
//
//   npm run shots -- --only today,today-closed,settings-closes,sheet-say-day,moment-day,moment-day-check,journal,moment-record,new-vault-code,food,moment-food,new-meal-sheet,activity,new-first-moves,insights,insights-experiment,insights-experiment-done,settings-privacy --out shots/site
//   node site/tools/shots.mjs shots/site
//
// Each screen is saved in Night and Light, 540 px wide, as site/public/shots/<name>.<theme>.webp. The page shows the
// set that matches the visitor's theme. Run it again when those screens change. `--sheet <file.png>` also writes one
// contact sheet of every Night screen, for a quick look.

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

/** [rig file without theme, name on the page]. A ".2" or ".3" is a scrolled frame of the same scene. */
export const SCREENS = [
  ["today", "today"],
  ["today-closed", "today-closed"],
  ["settings-closes", "closes"],
  ["moment-day", "say-recording"],
  ["moment-day-check", "say-check"],
  ["sheet-say-day", "say-first"],
  ["journal", "journal"],
  ["moment-record", "journal-record"],
  ["new-vault-code", "vault-code"],
  ["food", "food"],
  ["moment-food", "food-say"],
  ["new-meal-sheet", "food-meal"],
  ["activity", "moves"],
  ["activity.2", "round"],
  ["new-first-moves", "moves-choose"],
  ["insights", "insights"],
  ["insights-experiment", "experiment"],
  ["insights-experiment-done", "experiment-done"],
  ["settings-privacy", "privacy"],
  ["settings-privacy.3", "privacy-out"],
  ["settings-privacy.4", "privacy-ops"],
];
const THEMES = ["night", "light"];
const WIDTH = 540, QUALITY = 0.8;

const args = process.argv.slice(2);
const from = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--sheet");
const sheet = args.includes("--sheet") ? args[args.indexOf("--sheet") + 1] : null;
if (!from) { console.error("Usage: node site/tools/shots.mjs <capture dir> [--sheet <file.png>]"); process.exit(2); }
const out = path.join(import.meta.dirname, "..", "public", "shots");
fs.mkdirSync(out, { recursive: true });

/** "activity.2" in Night → "activity.night.2.png", as the rig names its frames. */
const rigFile = (scene, theme) => { const [id, frame] = scene.split("."); return `${id}.${theme}${frame ? "." + frame : ""}.png`; };

const browser = await chromium.launch({ channel: process.env.BROWSER || "msedge", headless: true });
try {
  const page = await browser.newPage();
  let total = 0;
  for (const [scene, name] of SCREENS) {
    for (const theme of THEMES) {
      const file = path.join(from, rigFile(scene, theme));
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
      fs.writeFileSync(path.join(out, `${name}.${theme}.webp`), bytes);
      total += bytes.length;
    }
  }
  console.log(`${SCREENS.length * THEMES.length} screens, ${Math.round(total / 1024)} KB in all, in ${path.relative(process.cwd(), out)}`);

  if (sheet) {
    const imgs = SCREENS.map(([, name]) => "data:image/webp;base64," + fs.readFileSync(path.join(out, `${name}.night.webp`)).toString("base64"));
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.setContent(`<body style="margin:0;background:#333;display:grid;grid-template-columns:repeat(7,1fr);gap:8px;padding:8px">${imgs.map((src, i) => `<figure style="margin:0;color:#fff;font:12px sans-serif"><img src="${src}" style="width:100%;display:block"><figcaption>${SCREENS[i][1]}</figcaption></figure>`).join("")}</body>`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: sheet, fullPage: true });
    console.log(`contact sheet: ${sheet}`);
  }
} finally { await browser.close(); }
