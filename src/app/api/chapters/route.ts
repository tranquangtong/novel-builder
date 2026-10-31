import { authorOf, body, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";

export const POST = guarded(async (req, { session }) => {
  const b = await body<{ title?: string; act_id?: string; afterId?: string; pov?: string }>(req);
  if (!b.title?.trim() || !b.act_id) throw new ValidationError("Cần tiêu đề và Act");
  const svc = await getService();
  const r = await svc.createChapter({ title: b.title.trim(), act_id: b.act_id, afterId: b.afterId, pov: b.pov }, authorOf(session));
  return json(r, 201);
});
