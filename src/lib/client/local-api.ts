"use client";
import { ConflictError, NotInitializedError, ValidationError } from "../core/service";
import { buildContextPack, type PackRequest } from "../core/context-pack";
import { importChapters, type ImportItem } from "../core/import-service";
import { initializeStructure } from "../core/init-structure";
import { ChapterFormatError } from "../domain/chapter";
import { FrontmatterError } from "../domain/frontmatter";
import { isValidId } from "../domain/ids";
import { chapterIdFromPath } from "../domain/paths";
import type { ChapterMeta } from "../domain/types";
import { simulateMainEdit, simulateProposal, simulatePushToProposal } from "../store/demo/agent-sim";
import { GitHubStore } from "../store/github/github-store";
import { HeadChangedError, NotMergeableError, StoreError } from "../store/types";
import { getBackend, NotConnectedError, resetBackend } from "./backend";
import type { Author } from "../core/service";

/**
 * “API” chạy ngay trong trình duyệt. Giữ nguyên đường dẫn /api/... của bản có máy chủ để
 * giao diện không đổi; mỗi handler gọi thẳng ManuscriptService (GitHub REST hoặc kho demo).
 * Không có máy chủ trung gian: trình duyệt ↔ api.github.com.
 */
export class LocalApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string, public readonly data: Record<string, unknown> = {}) {
    super(message);
  }
}

function toApiError(e: unknown): LocalApiError {
  if (e instanceof LocalApiError) return e;
  if (e instanceof NotConnectedError) return new LocalApiError("Chưa kết nối", 401, "unauthenticated");
  if (e instanceof ConflictError) return new LocalApiError(e.message, 409, "conflict", { conflict: e.detail });
  if (e instanceof HeadChangedError) return new LocalApiError(e.message, 409, "head_changed", { actualHead: e.actualHead });
  if (e instanceof NotMergeableError) return new LocalApiError(e.message, 409, "not_mergeable");
  if (e instanceof NotInitializedError) return new LocalApiError(e.message, 409, "not_initialized");
  if (e instanceof ValidationError || e instanceof FrontmatterError || e instanceof ChapterFormatError || e instanceof SyntaxError) return new LocalApiError(e.message, 400, "invalid");
  if (e instanceof StoreError) return new LocalApiError(e.message, e.status, e.status === 401 ? "unauthenticated" : "store");
  return new LocalApiError(e instanceof Error ? e.message : String(e), 500, "internal");
}

type Ctx = { method: string; params: string[]; query: URLSearchParams; body: Record<string, unknown> };
type Handler = (c: Ctx) => Promise<unknown>;

const SHA = /^[0-9a-f]{40}$/;
const ALLOWED_PREFIXES = ["content/canon/", "content/outlines/", "content/summaries/", "content/reviews/", "content/acts/", "content/notes/"];

async function author(): Promise<Author> {
  const { svc } = await getBackend();
  const login = await svc.store.actorLogin().catch(() => "tac-gia");
  return { name: login, email: `${login}@users.noreply.github.com` };
}

function needId(id: string) {
  if (!isValidId(id)) throw new ValidationError("ID chương không hợp lệ");
  return id;
}
function needN(n: string) {
  const v = Number(n);
  if (!Number.isInteger(v) || v <= 0) throw new ValidationError("Số đề xuất không hợp lệ");
  return v;
}

