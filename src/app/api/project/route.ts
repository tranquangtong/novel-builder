import { guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";

/** Danh sách Act/chương — chỉ metadata, KHÔNG có nội dung chương. */
export const GET = guarded(async () => {
  const svc = await getService();
  const { tree: _tree, ...snap } = await svc.snapshot();
  void _tree;
  return json(snap);
});
