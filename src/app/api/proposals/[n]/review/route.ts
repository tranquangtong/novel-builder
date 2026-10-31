import { body, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";
import { attributed } from "@/lib/server/attribution";
import { StoreError } from "@/lib/store/types";

/**
 * Review CHÍNH THỨC trên GitHub (APPROVE / REQUEST_CHANGES). Khác với “Chấp nhận” trong
 * ứng dụng (= merge). GitHub không cho tác giả PR tự approve/yêu cầu sửa PR của mình;
 * khi đó “Yêu cầu sửa” được gửi thành bình luận thường và báo rõ cho người dùng.
 */
export const POST = guarded<{ n: string }>(async (req, { params, session }) => {
  const n = Number(params.n);
  const b = await body<{ event?: string; body?: string }>(req);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError("Số đề xuất không hợp lệ");
  const event = b.event === "APPROVE" || b.event === "REQUEST_CHANGES" ? b.event : null;
  if (!event) throw new ValidationError("event phải là APPROVE hoặc REQUEST_CHANGES");
  const text = b.body?.trim() || (event === "APPROVE" ? "Đồng ý." : "");
  if (event === "REQUEST_CHANGES" && !text) throw new ValidationError("Hãy ghi rõ cần sửa gì");
  const svc = await getService();
  const msg = attributed(svc.store.kind, session.login, event === "REQUEST_CHANGES" ? `**Yêu cầu sửa:**\n\n${text}` : text);
  try {
    await svc.store.reviewPull(n, event, msg);
    return json({ ok: true, delivered: "review" });
  } catch (e) {
    if (e instanceof StoreError && e.status === 422 && event === "REQUEST_CHANGES") {
      await svc.store.commentPull(n, msg);
      return json({ ok: true, delivered: "comment", note: "GitHub không cho tài khoản này gửi review chính thức trên đề xuất này (thường vì đó là PR của chính tài khoản). Yêu cầu đã được gửi dưới dạng bình luận." });
    }
    throw e;
  }
});
