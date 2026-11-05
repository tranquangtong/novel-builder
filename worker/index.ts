import { ApiRouteError, dispatch, toRouteError, type Backend } from "../src/lib/core/api-routes";
import { ManuscriptService } from "../src/lib/core/service";
import { listAssets, serveAsset, trashAsset, uploadAsset } from "./assets";
import { authenticate, AuthError, SESSION_COOKIE, verifyFirebase, type Identity } from "./auth";
import { readerChapter, readerToc } from "./reader";
import type { Env } from "./env";
import { createNovel, getNovel, listNovels, novelStats, renameNovel, storeFor } from "./novels";
import { deleteDraft, getDraft, listDrafts, putDraft } from "./drafts";

/**
 * Cloudflare Worker: phục vụ trang tĩnh (out/) và API /api/*.
 *  - Đăng nhập: Google qua Firebase (cookie phiên) — hoặc Cloudflare Access (cách cũ); Worker kiểm tra mọi API.
 *  - Người đọc (không nằm trong EDITOR_EMAILS) chỉ dùng được API chế độ đọc.
 *  - Bản thảo: R2 (nội dung, phiên bản, ảnh) + D1 (trạng thái nhỏ của từng bộ truyện).
 */
const worker = {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return await handleApi(req, env, url);
    } catch (e) {
      if (e instanceof AuthError) return json({ error: e.message, code: e.status === 401 ? "unauthenticated" : "forbidden" }, e.status);
      const r = toRouteError(e);
      if (r.status >= 500) console.error(e);
      return json({ error: r.message, code: r.code, ...r.data }, r.status);
    }
  },
};
export default worker;

