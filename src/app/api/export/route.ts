import { guarded } from "@/lib/server/api";
import { getService } from "@/lib/server/service-instance";
import { ValidationError } from "@/lib/server/service";
import { isValidId } from "@/lib/domain/ids";

function attachment(text: string, filename: string) {
  return new Response(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** Xuất một chương (?chapter=id) hoặc toàn bộ bản thảo thành Markdown. */
export const GET = guarded(async (req) => {
  const svc = await getService();
  const id = req.nextUrl.searchParams.get("chapter");
  const raw = req.nextUrl.searchParams.get("format") === "raw";
  if (id) {
    if (!isValidId(id)) throw new ValidationError("ID chương không hợp lệ");
    const v = await svc.getChapter(id);
    const snap = await svc.snapshot();
    const n = snap.chapters.find((c) => c.id === id)?.number ?? 0;
    if (raw) return attachment(await svc.store.readBlob(v.blob), `${id}.md`);
    return attachment(`## Ch ${n} · ${v.doc.meta.title}\n\n${v.doc.body}`, `Ch${String(n).padStart(3, "0")}-${v.doc.meta.title}.md`);
  }
  const { text, snap } = await svc.exportManuscript();
  return attachment(text, `${snap.project.title}-${snap.headSha.slice(0, 7)}.md`);
});
