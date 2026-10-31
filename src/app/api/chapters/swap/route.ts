import { authorOf, body, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";

export const POST = guarded(async (req, { session }) => {
  const b = await body<{ a: { id: string; blob: string }; b: { id: string; blob: string } }>(req);
  const svc = await getService();
  const r = await svc.swapOrder(b.a, b.b, authorOf(session));
  return json({ commitSha: r.commitSha });
});
