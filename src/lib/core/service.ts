import { parseChapter, serializeChapter, validateMeta } from "../domain/chapter";
import { parseFrontmatter, serializeFrontmatter } from "../domain/frontmatter";
import { gitBlobSha } from "../domain/gitsha";
import { newId } from "../domain/ids";
import { chapterLabel } from "../domain/labels";
import {
  ACTS_DIR, CHAPTERS_DIR, INDEX_FILE, LEGACY_NOTE_DIRS, NOTES_ACT_DESCRIPTION, NOTES_ACT_TITLE, PROJECT_FILE, actPath, assertSafeContentPath, chapterIdFromPath, chapterPath, fileKind, isContentPath, type FileKind,
} from "../domain/paths";
import type {
  ActMeta, ChapterDoc, ChapterMeta, ChapterSummary, ChapterVersion, ProjectInfo, ProjectSnapshot, PullDetail,
} from "../domain/types";
import { countWords } from "../domain/wordcount";
import { RefMovedError, StoreError, type RepoStore } from "../store/types";
import { LruCache } from "../store/lru";

export interface Author {
  name: string;
  email: string;
}

export class ConflictError extends Error {
  constructor(
    message: string,
    public readonly detail: { path: string; serverBlob: string | null; serverCommit: string; expectedBlob: string | null },
  ) {
    super(message);
  }
}
export class ValidationError extends Error {}
export class NotInitializedError extends Error {}

interface IndexEntry {
  id: string;
  path: string;
  blob: string;
  title: string;
  act_id: string;
  order: number;
  status: ChapterMeta["status"];
  pov?: string;
  words: number;
}

const parsedChapterCache = new LruCache<string, { doc: ChapterDoc; words: number }>(4000);
const parsedFileCache = new LruCache<string, { data: Record<string, unknown>; body: string }>(2000);

/** Chỉ mục được ghi mỗi chương một dòng để git merge dễ hơn. File này là dữ liệu dẫn xuất. */
export function serializeIndex(entries: IndexEntry[]): string {
  const lines = entries.map((e) => "    " + JSON.stringify(e));
  return `{\n  "version": 1,\n  "note": "Tự sinh bởi ứng dụng — không sửa tay (agent không sửa file này). Nguồn chuẩn là frontmatter trong content/chapters/*.md; ứng dụng tự sinh lại khi lưu.",\n  "chapters": [\n${lines.join(",\n")}\n  ]\n}\n`;
}

function parseIndex(text: string): IndexEntry[] {
  try {
    const j = JSON.parse(text) as { chapters?: IndexEntry[] };
    return Array.isArray(j.chapters) ? j.chapters : [];
  } catch {
    return [];
  }
}

function shortTitle(c: { number: number; title: string }) {
  return chapterLabel(c);
}

/** Nội dung file Act 0 (Outline & Trivia). */
export function serializeNotesAct(id: string, order = 0) {
  return serializeFrontmatter({ id, title: NOTES_ACT_TITLE, order, kind: "notes" }, `${NOTES_ACT_DESCRIPTION}\n`);
}

const MANAGED_CHAPTER_KEYS = new Set(["id", "title", "act_id", "order", "status", "pov"]);
const LEGACY_KIND: [string, string][] = [
  ["content/outlines/", "outline"], ["content/canon/characters/", "character"], ["content/canon/world/", "world"],
  ["content/canon/timeline/", "timeline"], ["content/canon/knowledge/", "knowledge"], ["content/canon/", "canon"],
];

export class ManuscriptService {
  constructor(public readonly store: RepoStore) {}

  get branch() {
    return this.store.defaultBranch;
  }

  // ---------------- đọc ----------------

  async head() {
    return this.store.getBranchHead(this.branch);
  }

  private async parsedChapter(blob: string, path: string) {
    const hit = parsedChapterCache.get(blob);
    if (hit) return hit;
    const text = await this.store.readBlob(blob);
    const doc = parseChapter(text, chapterIdFromPath(path) ?? undefined);
    const v = { doc, words: countWords(doc.body) };
    parsedChapterCache.set(blob, v);
    return v;
  }

