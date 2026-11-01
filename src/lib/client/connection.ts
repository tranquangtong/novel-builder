"use client";
import { useMemo, useSyncExternalStore } from "react";

/**
 * Thông tin kết nối — CHỈ nằm trong trình duyệt của tác giả.
 * - Không "ghi nhớ": sessionStorage (mất khi đóng tab).
 * - "Ghi nhớ trên thiết bị này": localStorage.
 * Token không bao giờ được gửi tới đâu ngoài https://api.github.com.
 */
export type Connection =
  | { mode: "demo" }
  /** Bộ truyện trên Cloudflare (R2 + D1). Đăng nhập do Cloudflare Access lo, trình duyệt không giữ token. */
  | { mode: "cloud"; novelId: string; novelTitle: string }
  | { mode: "github"; owner: string; repo: string; branch: string; token: string; remember: boolean };

const KEY = "nb-connection";

export const DEFAULT_REPO = process.env.NEXT_PUBLIC_MANUSCRIPT_REPO ?? "";

/** Bản build cho Cloudflare Worker (NEXT_PUBLIC_TARGET=cloudflare). */
export const IS_CLOUD_BUILD = process.env.NEXT_PUBLIC_TARGET === "cloudflare";

function read(storage: Storage | undefined): Connection | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Connection;
    // Bản build cho Cloudflare chỉ có chế độ cloud: không bao giờ dùng GitHub/demo còn sót trong trình duyệt.
    if (IS_CLOUD_BUILD) return c.mode === "cloud" && /^nv_[0-9a-z]+$/.test(c.novelId) ? c : null;
    if (c.mode === "demo") return c;
    if (c.mode === "cloud" && /^nv_[0-9a-z]+$/.test(c.novelId)) return c;
    if (c.mode === "github" && c.token && c.owner && c.repo) return c;
  } catch {
    /* bỏ qua dữ liệu hỏng */
  }
  return null;
}

export function loadConnection(): Connection | null {
  if (typeof window === "undefined") return null;
  return read(window.sessionStorage) ?? read(window.localStorage);
}

export function saveConnection(c: Connection) {
  clearConnection();
  const remember = c.mode !== "github" || c.remember;
  (remember ? window.localStorage : window.sessionStorage).setItem(KEY, JSON.stringify(c));
  window.dispatchEvent(new Event("nb:connection-changed"));
}

export function clearConnection() {
  try {
    window.localStorage.removeItem(KEY);
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("nb:connection-changed"));
}

export function connectionKey(c: Connection | null) {
  if (!c) return "none";
  if (c.mode === "demo") return "demo";
  if (c.mode === "cloud") return `cloud:${c.novelId}`;
  return `github:${c.owner}/${c.repo}@${c.branch}`;
}

// ---- hook React: đọc kết nối hiện tại, cập nhật khi đổi (kể cả từ tab khác) ----

function subscribe(cb: () => void) {
  window.addEventListener("nb:connection-changed", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("nb:connection-changed", cb);
    window.removeEventListener("storage", cb);
  };
}
function snapshot() {
  try {
    return window.sessionStorage.getItem(KEY) ?? window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** undefined = chưa biết (đang render tĩnh), null = chưa kết nối. */
export function useConnection(): Connection | null | undefined {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "\u0000ssr");
  return useMemo(() => (raw === "\u0000ssr" ? undefined : raw ? loadConnection() : null), [raw]);
}
