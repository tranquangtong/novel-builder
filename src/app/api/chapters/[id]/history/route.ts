import { guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";
import { isValidId } from "@/lib/domain/ids";

export const GET = guarded<{ id: string }>(async (req, { params }) => {
  if (!isValidId(params.id)) throw new ValidationError("ID chương không hợp lệ");
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1) || 1);
  const svc = await getService();
  return json({ versions: await svc.chapterHistory(params.id, page) });
});
