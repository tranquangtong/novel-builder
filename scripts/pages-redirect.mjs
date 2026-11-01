// Tạo trang GitHub Pages chỉ để chuyển hướng sang bản Cloudflare (giữ nguyên đường dẫn con và ?query).
// Dùng: node scripts/pages-redirect.mjs <thư-mục-ra> <URL Cloudflare> <basePath>
import { mkdirSync, writeFileSync } from "node:fs";

const [out = "pages-redirect", target = "", base = ""] = process.argv.slice(2);
if (!/^https:\/\/[\w.-]+(\/.*)?$/.test(target)) throw new Error(`URL Cloudflare không hợp lệ: ${target}`);
const t = target.replace(/\/+$/, "");
const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${t}/">
<title>Novel Builder đã chuyển sang Cloudflare</title>
<script>
(function () {
  var base = ${JSON.stringify(base)};
  var p = location.pathname;
  if (base && p.indexOf(base) === 0) p = p.slice(base.length);
  location.replace(${JSON.stringify(t)} + (p || "/") + location.search + location.hash);
})();
</script></head>
<body style="font-family:system-ui;padding:40px">
<p>Novel Builder đã chuyển sang Cloudflare: <a href="${t}/">${t}</a></p>
<p>Bản thảo trong repo GitHub vẫn còn nguyên. Mở trang Cloudflare → Bộ truyện → “Chuyển từ repo GitHub” để đưa sang R2.</p>
</body></html>
`;
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/index.html`, html);
writeFileSync(`${out}/404.html`, html);
writeFileSync(`${out}/.nojekyll`, "");
console.log(`Đã tạo trang chuyển hướng ở ${out}/ → ${t}`);