function withCookie(res: Response, value: string, maxAge: number) {
  const h = new Headers(res.headers);
  h.append("set-cookie", `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);
  return new Response(res.body, { status: res.status, headers: h });
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}

/** Chặn request ghi từ trang khác (CSRF). Request không có Origin (service token, curl) vẫn được. */
function sameOrigin(req: Request, url: URL) {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw new ApiRouteError("Cần Content-Type: application/json", 415, "invalid");
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new ApiRouteError("JSON không hợp lệ", 400, "invalid");
  }
}

const needEditor = (who: Identity) => {
  if (who.role !== "editor") throw new ApiRouteError("Tài khoản này chỉ có quyền đọc", 403, "forbidden");
};

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !sameOrigin(req, url)) throw new ApiRouteError("Origin không hợp lệ", 403, "forbidden");
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]

  // /api/session — đổi ID token của Firebase thành cookie phiên (để cả <img> cũng được xác thực)
  if (parts.length === 2 && parts[1] === "session") {
    if (method === "DELETE") return withCookie(json({ ok: true }), "", 0);
    if (method !== "POST") throw new ApiRouteError("Phương thức không hỗ trợ", 405, "invalid");
    if (!env.FIREBASE_PROJECT_ID) throw new ApiRouteError("Máy chủ chưa bật đăng nhập Google (FIREBASE_PROJECT_ID)", 500, "invalid");
    const b = await readJson(req);
    const token = String(b.idToken ?? "");
    const who = await verifyFirebase(env, token);
    const exp = (() => {
      try {
        return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp as number;
      } catch {
        return 0;
      }
    })();
    const maxAge = Math.max(0, Math.min(3600, exp - Math.floor(Date.now() / 1000)));
    return withCookie(json({ name: who.name, role: who.role, kind: "cloud" }), token, maxAge);
  }

  const who = await authenticate(req, env);

  // /api/me
  if (parts.length === 2 && parts[1] === "me" && method === "GET") return json({ name: who.name, role: who.role, kind: "cloud" });

  // /api/novels
  if (parts[1] !== "novels") throw new ApiRouteError("Không tìm thấy", 404, "not_found");
  const reader = who.role === "viewer";
  if (parts.length === 2) {
    if (method === "GET") {
      const novels = await listNovels(env);
      // người đọc chỉ thấy tên bộ truyện (không thấy email người tạo, thống kê nội bộ)
      if (reader) return json({ novels: novels.map((n) => ({ id: n.id, title: n.title })) });
      if (url.searchParams.get("stats") !== "1") return json({ novels });
      return json({ novels: await Promise.all(novels.map(async (n) => ({ ...n, stats: await novelStats(env, n.id) }))) });
    }
    if (method === "POST") {
      needEditor(who);
      return json(await createNovel(env, who.name, await readJson(req)), 201);
    }
    throw new ApiRouteError("Phương thức không hỗ trợ", 405, "invalid");
  }

  const novel = await getNovel(env, parts[2]);
  if (!novel) throw new ApiRouteError("Không có bộ truyện này", 404, "not_found");

  // /api/novels/:id/read[/:chapterId] — chế độ đọc (mọi người đã đăng nhập)
  if (parts[3] === "read" && method === "GET") {
    if (parts.length === 4) return json(await readerToc(env, novel.id));
    if (parts.length === 5) return json(await readerChapter(env, novel.id, parts[4]));
  }
  // Người đọc: ngoài chế độ đọc chỉ được tải ảnh (ảnh chèn trong chương)
  if (reader && !(parts[3] === "assets" && parts[4] === "file" && (method === "GET" || method === "HEAD"))) {
    throw new ApiRouteError("Tài khoản người đọc chỉ xem được truyện ở chế độ đọc", 403, "forbidden");
  }

  // /api/novels/:id  (đổi tên)
  if (parts.length === 3 && method === "PATCH") {
    needEditor(who);
    const b = await readJson(req);
    return json(await renameNovel(env, novel.id, who.name, String(b.title ?? "")));
  }

  // /api/novels/:id/drafts[/:chapterId]  — nháp tự lưu (không phải phiên bản)
  if (parts[3] === "drafts") {
    if (parts.length === 4 && method === "GET") return json({ drafts: await listDrafts(env, novel.id) });
    const chapterId = parts[4] ?? "";
    if (method === "GET") return json({ draft: await getDraft(env, novel.id, chapterId) });
    needEditor(who);
    if (method === "PUT") return json({ draft: await putDraft(env, novel.id, chapterId, who.name, await readJson(req)) });
    if (method === "DELETE") return json(await deleteDraft(env, novel.id, chapterId, Number(url.searchParams.get("ifUpdatedAt")) || undefined));
    throw new ApiRouteError("Phương thức không hỗ trợ", 405, "invalid");
  }

  // /api/novels/:id/assets...
  if (parts[3] === "assets") {
    if (parts.length === 4 && method === "GET") return json({ assets: await listAssets(env, novel.id, url.searchParams.get("chapter")) });
    if (parts.length === 4 && method === "POST") {
      needEditor(who);
      return json(await uploadAsset(env, novel.id, who.name, req, url), 201);
    }
    if (parts[4] === "file" && parts.length > 5) {
      const rel = decodeURIComponent(parts.slice(5).join("/"));
      if (method === "GET" || method === "HEAD") return serveAsset(env, novel.id, rel, req);
      if (method === "DELETE") {
        needEditor(who);
        await trashAsset(env, novel.id, rel, who.name);
        return json({ ok: true });
      }
    }
    throw new ApiRouteError("Không tìm thấy", 404, "not_found");
  }

  // Còn lại: thao tác nghiệp vụ dùng chung (cùng mã với chế độ demo/GitHub trong trình duyệt)
  const body = method === "GET" || method === "HEAD" ? undefined : await readJson(req);
  const backend: Backend = { svc: new ManuscriptService(storeFor(env, novel.id, who.name)), kind: "cloud", role: who.role };
  const path = `/api/${parts.slice(3).join("/")}${url.search}`;
  return json(await dispatch(backend, method, path, body));
}
