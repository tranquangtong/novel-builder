import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
import { CHAPTER_STATUSES, type ChapterDoc, type ChapterMeta, type ChapterStatus } from "./types";

const MANAGED = ["id", "title", "act_id", "order", "status", "pov"] as const;

export class ChapterFormatError extends Error {}

export function parseChapter(text: string, fallbackId?: string): ChapterDoc {
  const { data, body } = parseFrontmatter(text);
  const id = typeof data.id === "string" ? data.id : fallbackId;
  if (!id) throw new ChapterFormatError("Chương thiếu id trong frontmatter");
  const status = CHAPTER_STATUSES.includes(data.status as ChapterStatus) ? (data.status as ChapterStatus) : "draft";
  const order = typeof data.order === "number" ? data.order : Number(data.order);
  const meta: ChapterMeta = {
    id,
    title: typeof data.title === "string" ? data.title : String(data.title ?? "(Chưa đặt tên)"),
    act_id: typeof data.act_id === "string" ? data.act_id : "",
    order: Number.isFinite(order) ? order : 0,
    status,
    pov: typeof data.pov === "string" && data.pov ? data.pov : undefined,
  };
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (!(MANAGED as readonly string[]).includes(k)) extra[k] = v;
  return { meta, body, extra };
}

export function serializeChapter(doc: ChapterDoc): string {
  const { meta } = doc;
  const data: Record<string, unknown> = {
    id: meta.id,
    title: meta.title,
    act_id: meta.act_id,
    order: meta.order,
    status: meta.status,
    pov: meta.pov,
    ...doc.extra,
  };
  return serializeFrontmatter(data, doc.body);
}

export function validateMeta(meta: Partial<ChapterMeta>): string[] {
  const errs: string[] = [];
  if (!meta.title || !meta.title.trim()) errs.push("Tiêu đề không được để trống");
  if (!meta.act_id) errs.push("Chương phải thuộc một Act");
  if (meta.status && !CHAPTER_STATUSES.includes(meta.status)) errs.push("Trạng thái không hợp lệ");
  if (meta.order !== undefined && !Number.isFinite(meta.order)) errs.push("Thứ tự không hợp lệ");
  return errs;
}
