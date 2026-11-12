// Renders the ad to video: the page in headless Chrome, one frame at a time, piped to ffmpeg.
//
//   node ad/render.mjs --cut 30 --shape vertical               ad/out/dayhub-30s-vertical.mp4 (silent; sound.py adds sound)
//   node ad/render.mjs --cut 15 --shape wide --audio x.wav      with a soundtrack muxed in
//   node ad/render.mjs --cut 30 --still 1.2,5,11.4              stills to ad/out/stills/ to look at
//   node ad/render.mjs --cut 30 --cues                          the sound cues as JSON (for sound.py)
//
// Needs ffmpeg on the PATH, Chrome or Edge installed, and the rig's screens in shots/site (README.md).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(HERE, "out");

function args(argv) {
  const get = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
  const has = (n) => argv.includes("--" + n);
  return {
    cut: get("cut", "30"), shape: get("shape", "vertical"), fps: Number(get("fps", "30")),
    still: get("still", null), cues: has("cues"), audio: get("audio", null), out: get("out", null),
    from: Number(get("from", "0")), to: get("to", null), workers: Number(get("workers", "4")),
    browser: get("browser", "chrome"), crf: get("crf", "19"), page: get("page", "ad/index.html"), query: get("query", ""),
  };
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".json": "application/json" };
function serve() {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.resolve(ROOT, "." + p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((res) => server.listen(0, "127.0.0.1", () => res(server)));
}

async function openPage(browser, url, W, H) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.AD && window.AD.ready, null, { timeout: 30000 });
  const info = await page.evaluate(() => window.AD.ready());
  if (errors.length) throw new Error("page errors:\n" + errors.join("\n"));
  return { page, ctx, info };
}

async function frame(page, t) {
  await page.evaluate((x) => { window.AD.seek(x); return new Promise((r) => requestAnimationFrame(() => r())); }, t);
  return page.screenshot({ type: "png", animations: "allow", caret: "hide", scale: "css" });
}

