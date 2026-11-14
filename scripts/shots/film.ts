// Frame sequences of the real app for the promo (opt-in, never part of npm run shots or the polish loop): one take
// on the promo's world (world.ts, day "ad", 6:47 pm), filmed at 24 fps at 3x, Night.
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/ts-resolve.mjs scripts/shots/film.ts [--voice <wav>] [--at 2026-11-13]
//
// Time is the page's, not the machine's: Playwright's clock holds Date, timers, requestAnimationFrame and
// performance.now still, the document timeline is slowed to a crawl over CDP, and each frame moves both on by exactly
// 1/24 s (every running CSS animation and transition by shifting its start time back, so it stays running and ends,
// and fires its events, as it would). However slow the machine, frame n is the screen n/24 s in.
// The microphone is Chromium's fake device, fed a voice recording when --voice is given (the level meter reacts to
// it in real time between frames), else the rig's steady tone.
// Needs `npm run dev` running, like shoot.ts. Writes shots/ad-promo/seq/<name>/0001.png… and seq/manifest.json.

import fs from "node:fs";
import path from "node:path";
import { chromium, type CDPSession, type Page } from "playwright-core";
import { buildWorld } from "./world";
import { prime, serve, settle } from "./shoot";
import type { Scene } from "./scenes";

const ROOT = process.cwd();
const FPS = 24, DT = 1000 / FPS, SCALE = 3, VIEW = { width: 390, height: 844 };
const OUT = path.join(ROOT, "shots", "ad-promo", "seq");
const URL = "http://localhost:3000";

const argv = process.argv.slice(2);
const get = (n: string) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : undefined; };
const voice = get("voice");
// The day (a local date, "2026-11-13"), at 6:47 pm.
const [Y, M, D] = (get("at") || "").split("-").map(Number);
const today = new Date();
const AT = Y ? new Date(Y, M - 1, D, 18, 47) : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 47);

type Event = { frame: number; what: string };
type Seq = { name: string; frames: number; width: number; height: number; fps: number; events: Event[] };
const manifest: Seq[] = [];
const problems: string[] = [];

class Take {
  frozen = false;
  readonly page: Page;
  readonly cdp: CDPSession;
  constructor(page: Page, cdp: CDPSession) { this.page = page; this.cdp = cdp; }

  /** Holds the page's time still: Playwright's clock paused, the document timeline all but stopped. */
  async freeze() {
    const now = await this.page.evaluate(() => Date.now());
    await this.page.clock.pauseAt(now + 1);
    await this.cdp.send("Animation.setPlaybackRate", { playbackRate: 0.001 });
    this.frozen = true;
  }

  /** Lets time run on its own again (between sequences, for loading). */
  async thaw() {
    await this.cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
    await this.page.clock.resume();
    this.frozen = false;
  }

  /** Moves the page's time on by `ms`: every running animation, then the clock (timers, rAF, Date). */
  async advance(ms: number) {
    await this.page.evaluate((ms) => {
      for (const a of document.getAnimations()) {
        if (a.playState !== "running" || a.startTime === null) continue;
        a.startTime = Number(a.startTime) - ms / (a.playbackRate || 1);
      }
    }, ms);
    await this.page.clock.runFor(ms);
    // React commits on a message, not a timer: give it a moment of real time to land before the next picture.
    await this.page.waitForTimeout(40);
  }

  /** Steps a frame at a time until `ready` is true in the page, up to `max` frames. */
  async until(ready: () => boolean, max = 600, step = DT) {
    for (let i = 0; i < max; i++) {
      if (await this.page.evaluate(ready)) return i;
      await this.advance(step);
    }
    throw new Error(`waited ${max} steps for ${ready.toString().slice(0, 120)}`);
  }

  async shot(dir: string, n: number) {
    await this.page.screenshot({ path: path.join(dir, String(n).padStart(4, "0") + ".png"), caret: "hide" });
  }

