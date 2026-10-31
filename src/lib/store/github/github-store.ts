import { Octokit } from "@octokit/rest";
import type { CommitInfo, FileChange, PullComment, PullDetail, PullSummary } from "../../domain/types";
import { isContentPath } from "../../domain/paths";
import { HeadChangedError, NotMergeableError, RefMovedError, StoreError, type CommitInput, type RepoStore } from "../types";
import { LruCache } from "../lru";

export interface GitHubStoreConfig {
  /** Fine-grained personal access token, chỉ quyền trên repo bản thảo. Chỉ nằm trong trình duyệt của tác giả. */
  token: string;
  owner: string;
  repo: string;
  branch: string;
  /** Cho phép test chèn fetch giả. */
  fetch?: typeof fetch;
  baseUrl?: string;
}

type GhFile = { filename: string; status: string };

function mapStatus(s: string): FileChange["status"] {
  if (s === "added") return "added";
  if (s === "removed") return "removed";
  if (s === "renamed") return "renamed";
  return "modified";
}

function httpStatus(e: unknown): number | undefined {
  return typeof e === "object" && e && "status" in e ? Number((e as { status: unknown }).status) : undefined;
}

function ghMessage(e: unknown): string {
  const anyE = e as { response?: { data?: { message?: string } }; message?: string };
  return anyE?.response?.data?.message ?? anyE?.message ?? String(e);
}

/**
 * Hiện thực RepoStore trên GitHub REST API, gọi thẳng từ trình duyệt (GitHub REST API hỗ trợ
 * CORS cho mọi origin) bằng fine-grained personal access token của tác giả.
 *
 * Các endpoint đã đối chiếu với đặc tả OpenAPI chính thức (github/rest-api-description):
 *  - GET  /repos/{o}/{r}/git/ref/{ref}            (Contents: read)
 *  - GET  /repos/{o}/{r}/git/trees/{sha}?recursive (Contents: read)
 *  - GET  /repos/{o}/{r}/git/blobs/{sha}          (Contents: read)
 *  - POST /repos/{o}/{r}/git/trees | commits     (Contents: write)
 *  - PATCH /repos/{o}/{r}/git/refs/{ref} force=false (Contents: write) — 422/409 nếu không fast-forward
 *  - PUT  /repos/{o}/{r}/pulls/{n}/merge  sha=...  (Contents: write) — 409 nếu head khác sha, 405 nếu không merge được
 *  - POST /repos/{o}/{r}/issues/{n}/comments      (Issues: write HOẶC Pull requests: write)
 * Quyền cần cho token: Contents read/write, Pull requests read/write (Metadata read tự có).
 *  - POST /repos/{o}/{r}/pulls/{n}/reviews        (Pull requests: write)
 *  - PATCH /repos/{o}/{r}/pulls/{n}               (Pull requests: write)
 */
export class GitHubStore implements RepoStore {
  readonly kind = "github" as const;
  readonly repoKey: string;
  readonly defaultBranch: string;
  readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;
  private readonly cfg: GitHubStoreConfig;
  private trees = new LruCache<string, Map<string, string>>(64);
  private blobs = new LruCache<string, string>(2000);
  private commitTreeSha = new LruCache<string, string>(512);
  private actor?: string;

  constructor(cfg: GitHubStoreConfig) {
    this.cfg = cfg;
    this.owner = cfg.owner;
    this.repo = cfg.repo;
    this.repoKey = `github:${cfg.owner}/${cfg.repo}`;
    this.defaultBranch = cfg.branch;
    this.octokit = new Octokit({
      auth: cfg.token,
      baseUrl: cfg.baseUrl,
      // GitHub trả "Cache-Control: private, max-age=60": nếu để trình duyệt tự cache thì
      // head của nhánh có thể cũ tới 60 giây (vừa nhập đề xuất mà vẫn thấy bản cũ).
      // Luôn hỏi lại GitHub; dữ liệu bất biến (tree/blob theo sha) đã có LRU riêng.
      request: { fetch: noStoreFetch(cfg.fetch) },
      userAgent: "the-last-miracle-studio",
    });
  }

  private get r() {
    return { owner: this.owner, repo: this.repo };
  }

