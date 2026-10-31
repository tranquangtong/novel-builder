import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getSession, type Session } from "./session";
import { ConflictError, NotInitializedError, ValidationError, type Author } from "./service";
import { HeadChangedError, NotMergeableError, StoreError } from "../store/types";
import { FrontmatterError } from "../domain/frontmatter";
import { ChapterFormatError } from "../domain/chapter";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function errorResponse(e: unknown) {
  if (e instanceof ConflictError) return json({ error: e.message, code: "conflict", conflict: e.detail }, 409);
  if (e instanceof HeadChangedError) return json({ error: e.message, code: "head_changed", actualHead: e.actualHead }, 409);
  if (e instanceof NotMergeableError) return json({ error: e.message, code: "not_mergeable" }, 409);
  if (e instanceof NotInitializedError) return json({ error: e.message, code: "not_initialized" }, 409);
  if (e instanceof ValidationError || e instanceof FrontmatterError || e instanceof ChapterFormatError || e instanceof SyntaxError) return json({ error: e.message, code: "invalid" }, 400);
  if (e instanceof StoreError) return json({ error: e.message, code: "store" }, e.status);
  console.error(e);
  return json({ error: e instanceof Error ? e.message : "Lỗi không xác định", code: "internal" }, 500);
}

/** Chặn request ghi từ origin khác (CSRF). Cookie đã là SameSite=Lax; đây là lớp thứ hai. */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function authorOf(s: Session): Author {
  return {
    name: s.name || s.login,
    email: s.email || (s.userId ? `${s.userId}+${s.login}@users.noreply.github.com` : `${s.login}@users.noreply.github.com`),
  };
}

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (req: NextRequest, args: { session: Session; params: P }) => Promise<Response>;

/** Mọi API nội dung đi qua đây: kiểm tra phiên đăng nhập (và origin cho thao tác ghi). */
export function guarded<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      const session = await getSession();
      if (!session) return json({ error: "Chưa đăng nhập", code: "unauthenticated" }, 401);
      if (req.method !== "GET" && req.method !== "HEAD") {
        if (!sameOrigin(req)) return json({ error: "Origin không hợp lệ", code: "forbidden" }, 403);
        const ct = req.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) return json({ error: "Cần Content-Type: application/json", code: "invalid" }, 415);
      }
      const params = ((await ctx?.params) ?? {}) as P;
      return await handler(req, { session, params });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function body<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ValidationError("JSON không hợp lệ");
  }
}
