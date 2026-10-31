import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gitBlobSha } from "../../domain/gitsha";

/**
 * "Mini-git" cho CHẾ ĐỘ DEMO: commit, nhánh, merge 3 chiều ở mức file,
 * lưu trên đĩa (thư mục .demo-data). Không phải git thật và không dùng cho
 * bản thảo thật — chỉ để chạy thử toàn bộ luồng mà không cần GitHub.
 */
export interface MgCommit {
  sha: string;
  tree: Record<string, string>;
  parents: string[];
  message: string;
  author: string;
  date: string;
}

export interface MgPull {
  number: number;
  title: string;
  body: string;
  author: string;
  headRef: string;
  baseRef: string;
  state: "open" | "closed" | "merged";
  createdAt: string;
  updatedAt: string;
  mergedSha?: string;
  comments: { id: string; author: string; body: string; createdAt: string; kind: "comment" | "review"; reviewState?: string }[];
}

interface MgState {
  refs: Record<string, string>;
  pulls: MgPull[];
}

export class MiniGit {
  private commitCache = new Map<string, MgCommit>();
  private blobCache = new Map<string, string>();

  constructor(public readonly dir: string) {}

  // ---------- low level ----------
  private p(...parts: string[]) {
    return path.join(this.dir, ...parts);
  }

  isInitialized(): boolean {
    return fs.existsSync(this.p("state.json"));
  }

  ensureDirs() {
    fs.mkdirSync(this.p("objects"), { recursive: true });
    fs.mkdirSync(this.p("commits"), { recursive: true });
  }

  private atomicWrite(file: string, data: string) {
    const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tmp, data, "utf8");
    fs.renameSync(tmp, file);
  }

  /** Khóa liên tiến trình bằng mkdir (nguyên tử trên mọi hệ điều hành phổ biến). */
  async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    this.ensureDirs();
    const lock = this.p(".lock");
    const start = Date.now();
    for (;;) {
      try {
        fs.mkdirSync(lock);
        break;
      } catch {
        try {
          const st = fs.statSync(lock);
          if (Date.now() - st.mtimeMs > 10_000) fs.rmSync(lock, { recursive: true, force: true });
        } catch {
          /* lock vừa được nhả */
        }
        if (Date.now() - start > 15_000) throw new Error("Không lấy được khóa dữ liệu demo");
        await new Promise((r) => setTimeout(r, 15));
      }
    }
    try {
      return await fn();
    } finally {
      fs.rmSync(lock, { recursive: true, force: true });
    }
  }

  readState(): MgState {
    return JSON.parse(fs.readFileSync(this.p("state.json"), "utf8")) as MgState;
  }

  writeState(s: MgState) {
    this.atomicWrite(this.p("state.json"), JSON.stringify(s, null, 1));
  }

  writeBlob(content: string): string {
    const sha = gitBlobSha(content);
    const f = this.p("objects", sha);
    if (!fs.existsSync(f)) this.atomicWrite(f, content);
    this.blobCache.set(sha, content);
    return sha;
  }

  readBlob(sha: string): string {
    const c = this.blobCache.get(sha);
    if (c !== undefined) return c;
    const f = this.p("objects", sha);
    if (!/^[0-9a-f]{40}$/.test(sha) || !fs.existsSync(f)) throw new Error(`Không tìm thấy blob ${sha}`);
    const content = fs.readFileSync(f, "utf8");
    this.blobCache.set(sha, content);
    return content;
  }

  writeCommit(c: Omit<MgCommit, "sha">): MgCommit {
    const sortedTree = Object.fromEntries(Object.entries(c.tree).sort(([a], [b]) => (a < b ? -1 : 1)));
    const body = JSON.stringify({ ...c, tree: sortedTree });
    const sha = createHash("sha1").update(`commit\0${body}`).digest("hex");
    const commit: MgCommit = { sha, ...c, tree: sortedTree };
    this.atomicWrite(this.p("commits", `${sha}.json`), JSON.stringify(commit));
    this.commitCache.set(sha, commit);
    return commit;
  }

  readCommit(sha: string): MgCommit {
    const c = this.commitCache.get(sha);
    if (c) return c;
    const f = this.p("commits", `${sha}.json`);
    if (!/^[0-9a-f]{40}$/.test(sha) || !fs.existsSync(f)) throw new Error(`Không tìm thấy phiên bản ${sha}`);
    const commit = JSON.parse(fs.readFileSync(f, "utf8")) as MgCommit;
    this.commitCache.set(sha, commit);
    return commit;
  }

  // ---------- graph ----------
  ancestors(sha: string): Set<string> {
    const seen = new Set<string>();
    const stack = [sha];
    while (stack.length) {
      const s = stack.pop()!;
      if (seen.has(s)) continue;
      seen.add(s);
      stack.push(...this.readCommit(s).parents);
    }
    return seen;
  }

  mergeBase(a: string, b: string): string {
    const anc = this.ancestors(a);
    const queue = [b];
    const seen = new Set<string>();
    while (queue.length) {
      const s = queue.shift()!;
      if (anc.has(s)) return s;
      if (seen.has(s)) continue;
      seen.add(s);
      queue.push(...this.readCommit(s).parents);
    }
    throw new Error("Hai phiên bản không có gốc chung");
  }

  /** Lịch sử theo thứ tự thời gian giảm dần (first-parent + nhánh merge). */
  log(head: string): MgCommit[] {
    const out: MgCommit[] = [];
    const seen = new Set<string>();
    const stack = [head];
    while (stack.length) {
      const s = stack.pop()!;
      if (seen.has(s)) continue;
      seen.add(s);
      const c = this.readCommit(s);
      out.push(c);
      stack.push(...c.parents);
    }
    return out.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  }

  /**
   * Merge 3 chiều ở mức file. Trả về danh sách file xung đột (nếu có).
   * content/index.json là file dẫn xuất nên khi xung đột sẽ lấy bản của nhánh chính
   * (ứng dụng tự sửa chỉ mục khi phát hiện lệch).
   */
  threeWay(baseSha: string, oursSha: string, theirsSha: string): { tree: Record<string, string>; conflicts: string[] } {
    const base = this.readCommit(baseSha).tree;
    const ours = this.readCommit(oursSha).tree;
    const theirs = this.readCommit(theirsSha).tree;
    const paths = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
    const tree: Record<string, string> = {};
    const conflicts: string[] = [];
    for (const p of paths) {
      const b = base[p], o = ours[p], t = theirs[p];
      let r: string | undefined;
      if (o === t) r = o;
      else if (b === o) r = t;
      else if (b === t) r = o;
      else if (p === "content/index.json") r = o;
      else {
        conflicts.push(p);
        r = o;
      }
      if (r !== undefined) tree[p] = r;
    }
    return { tree, conflicts: conflicts.sort() };
  }

  changedFiles(fromSha: string | null, toSha: string): { path: string; status: "added" | "modified" | "removed" }[] {
    const a = fromSha ? this.readCommit(fromSha).tree : {};
    const b = this.readCommit(toSha).tree;
    const out: { path: string; status: "added" | "modified" | "removed" }[] = [];
    for (const p of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[p] === b[p]) continue;
      out.push({ path: p, status: !a[p] ? "added" : !b[p] ? "removed" : "modified" });
    }
    return out.sort((x, y) => (x.path < y.path ? -1 : 1));
  }
}