  async parsedFile(blob: string) {
    const hit = parsedFileCache.get(blob);
    if (hit) return hit;
    const text = await this.store.readBlob(blob);
    let v: { data: Record<string, unknown>; body: string };
    try {
      const p = parseFrontmatter(text);
      v = { data: p.data, body: p.body };
    } catch {
      v = { data: {}, body: text };
    }
    parsedFileCache.set(blob, v);
    return v;
  }

  /**
   * Danh sách Act/chương KHÔNG kèm nội dung. Dùng content/index.json (1 lần đọc),
   * so blob sha với cây thư mục; chỉ những chương lệch mới được đọc trực tiếp.
   */
  async snapshot(commitSha?: string): Promise<ProjectSnapshot & { tree: Map<string, string> }> {
    const headSha = commitSha ?? (await this.head());
    const tree = await this.store.getTree(headSha);
    const projectBlob = tree.get(PROJECT_FILE);
    if (!projectBlob) throw new NotInitializedError("Repository chưa có content/project.json");
    const projectRaw = JSON.parse(await this.store.readBlob(projectBlob)) as Partial<ProjectInfo>;
    const project: ProjectInfo = {
      title: projectRaw.title ?? "Không tên",
      subtitle: projectRaw.subtitle,
      language: projectRaw.language ?? "vi",
      word_target: projectRaw.word_target ?? { min: 2500, max: 3000 },
      demo_data: projectRaw.demo_data === true,
    };

    const indexBlob = tree.get(INDEX_FILE);
    const indexed = new Map<string, IndexEntry>();
    if (indexBlob) for (const e of parseIndex(await this.store.readBlob(indexBlob))) indexed.set(e.path, e);

    const chapterFiles = [...tree.entries()].filter(([p]) => p.startsWith(`${CHAPTERS_DIR}/`) && p.endsWith(".md"));
    let stale = 0;
    const entries: IndexEntry[] = await mapLimit(chapterFiles, 8, async ([path, blob]) => {
      const e = indexed.get(path);
      if (e && e.blob === blob) return e;
      stale++;
      const { doc, words } = await this.parsedChapter(blob, path);
      return { id: doc.meta.id, path, blob, title: doc.meta.title, act_id: doc.meta.act_id, order: doc.meta.order, status: doc.meta.status, pov: doc.meta.pov, words };
    });
    if (indexed.size !== chapterFiles.length) stale += Math.max(0, indexed.size - chapterFiles.length);

    const actFiles = [...tree.entries()].filter(([p]) => p.startsWith(`${ACTS_DIR}/`) && p.endsWith(".md"));
    const acts: ActMeta[] = await mapLimit(actFiles, 8, async ([path, blob]) => {
      const f = await this.parsedFile(blob);
      return {
        id: String(f.data.id ?? path.replace(/^.*\/|\.md$/g, "")),
        title: String(f.data.title ?? "Act"),
        order: Number(f.data.order ?? 0),
        description: f.body.trim() || undefined,
        kind: f.data.kind === "notes" ? ("notes" as const) : undefined,
        path,
        blob,
      };
    });
    acts.sort((a, b) => a.order - b.order);

    // Ghi chú (Act 0) đứng trước, không đánh số; chương truyện được đánh số 1..N như cũ.
    const noteActs = new Set(acts.filter((a) => a.kind === "notes").map((a) => a.id));
    const byOrder = (a: IndexEntry, b: IndexEntry) => a.order - b.order || (a.id < b.id ? -1 : 1);
    const actRank = new Map(acts.map((a, i) => [a.id, i]));
    const notes = entries.filter((e) => noteActs.has(e.act_id)).sort((a, b) => (actRank.get(a.act_id)! - actRank.get(b.act_id)!) || byOrder(a, b));
    const story = entries.filter((e) => !noteActs.has(e.act_id)).sort(byOrder);
    const chapters: ChapterSummary[] = [
      ...notes.map((e) => ({ ...e, number: 0, note: true })),
      ...story.map((e, i) => ({ ...e, number: i + 1, note: false })),
    ];
    return { repo: this.store.repoKey, branch: this.branch, headSha, project, acts, chapters, indexStale: stale, tree };
  }

  /** ID các Act kiểu "notes" (Act 0) trong một cây thư mục. */
  private async noteActIds(tree: Map<string, string>) {
    const out = new Set<string>();
    for (const [p, blob] of tree) {
      if (!p.startsWith(`${ACTS_DIR}/`) || !p.endsWith(".md")) continue;
      const f = await this.parsedFile(blob);
      if (f.data.kind === "notes") out.add(String(f.data.id ?? p.replace(/^.*\/|\.md$/g, "")));
    }
    return out;
  }

