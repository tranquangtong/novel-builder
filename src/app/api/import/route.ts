import { authorOf, body, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { importChapters, type ImportItem } from "@/lib/server/import-service";

/** Ghi các chương đã được tác giả xác nhận ở bước xem trước — trong MỘT commit. */
export const POST = guarded(async (req, { session }) => {
  const b = await body<{ items: ImportItem[]; newActs?: { key: string; title: string }[]; sourceName?: string }>(req);
  const svc = await getService();
  return json(await importChapters(svc, b, authorOf(session)), 201);
});
