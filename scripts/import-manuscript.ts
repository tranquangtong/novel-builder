/**
 * Chuyển bản thảo xuất từ Google Docs (Markdown) vào cấu trúc repo bản thảo.
 * Giữ NGUYÊN VĂN: thân chương là đúng các dòng giữa hai tiêu đề chương trong file xuất
 * (chỉ bỏ dòng trống đầu/cuối, CRLF → LF). Không sửa chữ, dấu câu, ký tự escape.
 *
 * Dùng:
 *   npx tsx scripts/import-manuscript.ts <repo-bản-thảo> <chương.md> [--outline <outline.md>] [--act <số act, mặc định 1>]
 */
import fs from "node:fs";
import path from "node:path";
import { parseImport } from "../src/lib/domain/importer";
import { serializeChapter } from "../src/lib/domain/chapter";
import { serializeFrontmatter } from "../src/lib/domain/frontmatter";
import { newId } from "../src/lib/domain/ids";
import { gitBlobSha } from "../src/lib/domain/gitsha";
import { countWords } from "../src/lib/domain/wordcount";
import { AGENTS_MD } from "../src/lib/domain/agents-md";
import { serializeIndex } from "../src/lib/core/service";
import { parseChapter } from "../src/lib/domain/chapter";

// Tên 9 Act theo outline (Phần IV). Có thể đổi tên trong ứng dụng; ID không đổi.
const ACTS = [
  { title: "Act 1 · Muốn có chỗ đứng, mình phải có ích", range: "Chương 1–25" },
  { title: "Act 2 · Nếu mọi người cần mình, họ sẽ không đi", range: "Chương 26–50" },
  { title: "Act 3 · Mình phải biết trước hiểm nguy để không ai thất vọng", range: "Chương 51–75" },
  { title: "Act 4 · Hiểu nỗi đau không có nghĩa hiểu hết họ", range: "Chương 76–100" },
  { title: "Act 5 · Mình muốn cứu Dan, nhưng Dan có quyền nói Chưa", range: "Chương 101–125" },
  { title: "Act 6 · Mình có phải chỉ là người thay thế GS?", range: "Chương 126–150" },
  { title: "Act 7 · Có những bất công không thể giải quyết bằng lòng tốt", range: "Chương 151–170" },
  { title: "Act 8 · Nếu không thể giúp, mình vẫn muốn sống và trở về", range: "Chương 171–190" },
  { title: "Act 9 · Cùng nhau chọn cái giá", range: "Chương 191–205+" },
];

const args = process.argv.slice(2);
const repo = path.resolve(args[0] ?? "");
const chaptersFile = args[1];
const outlineFile = args.includes("--outline") ? args[args.indexOf("--outline") + 1] : undefined;
const actNo = args.includes("--act") ? Number(args[args.indexOf("--act") + 1]) : 1;
if (!args[0] || !chaptersFile) {
  console.error("Dùng: tsx scripts/import-manuscript.ts <repo> <chương.md> [--outline <outline.md>] [--act 1]");
  process.exit(1);
}

const w = (rel: string, content: string) => {
  const f = path.join(repo, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
};
const exists = (rel: string) => fs.existsSync(path.join(repo, rel));

// ---- khung dự án (chỉ tạo nếu chưa có) ----
if (!exists("content/project.json")) {
  w("content/project.json", JSON.stringify({ title: "The Last Miracle", language: "vi", word_target: { min: 2500, max: 3000 } }, null, 2) + "\n");
}
if (!exists("AGENTS.md")) w("AGENTS.md", AGENTS_MD);
for (const d of ["canon/characters", "canon/world", "canon/timeline", "canon/knowledge", "summaries", "reviews"]) {
  if (!exists(`content/${d}`)) w(`content/${d}/.gitkeep`, "");
}
const actsDir = path.join(repo, "content/acts");
let actIds: string[] = [];
if (!fs.existsSync(actsDir) || !fs.readdirSync(actsDir).some((f) => f.endsWith(".md"))) {
  actIds = ACTS.map(() => newId("act"));
  ACTS.forEach((a, i) => w(`content/acts/${actIds[i]}.md`, serializeFrontmatter({ id: actIds[i], title: a.title, order: i + 1 }, `${a.range} (theo outline).\n`)));
} else {
  actIds = fs.readdirSync(actsDir).filter((f) => f.endsWith(".md"))
    .map((f) => fs.readFileSync(path.join(actsDir, f), "utf8"))
    .map((t) => ({ id: /^id: (\S+)$/m.exec(t)?.[1] ?? "", order: Number(/^order: (\S+)$/m.exec(t)?.[1] ?? 0) }))
    .sort((x, y) => x.order - y.order)
    .map((x) => x.id);
}
const actId = actIds[actNo - 1];
if (!actId) throw new Error(`Không có Act ${actNo}`);

// ---- outline (nguyên văn) ----
if (outlineFile) {
  const raw = fs.readFileSync(outlineFile, "utf8").replace(/\r\n?/g, "\n");
  if (exists("content/outlines/outline.md")) throw new Error("content/outlines/outline.md đã tồn tại — không ghi đè");
  w("content/outlines/outline.md", serializeFrontmatter({ title: "Outline tổng (từ Google Docs)", type: "outline", status: "planned", source: "Google Docs: The Last Miracle - Outline" }, raw));
}

// ---- chương ----
const parsed = parseImport(fs.readFileSync(chaptersFile, "utf8"), path.basename(chaptersFile));
const chDir = path.join(repo, "content/chapters");
const existing = fs.existsSync(chDir) ? fs.readdirSync(chDir).filter((f) => f.endsWith(".md")) : [];
if (existing.length) throw new Error(`content/chapters đã có ${existing.length} chương — script không ghi đè`);

const report: string[] = [];
for (const wmsg of parsed.warnings) report.push(`! ${wmsg}`);
for (const c of parsed.chapters) {
  if (c.isPreamble) {
    report.push(`- BỎ QUA phần trước chương đầu (${c.words} chữ): ${JSON.stringify(c.body.slice(0, 80))}`);
    continue;
  }
  const id = newId("ch");
  const text = serializeChapter({ meta: { id, title: c.title, act_id: actId, order: c.number ?? c.seq, status: "draft" }, body: `${c.body}\n`, extra: {} });
  w(`content/chapters/${id}.md`, text);
  report.push(`- Ch ${c.number} · ${c.title} · ${c.words} chữ · ${id}${c.warnings.length ? ` · CẢNH BÁO: ${c.warnings.join("; ")}` : ""}`);
}

// ---- chỉ mục ----
const entries = fs.readdirSync(chDir).filter((f) => f.endsWith(".md")).map((f) => {
  const t = fs.readFileSync(path.join(chDir, f), "utf8");
  const d = parseChapter(t);
  return { id: d.meta.id, path: `content/chapters/${f}`, blob: gitBlobSha(t), title: d.meta.title, act_id: d.meta.act_id, order: d.meta.order, status: d.meta.status, pov: d.meta.pov, words: countWords(d.body) };
});
entries.sort((a, b) => a.order - b.order);
w("content/index.json", serializeIndex(entries));

console.log(report.join("\n"));
console.log(`\nĐã ghi ${entries.length} chương vào Act ${actNo}.`);