const routes: [string, RegExp, Handler][] = [
  ["GET", /^\/api\/me$/, async () => {
    const { svc, conn } = await getBackend();
    return { login: await svc.store.actorLogin().catch(() => "?"), mode: conn.mode, repoKey: svc.store.repoKey, branch: svc.store.defaultBranch };
  }],
  ["GET", /^\/api\/project$/, async () => {
    const { svc } = await getBackend();
    const { tree: _t, ...snap } = await svc.snapshot();
    void _t;
    return snap;
  }],
  ["POST", /^\/api\/project\/reindex$/, async () => ({ commitSha: (await (await getBackend()).svc.repairIndex(await author())).commitSha })],
  ["POST", /^\/api\/project\/init$/, async ({ body }) => initializeStructure((await getBackend()).svc, String(body.title || "The Last Miracle"), await author())],
  ["POST", /^\/api\/chapters$/, async ({ body }) => {
    const title = String(body.title ?? "").trim();
    if (!title || !body.act_id) throw new ValidationError("Cần tiêu đề và Act");
    return (await getBackend()).svc.createChapter({ title, act_id: String(body.act_id), afterId: body.afterId as string | undefined, pov: body.pov as string | undefined }, await author());
  }],
  ["POST", /^\/api\/chapters\/swap$/, async ({ body }) => {
    const r = await (await getBackend()).svc.swapOrder(body.a as { id: string; blob: string }, body.b as { id: string; blob: string }, await author());
    return { commitSha: r.commitSha };
  }],
  ["GET", /^\/api\/chapters\/([^/]+)$/, async ({ params, query }) => {
    const commit = query.get("commit") ?? undefined;
    if (commit && !SHA.test(commit)) throw new ValidationError("Phiên bản không hợp lệ");
    return (await getBackend()).svc.getChapter(needId(params[0]), commit);
  }],
  ["PUT", /^\/api\/chapters\/([^/]+)$/, async ({ params, body }) => {
    const id = needId(params[0]);
    const m = body.meta as Omit<ChapterMeta, "id"> | undefined;
    if (typeof body.body !== "string" || !m) throw new ValidationError("Thiếu nội dung");
    if (body.baseBlob !== null && typeof body.baseBlob !== "string") throw new ValidationError("Thiếu phiên bản gốc (baseBlob)");
    const meta = { title: String(m.title ?? ""), act_id: String(m.act_id ?? ""), order: Number(m.order), status: m.status, pov: m.pov || undefined };
    return (await getBackend()).svc.saveChapter(id, { meta, body: body.body, baseBlob: body.baseBlob as string | null, note: (body.note as string | undefined)?.slice(0, 2000) }, await author());
  }],
  ["GET", /^\/api\/chapters\/([^/]+)\/head$/, async ({ params }) => (await getBackend()).svc.chapterHead(needId(params[0]))],
  ["GET", /^\/api\/chapters\/([^/]+)\/history$/, async ({ params, query }) => ({ versions: await (await getBackend()).svc.chapterHistory(needId(params[0]), Math.max(1, Number(query.get("page") ?? 1) || 1)) })],
  ["POST", /^\/api\/acts$/, async ({ body }) => {
    const title = String(body.title ?? "").trim();
    if (!title) throw new ValidationError("Cần tên Act");
    return (await getBackend()).svc.createAct({ title, description: body.description as string | undefined }, await author());
  }],
  ["GET", /^\/api\/files$/, async ({ query }) => {
    const prefix = query.get("prefix") ?? "content/canon/";
    if (!ALLOWED_PREFIXES.some((a) => prefix.startsWith(a))) throw new ValidationError("Thư mục không được phép");
    const { headSha, tree, files } = await (await getBackend()).svc.listFiles(prefix);
    return {
      headSha,
      files: files.map((f) => {
        const cid = typeof f.data.chapter_id === "string" ? f.data.chapter_id : null;
        const current = cid ? tree.get(`content/chapters/${cid}.md`) ?? null : null;
        return { ...f, sourceCurrentBlob: current, stale: cid ? current !== f.data.source_blob : undefined };
      }),
    };
  }],
  ["GET", /^\/api\/file$/, async ({ query }) => {
    const commit = query.get("commit") ?? undefined;
    if (commit && !SHA.test(commit)) throw new ValidationError("Phiên bản không hợp lệ");
    const f = await (await getBackend()).svc.readFile(query.get("path") ?? "", commit);
    if (!f) throw new LocalApiError("Không có file", 404, "not_found");
    return f;
  }],
  ["PUT", /^\/api\/file$/, async ({ body }) => {
    if (typeof body.content !== "string") throw new ValidationError("Thiếu nội dung");
    const path = String(body.path ?? "");
    return (await getBackend()).svc.saveFile(path, body.content, (body.baseBlob as string | null) ?? null, String(body.message ?? "").trim() || `Lưu phiên bản: ${path}`, await author());
  }],
  ["GET", /^\/api\/history$/, async ({ query }) => {
    const { svc } = await getBackend();
    return { commits: await svc.store.listCommits({ branch: svc.branch, limit: 30, page: Math.max(1, Number(query.get("page") ?? 1) || 1) }) };
  }],
  ["GET", /^\/api\/history\/([^/]+)$/, async ({ params }) => {
    if (!SHA.test(params[0])) throw new ValidationError("Phiên bản không hợp lệ");
    return (await getBackend()).svc.store.getCommit(params[0]);
  }],
  ["POST", /^\/api\/restore\/preview$/, async ({ body }) => {
    const fromCommit = String(body.fromCommit ?? "");
    if (!SHA.test(fromCommit)) throw new ValidationError("Phiên bản không hợp lệ");
    const chapterIds = (body.chapterIds as string[] | undefined) ?? [];
    const { svc } = await getBackend();
    const snap = await svc.snapshot();
    const oldTree = await svc.store.getTree(fromCommit);
    const byId = new Map(snap.chapters.map((c) => [c.id, c]));
    const candidates: string[] = [];
    for (const [p, blob] of oldTree) {
      const id = chapterIdFromPath(p);
      if (id && snap.tree.get(p) && snap.tree.get(p) !== blob) candidates.push(id);
    }
    const ids = chapterIds.length ? chapterIds : candidates;
    const items = await Promise.all(ids.map(async (id) => {
      const cur = byId.get(id);
      const old = cur ? await svc.getChapter(id, fromCommit).catch(() => null) : null;
      if (!cur || !old) return { id, missing: true as const, number: 0 };
      const now = chapterIds.length ? await svc.getChapter(id) : null;
      return {
        id, number: cur.number, title: cur.title, currentBlob: cur.blob, oldBlob: old.blob, oldTitle: old.doc.meta.title, oldWords: old.words, currentWords: cur.words,
        oldBody: chapterIds.length ? old.doc.body : undefined, currentBody: now?.doc.body,
      };
    }));
    return { fromCommit, headSha: snap.headSha, candidates: candidates.length, items: items.sort((x, y) => x.number - y.number) };
  }],
  ["POST", /^\/api\/restore$/, async ({ body }) => {
    const fromCommit = String(body.fromCommit ?? "");
    const ids = body.chapterIds as string[];
    if (!SHA.test(fromCommit)) throw new ValidationError("Phiên bản không hợp lệ");
    if (!Array.isArray(ids) || !ids.every(isValidId)) throw new ValidationError("Danh sách chương không hợp lệ");
    const r = await (await getBackend()).svc.restoreChapters({ fromCommit, chapterIds: ids, current: (body.current as Record<string, string>) ?? {}, keepMeta: body.keepMeta !== false }, await author());
    return { commitSha: r.commitSha };
  }],
  ["GET", /^\/api\/proposals$/, async ({ query }) => {
    const st = query.get("state");
    const { svc } = await getBackend();
    const [pulls, snap] = await Promise.all([svc.store.listPulls(st === "closed" || st === "all" ? st : "open"), svc.snapshot()]);
    const byPath = new Map(snap.chapters.map((c) => [c.path, { id: c.id, number: c.number, title: c.title }]));
    return { pulls: pulls.map((p) => ({ ...p, chapters: p.files.map((f) => byPath.get(f.path)).filter(Boolean) })) };
  }],
  ["GET", /^\/api\/proposals\/(\d+)$/, async ({ params }) => {
    const { svc } = await getBackend();
    const [detail, actor] = await Promise.all([svc.proposalDetail(needN(params[0])), svc.store.actorLogin().catch(() => null)]);
    return { ...detail, actor, mode: svc.store.kind };
  }],
  ["POST", /^\/api\/proposals\/(\d+)\/comment$/, async ({ params, body }) => {
    const text = String(body.body ?? "").trim();
    if (!text) throw new ValidationError("Bình luận trống");
    await (await getBackend()).svc.store.commentPull(needN(params[0]), text);
    return { ok: true };
  }],
  ["POST", /^\/api\/proposals\/(\d+)\/review$/, async ({ params, body }) => {
    const n = needN(params[0]);
    const event = body.event === "APPROVE" || body.event === "REQUEST_CHANGES" ? body.event : null;
    if (!event) throw new ValidationError("event phải là APPROVE hoặc REQUEST_CHANGES");
    const text = String(body.body ?? "").trim() || (event === "APPROVE" ? "Đồng ý." : "");
    if (event === "REQUEST_CHANGES" && !text) throw new ValidationError("Hãy ghi rõ cần sửa gì");
    const msg = event === "REQUEST_CHANGES" ? `**Yêu cầu sửa:**\n\n${text}` : text;
    const { svc } = await getBackend();
    try {
      await svc.store.reviewPull(n, event, msg);
      return { ok: true, delivered: "review" };
    } catch (e) {
      // GitHub không cho tác giả PR tự gửi REQUEST_CHANGES → gửi thành bình luận và báo rõ.
      if (e instanceof StoreError && e.status === 422 && event === "REQUEST_CHANGES") {
        await svc.store.commentPull(n, msg);
        return { ok: true, delivered: "comment", note: "GitHub không cho tài khoản này gửi review chính thức trên đề xuất này (thường vì đó là PR của chính tài khoản). Yêu cầu đã được gửi dưới dạng bình luận." };
      }
      throw e;
    }
  }],
  ["POST", /^\/api\/proposals\/(\d+)\/merge$/, async ({ params, body }) => {
    const n = needN(params[0]);
    const expected = String(body.expectedHeadSha ?? "");
    if (!SHA.test(expected)) throw new ValidationError("Thiếu phiên bản đã xem (expectedHeadSha)");
    const { svc } = await getBackend();
    const pr = await svc.store.getPull(n);
    if (pr.state !== "open") throw new NotMergeableError("Đề xuất không còn mở");
    if (pr.headSha !== expected) throw new HeadChangedError(pr.headSha);
    if (pr.mergeable === false) throw new NotMergeableError(`Đề xuất xung đột với bản chính${pr.conflictFiles.length ? `: ${pr.conflictFiles.join(", ")}` : ""}`);
    if (pr.mergeable === null) throw new NotMergeableError("GitHub đang kiểm tra khả năng merge, thử lại sau vài giây");
    const r = await svc.store.mergePull(n, expected, `Nhập đề xuất #${n}: ${pr.title}`);
    return { ok: true, sha: r.sha };
  }],
  ["POST", /^\/api\/proposals\/(\d+)\/close$/, async ({ params, body }) => {
    const n = needN(params[0]);
    const { svc } = await getBackend();
    const reason = String(body.reason ?? "").trim();
    if (reason) await svc.store.commentPull(n, `Đóng đề xuất: ${reason}`);
    await svc.store.closePull(n);
    return { ok: true };
  }],
  ["POST", /^\/api\/import$/, async ({ body }) => importChapters((await getBackend()).svc, body as { items: ImportItem[]; newActs?: { key: string; title: string }[]; sourceName?: string }, await author())],
  ["POST", /^\/api\/context-pack$/, async ({ body }) => buildContextPack((await getBackend()).svc, body as unknown as PackRequest)],
  ["POST", /^\/api\/status\/diagnose$/, async () => {
    const { svc } = await getBackend();
    if (!(svc.store instanceof GitHubStore)) return { mode: "demo", steps: [{ step: "Chế độ demo", ok: true, detail: "Không kết nối GitHub — dữ liệu demo nằm trong IndexedDB của trình duyệt này" }] };
    return { mode: "github", steps: await svc.store.diagnose() };
  }],
  ["POST", /^\/api\/demo\/agent$/, async ({ body }) => {
    const { git } = await getBackend();
    if (!git) throw new LocalApiError("Chỉ có ở chế độ demo", 404, "not_found");
    if (body.action === "propose") return simulateProposal(git, { chapterIds: (body.chapterIds as string[]) ?? [], touchCanon: !!body.touchCanon, title: body.title as string | undefined });
    if (body.action === "edit-main") return simulateMainEdit(git, String(body.chapterId ?? ""));
    if (body.action === "push-to-proposal") return simulatePushToProposal(git, Number(body.number));
    throw new ValidationError("Hành động không hợp lệ");
  }],
  ["POST", /^\/api\/demo\/reset$/, async () => {
    const { git } = await getBackend();
    if (!git) throw new LocalApiError("Chỉ có ở chế độ demo", 404, "not_found");
    await git.storage.clear();
    resetBackend();
    await getBackend();
    return { ok: true };
  }],
];

