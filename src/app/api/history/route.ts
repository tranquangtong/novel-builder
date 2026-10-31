import { guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";

export const GET = guarded(async (req) => {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1) || 1);
  const svc = await getService();
  return json({ commits: await svc.store.listCommits({ branch: svc.branch, limit: 30, page }) });
});
