/**
 * Sinh lại content/index.json từ frontmatter của content/chapters/*.md trong một
 * bản clone của repo bản thảo. Dùng để bảo trì thủ công; ứng dụng vẫn tự sửa chỉ mục
 * mỗi khi lưu. Cách dùng: npm run reindex -- /đường/dẫn/tới/repo-bản-thảo
 */
import fs from "node:fs";
import path from "node:path";
import { parseChapter } from "../src/lib/domain/chapter";
import { gitBlobSha } from "../src/lib/domain/gitsha";
import { countWords } from "../src/lib/domain/wordcount";
import { serializeIndex } from "../src/lib/core/service";

const root = path.resolve(process.argv[2] ?? ".");
const dir = path.join(root, "content/chapters");
if (!fs.existsSync(dir)) {
  console.error(`Không thấy ${dir}`);
  process.exit(1);
}
const entries = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => {
  const text = fs.readFileSync(path.join(dir, f), "utf8");
  const p = `content/chapters/${f}`;
  const doc = parseChapter(text, f.replace(/\.md$/, ""));
  return { id: doc.meta.id, path: p, blob: gitBlobSha(text), title: doc.meta.title, act_id: doc.meta.act_id, order: doc.meta.order, status: doc.meta.status, pov: doc.meta.pov, words: countWords(doc.body) };
});
entries.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
fs.writeFileSync(path.join(root, "content/index.json"), serializeIndex(entries));
console.log(`Đã ghi content/index.json với ${entries.length} chương.`);
