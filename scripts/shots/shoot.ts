// Screenshots of every Dayhub screen, for the polish loop's critics (docs/POLISH.md). Runs the dev server's pages in a
// headless Edge at iPhone size, on the made-up member in world.ts, in Night and Light.
//
//   npm run shots                                   every scene, both themes, into shots/latest/
//   npm run shots -- --only today,food              some scenes, or whole areas by id
//   npm run shots -- --out shots/run1/r0            somewhere else (the workflow keeps one folder per round)
//   npm run shots -- --list                         the areas, their scenes, files and reference images, as JSON
//   npm run shots -- --only today --dump            also print each scene's accessibility tree (for writing steps)
//   npm run shots -- --at 2026-11-06T19:30          a fixed moment (the workflow pins one per run)
//   npm run shots -- --out shots/b --against shots/a   also writes shots/b/diff.json: which screens look different
//   npm run shots -- --compare shots/a shots/b         the same for two captures already made: shots/b/compare.json
//
// The page never reaches Catalyst or Stratus: the API and storage are answered from the fixture, and any other
// request off this machine is refused and listed. Nothing is written anywhere but shots/.
// Needs `npm run dev` running (it runs as the test member, which is what keeps the Catalyst sign-in out of the way).

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { answer, buildWorld, STRATUS, USER_ID, type DayShape, type Theme, type Who, type World } from "./world";
import { AREAS, SCENES, SYSTEM_FILES, type Scene, type Step } from "./scenes";

const ROOT = process.cwd();
const API = /API_BASE = "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "src/lib/api.ts"), "utf8"))?.[1] ?? "";
const VIEW = { width: 390, height: 844 };
const REFS = path.join(ROOT, "design-ref");
const BLIND = path.join(ROOT, "shots", "blind");
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");

type Shot = { scene: string; area: string; theme: Theme; frame: number; title: string; file: string; blind: string };
type Problem = { scene: string; theme: Theme | null; kind: string; detail: string };

function args(argv: string[]) {
  const get = (name: string) => { const i = argv.indexOf("--" + name); return i >= 0 ? argv[i + 1] : undefined; };
  const has = (name: string) => argv.includes("--" + name);
  const now = new Date();
  const at = get("at") ? new Date(get("at")!) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 30);
  if (Number.isNaN(at.getTime())) throw new Error(`--at ${get("at")} is not a date`);
  return {
    only: (get("only") || "").split(",").map((s) => s.trim()).filter(Boolean),
    themes: ((get("themes") || "night,light").split(",").map((s) => s.trim()) as Theme[]).filter((t) => t === "night" || t === "light"),
    out: path.resolve(ROOT, get("out") || "shots/latest"),
    url: (get("url") || "http://localhost:3000").replace(/\/$/, ""),
    at, list: has("list"), dump: has("dump"), browser: get("browser") || "msedge",
    /** Compare the new capture with an earlier one: writes diff.json next to the shots. */
    against: get("against") ? path.resolve(ROOT, get("against")!) : null,
    /** Compare two earlier captures without shooting: `--compare <before> <after>` writes <after>/compare.json. */
    compare: has("compare") ? [argv[argv.indexOf("--compare") + 1], argv[argv.indexOf("--compare") + 2]].map((d) => path.resolve(ROOT, d || "")) : null,
  };
}

/** Same bytes, same name: the name says nothing about which run or version an image came from. */
function blindCopy(file: string) {
  const bytes = fs.readFileSync(file);
  fs.mkdirSync(BLIND, { recursive: true });
  const out = path.join(BLIND, createHash("sha256").update(bytes).digest("hex").slice(0, 12) + path.extname(file));
  if (!fs.existsSync(out)) fs.writeFileSync(out, bytes);
  return rel(out);
}

/** Reference images David drops in design-ref/<area>/ (apps he admires, a mock-up): the bar to beat, never committed. */
function refsFor(area: string) {
  const dir = path.join(REFS, area);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().map((f) => ({ file: rel(path.join(dir, f)), blind: blindCopy(path.join(dir, f)) }));
}

function select(only: string[]) {
  if (!only.length) return SCENES;
  const unknown = only.filter((o) => !SCENES.some((s) => s.id === o) && !AREAS.some((a) => a.id === o));
  if (unknown.length) throw new Error(`no scene or area called ${unknown.join(", ")}. Try --list.`);
  return SCENES.filter((s) => only.includes(s.id) || only.includes(s.area));
}