  async getChapter(id: string, commitSha?: string): Promise<ChapterVersion> {
    const sha = commitSha ?? (await this.head());
    const tree = await this.store.getTree(sha);
    const path = chapterPath(id);
    const blob = tree.get(path);
    if (!blob) throw new StoreError(`Không có chương ${id} ở phiên bản ${sha.slice(0, 7)}`, 404);
    const { doc, words } = await this.parsedChapter(blob, path);
    return { repo: this.store.repoKey, branch: this.branch, commitSha: sha, blob, path, doc, words };
  }

  async chapterHead(id: string) {
    const headSha = await this.head();
    const tree = await this.store.getTree(headSha);
    return { headSha, blob: tree.get(chapterPath(id)) ?? null };
  }

  async chapterHistory(id: string, page = 1) {
    return this.store.listCommits({ branch: this.branch, path: chapterPath(id), limit: 30, page });
  }

  async readFile(path: string, commitSha?: string) {
    assertSafeContentPath(path);
    const sha = commitSha ?? (await this.head());
    const tree = await this.store.getTree(sha);
    const blob = tree.get(path);
    if (!blob) return null;
    return { path, blob, commitSha: sha, content: await this.store.readBlob(blob) };
  }

  /** Liệt kê file trong một thư mục content/ kèm frontmatter (không kèm thân). */
  async listFiles(prefix: string) {
    assertSafeContentPath(prefix.replace(/\/$/, "") + "/x");
    const headSha = await this.head();
    const tree = await this.store.getTree(headSha);
    const files = [...tree.entries()].filter(([p]) => p.startsWith(prefix) && /\.(md|json)$/.test(p));
    const out = await mapLimit(files, 8, async ([path, blob]) => {
      const f = path.endsWith(".md") ? await this.parsedFile(blob) : { data: {}, body: "" };
      return { path, blob, kind: fileKind(path) as FileKind, data: f.data, title: String(f.data.title ?? f.data.name ?? path.split("/").pop()) };
    });
    return { headSha, tree, files: out.sort((a, b) => (a.path < b.path ? -1 : 1)) };
  }

  // ---------------- ghi ----------------

