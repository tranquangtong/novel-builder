import { guarded, json } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";

const ALLOWED = ["content/canon/", "content/outlines/", "content/summaries/", "content/reviews/", "content/acts/", "content/notes/"];

/** Liệt kê file canon/outline/tóm tắt (frontmatter, không thân). */
export const GET = guarded(async (req) => {
  const prefix = req.nextUrl.searchParams.get("prefix") ?? "content/canon/";
  if (!ALLOWED.some((a) => prefix.startsWith(a))) throw new ValidationError("Thư mục không được phép");
  const svc = await getService();
  const { headSha, tree, files } = await svc.listFiles(prefix);
  // gắn blob hiện tại của chương nguồn để nhận biết tóm tắt đã cũ
  const withSource = files.map((f) => {
    const cid = typeof f.data.chapter_id === "string" ? f.data.chapter_id : null;
    const current = cid ? tree.get(`content/chapters/${cid}.md`) ?? null : null;
    return { ...f, sourceCurrentBlob: current, stale: cid ? current !== f.data.source_blob : undefined };
  });
  return json({ headSha, files: withSource });
});
