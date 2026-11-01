import { isValidId } from "../src/lib/domain/ids";
import { ApiRouteError } from "../src/lib/core/api-routes";
import type { Env } from "./env";

/**
 * NHÁP TỰ LƯU trên R2: novels/<novelId>/drafts/<chapterId>.json
 * Tách hẳn khỏi lịch sử phiên bản (không tạo commit). Ghi đè được, mỗi chương một bản nháp
 * (bản mới nhất). Nháp mang theo baseBlob/baseCommit để phát hiện bản chính đã đổi.
 */
export interface ServerDraft {
  chapterId: string;
  baseBlob: string | null;
  baseCommit: string;
  body: string;
  meta: Record<string, unknown>;
  updatedAt: number;
  by: string;
  device: string;
}

const MAX_DRAFT_BYTES = 2 * 1024 * 1024;
const key = (novelId: string, chapterId: string) => `novels/${novelId}/drafts/${chapterId}.json`;

function needChapter(id: string) {
  if (!isValidId(id) || !id.startsWith("ch_")) throw new ApiRouteError("ID chương không hợp lệ", 400, "invalid");
}

export async function getDraft(env: Env, novelId: string, chapterId: string): Promise<ServerDraft | null> {
  needChapter(chapterId);
  const o = await env.BUCKET.get(key(novelId, chapterId));
  return o ? ((await o.json()) as ServerDraft) : null;
}

export async function putDraft(env: Env, novelId: string, chapterId: string, by: string, input: Record<string, unknown>): Promise<ServerDraft> {
  needChapter(chapterId);
  if (typeof input.body !== "string" || typeof input.meta !== "object" || !input.meta) throw new ApiRouteError("Nháp không hợp lệ", 400, "invalid");
  const d: ServerDraft = {
    chapterId,
    baseBlob: typeof input.baseBlob === "string" ? input.baseBlob : null,
    baseCommit: String(input.baseCommit ?? ""),
    body: input.body,
    meta: input.meta as Record<string, unknown>,
    updatedAt: Number(input.updatedAt) || Date.now(),
    by,
    device: String(input.device ?? "").slice(0, 40),
  };
  const json = JSON.stringify(d);
  if (json.length > MAX_DRAFT_BYTES) throw new ApiRouteError("Nháp quá lớn", 413, "invalid");
  // Không ghi đè nháp mới hơn (ví dụ thiết bị khác vừa gõ sau)
  const cur = await getDraft(env, novelId, chapterId);
  if (cur && cur.updatedAt > d.updatedAt && cur.device !== d.device) {
    throw new ApiRouteError("Đã có nháp mới hơn từ thiết bị khác", 409, "draft_newer", { draft: cur as unknown as Record<string, unknown> });
  }
  await env.BUCKET.put(key(novelId, chapterId), json, { httpMetadata: { contentType: "application/json" } });
  return d;
}

/** Xóa nháp chỉ khi đúng là bản đã được lưu thành phiên bản (so updatedAt). */
export async function deleteDraft(env: Env, novelId: string, chapterId: string, ifUpdatedAt?: number) {
  needChapter(chapterId);
  if (ifUpdatedAt) {
    const cur = await getDraft(env, novelId, chapterId);
    if (cur && cur.updatedAt > ifUpdatedAt) return { deleted: false };
  }
  await env.BUCKET.delete(key(novelId, chapterId));
  return { deleted: true };
}

/** Danh sách chương đang có nháp chưa lưu thành phiên bản. */
export async function listDrafts(env: Env, novelId: string) {
  const out: { chapterId: string; updatedAt: string }[] = [];
  let cursor: string | undefined;
  do {
    const r = await env.BUCKET.list({ prefix: `novels/${novelId}/drafts/`, cursor });
    for (const o of r.objects) out.push({ chapterId: o.key.split("/").pop()!.replace(/\.json$/, ""), updatedAt: o.uploaded.toISOString() });
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}
