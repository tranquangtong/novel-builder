import { body, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";
import { attributed } from "@/lib/server/attribution";

export const POST = guarded<{ n: string }>(async (req, { params, session }) => {
  const n = Number(params.n);
  const b = await body<{ body?: string }>(req);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError("Số đề xuất không hợp lệ");
  if (!b.body?.trim()) throw new ValidationError("Bình luận trống");
  const svc = await getService();
  await svc.store.commentPull(n, attributed(svc.store.kind, session.login, b.body.trim()));
  return json({ ok: true }, 201);
});