async function serverUp(url: string) {
  for (let i = 0; i < 30; i++) {
    try { const res = await fetch(url + "/", { signal: AbortSignal.timeout(60_000) }); if (res.status < 500) return true; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/** The page's own store, set before any script runs: the look (so the first paint is right), today's opening words
 *  already shown, a fresh health sync (so none starts), the vault key unless the scene wants it locked. */
async function prime(ctx: BrowserContext, w: World, theme: Theme, scene: Scene) {
  await ctx.addInitScript((p) => {
    try {
      localStorage.setItem("soma-look", JSON.stringify({ theme: p.theme, palette: "soma", motion: "lively" }));
      localStorage.setItem("soma-opening-day", p.today);
      localStorage.setItem("soma-gh-sync." + p.userId, String(p.stamp));
      localStorage.setItem("soma-gh-sleep." + p.userId, "1");
      localStorage.setItem("soma.fitbitSnooze." + p.userId, String(p.stamp + 86400000));
      sessionStorage.setItem("soma-vault-asked." + p.userId, "1");
      if (p.locked || !p.key) sessionStorage.removeItem("soma-ck-v1." + p.userId);
      else sessionStorage.setItem("soma-ck-v1." + p.userId, p.key);
    } catch { /* a scene without storage still shoots */ }
  }, {
    theme: theme === "night" ? "dark" : "light", userId: USER_ID, key: w.keyB64, locked: scene.vault === "locked", stamp: w.now.getTime(),
    today: `${w.now.getFullYear()}-${String(w.now.getMonth() + 1).padStart(2, "0")}-${String(w.now.getDate()).padStart(2, "0")}`,
  });
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };

async function serve(ctx: BrowserContext, w: World, origin: string, note: (kind: string, detail: string) => void) {
  await ctx.route("**/*", async (route) => {
    const req = route.request(), url = req.url(), method = req.method();
    if (url.startsWith(origin)) return route.continue();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (API && url.startsWith(API)) {
      const p = url.slice(API.length);
      let body: unknown = null;
      try { body = req.postData() ? JSON.parse(req.postData()!) : null; } catch { /* not JSON */ }
      const a = answer(w, method, p, body);
      if (a.unknown) note("fixture", `no fixture for ${method} ${p.split("?")[0]}`);
      if (p.startsWith("/logs")) { const b = body as { area?: string; event?: string; message?: string } | null; note("report", `${b?.area}/${b?.event}: ${String(b?.message ?? "").slice(0, 160)}`); }
      return route.fulfill({ status: a.status, contentType: "application/json", headers: CORS, body: JSON.stringify(a.json) });
    }
    if (url.startsWith(STRATUS)) {
      const key = new URL(url).pathname.slice(1);
      if (method !== "GET") return route.fulfill({ status: 200, headers: CORS, body: "" });
      const blob = w.blobs.get(key);
      return blob ? route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/octet-stream" }, body: Buffer.from(blob) }) : route.fulfill({ status: 404, headers: CORS, body: "" });
    }
    note("blocked", `${method} ${url.slice(0, 140)}`);
    return route.abort();
  });
}

async function step(page: Page, s: Step) {
  if ("wait" in s) return page.waitForTimeout(s.wait);
  if ("scroll" in s) return scrollBy(page, s.scroll);
  if ("text" in s) return page.getByText(s.text, { exact: false }).first().click({ timeout: 10_000 });
  const target = page.getByRole(s.role || "button", { name: s.click, exact: s.exact ?? false });
  return target.nth(s.nth ?? 0).click({ timeout: 10_000 });
}

/** Scrolls whatever actually scrolls (the window, or the tallest scrolling element). False when it is at the end. */
function scrollBy(page: Page, dy: number) {
  return page.evaluate((dy) => {
    const all = [document.scrollingElement, ...Array.from(document.querySelectorAll<HTMLElement>("main, section, div"))].filter((el): el is HTMLElement => !!el);
    let best: HTMLElement | null = null;
    for (const el of all) {
      const can = el === document.scrollingElement || /(auto|scroll)/.test(getComputedStyle(el).overflowY);
      if (can && el.scrollHeight - el.clientHeight > 20 && (!best || el.scrollHeight - el.clientHeight > best.scrollHeight - best.clientHeight)) best = el;
    }
    if (!best) return false;
    const before = best.scrollTop;
    best.scrollTop = before + dy;
    return best.scrollTop !== before;
  }, dy);
}

/** Two seconds of a 220 Hz tone at a speaking level, 48 kHz mono. */
function toneWav(seconds = 2, rate = 48000) {
  const n = seconds * rate, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 9000), 44 + i * 2);
  return b;
}

/** Which screenshots look different between two captures, with the box around the change. Byte-identical is too
 *  strict (a blur can land a shade apart run to run), so a pixel counts only when it moved by more than a shade. */
async function diff(browser: Browser, before: string, after: string) {
  const read = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as { shots: Shot[] };
  const was = new Map(read(before).shots.map((s) => [path.basename(s.file), s]));
  const page = await browser.newPage();
  const out: { file: string; scene: string; theme: Theme; changed: boolean; pixels: number; box: number[] | null; before: Shot | null; after: Shot }[] = [];
  for (const s of read(after).shots) {
    const old = was.get(path.basename(s.file)) ?? null;
    if (!old) { out.push({ file: path.basename(s.file), scene: s.scene, theme: s.theme, changed: true, pixels: -1, box: null, before: null, after: s }); continue; }
    const r = old.blind === s.blind ? { n: 0, box: null } : await page.evaluate(async ([a, b]) => {
      const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/png;base64," + src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { n: ia.width * ia.height, box: [0, 0, ia.width, ia.height] };
      const c = document.createElement("canvas"); c.width = ia.width; c.height = ia.height;
      const x = c.getContext("2d")!;
      x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
      x.clearRect(0, 0, c.width, c.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (let i = 0; i < da.length; i += 4) {
        if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) <= 24) continue;
        const p = i / 4, px = p % c.width, py = (p / c.width) | 0;
        n++; x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
      }
      return { n, box: n ? [x0, y0, x1, y1] : null };
    }, [fs.readFileSync(path.join(ROOT, old.file)).toString("base64"), fs.readFileSync(path.join(ROOT, s.file)).toString("base64")]);
    // A few stray pixels are noise (a blinking caret, a shade of blur); a real change moves more than that.
    out.push({ file: path.basename(s.file), scene: s.scene, theme: s.theme, changed: r.n > 40, pixels: r.n, box: r.box, before: old, after: s });
  }
  await page.close();
  return out;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(500);
}

