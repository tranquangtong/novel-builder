"use client";
import { refreshSession } from "./firebase";
import { localApi, LocalApiError } from "./local-api";
import { loadConnection } from "./connection";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string | undefined, public readonly data: Record<string, unknown>) {
    super(message);
  }
}

/** Gọi “API” cục bộ chạy trong trình duyệt (xem local-api.ts). Giữ chữ ký cũ để giao diện không đổi. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const conn = typeof window !== "undefined" ? loadConnection() : null;
  if (conn?.mode === "cloud") return cloudFetch<T>(`/api/novels/${conn.novelId}${path.replace(/^\/api/, "")}`, method, opts.body);
  try {
    return (await localApi(method, path, opts.body)) as T;
  } catch (e) {
    const le = e instanceof LocalApiError ? e : new LocalApiError(e instanceof Error ? e.message : String(e), 500, "internal");
    if (le.status === 401 && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nb:unauthenticated"));
    throw new ApiError(le.message, le.status, le.code, le.data);
  }
}

export const short = (sha?: string | null) => (sha ? sha.slice(0, 7) : "—");

export function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relTime(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return "vừa xong";
  if (s < 60) return `${s} giây trước`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return new Date(ts).toLocaleString("vi-VN");
}

/** Gọi Cloudflare Worker cùng domain. Cookie của Cloudflare Access tự đi kèm. */
export async function cloudFetch<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response;
  const send = () =>
    fetch(path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      credentials: "same-origin",
    });
  try {
    res = await send();
    // phiên Google hết hạn giữa chừng: gia hạn rồi gửi lại một lần
    if (res.status === 401 && (await refreshSession())) res = await send();
  } catch (e) {
    throw new ApiError(`Không kết nối được máy chủ (${(e as Error).message})`, 0, "network", {});
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nb:unauthenticated"));
    throw new ApiError(String(data.error ?? `Lỗi ${res.status}`), res.status, data.code as string | undefined, data);
  }
  return data as T;
}
