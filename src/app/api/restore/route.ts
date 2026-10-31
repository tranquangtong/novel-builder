import { authorOf, body, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";
import { isValidId } from "@/lib/domain/ids";

/** Phục hồi chương bằng một phiên bản MỚI (không rollback toàn repo). */
export const POST = guarded(async (req, { session }) => {
  const b = await body<{ fromCommit: string; chapterIds: string[]; current: Record<string, string>; keepMeta?: boolean }>(req);
  if (!/^[0-9a-f]{40}$/.test(b.fromCommit ?? "")) throw new ValidationError("Phiên bản không hợp lệ");
  if (!Array.isArray(b.chapterIds) || !b.chapterIds.every(isValidId)) throw new ValidationError("Danh sách chương không hợp lệ");
  const svc = await getService();
  const r = await svc.restoreChapters({ fromCommit: b.fromCommit, chapterIds: b.chapterIds, current: b.current ?? {}, keepMeta: b.keepMeta !== false }, authorOf(session));
  return json({ commitSha: r.commitSha });
});
