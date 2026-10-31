import { guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";

export const GET = guarded<{ sha: string }>(async (_req, { params }) => {
  if (!/^[0-9a-f]{40}$/.test(params.sha)) throw new ValidationError("Phiên bản không hợp lệ");
  const svc = await getService();
  return json(await svc.store.getCommit(params.sha));
});