  async centre(name: string | RegExp, role: "button" | "checkbox" = "button") {
    const box = await this.page.getByRole(role, { name, exact: typeof name === "string" }).first().boundingBox();
    if (!box) throw new Error(`no ${role} ${name}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /** A real tap's press: the pointer goes down on the button and stays down. */
  async press(name: string | RegExp) {
    const c = await this.centre(name);
    await this.page.mouse.move(c.x, c.y);
    await this.page.mouse.down();
  }
}

function seqDir(name: string) {
  const dir = path.join(OUT, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** What the page shows that a promo must never: the Next.js dev overlay's toast, or an error. */
async function clean(page: Page, where: string) {
  const bad = await page.evaluate(() => {
    const portal = document.querySelector("nextjs-portal");
    const root = portal?.shadowRoot;
    // The badge (always there in dev, always hidden in the frames) turns red when the page has an error.
    const error = root?.querySelector('[data-next-badge][data-error="true"]');
    const said = Array.from(error?.querySelectorAll("[data-issues-open]") || []).map((e) => e.textContent).join(" ").trim();
    return error ? `Next.js dev overlay shows an error${said ? ` (${said})` : ""}` : "";
  });
  if (bad) problems.push(`${where}: ${bad}`);
}

async function main() {
  const tone = path.join(ROOT, "shots", ".tone.wav");
  const mic = voice ? path.resolve(voice) : tone;
  if (!fs.existsSync(mic)) throw new Error(`no microphone file at ${mic}`);
  const w = await buildWorld({ now: AT, theme: "night", day: "ad", who: "settled" });
  const browser = await chromium.launch({
    channel: get("browser") || "msedge", headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${mic}`],
  });
  try {
    const ctx = await browser.newContext({
      viewport: VIEW, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, locale: "en-US",
      colorScheme: "dark", reducedMotion: "no-preference", serviceWorkers: "block", permissions: ["microphone"],
    });
    await prime(ctx, w, "night", { id: "film", area: "today", title: "", path: "/" } as Scene);
    await serve(ctx, w, URL, (kind, detail) => { if (kind !== "report") problems.push(`${kind}: ${detail}`); });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text().slice(0, 200)); });
    page.on("pageerror", (e) => problems.push("pageerror: " + String(e.message).slice(0, 200)));
    await page.clock.install({ time: AT });
    await page.goto(URL + "/", { waitUntil: "load", timeout: 120_000 });
    await page.locator("nav:visible").first().waitFor({ state: "visible", timeout: 60_000 });
    await settle(page);
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.waitForTimeout(1500);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Animation.enable");
    const t = new Take(page, cdp);
    await t.freeze();

    // 1. Today, the orb moving, Say your day pressed from frame 17 (fully down by 18) and held: its release, which
    //    opens the recording, comes after the last frame.
    {
      const name = "today-tap", dir = seqDir(name), n = 30, PRESS = 17;
      for (let f = 1; f <= n; f++) {
        if (f === PRESS) await t.press(/^Say your day/);
        await t.shot(dir, f);
        await t.advance(DT);
      }
      await clean(page, name);
      manifest.push({ name, frames: n, width: VIEW.width * SCALE, height: VIEW.height * SCALE, fps: FPS, events: [
        { frame: 1, what: "Today at 6:47 pm, Good evening, Alex, 0/5, Say your day under the orb; the orb's ambient motion runs throughout" },
        { frame: PRESS, what: "pointer down on Say your day: the press transition starts (scale to 0.95 over 0.08 s)" },
        { frame: PRESS + 2, what: "fully pressed, held to the last frame (the release, which opens the recording, is after frame 30)" },
      ] });
    }

    // 2. The recording, from 0:12: the timer ticks over twice, the meter follows the voice.
    {
      await page.mouse.up();
      await t.until(() => !!document.querySelector('[aria-label="Saying your day"]'));
      // On to twelve seconds in, a quarter second at a time.
      await t.until(() => /^0:1[2-9]$/.test(document.querySelector('[aria-label="Saying your day"] .m')?.textContent?.trim() || ""), 200, 250);
      const name = "recording", dir = seqDir(name), n = 60, events: Event[] = [];
      let was = "";
      for (let f = 1; f <= n; f++) {
        const shown = await page.evaluate(() => document.querySelector('[aria-label="Saying your day"] .m')?.textContent?.trim() || "");
        if (shown !== was) { events.push({ frame: f, what: `timer reads ${shown}` }); was = shown; }
        if (process.env.FILM_DEBUG) console.log("recording", f, await page.evaluate(() => {
          const box = document.querySelector<HTMLElement>('[aria-label="Saying your day"] [class*="vox"]');
          const s = Array.from(box?.querySelectorAll<HTMLElement>("i") || []).map((b) => Number(b.style.getPropertyValue("--s")));
          return `${box?.className} lv=${box?.style.getPropertyValue("--lv")} s=${Math.min(...s).toFixed(2)}..${Math.max(...s).toFixed(2)}`;
        }));
        await t.shot(dir, f);
        await t.advance(DT);
      }
      await clean(page, name);
      manifest.push({ name, frames: n, width: VIEW.width * SCALE, height: VIEW.height * SCALE, fps: FPS, events: [
        { frame: 1, what: "Say your day recording: Your day · recording, the ring of level bars and the core following the microphone (" + (voice ? "a voice recording" : "a steady tone") + "), what is still open listed under Say your day" },
        ...events,
      ] });
    }

    // 3. Stop at 0:48, and Check your day arriving; Fill in my day pressed near the end and held.
    {
      await t.until(() => (document.querySelector('[aria-label="Saying your day"] .m')?.textContent?.trim() || "") === "0:48", 200, 250);
      const stop = await t.centre("Stop and save");
      await page.mouse.click(stop.x, stop.y);
      await t.until(() => !!document.querySelector('[aria-label="Say your day"]')?.textContent?.includes("Check your day"), 2000);
      const name = "check", dir = seqDir(name), n = 96, PRESS = 83;
      for (let f = 1; f <= n; f++) {
        if (f === PRESS) await t.press(/^Fill in my day/);
        await t.shot(dir, f);
        await t.advance(DT);
      }
      await clean(page, name);
      manifest.push({ name, frames: n, width: VIEW.width * SCALE, height: VIEW.height * SCALE, fps: FPS, events: [
        { frame: 1, what: "first frame of Check your day after Stop and save at 0:48: the screen opens as a circle growing out of Today (0.7 s), the heading rises and the rows slide in one after another" },
        { frame: 22, what: "every row in place: Journal Entry saved 0:48 (lock), Weight 162 lb, Check-in Great, Food Tacos 500 kcal · 22 P (Lunch), Activity Gym Done; held" },
        { frame: PRESS, what: "pointer down on Fill in my day · 4, held to the last frame (the release, which closes the day, is after frame 96). The app gives this button no pressed style, so the frames do not change" },
      ] });
    }

    // 4. The day closing, from its first frame: the orb blooms with its check, the streak rolls to 16, Lovely.
    {
      await page.mouse.up();
      await t.until(() => !!document.querySelector('[role="dialog"][aria-label^="Day closed"]'), 2000);
      const name = "closed", dir = seqDir(name), n = 60;
      for (let f = 1; f <= n; f++) { await t.shot(dir, f); await t.advance(DT); }
      await clean(page, name);
      const streak = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label^="Day closed"]')?.getAttribute("aria-label") || "");
      manifest.push({ name, frames: n, width: VIEW.width * SCALE, height: VIEW.height * SCALE, fps: FPS, events: [
        { frame: 1, what: `first frame of the day closing (${streak}): the screen opens as a circle over Today (0.7 s), the orb blooms in with its check (1.1 s), the rays fade in, the dots burst out from 0.25 s; the app's "Filled in 4 things" toast shows at the top` },
        { frame: 25, what: "the old streak number starts out upward (1.0 s in)" },
        { frame: 29, what: "the new number rolls up into place (1.15 s in, spring, settled by about frame 46)" },
        { frame: 32, what: "the week's dots fill one by one (1.3 to 1.84 s in), today's last in the day's colours, settled by about frame 57" },
        { frame: 1, what: "Lovely is part of the screen from the first frame, uncovered by the opening circle by about frame 8; held to the end" },
      ] });
    }

    // 5. The Journal tab: today's 6:47 pm entry, scrolled up until its words are all in view.
    {
      await t.thaw();
      await page.getByRole("button", { name: "Lovely", exact: true }).click();
      await page.waitForTimeout(1500);
      await page.getByRole("button", { name: "Journal", exact: true }).first().click();
      await page.getByText("And Sam finally called.", { exact: false }).first().waitFor({ state: "visible", timeout: 30_000 });
      await settle(page);
      await page.waitForTimeout(2500);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(500);
      await t.freeze();
      // How far: the entry's words end 260 px above the bottom of the screen, clear of the tab bar. The window is
      // what scrolls (Shell.tsx keeps one window scroll for every tab).
      const plan = await page.evaluate(() => {
        const words = Array.from(document.querySelectorAll<HTMLElement>("p, div, span")).filter((e) => e.children.length === 0 && /And Sam finally called\./.test(e.textContent || "") && e.getClientRects().length > 0)[0];
        const bottom = words ? words.getBoundingClientRect().bottom : 0;
        return { distance: Math.max(0, Math.round(bottom - (window.innerHeight - 260))), from: window.scrollY };
      });
      const name = "journal", dir = seqDir(name), n = 60, S0 = 6, S1 = 40;
      const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      for (let f = 1; f <= n; f++) {
        const k = Math.min(1, Math.max(0, (f - S0) / (S1 - S0)));
        const want = plan.from + plan.distance * ease(k);
        const got = await page.evaluate((top) => { window.scrollTo({ top, behavior: "instant" }); return window.scrollY; }, want);
        if (process.env.FILM_DEBUG) console.log("journal", f, want.toFixed(1), got);
        await t.shot(dir, f);
        await t.advance(DT);
      }
      await clean(page, name);
      manifest.push({ name, frames: n, width: VIEW.width * SCALE, height: VIEW.height * SCALE, fps: FPS, events: [
        { frame: 1, what: "the Journal tab (Sealed on this phone, Journal) at the top; today's 6:47 pm 0:48 entry low on screen" },
        { frame: S0, what: `eased scroll (cubic in-out) starts, ${plan.distance} px in all` },
        { frame: S1, what: "scroll ends: the entry's words (…And Sam finally called.) fully in view above the tab bar; held to the end" },
      ] });
    }
    await ctx.close();
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({
    made: new Date().toISOString(), moment: AT.toString(), theme: "night", viewport: VIEW, deviceScaleFactor: SCALE, fps: FPS,
    microphone: voice ? path.basename(voice) : "tone", sequences: manifest, problems,
  }, null, 2));
  console.log(`${manifest.length} sequences in ${path.relative(ROOT, OUT)}${problems.length ? `, ${problems.length} problems:\n  ` + problems.join("\n  ") : ""}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
