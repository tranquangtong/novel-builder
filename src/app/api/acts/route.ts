import { authorOf, body, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";

export const POST = guarded(async (req, { session }) => {
  const b = await body<{ title?: string; description?: string }>(req);
  if (!b.title?.trim()) throw new ValidationError("Cần tên Act");
  const svc = await getService();
  return json(await svc.createAct({ title: b.title.trim(), description: b.description }, authorOf(session)), 201);
});
