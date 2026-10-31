import type { CommitInfo, FileChange, PullComment, PullDetail, PullSummary } from "../domain/types";

/**
 * Lớp truy cập kho phiên bản. Chế độ demo (mini-git trên đĩa) và GitHub thật
 * cùng hiện thực interface này; mọi logic nghiệp vụ nằm ở ManuscriptService
 * và chỉ gọi qua đây.
 */
export interface RepoStore {
  readonly kind: "demo" | "github";
  /** "demo" hoặc "owner/repo" — dùng làm khóa cho nháp trên thiết bị. */
  readonly repoKey: string;
  readonly defaultBranch: string;

  getBranchHead(branch: string): Promise<string>;
  /** Toàn bộ file (path → blob sha) tại một commit. */
  getTree(commitSha: string): Promise<Map<string, string>>;
  readBlob(blobSha: string): Promise<string>;

  /**
   * Tạo MỘT commit chứa mọi thay đổi (nguyên tử) và cập nhật nhánh theo kiểu
   * compare-and-swap: nếu nhánh không còn ở `expectedHead` thì ném RefMovedError.
   * Không bao giờ force.
   */
  commitFiles(input: CommitInput): Promise<{ commitSha: string }>;

  listCommits(opts: { branch: string; path?: string; limit?: number; page?: number }): Promise<CommitInfo[]>;
  getCommit(sha: string): Promise<CommitInfo & { files: FileChange[] }>;

  listPulls(state: "open" | "closed" | "all"): Promise<PullSummary[]>;
  getPull(number: number): Promise<PullDetail>;
  commentPull(number: number, body: string): Promise<void>;
  reviewPull(number: number, event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT", body: string): Promise<void>;
  /** Merge chỉ khi head vẫn là `expectedHeadSha` (ném HeadChangedError nếu khác). */
  mergePull(number: number, expectedHeadSha: string, message: string): Promise<{ sha: string }>;
  closePull(number: number): Promise<void>;

  /** Danh tính dùng khi gửi bình luận/review lên kho. */
  actorLogin(): Promise<string>;
}

export interface CommitInput {
  branch: string;
  expectedHead: string;
  /** path → nội dung mới; null = xóa file */
  changes: Record<string, string | null>;
  message: string;
  author?: { name: string; email: string };
}

export class RefMovedError extends Error {
  constructor(public readonly actualHead?: string) {
    super("Nhánh đã có phiên bản mới hơn trong lúc lưu");
  }
}
export class HeadChangedError extends Error {
  constructor(public readonly actualHead?: string) {
    super("Đề xuất đã có thay đổi mới sau khi bạn mở review");
  }
}
export class NotMergeableError extends Error {}
export class StoreError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
  }
}
export type { PullComment };
