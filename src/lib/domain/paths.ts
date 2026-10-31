// Bố cục repository bản thảo. Đường dẫn chương dựa trên ID ổn định nên
// đổi tên hoặc chuyển Act không làm đổi đường dẫn file.
export const CONTENT = "content";
export const PROJECT_FILE = `${CONTENT}/project.json`;
export const INDEX_FILE = `${CONTENT}/index.json`;
export const ACTS_DIR = `${CONTENT}/acts`;
export const CHAPTERS_DIR = `${CONTENT}/chapters`;
export const CANON_DIR = `${CONTENT}/canon`;
export const OUTLINES_DIR = `${CONTENT}/outlines`;
export const SUMMARIES_DIR = `${CONTENT}/summaries`;
export const REVIEWS_DIR = `${CONTENT}/reviews`;

export const chapterPath = (id: string) => `${CHAPTERS_DIR}/${id}.md`;
export const actPath = (id: string) => `${ACTS_DIR}/${id}.md`;
export const summaryPath = (chapterId: string) => `${SUMMARIES_DIR}/${chapterId}.md`;

export function chapterIdFromPath(p: string): string | null {
  const m = /^content\/chapters\/([^/]+)\.md$/.exec(p);
  return m ? m[1] : null;
}

export function isContentPath(p: string): boolean {
  return p.startsWith(`${CONTENT}/`) || p === "AGENTS.md";
}

export type FileKind =
  | "chapter" | "act" | "project" | "index"
  | "canon-character" | "canon-world" | "canon-timeline" | "canon-knowledge"
  | "outline" | "summary" | "review" | "other";

export function fileKind(p: string): FileKind {
  if (p === PROJECT_FILE) return "project";
  if (p === INDEX_FILE) return "index";
  if (p.startsWith(`${CHAPTERS_DIR}/`)) return "chapter";
  if (p.startsWith(`${ACTS_DIR}/`)) return "act";
  if (p.startsWith(`${CANON_DIR}/characters/`)) return "canon-character";
  if (p.startsWith(`${CANON_DIR}/world/`)) return "canon-world";
  if (p.startsWith(`${CANON_DIR}/timeline/`)) return "canon-timeline";
  if (p.startsWith(`${CANON_DIR}/knowledge/`)) return "canon-knowledge";
  if (p.startsWith(`${OUTLINES_DIR}/`)) return "outline";
  if (p.startsWith(`${SUMMARIES_DIR}/`)) return "summary";
  if (p.startsWith(`${REVIEWS_DIR}/`)) return "review";
  return "other";
}

export const KIND_LABEL: Record<FileKind, string> = {
  chapter: "Chương",
  act: "Act",
  project: "Thông tin dự án",
  index: "Chỉ mục (tự sinh)",
  "canon-character": "Canon · Nhân vật",
  "canon-world": "Canon · Thế giới",
  "canon-timeline": "Sự kiện đã xảy ra",
  "canon-knowledge": "Kiến thức nhân vật",
  outline: "Outline (kế hoạch)",
  summary: "Tóm tắt (dẫn xuất)",
  review: "Ghi chú review",
  other: "Khác",
};

/** Chống path traversal cho các API đọc/ghi file. */
export function assertSafeContentPath(p: string): string {
  if (typeof p !== "string" || !/^content\/[A-Za-z0-9_\-./]+$/.test(p) || p.includes("..") || p.includes("//")) {
    throw new Error("Đường dẫn không hợp lệ");
  }
  return p;
}
