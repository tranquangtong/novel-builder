import type { CommitInfo, FileChange, PullDetail, PullSummary } from "../../domain/types";
import { isContentPath } from "../../domain/paths";
import { HeadChangedError, NotMergeableError, RefMovedError, StoreError, type CommitInput, type RepoStore } from "../types";
import { MiniGit, type MgCommit, type MgPull, type MgState } from "./minigit";

export const DEMO_OWNER = "tac-gia-demo";
export const DEMO_AGENT = "agent-demo[bot]";

function laterThan(prev: string | undefined): string {
  const now = Date.now();
  const p = prev ? Date.parse(prev) : 0;
  return new Date(Math.max(now, p + 1)).toISOString();
}

export class DemoStore implements RepoStore {
  readonly kind = "demo" as const;
  readonly repoKey = "demo";
  readonly defaultBranch = "main";

  constructor(public readonly git: MiniGit, private readonly actor = DEMO_OWNER) {}

  async getBranchHead(branch: string) {
    const sha = (await this.git.readState()).refs[branch];
    if (!sha) throw new StoreError(`Không có nhánh ${branch}`, 404);
    return sha;
  }

  async getTree(commitSha: string) {
    return new Map(Object.entries((await this.git.readCommit(commitSha)).tree));
  }

  readBlob(blobSha: string) {
    return this.git.readBlob(blobSha);
  }

  async commitFiles(input: CommitInput) {
    return this.git.withLock(async () => {
      const state = await this.git.readState();
      const head = state.refs[input.branch];
      if (!head) throw new StoreError(`Không có nhánh ${input.branch}`, 404);
      if (head !== input.expectedHead) throw new RefMovedError(head);
      const parent = await this.git.readCommit(head);
      const tree = { ...parent.tree };
      for (const [p, content] of Object.entries(input.changes)) {
        if (content === null) delete tree[p];
        else tree[p] = await this.git.writeBlob(content);
      }
      const c = await this.git.writeCommit({ tree, parents: [head], message: input.message, author: input.author?.name ?? this.actor, date: laterThan(parent.date) });
      state.refs[input.branch] = c.sha;
      await this.git.writeState(state);
      return { commitSha: c.sha };
    });
  }

  /** Dùng cho mô phỏng agent: tạo nhánh mới từ một commit. */
  async createBranch(name: string, fromSha: string) {
    await this.git.withLock(async () => {
      const s = await this.git.readState();
      if (s.refs[name]) throw new StoreError(`Nhánh ${name} đã tồn tại`, 422);
      s.refs[name] = fromSha;
      await this.git.writeState(s);
    });
  }

  async createPull(input: { title: string; body: string; head: string; base: string; author: string }) {
    return this.git.withLock(async () => {
      const s = await this.git.readState();
      const number = s.pulls.reduce((m, p) => Math.max(m, p.number), 0) + 1;
      const now = new Date().toISOString();
      s.pulls.push({ number, title: input.title, body: input.body, author: input.author, headRef: input.head, baseRef: input.base, state: "open", createdAt: now, updatedAt: now, comments: [] });
      await this.git.writeState(s);
      return number;
    });
  }

  private toInfo(c: MgCommit): CommitInfo {
    return { sha: c.sha, message: c.message, author: c.author, date: c.date, parents: c.parents };
  }

  async listCommits(opts: { branch: string; path?: string; limit?: number; page?: number }) {
    const head = await this.getBranchHead(opts.branch);
    let all = await this.git.log(head);
    if (opts.path) {
      const p = opts.path;
      const keep: MgCommit[] = [];
      for (const c of all) {
        const mine = c.tree[p];
        if (c.parents.length === 0 ? mine !== undefined : (await this.git.readCommit(c.parents[0])).tree[p] !== mine) keep.push(c);
      }
      all = keep;
    }
    const limit = opts.limit ?? 30;
    const page = opts.page ?? 1;
    return all.slice((page - 1) * limit, page * limit).map((c) => this.toInfo(c));
  }

  async getCommit(sha: string) {
    const c = await this.git.readCommit(sha);
    const files: FileChange[] = await this.git.changedFiles(c.parents[0] ?? null, sha);
    return { ...this.toInfo(c), files };
  }

  private pullHead(p: MgPull, s: MgState): string {
    if (p.state === "merged" && p.mergedSha) return p.mergedSha;
    return s.refs[p.headRef] ?? p.mergedSha ?? "";
  }

  private async summarize(p: MgPull, s: MgState): Promise<PullSummary> {
    const headSha = this.pullHead(p, s);
    const baseHead = s.refs[p.baseRef];
    let files: FileChange[] = [];
    if (headSha && baseHead) {
      const mb = p.state === "merged" ? (await this.git.readCommit(headSha)).parents[0] ?? headSha : await this.git.mergeBase(baseHead, headSha);
      files = await this.git.changedFiles(mb, headSha);
    }
    return {
      number: p.number, title: p.title, author: p.author, state: p.state, headRef: p.headRef, headSha,
      baseRef: p.baseRef, createdAt: p.createdAt, updatedAt: p.updatedAt, files,
      contentRelated: files.some((f) => isContentPath(f.path)), draft: false,
    };
  }

