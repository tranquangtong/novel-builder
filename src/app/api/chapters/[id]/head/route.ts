import { guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";
import { isValidId } from "@/lib/domain/ids";

/** Phiên bản mới nhất của chương trên bản chính (để phát hiện thay đổi từ bên ngoài). */
export const GET = guarded<{ id: string }>(async (_req, { params }) => {
  if (!isValidId(params.id)) throw new ValidationError("ID chương không hợp lệ");
  const svc = await getService();
  return json(await svc.chapterHead(params.id));
});
