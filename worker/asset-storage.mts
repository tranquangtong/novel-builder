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
/** Loại ảnh: nhân vật, cảnh quan, cảnh hành động, phác thảo, minh hoạ, tham khảo, khác. */
export const ASSET_KINDS = ["character", "scenery", "action", "sketch", "illustration", "reference", "other"] as const;
export const SCOPE = /^(chung|ch_[0-9a-z_-]{3,40})$/;

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

export const assetPrefix = (novelId: string) => `novels/${novelId}/assets/`;

function safeName(name: string) {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  return base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "anh";
}

export function assetKeyValid(novelId: string, rel: string) {
  return /^(chung|ch_[0-9a-z_-]{3,40})\/[0-9a-z]+-[0-9a-z]+-[A-Za-z0-9._-]{1,80}$/.test(rel) && !rel.includes("..") ? `${assetPrefix(novelId)}${rel}` : null;
}

const encodeMeta = (s: string) => encodeURIComponent(s.slice(0, 500));
const decodeMeta = (s?: string) => {
  try {
    return s ? decodeURIComponent(s) : "";
  } catch {
    return s ?? "";
  }
};

export function imageTypeFromFileName(fileName: string) {
  const ext = fileName.match(/\.([^.]+)$/)?.[1].toLowerCase();
  if (ext === "jpeg") return "image/jpeg";
  return Object.keys(IMAGE_TYPES).find((type) => IMAGE_TYPES[type] === ext);
}

export function assetKindValid(kind: string) {
  return (ASSET_KINDS as readonly string[]).includes(kind);
}

export function buildAssetRel(scope: string, fileName: string, ext: string) {
  let name = safeName(fileName);
  if (!name.toLowerCase().endsWith(`.${ext}`)) name = `${name.replace(/\.[A-Za-z0-9]+$/, "")}.${ext}`;
  return `${scope}/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}-${name}`;
}

export function buildAssetMetadata(contentType: string, kind: string, caption: string, fileName: string, uploadedAt: string, actor: string) {
  return {
    httpMetadata: { contentType },
    customMetadata: { kind, caption: encodeMeta(caption), fileName: encodeMeta(fileName), uploadedAt, uploadedBy: actor },
  };
}

export const trashKey = (novelId: string, rel: string) => `novels/${novelId}/trash/${rel}`;

export async function moveAssetToTrash(bucket: Pick<R2Bucket, "get" | "put" | "delete">, key: string, destination: string, actor: string) {
  const o = await bucket.get(key);
  if (!o) return false;
  await bucket.put(destination, await o.arrayBuffer(), {
    httpMetadata: o.httpMetadata,
    customMetadata: { ...(o.customMetadata ?? {}), deletedAt: new Date().toISOString(), deletedBy: actor },
  });
  await bucket.delete(key);
  return true;
}

export async function readAssets(bucket: Pick<R2Bucket, "list">, novelId: string, scope?: string | null): Promise<AssetInfo[]> {
  const out: AssetInfo[] = [];
  let cursor: string | undefined;
  do {
    const r = await bucket.list({ prefix: assetPrefix(novelId) + (scope ? `${scope}/` : ""), cursor, include: ["customMetadata", "httpMetadata"] });
    for (const o of r.objects) {
      const rel = o.key.slice(assetPrefix(novelId).length);
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