export async function localApi(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = new URL(path, "http://local");
  for (const [m, re, h] of routes) {
    if (m !== method) continue;
    const match = re.exec(url.pathname);
    if (!match) continue;
    try {
      return await h({ method, params: match.slice(1), query: url.searchParams, body: (body ?? {}) as Record<string, unknown> });
    } catch (e) {
      throw toApiError(e);
    }
  }
  throw new LocalApiError(`Không có thao tác ${method} ${url.pathname}`, 404, "not_found");
}

/** Tải tệp xuống máy (thay cho link /api/export của bản có máy chủ). */
export async function exportMarkdown(chapterId?: string) {
  const { svc } = await getBackend();
  let text: string, name: string;
  if (chapterId) {
    const v = await svc.getChapter(needId(chapterId));
    const snap = await svc.snapshot();
    const n = snap.chapters.find((c) => c.id === chapterId)?.number ?? 0;
    text = `## Ch ${n} · ${v.doc.meta.title}\n\n${v.doc.body}`;
    name = `Ch${String(n).padStart(3, "0")}-${v.doc.meta.title}.md`;
  } else {
    const r = await svc.exportManuscript();
    text = r.text;
    name = `${r.snap.project.title}-${r.snap.headSha.slice(0, 7)}.md`;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { text, name };
}
