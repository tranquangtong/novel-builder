import { authorOf, body, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";
import { StoreError } from "@/lib/store/types";

export const GET = guarded(async (req) => {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const commit = req.nextUrl.searchParams.get("commit") ?? undefined;
  if (commit && !/^[0-9a-f]{40}$/.test(commit)) throw new ValidationError("Phiên bản không hợp lệ");
  const svc = await getService();
  const f = await svc.readFile(path, commit);
  if (!f) throw new StoreError("Không có file", 404);
  return json(f);
});

export const PUT = guarded(async (req, { session }) => {
  const b = await body<{ path: string; content: string; baseBlob: string | null; message?: string }>(req);
  if (typeof b.content !== "string") throw new ValidationError("Thiếu nội dung");
  const svc = await getService();
  const r = await svc.saveFile(b.path, b.content, b.baseBlob ?? null, b.message?.trim() || `Lưu phiên bản: ${b.path}`, authorOf(session));
  return json(r);
});