async function main() {
  const o = args(process.argv.slice(2));
  if (o.list) {
    console.log(JSON.stringify({
      areas: AREAS.map((a) => ({ ...a, scenes: SCENES.filter((s) => s.area === a.id).map(({ id, title, frames }) => ({ id, title, frames: 1 + (frames || 0) })), refs: refsFor(a.id) })),
      systemFiles: SYSTEM_FILES,
    }, null, 2));
    return;
  }
  if (o.compare) {
    const [before, after] = o.compare;
    for (const d of o.compare) if (!fs.existsSync(path.join(d, "manifest.json"))) throw new Error(`no capture in ${rel(d)}`);
    const browser = await chromium.launch({ channel: o.browser, headless: true });
    try {
      const changes = await diff(browser, before, after);
      fs.writeFileSync(path.join(after, "compare.json"), JSON.stringify({ before: rel(before), after: rel(after), changes }, null, 2));
      const moved = changes.filter((c) => c.changed);
      console.log(`${rel(after)} against ${rel(before)}: ${moved.length} of ${changes.length} look different${moved.length ? ": " + moved.map((c) => c.file.replace(/\.png$/, "")).join(", ") : ""}`);
    } finally { await browser.close(); }
    return;
  }
  const scenes = select(o.only);
  if (!API) throw new Error("could not read API_BASE from src/lib/api.ts");
  if (!(await serverUp(o.url))) {
    console.error(`No dev server at ${o.url}. Start it first (npm run dev, or preview_start soma-dev), then run this again.`);
    process.exit(2);
  }

  fs.mkdirSync(o.out, { recursive: true });
  const shots: Shot[] = [], problems: Problem[] = [];
  const worlds = new Map<string, Promise<World>>();
  const world = (theme: Theme, day: DayShape, who: Who) => {
    const k = theme + day + who;
    if (!worlds.has(k)) worlds.set(k, buildWorld({ now: o.at, theme, day, who }));
    return worlds.get(k)!;
  };

  // The microphone is a steady tone, so the listening moments draw the same waveform on every run.
  const tone = path.join(ROOT, "shots", ".tone.wav");
  if (!fs.existsSync(tone)) fs.writeFileSync(tone, toneWav());
  const browser = await chromium.launch({
    channel: o.browser, headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${tone}`],
  });
  try {
    for (const scene of scenes) {
      for (const theme of o.themes) {
        const note = (kind: string, detail: string) => { if (!problems.some((p) => p.scene === scene.id && p.theme === theme && p.detail === detail)) problems.push({ scene: scene.id, theme, kind, detail }); };
        const w = await world(theme, scene.day || "open", scene.who || "settled");
        const ctx = await browser.newContext({
          viewport: scene.view || VIEW, deviceScaleFactor: scene.view ? 1 : 2, isMobile: !scene.view, hasTouch: !scene.view, locale: "en-US",
          colorScheme: theme === "night" ? "dark" : "light", reducedMotion: scene.reduced ? "reduce" : "no-preference",
          serviceWorkers: "block", permissions: ["microphone"],
        });
        try {
          await prime(ctx, w, theme, scene);
          await serve(ctx, w, o.url, note);
          const page = await ctx.newPage();
          page.on("console", (m) => { if (m.type() === "error") note("console", m.text().slice(0, 200)); });
          page.on("pageerror", (e) => note("pageerror", String(e.message).slice(0, 200)));
          await page.clock.setFixedTime(o.at);
          await page.goto(o.url + scene.path, { waitUntil: "load", timeout: 120_000 });
          // Ready: the tab bar is up (the desktop sidebar is a hidden nav at this size) and the opening overlay has gone.
          // An account waiting for approval has no tab bar: its screen is ready when its Check again button is.
          const ready = scene.who === "pending" ? page.getByRole("button", { name: "Check again" }) : page.locator("nav:visible").first();
          await ready.waitFor({ state: "visible", timeout: 60_000 });
          if (await page.getByRole("button", { name: /^sign in/i }).count()) throw new Error("the dev server shows the sign-in: it must run as the test member (NEXT_PUBLIC_DEV_TEST_KEY in .env.development.local)");
          await settle(page);
          for (const [i, s] of (scene.steps || []).entries()) {
            try { await step(page, s); await page.waitForTimeout(250); }
            catch (e) { throw new Error(`step ${i + 1} (${JSON.stringify(s)}) failed: ${(e as Error).message.split("\n")[0]}`); }
          }
          await settle(page);
          // The Next.js dev badge is not part of Dayhub.
          await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
          if (o.dump) console.log(`\n── ${scene.id} · ${theme}\n` + await page.locator("body").ariaSnapshot());
          for (let frame = 0; frame <= (scene.frames || 0); frame++) {
            if (frame > 0 && !(await scrollBy(page, (scene.view || VIEW).height - 120))) break;
            if (frame > 0) await page.waitForTimeout(300);
            const file = path.join(o.out, `${scene.id}.${theme}${frame ? "." + (frame + 1) : ""}.png`);
            // "disabled" plays every finite animation to its end and stops the endless ones at their start, so the
            // picture is the screen at rest, the same on every run.
            await page.screenshot({ path: file, animations: "disabled", caret: "hide" });
            shots.push({ scene: scene.id, area: scene.area, theme, frame: frame + 1, title: scene.title, file: rel(file), blind: blindCopy(file) });
          }
        } catch (e) {
          // What the page showed when it went wrong, so the failure can be seen rather than guessed at.
          const file = path.join(o.out, `${scene.id}.${theme}.failed.png`);
          const seen = await ctx.pages()[0]?.screenshot({ path: file }).then(() => ` (see ${rel(file)})`, () => "");
          note("failed", (e as Error).message.split("\n")[0] + seen);
        } finally {
          await ctx.close();
        }
      }
    }
    const manifest = { at: o.at.toISOString(), url: o.url, viewport: VIEW, shots, problems };
    fs.writeFileSync(path.join(o.out, "manifest.json"), JSON.stringify(manifest, null, 2));
    console.log(`${shots.length} screenshots in ${rel(o.out)}${problems.length ? `, ${problems.length} problem${problems.length === 1 ? "" : "s"}:` : ""}`);
    for (const p of problems) console.log(`  ${p.kind.padEnd(9)} ${p.scene}${p.theme ? "." + p.theme : ""}  ${p.detail}`);
    if (o.against) {
      const changes = await diff(browser, o.against, o.out);
      fs.writeFileSync(path.join(o.out, "diff.json"), JSON.stringify({ before: rel(o.against), after: rel(o.out), changes }, null, 2));
      const moved = changes.filter((c) => c.changed);
      console.log(`against ${rel(o.against)}: ${moved.length} of ${changes.length} look different${moved.length ? ": " + moved.map((c) => c.file.replace(/\.png$/, "")).join(", ") : ""}`);
    }
  } finally {
    await browser.close();
  }
  if (problems.some((p) => p.kind === "failed")) process.exit(1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
