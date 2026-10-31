import { guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";

export const GET = guarded<{ n: string }>(async (_req, { params }) => {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError("Số đề xuất không hợp lệ");
  const svc = await getService();
  const [detail, actor] = await Promise.all([svc.proposalDetail(n), svc.store.actorLogin().catch(() => null)]);
  return json({ ...detail, actor, mode: svc.store.kind });
});
