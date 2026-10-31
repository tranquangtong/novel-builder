import { body, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";
import { attributed } from "@/lib/server/attribution";

export const POST = guarded<{ n: string }>(async (req, { params, session }) => {
  const n = Number(params.n);
  const b = await body<{ reason?: string }>(req);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError("Số đề xuất không hợp lệ");
  const svc = await getService();
  if (b.reason?.trim()) await svc.store.commentPull(n, attributed(svc.store.kind, session.login, `Đóng đề xuất: ${b.reason.trim()}`));
  await svc.store.closePull(n);
  return json({ ok: true });
});
