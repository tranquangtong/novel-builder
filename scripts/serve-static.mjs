// Máy chủ tĩnh tối giản mô phỏng GitHub Pages để chạy thử/E2E bản xuất tĩnh trong out/.
// Dùng: node scripts/serve-static.mjs [port] [basePath]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const port = Number(process.argv[2] ?? 4321);
const base = process.argv[3] ?? process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const root = path.resolve("out");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let p = decodeURIComponent(url.pathname);
  if (base && !p.startsWith(base)) { res.writeHead(404); return res.end("not found"); }
  p = p.slice(base.length) || "/";
  let file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!p.endsWith("/")) { res.writeHead(301, { Location: `${base}${p}/${url.search}` }); return res.end(); }
    file = path.join(file, "index.html");
  }
  if (!fs.existsSync(file)) { file = path.join(root, "404.html"); res.statusCode = 404; }
  res.setHeader("Content-Type", types[path.extname(file)] ?? "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}${base}/`));
