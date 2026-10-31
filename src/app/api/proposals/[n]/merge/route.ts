import { body, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";
import { HeadChangedError, NotMergeableError } from "@/lib/store/types";

/**
 * “Chấp nhận toàn bộ đề xuất” = merge pull request vào bản chính.
 * Chỉ merge nếu head của đề xuất vẫn đúng bằng phiên bản tác giả đã xem (expectedHeadSha).
 */
export const POST = guarded<{ n: string }>(async (req, { params }) => {
  const n = Number(params.n);
  const b = await body<{ expectedHeadSha?: string }>(req);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError("Số đề xuất không hợp lệ");
  if (!/^[0-9a-f]{40}$/.test(b.expectedHeadSha ?? "")) throw new ValidationError("Thiếu phiên bản đã xem (expectedHeadSha)");
  const svc = await getService();
  const pr = await svc.store.getPull(n);
  if (pr.state !== "open") throw new NotMergeableError("Đề xuất không còn mở");
  if (pr.headSha !== b.expectedHeadSha) throw new HeadChangedError(pr.headSha);
  if (pr.mergeable === false) throw new NotMergeableError(`Đề xuất xung đột với bản chính${pr.conflictFiles.length ? `: ${pr.conflictFiles.join(", ")}` : ""}`);
  if (pr.mergeable === null) throw new NotMergeableError("GitHub đang kiểm tra khả năng merge, thử lại sau vài giây");
  const r = await svc.store.mergePull(n, b.expectedHeadSha!, `Nhập đề xuất #${n}: ${pr.title}`);
  return json({ ok: true, sha: r.sha });
});