  private wrap(e: unknown, what: string): never {
    const st = httpStatus(e);
    throw new StoreError(`GitHub: ${what} thất bại (${st ?? "?"}): ${ghMessage(e)}`, st && st >= 400 && st < 500 ? st : 502);
  }

  async getBranchHead(branch: string) {
    try {
      const { data } = await this.octokit.git.getRef({ ...this.r, ref: `heads/${branch}` });
      return data.object.sha;
    } catch (e) {
      this.wrap(e, `đọc nhánh ${branch}`);
    }
  }

  private async treeShaOf(commitSha: string) {
    const cached = this.commitTreeSha.get(commitSha);
    if (cached) return cached;
    const { data } = await this.octokit.git.getCommit({ ...this.r, commit_sha: commitSha });
    this.commitTreeSha.set(commitSha, data.tree.sha);
    return data.tree.sha;
  }

  async getTree(commitSha: string) {
    const hit = this.trees.get(commitSha);
    if (hit) return hit;
    try {
      const treeSha = await this.treeShaOf(commitSha);
      const { data } = await this.octokit.git.getTree({ ...this.r, tree_sha: treeSha, recursive: "true" });
      if (data.truncated) throw new StoreError("Cây thư mục quá lớn (GitHub trả về truncated)");
      const map = new Map<string, string>();
      for (const t of data.tree) if (t.type === "blob" && t.path && t.sha) map.set(t.path, t.sha);
      this.trees.set(commitSha, map);
      return map;
    } catch (e) {
      if (e instanceof StoreError) throw e;
      this.wrap(e, "đọc cây thư mục");
    }
  }

  async readBlob(blobSha: string) {
    const hit = this.blobs.get(blobSha);
    if (hit !== undefined) return hit;
    try {
      const { data } = await this.octokit.git.getBlob({ ...this.r, file_sha: blobSha });
      const text = data.encoding === "base64" ? decodeBase64Utf8(data.content) : data.content;
      this.blobs.set(blobSha, text);
      return text;
    } catch (e) {
      this.wrap(e, "đọc file");
    }
  }

  async commitFiles(input: CommitInput) {
    let treeSha: string;
    try {
      const baseTree = await this.treeShaOf(input.expectedHead);
      const tree = Object.entries(input.changes).map(([path, content]) =>
        content === null
          ? { path, mode: "100644" as const, type: "blob" as const, sha: null }
          : { path, mode: "100644" as const, type: "blob" as const, content },
      );
      const { data } = await this.octokit.git.createTree({ ...this.r, base_tree: baseTree, tree });
      treeSha = data.sha;
    } catch (e) {
      this.wrap(e, "tạo cây thư mục");
    }
    let commitSha: string;
    try {
      const { data } = await this.octokit.git.createCommit({
        ...this.r,
        message: input.message,
        tree: treeSha,
        parents: [input.expectedHead],
        ...(input.author ? { author: { name: input.author.name, email: input.author.email } } : {}),
      });
      commitSha = data.sha;
    } catch (e) {
      this.wrap(e, "tạo commit");
    }
    try {
      // force: false → GitHub chỉ chấp nhận fast-forward; nếu nhánh đã đi tiếp, trả 422/409.
      await this.octokit.git.updateRef({ ...this.r, ref: `heads/${input.branch}`, sha: commitSha, force: false });
    } catch (e) {
      const st = httpStatus(e);
      if (st === 422 || st === 409) {
        const actual = await this.getBranchHead(input.branch).catch(() => undefined);
        if (actual !== input.expectedHead) throw new RefMovedError(actual);
      }
      this.wrap(e, "cập nhật nhánh");
    }
    return { commitSha };
  }

  private toInfo(c: { sha: string; parents: { sha: string }[]; commit: { message: string; author: { name?: string; date?: string } | null } ; author?: { login?: string } | null }): CommitInfo {
    return {
      sha: c.sha,
      message: c.commit.message,
      author: c.author?.login ?? c.commit.author?.name ?? "?",
      date: c.commit.author?.date ?? "",
      parents: c.parents.map((p) => p.sha),
    };
  }

