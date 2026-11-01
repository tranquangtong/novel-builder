"use client";
import { ValidationError } from "../core/service";
import { dispatch, toRouteError, type Backend } from "../core/api-routes";
import { simulateMainEdit, simulateProposal, simulatePushToProposal } from "../store/demo/agent-sim";
import { GitHubStore } from "../store/github/github-store";
import { getBackend, NotConnectedError, resetBackend } from "./backend";

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
  const r = toRouteError(e);
  return new LocalApiError(r.message, r.status, r.code, r.data);
}

type Ctx = { method: string; params: string[]; query: URLSearchParams; body: Record<string, unknown> };
type Handler = (c: Ctx) => Promise<unknown>;

const routes: [string, RegExp, Handler][] = [
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
  // Thao tác riêng của trình duyệt (demo / kiểm tra GitHub)
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
  // Thao tác nghiệp vụ dùng chung với Cloudflare Worker
  let backend: Backend;
  try {
    const { svc, conn } = await getBackend();
    backend = { svc, kind: conn.mode === "github" ? "github" : "demo", role: "editor" };
  } catch (e) {
    throw toApiError(e);
  }
  try {
    return await dispatch(backend, method, path, body);
  } catch (e) {
    throw toApiError(e);
  }
}

/** Tải tệp xuống máy: Markdown của một chương hoặc toàn bộ bản thảo. */
export async function exportMarkdown(chapterId?: string) {
  const { api } = await import("./api");
  const r = await api<{ text: string; name: string }>(`/api/export${chapterId ? `?chapter=${encodeURIComponent(chapterId)}` : ""}`);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([r.text], { type: "text/markdown;charset=utf-8" }));
  a.download = r.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return r;
}