  /**
   * Ghi nhiều file trong MỘT commit với kiểm tra phiên bản gốc theo từng file.
   * `expected[path]` = blob sha mà người dùng dựa vào (null = file phải chưa tồn tại).
   * Nếu nhánh đi tiếp trong lúc ghi nhưng các file này không bị đụng tới thì thử lại
   * trên phiên bản mới; nếu chính các file này đã đổi thì ném ConflictError.
   * Chỉ mục content/index.json luôn được sinh lại trong cùng commit.
   */
  async commitWithChecks(input: {
    expected: Record<string, string | null>;
    build: (ctx: { headSha: string; tree: Map<string, string> }) => Promise<Record<string, string | null>>;
    message: string;
    author?: Author;
  }) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const headSha = await this.head();
      const tree = await this.store.getTree(headSha);
      for (const [path, exp] of Object.entries(input.expected)) {
        const actual = tree.get(path) ?? null;
        if (actual !== exp) {
          throw new ConflictError(
            exp === null ? `File ${path} đã tồn tại` : actual === null ? `File ${path} đã bị xóa ở phiên bản mới hơn` : `Nội dung ${path} đã thay đổi kể từ phiên bản bạn dựa vào`,
            { path, serverBlob: actual, serverCommit: headSha, expectedBlob: exp },
          );
        }
      }
      const changes = await input.build({ headSha, tree });
      changes[INDEX_FILE] = await this.buildIndexText(tree, changes);
      try {
        const { commitSha } = await this.store.commitFiles({ branch: this.branch, expectedHead: headSha, changes, message: input.message, author: input.author });
        return { commitSha, changes };
      } catch (e) {
        if (e instanceof RefMovedError) continue; // có người vừa lưu file khác → kiểm tra lại
        throw e;
      }
    }
    throw new StoreError("Kho liên tục thay đổi trong lúc lưu, vui lòng thử lại", 503);
  }

  private async buildIndexText(tree: Map<string, string>, changes: Record<string, string | null>) {
    const paths = new Set<string>();
    for (const p of tree.keys()) if (p.startsWith(`${CHAPTERS_DIR}/`) && p.endsWith(".md")) paths.add(p);
    for (const [p, c] of Object.entries(changes)) {
      if (!p.startsWith(`${CHAPTERS_DIR}/`) || !p.endsWith(".md")) continue;
      if (c === null) paths.delete(p);
      else paths.add(p);
    }
    const entries = await mapLimit([...paths], 8, async (path): Promise<IndexEntry> => {
      const content = changes[path];
      let doc: ChapterDoc, words: number, blob: string;
      if (typeof content === "string") {
        doc = parseChapter(content, chapterIdFromPath(path) ?? undefined);
        words = countWords(doc.body);
        blob = gitBlobSha(content);
      } else {
        blob = tree.get(path)!;
        ({ doc, words } = await this.parsedChapter(blob, path));
      }
      return { id: doc.meta.id, path, blob, title: doc.meta.title, act_id: doc.meta.act_id, order: doc.meta.order, status: doc.meta.status, pov: doc.meta.pov, words };
    });
    entries.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
    return serializeIndex(entries);
  }

  async saveChapter(id: string, input: { meta: Omit<ChapterMeta, "id">; body: string; baseBlob: string | null; note?: string }, author?: Author) {
    const errs = validateMeta(input.meta);
    if (errs.length) throw new ValidationError(errs.join("; "));
    const path = chapterPath(id);
    const isNew = input.baseBlob === null;
    const msgTitle = `${isNew ? "Tạo chương" : "Lưu phiên bản"}: ${input.meta.title}`;
    const message = `${msgTitle}${input.note ? `\n\n${input.note}` : ""}\n\nChapter-Id: ${id}`;
    const res = await this.commitWithChecks({
      expected: { [path]: input.baseBlob },
      author,
      message,
      build: async ({ tree }) => {
        if (!tree.has(actPath(input.meta.act_id))) throw new ValidationError(`Act ${input.meta.act_id} không tồn tại`);
        let extra: Record<string, unknown> = {};
        const old = tree.get(path);
        if (old) {
          const prev = await this.parsedChapter(old, path);
          extra = prev.doc.extra;
          if (prev.doc.meta.act_id !== input.meta.act_id) {
            const notes = await this.noteActIds(tree);
            if (notes.has(prev.doc.meta.act_id) !== notes.has(input.meta.act_id)) throw new ValidationError("Không chuyển chương giữa Act 0 (ghi chú) và các Act truyện — Act 0 không đánh số chương");
          }
        }
        return { [path]: serializeChapter({ meta: { ...input.meta, id }, body: input.body, extra }) };
      },
    });
    return { commitSha: res.commitSha, blob: gitBlobSha(res.changes[path] as string) };
  }

  async createChapter(input: { title: string; act_id: string; pov?: string; afterId?: string }, author?: Author) {
    const snap = await this.snapshot();
    const id = newId("ch");
    let order: number;
    const inAct = snap.chapters.filter((c) => c.act_id === input.act_id);
    if (snap.acts.find((a) => a.id === input.act_id)?.kind === "notes") {
      // Ghi chú có thứ tự riêng trong Act 0, không xen vào dãy chương truyện.
      order = Math.max(0, ...inAct.map((c) => c.order)) + 1;
    } else if (input.afterId) {
      const i = snap.chapters.findIndex((c) => c.id === input.afterId);
      const a = snap.chapters[i];
      const b = snap.chapters[i + 1];
      order = a ? (b ? (a.order + b.order) / 2 : a.order + 1) : (snap.chapters.at(-1)?.order ?? 0) + 1;
    } else if (inAct.length) {
      const last = inAct.at(-1)!;
      const next = snap.chapters[snap.chapters.findIndex((c) => c.id === last.id) + 1];
      order = next ? (last.order + next.order) / 2 : last.order + 1;
    } else {
      const act = snap.acts.find((a) => a.id === input.act_id);
      const laterActs = new Set(snap.acts.filter((a) => act && a.order > act.order).map((a) => a.id));
      const firstLater = snap.chapters.find((c) => laterActs.has(c.act_id));
      const prev = firstLater ? snap.chapters[snap.chapters.indexOf(firstLater) - 1] : snap.chapters.at(-1);
      order = firstLater ? ((prev?.order ?? firstLater.order - 1) + firstLater.order) / 2 : (prev?.order ?? 0) + 1;
    }
    const res = await this.saveChapter(id, { meta: { title: input.title, act_id: input.act_id, order, status: "draft", pov: input.pov }, body: "", baseBlob: null }, author);
    return { id, ...res };
  }

  /** Đổi chỗ hai chương (một commit, 2 file + chỉ mục). */
  async swapOrder(a: { id: string; blob: string }, b: { id: string; blob: string }, author?: Author) {
    const pa = chapterPath(a.id), pb = chapterPath(b.id);
    return this.commitWithChecks({
      expected: { [pa]: a.blob, [pb]: b.blob },
      author,
      message: `Đổi thứ tự chương\n\nChapter-Id: ${a.id}\nChapter-Id: ${b.id}`,
      build: async ({ tree }) => {
        const da = (await this.parsedChapter(tree.get(pa)!, pa)).doc;
        const db = (await this.parsedChapter(tree.get(pb)!, pb)).doc;
        return {
          [pa]: serializeChapter({ ...da, meta: { ...da.meta, order: db.meta.order, act_id: db.meta.act_id } }),
          [pb]: serializeChapter({ ...db, meta: { ...db.meta, order: da.meta.order, act_id: da.meta.act_id } }),
        };
      },
    });
  }

  async createAct(input: { title: string; description?: string }, author?: Author) {
    const snap = await this.snapshot();
    const id = newId("act");
    const order = (snap.acts.at(-1)?.order ?? 0) + 1;
    const path = actPath(id);
    const res = await this.commitWithChecks({
      expected: { [path]: null },
      author,
      message: `Tạo Act: ${input.title}`,
      build: async () => ({ [path]: serializeFrontmatter({ id, title: input.title, order }, `${input.description ?? ""}\n`) }),
    });
    return { id, commitSha: res.commitSha };
  }

  async saveFile(path: string, content: string, baseBlob: string | null, message: string, author?: Author) {
    assertSafeContentPath(path);
    if (path === INDEX_FILE) throw new ValidationError("content/index.json là file tự sinh");
    if (path.startsWith(`${CHAPTERS_DIR}/`)) throw new ValidationError("Dùng trình soạn chương để lưu chương");
    if (path === PROJECT_FILE) JSON.parse(content);
    const res = await this.commitWithChecks({ expected: { [path]: baseBlob }, author, message, build: async () => ({ [path]: content }) });
    return { commitSha: res.commitSha, blob: gitBlobSha(content) };
  }

  // ---------------- Act 0 (Outline & Trivia) ----------------

  /** Act 0 đã có chưa, và còn file outline/canon kiểu cũ nào chưa được chuyển vào Act 0. */
  async notesStatus() {
    const tree = await this.store.getTree(await this.head());
    return this.notesStatusFrom(tree);
  }

  private async notesStatusFrom(tree: Map<string, string>) {
    const ids = await this.noteActIds(tree);
    const legacy = [...tree.keys()].filter((p) => p.endsWith(".md") && LEGACY_NOTE_DIRS.some((d) => p.startsWith(d))).sort();
    return { hasAct: ids.size > 0, actId: [...ids][0] ?? null, legacy };
  }

  /**
   * Tạo Act 0 (nếu chưa có) và chuyển MỌI file .md trong content/outlines/ và content/canon/
   * thành ghi chú của Act 0, trong MỘT commit: thân file giữ nguyên từng ký tự, thuộc tính (YAML)
   * giữ lại làm metadata phụ, file cũ bị xóa khỏi bản chính (vẫn còn trong lịch sử để phục hồi).
   * Gọi lại khi không còn gì để chuyển thì không tạo commit.
   */
  async setupNotesAct(author?: Author) {
    const head = await this.head();
    const tree = await this.store.getTree(head);
    const st = await this.notesStatusFrom(tree);
    if (st.hasAct && !st.legacy.length) return { actId: st.actId!, moved: [] as { from: string; id: string; title: string }[], commitSha: null as string | null };

    const actId = st.actId ?? newId("act");
    const expected: Record<string, string | null> = {};
    if (!st.hasAct) expected[actPath(actId)] = null;
    for (const p of st.legacy) expected[p] = tree.get(p)!;

    const moved: { from: string; id: string; title: string }[] = [];
    const res = await this.commitWithChecks({
      expected,
      author,
      message: st.legacy.length ? `Chuyển ${st.legacy.length} file outline/canon vào Act 0` : "Tạo Act 0 · Outline & Trivia",
      build: async ({ tree: t }) => {
        const changes: Record<string, string | null> = {};
        if (!st.hasAct) changes[actPath(actId)] = serializeNotesAct(actId);
        const rank = (p: string) => LEGACY_KIND.findIndex(([d]) => p.startsWith(d));
        const files = [...st.legacy].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
        // Thứ tự ghi chú mới nối tiếp sau các ghi chú đã có.
        let order = 0;
        if (st.hasAct) for (const [p, blob] of t) if (p.startsWith(`${CHAPTERS_DIR}/`)) { const d = (await this.parsedChapter(blob, p)).doc.meta; if (d.act_id === actId) order = Math.max(order, d.order); }
        for (const from of files) {
          const f = await this.parsedFile(t.get(from)!);
          const id = newId("ch");
          const extra: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(f.data)) {
            if (MANAGED_CHAPTER_KEYS.has(k)) extra[k === "act_id" ? "related_act_id" : k === "status" ? "legacy_status" : `legacy_${k}`] = v;
            else extra[k] = v;
          }
          extra.note_kind = LEGACY_KIND[rank(from)][1];
          extra.migrated_from = from;
          const title = typeof f.data.title === "string" && f.data.title ? f.data.title : (f.data.name ? String(f.data.name) : from.split("/").pop()!.replace(/\.md$/, ""));
          order += 1;
          changes[chapterPath(id)] = serializeChapter({ meta: { id, title, act_id: actId, order, status: "draft" }, body: f.body, extra });
          changes[from] = null;
          moved.push({ from, id, title });
        }
        return changes;
      },
    });
    return { actId, moved, commitSha: res.commitSha };
  }

  async repairIndex(author?: Author) {
    return this.commitWithChecks({ expected: {}, author, message: "Cập nhật chỉ mục chương (content/index.json)", build: async () => ({}) });
  }

  // ---------------- phục hồi ----------------

  /**
   * Phục hồi một hoặc nhiều chương về nội dung ở `fromCommit` bằng một phiên bản MỚI.
   * Không viết lại lịch sử, không đụng tới file khác (canon, chương khác).
   * `current[id]` = blob hiện tại mà người dùng đã xem trong bước xem trước.
   */
  async restoreChapters(input: { fromCommit: string; chapterIds: string[]; current: Record<string, string>; keepMeta: boolean }, author?: Author) {
    if (!input.chapterIds.length) throw new ValidationError("Chưa chọn chương nào");
    const oldTree = await this.store.getTree(input.fromCommit);
    const expected: Record<string, string | null> = {};
    for (const id of input.chapterIds) {
      const p = chapterPath(id);
      if (!oldTree.has(p)) throw new ValidationError(`Chương ${id} không tồn tại ở phiên bản ${input.fromCommit.slice(0, 7)}`);
      if (!input.current[id]) throw new ValidationError(`Thiếu phiên bản hiện tại của ${id} (cần xem trước khi phục hồi)`);
      expected[p] = input.current[id];
    }
    const snap = await this.snapshot();
    const labels = input.chapterIds.map((id) => {
      const c = snap.chapters.find((x) => x.id === id);
      return c ? shortTitle(c) : id;
    });
    const message = `Phục hồi ${labels.join(", ")} về nội dung của phiên bản ${input.fromCommit.slice(0, 7)}\n\n${input.keepMeta ? "Giữ nguyên tiêu đề, Act, trạng thái hiện tại; chỉ phục hồi nội dung." : "Phục hồi cả nội dung và metadata."}\n\n${input.chapterIds.map((id) => `Chapter-Id: ${id}`).join("\n")}`;
    return this.commitWithChecks({
      expected,
      author,
      message,
      build: async ({ tree }) => {
        const changes: Record<string, string> = {};
        for (const id of input.chapterIds) {
          const p = chapterPath(id);
          const old = (await this.parsedChapter(oldTree.get(p)!, p)).doc;
          const cur = (await this.parsedChapter(tree.get(p)!, p)).doc;
          const doc: ChapterDoc = input.keepMeta ? { ...cur, body: old.body } : old;
          changes[p] = serializeChapter(doc);
        }
        return changes;
      },
    });
  }

  // ---------------- đề xuất (pull request) ----------------

  /**
   * Như snapshot() nhưng không lỗi khi nhánh chính chưa có cấu trúc bản thảo
   * (ví dụ repo mới, cấu trúc đang nằm trong một đề xuất chưa nhập).
   */
  async snapshotOrEmpty(): Promise<{ headSha: string; tree: Map<string, string>; chapters: ChapterSummary[]; initialized: boolean }> {
    try {
      const s = await this.snapshot();
      return { headSha: s.headSha, tree: s.tree, chapters: s.chapters, initialized: true };
    } catch (e) {
      if (!(e instanceof NotInitializedError)) throw e;
      const headSha = await this.head();
      return { headSha, tree: await this.store.getTree(headSha), chapters: [], initialized: false };
    }
  }

  async proposalDetail(n: number) {
    const pr: PullDetail = await this.store.getPull(n);
    const snap = await this.snapshotOrEmpty();
    const byPath = new Map(snap.chapters.map((c) => [c.path, c]));
    const baseTree = await this.store.getTree(pr.mergeBase);
    const headTree = pr.headSha ? await this.store.getTree(pr.headSha) : new Map<string, string>();
    const files = await mapLimit(pr.files, 6, async (f) => {
      const before = baseTree.get(f.path) ?? null;
      const after = headTree.get(f.path) ?? null;
      const onMain = snap.tree.get(f.path) ?? null;
      const ch = byPath.get(f.path);
      const id = chapterIdFromPath(f.path);
      return {
        ...f,
        kind: fileKind(f.path),
        chapter: ch ? { id: ch.id, number: ch.number, title: ch.title } : id ? newChapterLabel(id, after ? await this.store.readBlob(after) : null) : null,
        beforeBlob: before,
        afterBlob: after,
        /** File trên bản chính đã đổi kể từ khi agent bắt đầu (merge base). */
        changedOnMainSinceBase: onMain !== before,
        before: before ? await this.store.readBlob(before) : null,
        after: after ? await this.store.readBlob(after) : null,
      };
    });
    // Chương trước (theo số chương), rồi tới canon/outline/khác.
    files.sort((a, b) => (a.chapter ? 0 : 1) - (b.chapter ? 0 : 1) || (a.chapter?.number ?? 0) - (b.chapter?.number ?? 0) || (a.path < b.path ? -1 : 1));
    return { pr, files: files.filter((f) => isContentPath(f.path) || f.path.endsWith(".md")), otherFiles: files.filter((f) => !(isContentPath(f.path) || f.path.endsWith(".md"))).map((f) => f.path), mainHead: snap.headSha };
  }

  // ---------------- xuất ----------------

  async exportManuscript() {
    const snap = await this.snapshot();
    const actTitle = new Map(snap.acts.map((a) => [a.id, a.title]));
    const blocks: string[] = [`# ${snap.project.title}\n`];
    if (snap.project.demo_data) blocks.push("> DỮ LIỆU DEMO — không phải bản thảo thật.\n");
    blocks.push(`<!-- Xuất từ ${snap.repo} @ ${snap.headSha} -->\n`);
    let lastAct = "";
    // Ghi chú trong Act 0 không thuộc bản thảo truyện nên không xuất.
    const story = snap.chapters.filter((c) => !c.note);
    const bodies = await mapLimit(story, 8, async (c) => (await this.parsedChapter(c.blob, c.path)).doc.body);
    story.forEach((c, i) => {
      if (c.act_id !== lastAct) {
        blocks.push(`\n# ${actTitle.get(c.act_id) ?? "Chưa xếp Act"}\n`);
        lastAct = c.act_id;
      }
      blocks.push(`\n## ${shortTitle(c)}\n\n${bodies[i].replace(/\s+$/, "")}\n`);
    });
    return { text: blocks.join(""), snap };
  }
}

/** Chương chỉ có trong đề xuất (chưa có trên bản chính): lấy tên và thứ tự từ chính file. */
function newChapterLabel(id: string, text: string | null) {
  if (!text) return { id, number: 0, title: id };
  try {
    const d = parseChapter(text, id);
    return { id, number: d.meta.order, title: d.meta.title };
  } catch {
    return { id, number: 0, title: id };
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
