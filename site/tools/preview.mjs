// Builds a preview of the landing page as a claude.ai Artifact, to look at on a phone before the site has an address:
//
//   node site/tools/preview.mjs <out dir>
//
// An Artifact page is a fragment (the viewer adds the document around it) that may load files published beside it
// but no fonts from anywhere but Google. So this writes <out dir>/index.html with the head's title, the stylesheet
// (its fonts inlined as data: URIs) and both scripts inlined, and copies the screens to <out dir>/shots/. It prints the
// `files` map to publish with it. The site itself is site/public, unchanged.

import fs from "node:fs";
import path from "node:path";

const out = process.argv[2];
if (!out) { console.error("Usage: node site/tools/preview.mjs <out dir>"); process.exit(2); }
const SRC = path.join(import.meta.dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(SRC, f), "utf8");

const html = read("index.html");
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script src="[^"]+"[^>]*><\/script>\s*/g, "");

const css = read("site.css").replace(/url\("fonts\/([^"]+)"\)/g, (_, f) => `url("data:font/woff2;base64,${fs.readFileSync(path.join(SRC, "fonts", f)).toString("base64")}")`);
// A script inlined into a page must never close its own tag.
const js = (f) => read(f).replace(/<\/script/gi, "<\\/script");

const page = [
  title,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<meta name="color-scheme" content="dark light">',
  `<style>\n${css}\n</style>`,
  body.trim(),
  `<script>\n${js("orb.js")}\n</script>`,
  `<script>\n${js("site.js")}\n</script>`,
  "",
].join("\n");

fs.mkdirSync(path.join(out, "shots"), { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), page);
const files = {};
for (const f of fs.readdirSync(path.join(SRC, "shots"))) {
  fs.copyFileSync(path.join(SRC, "shots", f), path.join(out, "shots", f));
  files[`shots/${f}`] = path.join(out, "shots", f).replace(/\\/g, "/");
}
fs.writeFileSync(path.join(out, "files.json"), JSON.stringify(files, null, 2));
console.log(`${path.join(out, "index.html")}: ${Math.round(page.length / 1024)} KB, ${Object.keys(files).length} screens (files.json lists them)`);
