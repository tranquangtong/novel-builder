"use client";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string | undefined, public readonly data: Record<string, unknown>) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch (e) {
    throw new ApiError(`Không kết nối được máy chủ (${(e as Error).message})`, 0, "network", {});
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth")) {
      window.dispatchEvent(new CustomEvent("nb:unauthenticated"));
    }
    throw new ApiError(String(data.error ?? `Lỗi ${res.status}`), res.status, data.code as string | undefined, data);
  }
  return data as T;
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