  async listCommits(opts: { branch: string; path?: string; limit?: number; page?: number }) {
    try {
      const { data } = await this.octokit.repos.listCommits({ ...this.r, sha: opts.branch, path: opts.path, per_page: opts.limit ?? 30, page: opts.page ?? 1 });
      return data.map((c) => this.toInfo(c as never));
    } catch (e) {
      this.wrap(e, "đọc lịch sử");
    }
  }

  async getCommit(sha: string) {
    try {
      const { data } = await this.octokit.repos.getCommit({ ...this.r, ref: sha });
      return { ...this.toInfo(data as never), files: (data.files ?? []).map((f) => ({ path: f.filename, status: mapStatus(f.status) })) };
    } catch (e) {
      this.wrap(e, "đọc phiên bản");
    }
  }

  private async pullFiles(n: number): Promise<FileChange[]> {
    const files = (await this.octokit.paginate(this.octokit.pulls.listFiles, { ...this.r, pull_number: n, per_page: 100 })) as GhFile[];
    return files.map((f) => ({ path: f.filename, status: mapStatus(f.status) }));
  }

  private summarize(p: { number: number; title: string; user: { login: string } | null; state: string; merged_at: string | null; head: { ref: string; sha: string }; base: { ref: string }; created_at: string; updated_at: string; draft?: boolean }, files: FileChange[]): PullSummary {
    return {
      number: p.number, title: p.title, author: p.user?.login ?? "?",
      state: p.merged_at ? "merged" : p.state === "open" ? "open" : "closed",
      headRef: p.head.ref, headSha: p.head.sha, baseRef: p.base.ref,
      createdAt: p.created_at, updatedAt: p.updated_at, files,
      contentRelated: files.some((f) => isContentPath(f.path)), draft: !!p.draft,
    };
  }

  async listPulls(state: "open" | "closed" | "all") {
    try {
      const { data } = await this.octokit.pulls.list({ ...this.r, state, base: this.defaultBranch, per_page: 30, sort: "updated", direction: "desc" });
      return Promise.all(data.map(async (p) => this.summarize(p as never, await this.pullFiles(p.number))));
    } catch (e) {
      this.wrap(e, "đọc danh sách đề xuất");
    }
  }

  async getPull(n: number): Promise<PullDetail> {
    try {
      const { data: p } = await this.octokit.pulls.get({ ...this.r, pull_number: n });
      const [files, comments, reviews, cmp, baseHead] = await Promise.all([
        this.pullFiles(n),
        this.octokit.paginate(this.octokit.issues.listComments, { ...this.r, issue_number: n, per_page: 100 }),
        this.octokit.paginate(this.octokit.pulls.listReviews, { ...this.r, pull_number: n, per_page: 100 }),
        this.octokit.repos.compareCommitsWithBasehead({ ...this.r, basehead: `${p.base.ref}...${p.head.sha}`, per_page: 1 }),
        this.getBranchHead(p.base.ref),
      ]);
      const all: PullComment[] = [
        ...comments.map((c) => ({ id: `c${c.id}`, author: c.user?.login ?? "?", body: c.body ?? "", createdAt: c.created_at, kind: "comment" as const })),
        ...reviews
          .filter((r) => r.state !== "PENDING")
          .map((r) => ({ id: `r${r.id}`, author: r.user?.login ?? "?", body: r.body ?? "", createdAt: r.submitted_at ?? "", kind: "review" as const, reviewState: r.state })),
      ].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      // GitHub không cho biết file nào xung đột; ước lượng: file đổi ở cả hai phía kể từ merge base.
      let conflictFiles: string[] = [];
      if (p.mergeable === false) {
        const sinceBase = await this.octokit.repos.compareCommitsWithBasehead({ ...this.r, basehead: `${cmp.data.merge_base_commit.sha}...${baseHead}` });
        const onBase = new Set((sinceBase.data.files ?? []).map((f) => f.filename));
        conflictFiles = files.map((f) => f.path).filter((x) => onBase.has(x));
      }
      return {
        ...this.summarize(p as never, files),
        body: p.body ?? "",
        mergeBase: cmp.data.merge_base_commit.sha,
        baseHeadSha: baseHead,
        mergeable: p.mergeable,
        mergeableState: p.mergeable_state,
        conflictFiles,
        comments: all,
        url: p.html_url,
      };
    } catch (e) {
      if (e instanceof StoreError) throw e;
      this.wrap(e, `đọc đề xuất #${n}`);
    }
  }

