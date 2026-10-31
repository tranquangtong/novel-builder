import { authorOf, body, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";
import { isValidId } from "@/lib/domain/ids";
import type { ChapterMeta } from "@/lib/domain/types";

/** Đọc MỘT chương (tùy chọn ở một phiên bản cụ thể). */
export const GET = guarded<{ id: string }>(async (req, { params }) => {
  if (!isValidId(params.id)) throw new ValidationError("ID chương không hợp lệ");
  const commit = req.nextUrl.searchParams.get("commit") ?? undefined;
  if (commit && !/^[0-9a-f]{40}$/.test(commit)) throw new ValidationError("Phiên bản không hợp lệ");
  const svc = await getService();
  return json(await svc.getChapter(params.id, commit));
});

/** “Lưu phiên bản”: tạo một commit; từ chối nếu baseBlob không còn khớp. */
export const PUT = guarded<{ id: string }>(async (req, { params, session }) => {
  if (!isValidId(params.id)) throw new ValidationError("ID chương không hợp lệ");
  const b = await body<{ meta: Omit<ChapterMeta, "id">; body: string; baseBlob: string | null; note?: string }>(req);
  if (typeof b.body !== "string" || !b.meta) throw new ValidationError("Thiếu nội dung");
  if (b.baseBlob !== null && typeof b.baseBlob !== "string") throw new ValidationError("Thiếu phiên bản gốc (baseBlob)");
  const svc = await getService();
  const meta = { title: String(b.meta.title ?? ""), act_id: String(b.meta.act_id ?? ""), order: Number(b.meta.order), status: b.meta.status, pov: b.meta.pov || undefined };
  const r = await svc.saveChapter(params.id, { meta, body: b.body, baseBlob: b.baseBlob, note: b.note?.slice(0, 2000) }, authorOf(session));
  return json(r);
});
