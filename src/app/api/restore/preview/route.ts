import { body, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";
import { chapterIdFromPath } from "@/lib/domain/paths";

/**
 * Xem trước phục hồi: so sánh chương ở phiên bản cũ với bản hiện tại.
 * Không ghi gì cả.
 */
export const POST = guarded(async (req) => {
  const b = await body<{ fromCommit: string; chapterIds?: string[] }>(req);
  if (!/^[0-9a-f]{40}$/.test(b.fromCommit ?? "")) throw new ValidationError("Phiên bản không hợp lệ");
  const svc = await getService();
  const snap = await svc.snapshot();
  const oldTree = await svc.store.getTree(b.fromCommit);
  const byId = new Map(snap.chapters.map((c) => [c.id, c]));
  const candidates: string[] = [];
  for (const [p, blob] of oldTree) {
    const id = chapterIdFromPath(p);
    if (id && snap.tree.get(p) && snap.tree.get(p) !== blob) candidates.push(id);
  }
  const ids = b.chapterIds?.length ? b.chapterIds : candidates;
  const items = await Promise.all(
    ids.map(async (id) => {
      const cur = byId.get(id);
      if (!cur) return { id, missing: true as const };
      const old = await svc.getChapter(id, b.fromCommit).catch(() => null);
      if (!old) return { id, missing: true as const };
      const now = b.chapterIds?.length ? await svc.getChapter(id) : null;
      return {
        id, number: cur.number, title: cur.title, currentBlob: cur.blob, oldBlob: old.blob,
        oldTitle: old.doc.meta.title, oldWords: old.words, currentWords: cur.words,
        oldBody: b.chapterIds?.length ? old.doc.body : undefined,
        currentBody: now?.doc.body,
      };
    }),
  );
  return json({ fromCommit: b.fromCommit, headSha: snap.headSha, candidates: candidates.length, items: items.sort((x, y) => (("number" in x ? x.number : 0) ?? 0) - (("number" in y ? y.number : 0) ?? 0)) });
});
