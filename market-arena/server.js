// Local server: serves the game and proxies rounds to TypeSafe so the API key stays on this machine.
// Run:  node server.js   (reads TYPESAFE_API_KEY from the environment or a .env file), then open http://localhost:3000
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

try {
  (await readFile(new URL(".env", import.meta.url), "utf8")).split("\n").forEach((l) => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  });
} catch {}
const { scenario, templates, round, share, getShare, askRound } = await import("./lib/handlers.js");
if (!process.env.TYPESAFE_API_KEY) { console.error("Set TYPESAFE_API_KEY in your shell or a .env file, then start again."); process.exit(1); }

const PUBLIC = fileURLToPath(new URL("./public", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const send = (res, [code, body]) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };

http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  if (req.method === "GET" && url === "/api/scenario") return send(res, scenario());
  if (req.method === "GET" && url === "/api/templates") return send(res, templates());
  if (req.method === "POST" && url === "/api/round") {
    let body = "";
    for await (const c of req) { body += c; if (body.length > 20000) return send(res, [413, { error: "Request too large." }]); }
    return send(res, await round(body, req.headers["x-arena-code"], req.socket.remoteAddress));
  }
  if (req.method === "POST" && url === "/api/share") {
    let body = "";
    for await (const c of req) { body += c; if (body.length > 40000) return send(res, [413, { error: "Request too large." }]); }
    return send(res, await share(body));
  }
  if (req.method === "POST" && url === "/api/ask") {
    let body = "";
    for await (const c of req) { body += c; if (body.length > 120000) return send(res, [413, { error: "Request too large." }]); }
    return send(res, await askRound(body));
  }
  if (req.method === "GET" && url.startsWith("/api/share/")) return send(res, await getShare(url.slice("/api/share/".length)));
  const path = join(PUBLIC, url === "/" ? "index.html" : url);
  if (!path.startsWith(PUBLIC)) return send(res, [403, { error: "Forbidden" }]);
  const file = await readFile(path).catch(() => null);
  if (!file) return send(res, [404, { error: "Not found" }]);
  res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" }); res.end(file);
}).listen(process.env.PORT || 3000, () => console.log(`Market Arena running at http://localhost:${process.env.PORT || 3000}`));
