import type { ChapterSummary } from "./types";

export const COMMON_SCOPE = "chung";
export const COMMON_SCOPE_LABEL = "Ảnh chung";

export interface GalleryAsset {
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

export type GalleryChapterRef = Pick<ChapterSummary, "id" | "title" | "number" | "note">;

export interface KindOption {
  readonly v: string;
  readonly label: string;
}

export interface KindCount extends KindOption {
  count: number;
}

export interface ChapterFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface ResolvedScope {
  label: string;
  chapter?: GalleryChapterRef;
}

/** Sắp xếp ảnh mới nhất trước (giảm dần theo uploadedAt, hoà thì theo key). */
export function sortAssetsNewestFirst<T extends Pick<GalleryAsset, "uploadedAt" | "key">>(assets: readonly T[]): T[] {
  return [...assets].sort((a, b) => {
    if (a.uploadedAt !== b.uploadedAt) return a.uploadedAt < b.uploadedAt ? 1 : -1;
    return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
  });
}

function formatChapterLabel(ch: GalleryChapterRef): string {
  if (ch.note) return ch.title;
  return ch.number > 0 ? `Ch ${ch.number} · ${ch.title}` : ch.title;
}

/** Đổi scope ('chung' hoặc 'ch_...') sang tên chương tương ứng. */
export function resolveScopeLabel(scope: string, chapters: readonly GalleryChapterRef[]): ResolvedScope {
  const normalized = scope || COMMON_SCOPE;
  if (normalized === COMMON_SCOPE) return { label: COMMON_SCOPE_LABEL };
  const chapter = chapters.find((c) => c.id === normalized);
  if (chapter) return { label: formatChapterLabel(chapter), chapter };
  return { label: normalized };
}

/** Danh sách lựa chọn cho bộ lọc chương: Ảnh chung + các chương có ảnh (theo thứ tự bản thảo). */
export function buildChapterOptions(assets: readonly Pick<GalleryAsset, "scope">[], chapters: readonly GalleryChapterRef[]): ChapterFilterOption[] {
  const counts = new Map<string, number>();
  for (const a of assets) {
    const scope = a.scope || COMMON_SCOPE;
    counts.set(scope, (counts.get(scope) ?? 0) + 1);
  }
  const options: ChapterFilterOption[] = [
    { value: COMMON_SCOPE, label: COMMON_SCOPE_LABEL, count: counts.get(COMMON_SCOPE) ?? 0 },
  ];
  const seen = new Set<string>([COMMON_SCOPE]);
  for (const ch of chapters) {
    const count = counts.get(ch.id) ?? 0;
    if (count > 0) {
      options.push({ value: ch.id, label: formatChapterLabel(ch), count });
      seen.add(ch.id);
    }
  }
  const orphans = [...counts.entries()]
    .filter(([scope]) => !seen.has(scope))
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [scope, count] of orphans) {
    options.push({ value: scope, label: scope, count });
  }
  return options;
}

/** Lọc ảnh theo loại (kind) và chương (scope). */
export function filterAssets<T extends Pick<GalleryAsset, "kind" | "scope">>(
  assets: readonly T[],
  filters: { kind?: string; chapter?: string },
): T[] {
  const kind = filters.kind ?? "";
  const chapter = filters.chapter ?? "";
  return assets.filter((a) => (!kind || a.kind === kind) && (!chapter || (a.scope || COMMON_SCOPE) === chapter));
}

/** Đếm số ảnh theo từng loại (chỉ trả loại có ảnh, hoặc loại đang chọn). */
export function countByKind(
  assets: readonly Pick<GalleryAsset, "kind">[],
  kinds: readonly KindOption[],
  activeKind = "",
): KindCount[] {
  const counts = new Map<string, number>();
  for (const a of assets) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);

  const out: KindCount[] = [];
  const known = new Set<string>();
  for (const k of kinds) {
    known.add(k.v);
    const count = counts.get(k.v) ?? 0;
    if (count > 0 || (activeKind && activeKind === k.v)) {
      out.push({ v: k.v, label: k.label, count });
    }
  }
  for (const [v, count] of counts) {
    if (!known.has(v)) out.push({ v, label: v, count });
  }
  return out;
}

/** Định dạng dung lượng tệp ảnh gọn gàng (KB / MB). */
export function formatAssetSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}
