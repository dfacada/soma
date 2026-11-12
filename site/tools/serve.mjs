// Serves site/public on this machine only, to look at the landing page while working on it:
//
//   node site/tools/serve.mjs                     http://localhost:4400
//   node site/tools/serve.mjs --port 4500
//   node site/tools/serve.mjs --root out          the app's build, to see /landing/ as Slate serves it
//
// No cache, so a reload always shows the files as they are. Like Slate, a folder answers with or without its slash.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const args = process.argv.slice(2);
const ROOT = args.includes("--root") ? path.resolve(args[args.indexOf("--root") + 1]) : path.join(import.meta.dirname, "..", "public");
const PORT = Number(args.includes("--port") ? args[args.indexOf("--port") + 1] : 4400);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml" };

http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain" }).end("Not found"); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(body);
  });
}).listen(PORT, "127.0.0.1", () => console.log(`Serving ${ROOT} at http://localhost:${PORT}`));
