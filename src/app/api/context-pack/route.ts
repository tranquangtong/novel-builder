import { body, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { buildContextPack, type PackRequest } from "@/lib/server/context-pack";

export const POST = guarded(async (req) => {
  const b = await body<PackRequest>(req);
  const svc = await getService();
  return json(await buildContextPack(svc, b));
});
