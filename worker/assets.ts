import { ValidationError } from "../src/lib/core/service";
import { ApiRouteError } from "../src/lib/core/api-routes";
import type { Env } from "./env";
import {
  IMAGE_TYPES, MAX_IMAGE_BYTES, SCOPE, assetKeyValid, assetKindValid, assetPrefix,
  buildAssetMetadata, buildAssetRel, moveAssetToTrash, readAssets, trashKey,
  type AssetInfo,
} from "./asset-storage.mjs";

export { ASSET_KINDS, IMAGE_TYPES, MAX_IMAGE_BYTES, assetKeyValid, type AssetInfo } from "./asset-storage.mjs";

export async function listAssets(env: Env, novelId: string, scope?: string | null): Promise<AssetInfo[]> {
  if (scope && !SCOPE.test(scope)) throw new ValidationError("Phạm vi ảnh không hợp lệ");
  return readAssets(env.BUCKET, novelId, scope);
}

export async function uploadAsset(env: Env, novelId: string, actor: string, req: Request, url: URL): Promise<AssetInfo> {
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[contentType];
  if (!ext) throw new ApiRouteError("Chỉ nhận ảnh JPG, PNG, WebP, GIF hoặc AVIF", 415, "invalid");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new ApiRouteError("Ảnh quá lớn (tối đa 15 MB)", 413, "invalid");
  const scope = url.searchParams.get("chapter") || "chung";
  if (!SCOPE.test(scope)) throw new ValidationError("Chương không hợp lệ");
  const kind = url.searchParams.get("kind") ?? "reference";
  if (!assetKindValid(kind)) throw new ValidationError("Loại ảnh không hợp lệ");
  const caption = (url.searchParams.get("caption") ?? "").trim();
  const fileName = (url.searchParams.get("name") ?? `anh.${ext}`).trim();
  const data = await req.arrayBuffer();
  if (!data.byteLength) throw new ValidationError("Tệp rỗng");
  if (data.byteLength > MAX_IMAGE_BYTES) throw new ApiRouteError("Ảnh quá lớn (tối đa 15 MB)", 413, "invalid");
  const rel = buildAssetRel(scope, fileName, ext);
  const uploadedAt = new Date().toISOString();
  await env.BUCKET.put(assetPrefix(novelId) + rel, data, buildAssetMetadata(contentType, kind, caption, fileName, uploadedAt, actor));
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
  if (!key || !(await moveAssetToTrash(env.BUCKET, key, trashKey(novelId, rel), actor))) {
    throw new ApiRouteError("Không tìm thấy ảnh", 404, "not_found");
  }
}