function ffmpeg(argv) {
  const p = spawn("ffmpeg", argv, { stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  p.stderr.on("data", (d) => { err += d; if (err.length > 20000) err = err.slice(-20000); });
  const done = new Promise((res, rej) => p.on("close", (code) => (code === 0 ? res() : rej(new Error("ffmpeg failed:\n" + err.slice(-3000))))));
  return { p, done };
}

const ENCODE = (crf) => [
  "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
  "-c:v", "libx264", "-preset", "slow", "-crf", crf, "-maxrate", "10M", "-bufsize", "20M", "-profile:v", "high", "-tune", "film", "-x264-params", "aq-mode=3",
  "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
];

/** Lay a soundtrack under a finished video, its loudness set in two passes: measured, then one linear gain to -14
 *  LUFS, or as close as keeps true peaks under -1.5 dBTP (no compression is added). */
async function mux(video, audio, out) {
  const probe = spawn("ffmpeg", ["-hide_banner", "-i", audio, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  probe.stderr.on("data", (d) => { err += d; });
  await new Promise((res) => probe.on("close", res));
  const m = JSON.parse(err.slice(err.lastIndexOf("{"), err.lastIndexOf("}") + 1));
  const I = Number(m.input_i), TP = Number(m.input_tp);
  const target = Math.min(-14, -1.5 - (TP - I) - 0.1);
  const af = `loudnorm=I=${target.toFixed(1)}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`;
  await ffmpeg(["-y", "-loglevel", "error", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", af, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", out]).done;
  console.log(`muxed: ${path.relative(ROOT, out)} (sound measured ${I} LUFS, ${TP} dBTP; set to ${target.toFixed(1)} LUFS)`);
}

async function main() {
  const o = args(process.argv.slice(2));
  fs.mkdirSync(OUT, { recursive: true });
  const muxIdx = process.argv.indexOf("--mux");
  if (muxIdx >= 0) return mux(path.resolve(ROOT, process.argv[muxIdx + 1]), path.resolve(ROOT, o.audio), path.resolve(ROOT, o.out));
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/${o.page}?cut=${o.cut}&shape=${o.shape}${o.query ? "&" + o.query : ""}`;
  // The page says its own size (a plate is 1080 × 2330); the first guess only has to load it.
  let W = o.shape === "wide" ? 1920 : 1080, H = o.shape === "wide" ? 1080 : 1920;
  const browser = await chromium.launch({ channel: o.browser, headless: true, args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--force-color-profile=srgb", "--hide-scrollbars"] });
  try {
    const first = await openPage(browser, base, W, H);
    const meta = await first.page.evaluate(() => window.AD.info);
    if (meta.W !== W || meta.H !== H) { W = meta.W; H = meta.H; await first.page.setViewportSize({ width: W, height: H }); }
    console.log(`page ready: ${meta.W}x${meta.H}, ${meta.dur}s, WebGL: ${first.info.renderer}, ${first.info.images} images`);
    const name = `dayhub-${o.cut}s-${o.shape}`;

    if (o.cues) {
      const cues = await first.page.evaluate(() => window.AD.cues());
      const file = path.join(OUT, `${name}.cues.json`);
      fs.writeFileSync(file, JSON.stringify({ dur: meta.dur, cut: Number(o.cut), cues }, null, 1));
      console.log("cues:", path.relative(ROOT, file), cues.length);
      return;
    }

    if (o.still) {
      const dir = path.join(OUT, "stills");
      fs.mkdirSync(dir, { recursive: true });
      for (const s of o.still.split(",").map(Number)) {
        const png = await frame(first.page, s);
        const file = path.join(dir, `${name}-${s.toFixed(2)}.png`);
        fs.writeFileSync(file, png);
        console.log("still:", path.relative(ROOT, file));
      }
      return;
    }

    // The whole cut: frames split among a few pages, each into its own segment, then joined.
    const total = Math.round(meta.dur * o.fps);
    const f0 = Math.round(o.from * o.fps), f1 = o.to ? Math.round(Number(o.to) * o.fps) : total;
    const n = Math.max(1, Math.min(o.workers, Math.ceil((f1 - f0) / 30)));
    const per = Math.ceil((f1 - f0) / n);
    const pages = [first];
    for (let i = 1; i < n; i++) pages.push(await openPage(browser, base, W, H));
    const tmp = path.join(OUT, "tmp-" + name + (o.query ? "-" + o.query.replace(/[^a-z0-9]+/gi, "") : "") + `-${f0}-${f1}`);
    fs.mkdirSync(tmp, { recursive: true });
    const t0 = Date.now();
    let doneFrames = 0;
    const segs = await Promise.all(pages.map(async ({ page }, i) => {
      const a = f0 + i * per, b = Math.min(f1, a + per);
      const seg = path.join(tmp, `seg${i}.mp4`);
      if (a >= b) return null;
      const enc = ffmpeg(["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(o.fps), "-c:v", "png", "-i", "-", ...ENCODE(o.crf), "-r", String(o.fps), seg]);
      for (let f = a; f < b; f++) {
        const png = await frame(page, f / o.fps);
        if (!enc.p.stdin.write(png)) await new Promise((r) => enc.p.stdin.once("drain", r));
        doneFrames++;
        if (doneFrames % 60 === 0) console.log(`  ${doneFrames}/${f1 - f0} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
      enc.p.stdin.end();
      await enc.done;
      return seg;
    }));
    const list = path.join(tmp, "list.txt");
    fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
    const out = o.out ? path.resolve(ROOT, o.out) : path.join(OUT, `${name}${o.audio ? "" : "-silent"}.mp4`);
    const join = ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list];
    if (o.audio) join.push("-i", path.resolve(ROOT, o.audio), "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest");
    join.push("-c:v", "copy", "-movflags", "+faststart", out);
    await ffmpeg(join).done;
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`video: ${path.relative(ROOT, out)} (${f1 - f0} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
