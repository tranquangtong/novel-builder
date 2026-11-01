import { chapterLabel } from "../domain/labels";
import { chapterIdFromPath, chapterPath, fileKind, summaryPath, KIND_LABEL, assertSafeContentPath } from "../domain/paths";
import { ValidationError, type ManuscriptService } from "./service";

export interface PackRequest {
  task: string;
  targets: string[];
  neighbors: string[];
  files: string[];
  includeSummariesForNeighbors?: boolean;
}

export type PackRole = "target" | "neighbor" | "canon" | "knowledge" | "timeline" | "outline" | "summary" | "note" | "other";

/**
 * “Gói tài liệu cho nhiệm vụ”: manifest gồm đường dẫn + phiên bản nguồn (blob sha)
 * tại một commit cố định. Không nhúng nội dung — agent tự đọc đúng phiên bản trong repo.
 */
export async function buildContextPack(svc: ManuscriptService, req: PackRequest) {
  if (!req.targets?.length) throw new ValidationError("Chọn ít nhất một chương cần xử lý");
  const snap = await svc.snapshot();
  const byId = new Map(snap.chapters.map((c) => [c.id, c]));
  const entries: { role: PackRole; path: string; blob: string; label: string; words?: number; stale?: boolean; note?: string }[] = [];
  const seen = new Set<string>();
  const add = (e: (typeof entries)[number]) => {
    if (seen.has(e.path)) return;
    seen.add(e.path);
    entries.push(e);
  };
  for (const id of req.targets) {
    const c = byId.get(id);
    if (!c) throw new ValidationError(`Không có chương ${id}`);
    if (c.note) throw new ValidationError("Ghi chú Act 0 chỉ thêm vào gói như tài liệu tham khảo, không phải chương cần xử lý");
    add({ role: "target", path: c.path, blob: c.blob, label: chapterLabel(c), words: c.words });
  }
  for (const id of req.neighbors ?? []) {
    const c = byId.get(id);
    if (!c) continue;
    add({ role: "neighbor", path: c.path, blob: c.blob, label: chapterLabel(c), words: c.words, note: "chương lân cận — chỉ để tham khảo, không sửa" });
    if (req.includeSummariesForNeighbors) {
      const sp = summaryPath(id);
      const sb = snap.tree.get(sp);
      if (sb) {
        const f = await svc.parsedFile(sb);
        add({ role: "summary", path: sp, blob: sb, label: `Tóm tắt Ch ${c.number}`, stale: f.data.source_blob !== c.blob, note: "tóm tắt dẫn xuất — không thay thế nguyên văn" });
      }
    }
  }
  for (const p of req.files ?? []) {
    assertSafeContentPath(p);
    const blob = snap.tree.get(p);
    if (!blob) throw new ValidationError(`Không có file ${p}`);
    const kind = fileKind(p);
    const noteCh = kind === "chapter" ? snap.chapters.find((c) => c.id === chapterIdFromPath(p)) : undefined;
    if (noteCh?.note) {
      add({ role: "note", path: p, blob, label: `Act 0 · ${noteCh.title}`, note: "ghi chú viết truyện (outline, trivia…) — chỉ để đọc" });
      continue;
    }
    const role: PackRole = kind === "canon-character" || kind === "canon-world" ? "canon" : kind === "canon-knowledge" ? "knowledge" : kind === "canon-timeline" ? "timeline" : kind === "outline" ? "outline" : kind === "summary" ? "summary" : "other";
    let stale: boolean | undefined;
    let label = p.split("/").pop()!;
    if (p.endsWith(".md")) {
      const f = await svc.parsedFile(blob);
      label = String(f.data.title ?? label);
      if (kind === "summary" && typeof f.data.chapter_id === "string") stale = snap.tree.get(chapterPath(f.data.chapter_id)) !== f.data.source_blob;
    }
    add({ role, path: p, blob, label: `${KIND_LABEL[kind]}: ${label}`, stale });
  }
  const manifest = {
    kind: "the-last-miracle/context-pack",
    version: 1,
    created_at: new Date().toISOString(),
    repo: snap.repo,
    branch: snap.branch,
    commit: snap.headSha,
    task: req.task?.trim() || "",
    rules: [
      "Đọc AGENTS.md trước.",
      "Chỉ sửa các file role=target. Các file khác chỉ để đọc.",
      "Đọc đúng phiên bản: git show <commit>:<path> hoặc so blob sha.",
      "Tóm tắt (role=summary) không thay thế nguyên văn; stale=true nghĩa là tóm tắt đã cũ.",
      "Làm trên branch riêng và mở pull request; nêu rõ chương bị ảnh hưởng và thay đổi canon.",
      "Không tuyên bố đã review toàn truyện — chỉ những file trong gói này.",
    ],
    files: entries,
    totals: { files: entries.length, chapter_words: entries.reduce((s, e) => s + (e.words ?? 0), 0), manuscript_chapters: snap.chapters.filter((c) => !c.note).length },
  };
  return manifest;
}
