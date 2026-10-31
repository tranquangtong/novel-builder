import { authorOf, body, guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { initializeStructure } from "@/lib/server/init-structure";

/** Khởi tạo cấu trúc bản thảo trong repo trống (chỉ khi chưa có content/project.json). */
export const POST = guarded(async (req, { session }) => {
  const { title } = await body<{ title?: string }>(req);
  const svc = await getService();
  const r = await initializeStructure(svc, title || "The Last Miracle", authorOf(session));
  return json(r);
});
