import { ConflictError, NotInitializedError, ValidationError, type Author, type ManuscriptService } from "./service";
import { buildContextPack, type PackRequest } from "./context-pack";
import { importChapters, type ImportItem } from "./import-service";
import { initializeStructure } from "./init-structure";
import { ChapterFormatError } from "../domain/chapter";
import { FrontmatterError } from "../domain/frontmatter";
import { isValidId } from "../domain/ids";
import { chapterIdFromPath } from "../domain/paths";
import type { ChapterMeta } from "../domain/types";
import { HeadChangedError, NotMergeableError, StoreError } from "../store/types";
import { DemoStore } from "../store/demo/demo-store";
import { createAgentProposal } from "./agent-proposal";

/**
 * Bảng thao tác nghiệp vụ DÙNG CHUNG: chạy trong trình duyệt (chế độ demo/GitHub, xem
 * client/local-api.ts) và trong Cloudflare Worker (chế độ cloud, xem worker/). Đường dẫn
 * giữ dạng /api/... để giao diện không đổi.
 */
export type Role = "editor" | "viewer" | "agent";

export interface Backend {
  svc: ManuscriptService;
  kind: "demo" | "github" | "cloud";
  role: Role;
}

export class ApiRouteError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string, public readonly data: Record<string, unknown> = {}) {
    super(message);
  }
}

export function toRouteError(e: unknown): ApiRouteError {
  if (e instanceof ApiRouteError) return e;
  if (e instanceof ConflictError) return new ApiRouteError(e.message, 409, "conflict", { conflict: e.detail });
  if (e instanceof HeadChangedError) return new ApiRouteError(e.message, 409, "head_changed", { actualHead: e.actualHead });
  if (e instanceof NotMergeableError) return new ApiRouteError(e.message, 409, "not_mergeable");
  if (e instanceof NotInitializedError) return new ApiRouteError(e.message, 409, "not_initialized");
  if (e instanceof ValidationError || e instanceof FrontmatterError || e instanceof ChapterFormatError || e instanceof SyntaxError) return new ApiRouteError(e.message, 400, "invalid");
  if (e instanceof StoreError) return new ApiRouteError(e.message, e.status, e.status === 401 ? "unauthenticated" : "store");
  return new ApiRouteError(e instanceof Error ? e.message : String(e), 500, "internal");
}

export type RouteCtx = { b: Backend; method: string; params: string[]; query: URLSearchParams; body: Record<string, unknown> };
type Handler = (c: RouteCtx) => Promise<unknown>;

const SHA = /^[0-9a-f]{40}$/;
const ALLOWED_PREFIXES = ["content/canon/", "content/outlines/", "content/summaries/", "content/reviews/", "content/acts/", "content/notes/"];

