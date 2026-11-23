import { describe, expect, it } from "vitest";
import {
  buildChapterOptions,
  COMMON_SCOPE,
  COMMON_SCOPE_LABEL,
  countByKind,
  filterAssets,
  formatAssetSize,
  isChapterScope,
  resolveScopeLabel,
  sortAssetsNewestFirst,
  type GalleryAsset,
  type GalleryChapterRef,
} from "@/lib/domain/gallery";

const makeAsset = (over: Partial<GalleryAsset> = {}): GalleryAsset => ({
  key: "ch_001/1-a-img.png",
  scope: "ch_001",
  kind: "character",
  caption: "",
  fileName: "img.png",
  contentType: "image/png",
  size: 2048,
  uploadedAt: "2026-05-01T10:00:00.000Z",
  uploadedBy: "tac-gia@example.com",
  ...over,
});

const CHAPTERS: GalleryChapterRef[] = [
  { id: "ch_note1", title: "Outline Act 1", number: 0, note: true },
  { id: "ch_001", title: "Tàn tro", number: 1, note: false },
  { id: "ch_002", title: "Dấu thập đỏ", number: 2, note: false },
  { id: "ch_003", title: "Chương trống", number: 3, note: false },
];

const KINDS = [
  { v: "character", label: "Nhân vật" },
  { v: "scenery", label: "Cảnh quan" },
  { v: "illustration", label: "Minh hoạ" },
];

describe("gallery helpers", () => {
  it("sortAssetsNewestFirst sắp xếp mới nhất trước và không sửa mảng gốc", () => {
    const a = makeAsset({ key: "ch_001/1-a.png", uploadedAt: "2026-05-01T08:00:00.000Z" });
    const b = makeAsset({ key: "ch_001/2-b.png", uploadedAt: "2026-05-03T08:00:00.000Z" });
    const c = makeAsset({ key: "ch_001/3-c.png", uploadedAt: "2026-05-02T08:00:00.000Z" });
    const input = [a, b, c];
    const sorted = sortAssetsNewestFirst(input);
    expect(sorted.map((x) => x.key)).toEqual([b.key, c.key, a.key]);
    expect(input.map((x) => x.key)).toEqual([a.key, b.key, c.key]);
  });

  it("resolveScopeLabel và isChapterScope xử lý Ảnh chung, chương, ghi chú và scope lạ", () => {
    expect(isChapterScope(COMMON_SCOPE)).toBe(false);
    expect(isChapterScope("ch_001")).toBe(true);
    expect(isChapterScope("")).toBe(false);

    expect(resolveScopeLabel(COMMON_SCOPE, CHAPTERS)).toEqual({ label: COMMON_SCOPE_LABEL });
    expect(resolveScopeLabel("ch_001", CHAPTERS)).toEqual({ label: "Ch 1 · Tàn tro", chapter: CHAPTERS[1] });
    expect(resolveScopeLabel("ch_note1", CHAPTERS)).toEqual({ label: "Outline Act 1", chapter: CHAPTERS[0] });
    expect(resolveScopeLabel("ch_deleted", CHAPTERS)).toEqual({ label: "ch_deleted" });
  });

  it("buildChapterOptions luôn có Ảnh chung và chỉ liệt kê chương có ảnh theo đúng thứ tự", () => {
    const assets = [
      makeAsset({ key: "ch_002/1.png", scope: "ch_002" }),
      makeAsset({ key: "ch_001/1.png", scope: "ch_001" }),
      makeAsset({ key: "ch_001/2.png", scope: "ch_001" }),
      makeAsset({ key: "ch_orphan/1.png", scope: "ch_orphan" }),
    ];
    expect(buildChapterOptions(assets, CHAPTERS)).toEqual([
      { value: "chung", label: "Ảnh chung", count: 0 },
      { value: "ch_001", label: "Ch 1 · Tàn tro", count: 2 },
      { value: "ch_002", label: "Ch 2 · Dấu thập đỏ", count: 1 },
      { value: "ch_orphan", label: "ch_orphan", count: 1 },
    ]);
  });

  it("filterAssets lọc theo kind và chapter độc lập hoặc kết hợp", () => {
    const assets = [
      makeAsset({ key: "1", scope: "ch_001", kind: "character" }),
      makeAsset({ key: "2", scope: "ch_001", kind: "scenery" }),
      makeAsset({ key: "3", scope: "chung", kind: "character" }),
    ];
    expect(filterAssets(assets, {}).map((a) => a.key)).toEqual(["1", "2", "3"]);
    expect(filterAssets(assets, { kind: "character" }).map((a) => a.key)).toEqual(["1", "3"]);
    expect(filterAssets(assets, { chapter: "ch_001" }).map((a) => a.key)).toEqual(["1", "2"]);
    expect(filterAssets(assets, { kind: "character", chapter: "chung" }).map((a) => a.key)).toEqual(["3"]);
  });

  it("countByKind đếm loại có ảnh, giữ lại loại đang chọn và loại lạ", () => {
    const assets = [
      makeAsset({ kind: "character" }),
      makeAsset({ kind: "character" }),
      makeAsset({ kind: "custom" }),
    ];
    expect(countByKind(assets, KINDS, "scenery")).toEqual([
      { v: "character", label: "Nhân vật", count: 2 },
      { v: "scenery", label: "Cảnh quan", count: 0 },
      { v: "custom", label: "custom", count: 1 },
    ]);
  });

  it("formatAssetSize hiển thị KB và MB hợp lý", () => {
    expect(formatAssetSize(100)).toBe("1 KB");
    expect(formatAssetSize(2048)).toBe("2 KB");
    expect(formatAssetSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
