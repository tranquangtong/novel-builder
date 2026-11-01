import { ManuscriptService, serializeIndex, ValidationError } from "../src/lib/core/service";
import { serializeFrontmatter } from "../src/lib/domain/frontmatter";
import { newId } from "../src/lib/domain/ids";
import { AGENTS_MD } from "../src/lib/domain/agents-md";
import { parseChapter } from "../src/lib/domain/chapter";
import { gitBlobSha } from "../src/lib/domain/gitsha";
import { countWords } from "../src/lib/domain/wordcount";
import { DemoStore } from "../src/lib/store/demo/demo-store";
import { MiniGit } from "../src/lib/store/demo/minigit";
import { StoreError } from "../src/lib/store/types";
import type { Env } from "./env";
import { R2D1Storage } from "./storage";

export interface NovelRow {
  id: string;
  title: string;
  created_at: string;
  created_by: string;
}

export const NOVEL_ID = /^nv_[0-9a-z]{6,20}$/;

export function storeFor(env: Env, novelId: string, actor: string) {
  return new DemoStore(new MiniGit(new R2D1Storage(env, novelId)), actor, `cloud:${novelId}`);
}

export async function getNovel(env: Env, id: string): Promise<NovelRow | null> {
  if (!NOVEL_ID.test(id)) return null;
  return env.DB.prepare("SELECT id, title, created_at, created_by FROM novels WHERE id = ?").bind(id).first<NovelRow>();
}

export async function listNovels(env: Env): Promise<NovelRow[]> {
  const r = await env.DB.prepare("SELECT id, title, created_at, created_by FROM novels ORDER BY created_at").all<NovelRow>();
  return r.results ?? [];
}

const MAX_FILES = 5000;

/**
 * Tạo bộ truyện mới. `files` (tùy chọn) là toàn bộ file văn bản của một bản thảo có sẵn
 * (ví dụ chuyển từ repo GitHub): được ghi NGUYÊN VĂN vào phiên bản đầu tiên.
 * Không có `files` → tạo cấu trúc trống (project.json, Act đầu tiên, AGENTS.md).
 */
export async function createNovel(env: Env, actor: string, input: { title?: string; files?: Record<string, string> }) {
  const title = String(input.title ?? "").trim();
  if (!title) throw new ValidationError("Bộ truyện cần tên");
  if (title.length > 200) throw new ValidationError("Tên quá dài");
  const id = newId("ch").replace(/^ch_/, "nv_");
  let files: Record<string, string>;
  if (input.files && Object.keys(input.files).length) {
    const entries = Object.entries(input.files);
    if (entries.length > MAX_FILES) throw new ValidationError(`Tối đa ${MAX_FILES} file`);
    for (const [p, c] of entries) {
      if (typeof c !== "string") throw new ValidationError(`Nội dung ${p} không hợp lệ`);
      if (p !== "AGENTS.md" && !/^content\/[A-Za-z0-9_\-./]+$/.test(p)) throw new ValidationError(`Đường dẫn không được phép: ${p}`);
      if (p.includes("..")) throw new ValidationError(`Đường dẫn không hợp lệ: ${p}`);
    }
    files = { ...input.files };
    if (!files["content/project.json"]) throw new ValidationError("Thiếu content/project.json");
    if (!files["AGENTS.md"]) files["AGENTS.md"] = AGENTS_MD;
  } else {
    const actId = newId("act");
    files = {
      "content/project.json": JSON.stringify({ title, language: "vi", word_target: { min: 2500, max: 3000 } }, null, 2) + "\n",
      [`content/acts/${actId}.md`]: serializeFrontmatter({ id: actId, title: "Act I", order: 1 }, "\n"),
      "AGENTS.md": AGENTS_MD,
    };
  }
  // Chỉ mục luôn được sinh lại từ frontmatter để khớp với nội dung thật.
  const entries = Object.entries(files)
    .filter(([p]) => /^content\/chapters\/[^/]+\.md$/.test(p))
    .map(([p, t]) => {
      const d = parseChapter(t, p.replace(/^content\/chapters\/|\.md$/g, ""));
      return { id: d.meta.id, path: p, blob: gitBlobSha(t), title: d.meta.title, act_id: d.meta.act_id, order: d.meta.order, status: d.meta.status, pov: d.meta.pov, words: countWords(d.body) };
    })
    .sort((a, b) => a.order - b.order);
  files["content/index.json"] = serializeIndex(entries);

  const git = new MiniGit(new R2D1Storage(env, id));
  const tree: Record<string, string> = {};
  for (const [p, c] of Object.entries(files)) tree[p] = await git.writeBlob(c);
  const commit = await git.writeCommit({ tree, parents: [], message: input.files ? `Chuyển bản thảo “${title}” lên Cloudflare` : `Tạo bộ truyện “${title}”`, author: actor, date: new Date().toISOString() });
  const now = new Date().toISOString();
  const res = await env.DB.batch([
    env.DB.prepare("INSERT INTO novels (id, title, created_at, created_by) VALUES (?, ?, ?, ?)").bind(id, title, now, actor),
    env.DB.prepare("INSERT INTO repo_state (novel_id, state, version) VALUES (?, ?, 1)").bind(id, JSON.stringify({ refs: { main: commit.sha }, pulls: [] })),
  ]);
  if (!res.every((r: { success: boolean }) => r.success)) throw new StoreError("Không tạo được bộ truyện", 500);
  return { id, title, chapters: entries.length, commitSha: commit.sha };
}

export function serviceFor(env: Env, novelId: string, actor: string) {
  return new ManuscriptService(storeFor(env, novelId, actor));
}