async function author(b: Backend): Promise<Author> {
  const login = await b.svc.store.actorLogin().catch(() => "tac-gia");
  return { name: login, email: login.includes("@") ? login : `${login}@users.noreply.github.com` };
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

/** Thao tác agent (service token) được phép ngoài các thao tác đọc. */
const AGENT_WRITE = new Set(["POST /api/proposals/:n/comment", "POST /api/agent/proposals"]);

export const ROUTES: [string, RegExp, Handler][] = [
  ["GET", /^\/api\/me$/, async ({ b }) => ({ login: await b.svc.store.actorLogin().catch(() => "?"), mode: b.kind, repoKey: b.svc.store.repoKey, branch: b.svc.store.defaultBranch, role: b.role })],
  ["GET", /^\/api\/project$/, async ({ b }) => {
    const { svc } = b;
    const { tree: _t, ...snap } = await svc.snapshot();
    void _t;
    return snap;
  }],
  ["POST", /^\/api\/project\/reindex$/, async ({ b }) => ({ commitSha: (await b.svc.repairIndex(await author(b))).commitSha })],
  ["POST", /^\/api\/project\/init$/, async ({ b, body }) => initializeStructure(b.svc, String(body.title || "The Last Miracle"), await author(b))],
  ["POST", /^\/api\/chapters$/, async ({ b, body }) => {
    const title = String(body.title ?? "").trim();
    if (!title || !body.act_id) throw new ValidationError("Cần tiêu đề và Act");
    return b.svc.createChapter({ title, act_id: String(body.act_id), afterId: body.afterId as string | undefined, pov: body.pov as string | undefined }, await author(b));
  }],
  ["POST", /^\/api\/chapters\/swap$/, async ({ b, body }) => {
    const r = await b.svc.swapOrder(body.a as { id: string; blob: string }, body.b as { id: string; blob: string }, await author(b));
    return { commitSha: r.commitSha };
  }],
  ["GET", /^\/api\/chapters\/([^/]+)$/, async ({ b, params, query }) => {
    const commit = query.get("commit") ?? undefined;
    if (commit && !SHA.test(commit)) throw new ValidationError("Phiên bản không hợp lệ");
    return b.svc.getChapter(needId(params[0]), commit);
  }],
  ["PUT", /^\/api\/chapters\/([^/]+)$/, async ({ b, params, body }) => {
    const id = needId(params[0]);
    const m = body.meta as Omit<ChapterMeta, "id"> | undefined;
    if (typeof body.body !== "string" || !m) throw new ValidationError("Thiếu nội dung");
    if (body.baseBlob !== null && typeof body.baseBlob !== "string") throw new ValidationError("Thiếu phiên bản gốc (baseBlob)");
    const meta = { title: String(m.title ?? ""), act_id: String(m.act_id ?? ""), order: Number(m.order), status: m.status, pov: m.pov || undefined };
    return b.svc.saveChapter(id, { meta, body: body.body, baseBlob: body.baseBlob as string | null, note: (body.note as string | undefined)?.slice(0, 2000) }, await author(b));
  }],
  ["GET", /^\/api\/chapters\/([^/]+)\/head$/, async ({ b, params }) => b.svc.chapterHead(needId(params[0]))],
  ["GET", /^\/api\/chapters\/([^/]+)\/history$/, async ({ b, params, query }) => ({ versions: await b.svc.chapterHistory(needId(params[0]), Math.max(1, Number(query.get("page") ?? 1) || 1)) })],
  ["POST", /^\/api\/acts$/, async ({ b, body }) => {
    const title = String(body.title ?? "").trim();
    if (!title) throw new ValidationError("Cần tên Act");
    return b.svc.createAct({ title, description: body.description as string | undefined }, await author(b));
  }],
  ["GET", /^\/api\/files$/, async ({ b, query }) => {
    const prefix = query.get("prefix") ?? "content/canon/";
    if (!ALLOWED_PREFIXES.some((a) => prefix.startsWith(a))) throw new ValidationError("Thư mục không được phép");
    const { headSha, tree, files } = await b.svc.listFiles(prefix);
    return {
      headSha,
      files: files.map((f) => {
        const cid = typeof f.data.chapter_id === "string" ? f.data.chapter_id : null;
        const current = cid ? tree.get(`content/chapters/${cid}.md`) ?? null : null;
        return { ...f, sourceCurrentBlob: current, stale: cid ? current !== f.data.source_blob : undefined };
      }),
    };
  }],
  ["GET", /^\/api\/file$/, async ({ b, query }) => {
    const commit = query.get("commit") ?? undefined;
    if (commit && !SHA.test(commit)) throw new ValidationError("Phiên bản không hợp lệ");
    const f = await b.svc.readFile(query.get("path") ?? "", commit);
    if (!f) throw new ApiRouteError("Không có file", 404, "not_found");
    return f;
  }],
  ["PUT", /^\/api\/file$/, async ({ b, body }) => {
    if (typeof body.content !== "string") throw new ValidationError("Thiếu nội dung");
    const path = String(body.path ?? "");
    return b.svc.saveFile(path, body.content, (body.baseBlob as string | null) ?? null, String(body.message ?? "").trim() || `Lưu phiên bản: ${path}`, await author(b));
  }],
  ["GET", /^\/api\/history$/, async ({ b, query }) => {
    const { svc } = b;
    return { commits: await svc.store.listCommits({ branch: svc.branch, limit: 30, page: Math.max(1, Number(query.get("page") ?? 1) || 1) }) };
  }],
  ["GET", /^\/api\/history\/([^/]+)$/, async ({ b, params }) => {
    if (!SHA.test(params[0])) throw new ValidationError("Phiên bản không hợp lệ");
    return b.svc.store.getCommit(params[0]);
  }],
  ["POST", /^\/api\/restore\/preview$/, async ({ b, body }) => {
    const fromCommit = String(body.fromCommit ?? "");
    if (!SHA.test(fromCommit)) throw new ValidationError("Phiên bản không hợp lệ");
    const chapterIds = (body.chapterIds as string[] | undefined) ?? [];
    const { svc } = b;
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
  ["POST", /^\/api\/restore$/, async ({ b, body }) => {
    const fromCommit = String(body.fromCommit ?? "");
    const ids = body.chapterIds as string[];
    if (!SHA.test(fromCommit)) throw new ValidationError("Phiên bản không hợp lệ");
    if (!Array.isArray(ids) || !ids.every(isValidId)) throw new ValidationError("Danh sách chương không hợp lệ");
    const r = await b.svc.restoreChapters({ fromCommit, chapterIds: ids, current: (body.current as Record<string, string>) ?? {}, keepMeta: body.keepMeta !== false }, await author(b));
    return { commitSha: r.commitSha };
  }],
  ["GET", /^\/api\/proposals$/, async ({ b, query }) => {
    const st = query.get("state");
    const { svc } = b;
    const [pulls, snap] = await Promise.all([svc.store.listPulls(st === "closed" || st === "all" ? st : "open"), svc.snapshotOrEmpty()]);
    const byPath = new Map(snap.chapters.map((c) => [c.path, { id: c.id, number: c.number, title: c.title }]));
    return { pulls: pulls.map((p) => ({ ...p, chapters: p.files.map((f) => byPath.get(f.path)).filter(Boolean) })) };
  }],
  ["GET", /^\/api\/proposals\/(\d+)$/, async ({ b, params }) => {
    const { svc } = b;
    const [detail, actor] = await Promise.all([svc.proposalDetail(needN(params[0])), svc.store.actorLogin().catch(() => null)]);
    return { ...detail, actor, mode: svc.store.kind };
  }],
  ["POST", /^\/api\/proposals\/(\d+)\/comment$/, async ({ b, params, body }) => {
    const text = String(body.body ?? "").trim();
    if (!text) throw new ValidationError("Bình luận trống");
    await b.svc.store.commentPull(needN(params[0]), text);
    return { ok: true };
  }],
  ["POST", /^\/api\/proposals\/(\d+)\/review$/, async ({ b, params, body }) => {
    const n = needN(params[0]);
    const event = body.event === "APPROVE" || body.event === "REQUEST_CHANGES" ? body.event : null;
    if (!event) throw new ValidationError("event phải là APPROVE hoặc REQUEST_CHANGES");
    const text = String(body.body ?? "").trim() || (event === "APPROVE" ? "Đồng ý." : "");
    if (event === "REQUEST_CHANGES" && !text) throw new ValidationError("Hãy ghi rõ cần sửa gì");
    const msg = event === "REQUEST_CHANGES" ? `**Yêu cầu sửa:**\n\n${text}` : text;
    const { svc } = b;
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
  ["POST", /^\/api\/proposals\/(\d+)\/merge$/, async ({ b, params, body }) => {
    const n = needN(params[0]);
    const expected = String(body.expectedHeadSha ?? "");
    if (!SHA.test(expected)) throw new ValidationError("Thiếu phiên bản đã xem (expectedHeadSha)");
    const { svc } = b;
    const pr = await svc.store.getPull(n);
    if (pr.state !== "open") throw new NotMergeableError("Đề xuất không còn mở");
    if (pr.headSha !== expected) throw new HeadChangedError(pr.headSha);
    if (pr.mergeable === false) throw new NotMergeableError(`Đề xuất xung đột với bản chính${pr.conflictFiles.length ? `: ${pr.conflictFiles.join(", ")}` : ""}`);
    if (pr.mergeable === null) throw new NotMergeableError("GitHub đang kiểm tra khả năng merge, thử lại sau vài giây");
    const r = await svc.store.mergePull(n, expected, `Nhập đề xuất #${n}: ${pr.title}`);
    return { ok: true, sha: r.sha };
  }],
  ["POST", /^\/api\/proposals\/(\d+)\/close$/, async ({ b, params, body }) => {
    const n = needN(params[0]);
    const { svc } = b;
    const reason = String(body.reason ?? "").trim();
    if (reason) await svc.store.commentPull(n, `Đóng đề xuất: ${reason}`);
    await svc.store.closePull(n);
    return { ok: true };
  }],
  ["POST", /^\/api\/import$/, async ({ b, body }) => importChapters(b.svc, body as { items: ImportItem[]; newActs?: { key: string; title: string }[]; sourceName?: string }, await author(b))],
  ["POST", /^\/api\/context-pack$/, async ({ b, body }) => buildContextPack(b.svc, body as unknown as PackRequest)],
  ["GET", /^\/api\/export$/, async ({ b, query }) => {
    const id = query.get("chapter");
    if (id) {
      needId(id);
      const v = await b.svc.getChapter(id);
      const n = (await b.svc.snapshot()).chapters.find((c) => c.id === id)?.number ?? 0;
      if (n === 0) return { text: `## ${v.doc.meta.title}\n\n${v.doc.body}`, name: `Ghi-chu-${v.doc.meta.title}.md` };
      return { text: `## Ch ${n} · ${v.doc.meta.title}\n\n${v.doc.body}`, name: `Ch${String(n).padStart(3, "0")}-${v.doc.meta.title}.md` };
    }
    const r = await b.svc.exportManuscript();
    return { text: r.text, name: `${r.snap.project.title}-${r.snap.headSha.slice(0, 7)}.md` };
  }],
  ["GET", /^\/api\/notes-act$/, async ({ b }) => b.svc.notesStatus()],
  ["POST", /^\/api\/notes-act$/, async ({ b }) => b.svc.setupNotesAct(await author(b))],
  ["POST", /^\/api\/agent\/proposals$/, async ({ b, body }) => {
    if (!(b.svc.store instanceof DemoStore)) throw new ApiRouteError("Chỉ có ở chế độ Cloudflare/demo", 501, "unsupported");
    return createAgentProposal(b.svc.store, await b.svc.store.actorLogin(), body as never);
  }],
];

/** Khóa mô tả của từng route (để kiểm tra quyền): "METHOD /api/path/:id". */
function routeKey(i: number) {
  return ROUTE_KEYS[i];
}
const ROUTE_KEYS = ["GET /api/me", "GET /api/project", "POST /api/project/reindex", "POST /api/project/init", "POST /api/chapters", "POST /api/chapters/swap", "GET /api/chapters/:id", "PUT /api/chapters/:id", "GET /api/chapters/:id/head", "GET /api/chapters/:id/history", "POST /api/acts", "GET /api/files", "GET /api/file", "PUT /api/file", "GET /api/history", "GET /api/history/:id", "POST /api/restore/preview", "POST /api/restore", "GET /api/proposals", "GET /api/proposals/:n", "POST /api/proposals/:n/comment", "POST /api/proposals/:n/review", "POST /api/proposals/:n/merge", "POST /api/proposals/:n/close", "POST /api/import", "POST /api/context-pack", "GET /api/export", "GET /api/notes-act", "POST /api/notes-act", "POST /api/agent/proposals"];

export function canAccess(role: Role, method: string, key: string) {
  if (role === "editor") return true;
  if (method === "GET") return true;
  if (method === "POST" && (key === "POST /api/context-pack" || key === "POST /api/restore/preview")) return true; // chỉ đọc
  return role === "agent" && AGENT_WRITE.has(key);
}

/** Chạy một thao tác. Ném ApiRouteError (đã chuẩn hóa) khi lỗi. */
export async function dispatch(b: Backend, method: string, path: string, body?: unknown): Promise<unknown> {
  const url = new URL(path, "http://local");
  for (let i = 0; i < ROUTES.length; i++) {
    const [m, re, h] = ROUTES[i];
    if (m !== method) continue;
    const match = re.exec(url.pathname);
    if (!match) continue;
    if (!canAccess(b.role, method, routeKey(i))) throw new ApiRouteError("Tài khoản này chỉ có quyền đọc", 403, "forbidden");
    try {
      return await h({ b, method, params: match.slice(1), query: url.searchParams, body: (body ?? {}) as Record<string, unknown> });
    } catch (e) {
      throw toRouteError(e);
    }
  }
  throw new ApiRouteError(`Không có thao tác ${method} ${url.pathname}`, 404, "not_found");
}

if (ROUTE_KEYS.length !== ROUTES.length) throw new Error("ROUTE_KEYS không khớp ROUTES");
