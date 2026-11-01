import { ValidationError } from "../src/lib/core/service";
import { ApiRouteError } from "../src/lib/core/api-routes";
import type { Env } from "./env";

/**
 * Ảnh đi kèm chương (sketch, minh hoạ, tham khảo) lưu ở R2:
 *   novels/<novelId>/assets/<chapterId | chung>/<thời-điểm>-<ngẫu-nhiên>-<tên-file>
 * Khóa không bao giờ bị ghi đè (mỗi lần tải lên là một khóa mới). Xóa = chuyển vào
 * novels/<novelId>/trash/... để có thể khôi phục thủ công.
 * Không nhận SVG (có thể chứa script).
 */
export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const ASSET_KINDS = ["sketch", "illustration", "reference"] as const;
const SCOPE = /^(chung|ch_[0-9a-z_-]{3,40})$/;

export interface AssetInfo {
  key: string;
  scope: string;
  kind: string;
  caption: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
}

const prefix = (novelId: string) => `novels/${novelId}/assets/`;

function safeName(name: string) {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  return base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "anh";
}

export function assetKeyValid(novelId: string, rel: string) {
  return /^(chung|ch_[0-9a-z_-]{3,40})\/[0-9a-z]+-[0-9a-z]+-[A-Za-z0-9._-]{1,80}$/.test(rel) && !rel.includes("..") ? `${prefix(novelId)}${rel}` : null;
}

export async function listAssets(env: Env, novelId: string, scope?: string | null): Promise<AssetInfo[]> {
  if (scope && !SCOPE.test(scope)) throw new ValidationError("Phạm vi ảnh không hợp lệ");
  const out: AssetInfo[] = [];
  let cursor: string | undefined;
  do {
    const r = await env.BUCKET.list({ prefix: prefix(novelId) + (scope ? `${scope}/` : ""), cursor, include: ["customMetadata", "httpMetadata"] });
    for (const o of r.objects) {
      const rel = o.key.slice(prefix(novelId).length);
      const m = o.customMetadata ?? {};
      out.push({
        key: rel, scope: rel.split("/")[0], kind: m.kind ?? "reference", caption: decodeMeta(m.caption), fileName: decodeMeta(m.fileName),
        contentType: o.httpMetadata?.contentType ?? "application/octet-stream", size: o.size, uploadedAt: m.uploadedAt ?? o.uploaded.toISOString(), uploadedBy: m.uploadedBy ?? "",
      });
    }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

const encodeMeta = (s: string) => encodeURIComponent(s.slice(0, 500));
const decodeMeta = (s?: string) => {
  try {
    return s ? decodeURIComponent(s) : "";
  } catch {
    return s ?? "";
  }
};

export async function uploadAsset(env: Env, novelId: string, actor: string, req: Request, url: URL): Promise<AssetInfo> {
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[contentType];
  if (!ext) throw new ApiRouteError("Chỉ nhận ảnh JPG, PNG, WebP, GIF hoặc AVIF", 415, "invalid");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new ApiRouteError("Ảnh quá lớn (tối đa 15 MB)", 413, "invalid");
  const scope = url.searchParams.get("chapter") || "chung";
  if (!SCOPE.test(scope)) throw new ValidationError("Chương không hợp lệ");
  const kind = url.searchParams.get("kind") ?? "reference";
  if (!(ASSET_KINDS as readonly string[]).includes(kind)) throw new ValidationError("Loại ảnh không hợp lệ");
  const caption = (url.searchParams.get("caption") ?? "").trim();
  const fileName = (url.searchParams.get("name") ?? `anh.${ext}`).trim();
  const data = await req.arrayBuffer();
  if (!data.byteLength) throw new ValidationError("Tệp rỗng");
  if (data.byteLength > MAX_IMAGE_BYTES) throw new ApiRouteError("Ảnh quá lớn (tối đa 15 MB)", 413, "invalid");
  let name = safeName(fileName);
  if (!name.toLowerCase().endsWith(`.${ext}`)) name = `${name.replace(/\.[A-Za-z0-9]+$/, "")}.${ext}`;
  const rel = `${scope}/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}-${name}`;
  const uploadedAt = new Date().toISOString();
  await env.BUCKET.put(prefix(novelId) + rel, data, {
    httpMetadata: { contentType },
    customMetadata: { kind, caption: encodeMeta(caption), fileName: encodeMeta(fileName), uploadedAt, uploadedBy: actor },
  });
  return { key: rel, scope, kind, caption, fileName, contentType, size: data.byteLength, uploadedAt, uploadedBy: actor };
}

export async function serveAsset(env: Env, novelId: string, rel: string, req: Request): Promise<Response> {
  const key = assetKeyValid(novelId, rel);
  if (!key) return new Response("Không tìm thấy", { status: 404 });
  const o = await env.BUCKET.get(key, { onlyIf: req.headers });
  if (!o) return new Response("Không tìm thấy", { status: 404 });
  const headers = new Headers();
  o.writeHttpMetadata(headers);
  headers.set("etag", o.httpEtag);
  // Khóa ảnh bất biến → có thể cache lâu, nhưng chỉ trong trình duyệt của người đã đăng nhập.
  headers.set("cache-control", "private, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  if (!("body" in o)) return new Response(null, { status: 304, headers });
  return new Response(o.body, { headers });
}

export async function trashAsset(env: Env, novelId: string, rel: string, actor: string) {
  const key = assetKeyValid(novelId, rel);
  if (!key) throw new ApiRouteError("Không tìm thấy ảnh", 404, "not_found");
  const o = await env.BUCKET.get(key);
  if (!o) throw new ApiRouteError("Không tìm thấy ảnh", 404, "not_found");
  await env.BUCKET.put(`novels/${novelId}/trash/${rel}`, await o.arrayBuffer(), {
    httpMetadata: o.httpMetadata,
    customMetadata: { ...(o.customMetadata ?? {}), deletedAt: new Date().toISOString(), deletedBy: actor },
  });
  await env.BUCKET.delete(key);
}
