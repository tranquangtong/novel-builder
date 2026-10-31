import { gitBlobSha, sha1OfString } from "../../domain/gitsha";

/**
 * "Mini-git" cho CHẾ ĐỘ DEMO: commit, nhánh, merge 3 chiều ở mức file.
 * Lưu qua MgStorage (IndexedDB trong trình duyệt, bộ nhớ/ổ đĩa khi test).
 * Không phải git thật và không dùng cho bản thảo thật.
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

export interface MgState {
  refs: Record<string, string>;
  pulls: MgPull[];
}

export interface MgStorage {
  getState(): Promise<MgState | null>;
  putState(s: MgState): Promise<void>;
  getObject(kind: "blob" | "commit", sha: string): Promise<string | undefined>;
  putObject(kind: "blob" | "commit", sha: string, data: string): Promise<void>;
  /** Khóa độc quyền (giữa các tab nếu có thể). */
  withLock<T>(fn: () => Promise<T>): Promise<T>;
  clear(): Promise<void>;
}

/** Lưu trong bộ nhớ (dùng cho test). */
export class MemoryStorage implements MgStorage {
  private state: MgState | null = null;
  private objs = new Map<string, string>();
  private chain: Promise<unknown> = Promise.resolve();
  async getState() {
    return this.state ? (JSON.parse(JSON.stringify(this.state)) as MgState) : null;
  }
  async putState(s: MgState) {
    this.state = JSON.parse(JSON.stringify(s));
  }
  async getObject(kind: string, sha: string) {
    return this.objs.get(`${kind}:${sha}`);
  }
  async putObject(kind: string, sha: string, data: string) {
    this.objs.set(`${kind}:${sha}`, data);
  }
  withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }
  async clear() {
    this.state = null;
    this.objs.clear();
  }
}

export class MiniGit {
  private commitCache = new Map<string, MgCommit>();
  private blobCache = new Map<string, string>();

  constructor(public readonly storage: MgStorage) {}

  async isInitialized() {
    return (await this.storage.getState()) !== null;
  }

  withLock<T>(fn: () => Promise<T>) {
    return this.storage.withLock(fn);
  }

  async readState(): Promise<MgState> {
    const s = await this.storage.getState();
    if (!s) throw new Error("Kho demo chưa được khởi tạo");
    return s;
  }

  writeState(s: MgState) {
    return this.storage.putState(s);
  }

  async writeBlob(content: string): Promise<string> {
    const sha = gitBlobSha(content);
    if (!this.blobCache.has(sha)) {
      await this.storage.putObject("blob", sha, content);
      this.blobCache.set(sha, content);
    }
    return sha;
  }

  async readBlob(sha: string): Promise<string> {
    const c = this.blobCache.get(sha);
    if (c !== undefined) return c;
    const v = /^[0-9a-f]{40}$/.test(sha) ? await this.storage.getObject("blob", sha) : undefined;
    if (v === undefined) throw new Error(`Không tìm thấy blob ${sha}`);
    this.blobCache.set(sha, v);
    return v;
  }

  async writeCommit(c: Omit<MgCommit, "sha">): Promise<MgCommit> {
    const sortedTree = Object.fromEntries(Object.entries(c.tree).sort(([a], [b]) => (a < b ? -1 : 1)));
    const body = JSON.stringify({ ...c, tree: sortedTree });
    const sha = sha1OfString(`commit\0${body}`);
    const commit: MgCommit = { sha, ...c, tree: sortedTree };
    await this.storage.putObject("commit", sha, JSON.stringify(commit));
    this.commitCache.set(sha, commit);
    return commit;
  }

  async readCommit(sha: string): Promise<MgCommit> {
    const c = this.commitCache.get(sha);
    if (c) return c;
    const v = /^[0-9a-f]{40}$/.test(sha) ? await this.storage.getObject("commit", sha) : undefined;
    if (v === undefined) throw new Error(`Không tìm thấy phiên bản ${sha}`);
    const commit = JSON.parse(v) as MgCommit;
    this.commitCache.set(sha, commit);
    return commit;
  }

  async ancestors(sha: string): Promise<Set<string>> {
    const seen = new Set<string>();
    const stack = [sha];
    while (stack.length) {
      const s = stack.pop()!;
      if (seen.has(s)) continue;
      seen.add(s);
      stack.push(...(await this.readCommit(s)).parents);
    }
    return seen;
  }

  async mergeBase(a: string, b: string): Promise<string> {
    const anc = await this.ancestors(a);
    const queue = [b];
    const seen = new Set<string>();
    while (queue.length) {
      const s = queue.shift()!;
      if (anc.has(s)) return s;
      if (seen.has(s)) continue;
      seen.add(s);
      queue.push(...(await this.readCommit(s)).parents);
    }
    throw new Error("Hai phiên bản không có gốc chung");
  }

  /** Lịch sử theo thời gian giảm dần. */
  async log(head: string): Promise<MgCommit[]> {
    const out: MgCommit[] = [];
    const seen = new Set<string>();
    const stack = [head];
    while (stack.length) {
      const s = stack.pop()!;
      if (seen.has(s)) continue;
      seen.add(s);
      const c = await this.readCommit(s);
      out.push(c);
      stack.push(...c.parents);
    }
    return out.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  }

  /**
   * Merge 3 chiều ở mức file. content/index.json là file dẫn xuất nên khi xung đột
   * lấy bản của nhánh chính (ứng dụng tự sửa chỉ mục khi phát hiện lệch).
   */
  async threeWay(baseSha: string, oursSha: string, theirsSha: string) {
    const base = (await this.readCommit(baseSha)).tree;
    const ours = (await this.readCommit(oursSha)).tree;
    const theirs = (await this.readCommit(theirsSha)).tree;
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

  async changedFiles(fromSha: string | null, toSha: string) {
    const a = fromSha ? (await this.readCommit(fromSha)).tree : {};
    const b = (await this.readCommit(toSha)).tree;
    const out: { path: string; status: "added" | "modified" | "removed" }[] = [];
    for (const p of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[p] === b[p]) continue;
      out.push({ path: p, status: !a[p] ? "added" : !b[p] ? "removed" : "modified" });
    }
    return out.sort((x, y) => (x.path < y.path ? -1 : 1));
  }
}
