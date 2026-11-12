// Puts the landing page into the app's static build at /landing/, so it can be opened at the app's own address
// before Dayhub has its domain (David, 2026-11-11). npm runs this after `next build` (the "postbuild" script), so
// every deploy of the app carries the page as site/public has it, and nothing is copied into the repo.
//
// The copy's index.html differs from site/public's in three lines, all in its head:
// - <base href="/landing/">: Slate answers /landing without the slash too, and the page's own files are relative;
// - a line that moves /landing to /landing/, so the page's in-page links never reload it;
// - noindex, as for the rest of the app's address: the page's real home is the bare domain, from move day.

import fs from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dirname, "..", "public");
const BUILD = path.join(import.meta.dirname, "..", "..", "out");
const OUT = path.join(BUILD, "landing");
if (!fs.existsSync(BUILD)) { console.error("No out/ folder: run next build first."); process.exit(1); }

fs.rmSync(OUT, { recursive: true, force: true });
// Not the dot-folders (.catalyst): those are for the site's own Slate app, never for the app's.
fs.cpSync(SRC, OUT, { recursive: true, filter: (from) => from === SRC || !path.basename(from).startsWith(".") });

const page = path.join(OUT, "index.html");
const html = fs.readFileSync(page, "utf8");
const head = '<meta charset="utf-8">';
if (!html.includes(head)) { console.error(`${page} has no ${head} to put the base path after.`); process.exit(1); }
fs.writeFileSync(page, html.replace(head, [
  head,
  '<base href="/landing/">',
  '<script>if (location.pathname === "/landing") location.replace("/landing/" + location.search + location.hash);</script>',
  '<meta name="robots" content="noindex">',
].join("\n")));
console.log(`Landing page copied to ${path.relative(process.cwd(), OUT)} (served at /landing/)`);
