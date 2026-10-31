import { authorOf, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";

export const POST = guarded(async (_req, { session }) => {
  const svc = await getService();
  const r = await svc.repairIndex(authorOf(session));
  return json({ commitSha: r.commitSha });
});