  async listPulls(state: "open" | "closed" | "all") {
    const s = await this.git.readState();
    const list = s.pulls.filter((p) => state === "all" || (state === "open" ? p.state === "open" : p.state !== "open")).sort((a, b) => b.number - a.number);
    const out: PullSummary[] = [];
    for (const p of list) out.push(await this.summarize(p, s));
    return out;
  }

  async getPull(n: number): Promise<PullDetail> {
    const s = await this.git.readState();
    const p = s.pulls.find((x) => x.number === n);
    if (!p) throw new StoreError(`Không có đề xuất #${n}`, 404);
    const sum = await this.summarize(p, s);
    const baseHead = s.refs[p.baseRef];
    let mergeBase = baseHead;
    let conflicts: string[] = [];
    if (p.state === "open" && sum.headSha) {
      mergeBase = await this.git.mergeBase(baseHead, sum.headSha);
      conflicts = (await this.git.threeWay(mergeBase, baseHead, sum.headSha)).conflicts;
    } else if (p.state === "merged" && p.mergedSha) {
      mergeBase = (await this.git.readCommit(p.mergedSha)).parents[0] ?? p.mergedSha;
    }
    return {
      ...sum,
      body: p.body,
      mergeBase,
      baseHeadSha: baseHead,
      mergeable: p.state === "open" ? conflicts.length === 0 : null,
      mergeableState: p.state !== "open" ? p.state : conflicts.length ? "dirty" : "clean",
      conflictFiles: conflicts,
      comments: p.comments,
    };
  }

  private async mutatePull(n: number, fn: (p: MgPull) => void) {
    await this.git.withLock(async () => {
      const s = await this.git.readState();
      const p = s.pulls.find((x) => x.number === n);
      if (!p) throw new StoreError(`Không có đề xuất #${n}`, 404);
      fn(p);
      p.updatedAt = new Date().toISOString();
      await this.git.writeState(s);
    });
  }

  async commentPull(n: number, body: string) {
    await this.mutatePull(n, (p) => {
      p.comments.push({ id: `c${p.comments.length + 1}-${Date.now()}`, author: this.actor, body, createdAt: new Date().toISOString(), kind: "comment" });
    });
  }

  async reviewPull(n: number, event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT", body: string) {
    const p = (await this.git.readState()).pulls.find((x) => x.number === n);
    if (!p) throw new StoreError(`Không có đề xuất #${n}`, 404);
    // Mô phỏng đúng quy tắc của GitHub: tác giả pull request không thể tự approve/yêu cầu sửa PR của mình.
    if (event !== "COMMENT" && p.author === this.actor) throw new StoreError("GitHub không cho phép tác giả tự approve/yêu cầu sửa pull request của chính mình", 422);
    if (p.state !== "open") throw new StoreError("Đề xuất đã đóng", 422);
    const state = event === "APPROVE" ? "APPROVED" : event === "REQUEST_CHANGES" ? "CHANGES_REQUESTED" : "COMMENTED";
    await this.mutatePull(n, (pp) => {
      pp.comments.push({ id: `r${pp.comments.length + 1}-${Date.now()}`, author: this.actor, body, createdAt: new Date().toISOString(), kind: "review", reviewState: state });
    });
  }

  async mergePull(n: number, expectedHeadSha: string, message: string) {
    return this.git.withLock(async () => {
      const s = await this.git.readState();
      const p = s.pulls.find((x) => x.number === n);
      if (!p) throw new StoreError(`Không có đề xuất #${n}`, 404);
      if (p.state !== "open") throw new NotMergeableError("Đề xuất không còn mở");
      const head = s.refs[p.headRef];
      if (head !== expectedHeadSha) throw new HeadChangedError(head);
      const baseHead = s.refs[p.baseRef];
      const mb = await this.git.mergeBase(baseHead, head);
      const { tree, conflicts } = await this.git.threeWay(mb, baseHead, head);
      if (conflicts.length) throw new NotMergeableError(`Xung đột ở: ${conflicts.join(", ")}`);
      const c = await this.git.writeCommit({ tree, parents: [baseHead, head], message, author: this.actor, date: laterThan((await this.git.readCommit(baseHead)).date) });
      s.refs[p.baseRef] = c.sha;
      p.state = "merged";
      p.mergedSha = c.sha;
      p.updatedAt = new Date().toISOString();
      await this.git.writeState(s);
      return { sha: c.sha };
    });
  }

  async closePull(n: number) {
    await this.mutatePull(n, (p) => {
      if (p.state !== "open") throw new StoreError("Đề xuất đã đóng", 422);
      p.state = "closed";
    });
  }

  async actorLogin() {
    return this.actor;
  }
}