  async commentPull(n: number, body: string) {
    try {
      await this.octokit.issues.createComment({ ...this.r, issue_number: n, body });
    } catch (e) {
      this.wrap(e, "gửi bình luận");
    }
  }

  async reviewPull(n: number, event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT", body: string) {
    try {
      await this.octokit.pulls.createReview({ ...this.r, pull_number: n, event, body });
    } catch (e) {
      this.wrap(e, "gửi review");
    }
  }

  async mergePull(n: number, expectedHeadSha: string, message: string) {
    try {
      const { data } = await this.octokit.pulls.merge({ ...this.r, pull_number: n, sha: expectedHeadSha, merge_method: "merge", commit_title: message });
      return { sha: data.sha };
    } catch (e) {
      const st = httpStatus(e);
      if (st === 409) throw new HeadChangedError();
      if (st === 405) throw new NotMergeableError(`GitHub từ chối merge: ${ghMessage(e)}`);
      this.wrap(e, "merge");
    }
  }

  async closePull(n: number) {
    try {
      await this.octokit.pulls.update({ ...this.r, pull_number: n, state: "closed" });
    } catch (e) {
      this.wrap(e, "đóng đề xuất");
    }
  }

  /** Danh tính của tài khoản sở hữu token. */
  async actorLogin() {
    if (this.actor) return this.actor;
    const { data } = await this.octokit.users.getAuthenticated();
    this.actor = data.login;
    return this.actor;
  }

  /** Kiểm tra kết nối thật: trả về kết quả từng bước, không tô vẽ. */
  async diagnose(): Promise<{ step: string; ok: boolean; detail: string }[]> {
    const out: { step: string; ok: boolean; detail: string }[] = [];
    try {
      out.push({ step: "Token hợp lệ", ok: true, detail: `đăng nhập là ${await this.actorLogin()}` });
    } catch (e) {
      out.push({ step: "Token hợp lệ", ok: false, detail: ghMessage(e) });
      return out;
    }
    try {
      const { data } = await this.octokit.repos.get(this.r);
      out.push({ step: "Đọc repository bản thảo", ok: true, detail: `${data.full_name} · nhánh mặc định ${data.default_branch}` });
      out.push({ step: "Repository là private", ok: data.private, detail: data.private ? "private" : "ĐANG PUBLIC — ai cũng đọc được bản thảo. Hãy chuyển sang private." });
      const push = !!data.permissions?.push;
      out.push({ step: "Token có quyền ghi", ok: push, detail: push ? "có" : "không — cần Contents: Read and write" });
    } catch (e) {
      out.push({ step: "Đọc repository bản thảo", ok: false, detail: `${ghMessage(e)} — kiểm tra tên repo và token đã chọn repo này chưa` });
      return out;
    }
    try {
      const head = await this.getBranchHead(this.defaultBranch);
      out.push({ step: `Đọc nhánh ${this.defaultBranch}`, ok: true, detail: head.slice(0, 7) });
      const tree = await this.getTree(head);
      out.push({ step: "Có cấu trúc bản thảo (content/project.json)", ok: tree.has("content/project.json"), detail: tree.has("content/project.json") ? "có" : "chưa có — bấm Khởi tạo cấu trúc" });
    } catch (e) {
      out.push({ step: `Đọc nhánh ${this.defaultBranch}`, ok: false, detail: ghMessage(e) });
    }
    try {
      await this.octokit.pulls.list({ ...this.r, per_page: 1 });
      out.push({ step: "Đọc pull request", ok: true, detail: "OK" });
    } catch (e) {
      out.push({ step: "Đọc pull request", ok: false, detail: `${ghMessage(e)} — cần Pull requests: Read and write` });
    }
    return out;
  }
}

function noStoreFetch(base?: typeof fetch): typeof fetch {
  return (input, init) => (base ?? globalThis.fetch)(input, { ...init, cache: "no-store" });
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
