import { guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";

export const GET = guarded(async (req) => {
  const st = req.nextUrl.searchParams.get("state");
  const state = st === "closed" || st === "all" ? st : "open";
  const svc = await getService();
  const [pulls, snap] = await Promise.all([svc.store.listPulls(state), svc.snapshot()]);
  const byPath = new Map(snap.chapters.map((c) => [c.path, { id: c.id, number: c.number, title: c.title }]));
  return json({
    pulls: pulls.map((p) => ({ ...p, chapters: p.files.map((f) => byPath.get(f.path)).filter(Boolean) })),
  });
});
