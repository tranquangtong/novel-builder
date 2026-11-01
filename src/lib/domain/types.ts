// Kiểu dữ liệu nghiệp vụ dùng chung cho server và client.

export const CHAPTER_STATUSES = ["draft", "in_review", "approved"] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export const STATUS_LABEL: Record<ChapterStatus, string> = {
  draft: "Bản nháp",
  in_review: "Đang duyệt",
  approved: "Đã duyệt",
};

/** Metadata của chương — nằm trong frontmatter của file chương (nguồn chuẩn). */
export interface ChapterMeta {
  id: string;
  title: string;
  act_id: string;
  /** Khóa sắp xếp toàn bản thảo (có thể là số thập phân). Số chương hiển thị được tính từ thứ tự này. */
  order: number;
  status: ChapterStatus;
  pov?: string;
}

/** Một dòng trong danh sách chương (không có nội dung). */
export interface ChapterSummary extends ChapterMeta {
  path: string;
  /** git blob sha của file chương tại phiên bản đang xem. */
  blob: string;
  words: number;
  /** Số chương hiển thị (1-based), tính từ thứ tự. Ghi chú trong Act 0 luôn là 0. */
  number: number;
  /** true = ghi chú trong Act 0 (outline, trivia…): không đánh số, không tính vào số chữ/mục tiêu của truyện. */
  note: boolean;
}

export interface ChapterDoc {
  meta: ChapterMeta;
  body: string;
  /** Các khóa frontmatter khác mà ứng dụng không quản lý — được giữ nguyên khi lưu. */
  extra: Record<string, unknown>;
}

export interface ActMeta {
  id: string;
  title: string;
  order: number;
  description?: string;
  /** "notes" = Act 0 chứa outline, trivia, ghi chú viết truyện. */
  kind?: "notes";
  path: string;
  blob: string;
}

export interface ProjectInfo {
  title: string;
  subtitle?: string;
  language?: string;
  word_target: { min: number; max: number };
  /** true = dữ liệu thử, không phải bản thảo thật. */
  demo_data?: boolean;
}

export interface ProjectSnapshot {
  repo: string;
  branch: string;
  headSha: string;
  project: ProjectInfo;
  acts: ActMeta[];
  chapters: ChapterSummary[];
  /** Số chương mà content/index.json không còn khớp (đã đọc trực tiếp từ file). */
  indexStale: number;
}

export interface ChapterVersion {
  repo: string;
  branch: string;
  /** commit chứa phiên bản này */
  commitSha: string;
  blob: string;
  path: string;
  doc: ChapterDoc;
  words: number;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  parents: string[];
}

export interface FileChange {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
}

export interface PullSummary {
  number: number;
  title: string;
  author: string;
  state: "open" | "closed" | "merged";
  headRef: string;
  headSha: string;
  baseRef: string;
  createdAt: string;
  updatedAt: string;
  files: FileChange[];
  contentRelated: boolean;
  draft: boolean;
}

export interface PullComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  kind: "comment" | "review";
  reviewState?: string;
}

export interface PullDetail extends PullSummary {
  body: string;
  mergeBase: string;
  baseHeadSha: string;
  /** null = GitHub đang tính toán */
  mergeable: boolean | null;
  mergeableState: string;
  conflictFiles: string[];
  comments: PullComment[];
  url?: string;
}

export interface SaveResult {
  commitSha: string;
  blob: string;
  snapshot?: ProjectSnapshot;
}

export interface RepoFileEntry {
  path: string;
  blob: string;
}
