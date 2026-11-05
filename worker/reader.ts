import { isValidId } from "../src/lib/domain/ids";
import { ApiRouteError } from "../src/lib/core/api-routes";
import type { Env } from "./env";
import { serviceFor } from "./novels";

/**
 * API cho CHẾ ĐỘ ĐỌC. Chỉ trả về chương truyện của bản chính: không có Act 0 (outline,
 * trivia, ghi chú), không có đề xuất, lịch sử, nháp hay metadata nội bộ (blob, đường dẫn…).
 */
export async function readerToc(env: Env, novelId: string) {
  const snap = await serviceFor(env, novelId, "reader").snapshot();
  const acts = snap.acts.filter((a) => a.kind !== "notes").sort((a, b) => a.order - b.order);
  const chapters = snap.chapters.filter((c) => !c.note).sort((a, b) => a.number - b.number);
  return {
    title: snap.project.title,
    subtitle: snap.project.subtitle ?? null,
    acts: acts
      .map((a) => ({
        id: a.id,
        title: a.title,
        chapters: chapters.filter((c) => c.act_id === a.id).map((c) => ({ id: c.id, number: c.number, title: c.title, words: c.words })),
      }))
      .filter((a) => a.chapters.length > 0),
  };
}

export async function readerChapter(env: Env, novelId: string, chapterId: string) {
  if (!isValidId(chapterId) || !chapterId.startsWith("ch_")) throw new ApiRouteError("ID chương không hợp lệ", 400, "invalid");
  const svc = serviceFor(env, novelId, "reader");
  const snap = await svc.snapshot();
  const list = snap.chapters.filter((c) => !c.note).sort((a, b) => a.number - b.number);
  const i = list.findIndex((c) => c.id === chapterId);
  // ghi chú Act 0 hoặc chương không tồn tại: trả 404 như nhau (không lộ là có ghi chú)
  if (i < 0) throw new ApiRouteError("Không có chương này", 404, "not_found");
  const v = await svc.getChapter(chapterId, snap.headSha);
  const act = snap.acts.find((a) => a.id === list[i].act_id);
  const brief = (c: (typeof list)[number] | undefined) => (c ? { id: c.id, number: c.number, title: c.title } : null);
  return {
    id: chapterId,
    number: list[i].number,
    title: v.doc.meta.title,
    act: act ? act.title : null,
    body: v.doc.body,
    words: v.words,
    prev: brief(list[i - 1]),
    next: brief(list[i + 1]),
  };
}
