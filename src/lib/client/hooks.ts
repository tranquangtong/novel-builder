"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { ProjectSnapshot } from "../domain/types";
import { IS_CLOUD_BUILD } from "./connection";

export function useProject(enabled = true) {
  return useQuery({ queryKey: ["project"], enabled, queryFn: () => api<ProjectSnapshot>("/api/project"), staleTime: 10_000, refetchOnWindowFocus: true });
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<{ login: string; name?: string; mode: "demo" | "github"; repoKey: string; branch: string }>("/api/me"), staleTime: 60_000 });
}

export interface CloudMe { name: string; role: "editor" | "viewer" | "agent"; kind: "cloud" }

/** Lỗi xác thực với Worker (chỉ bản build Cloudflare). */
export class CloudAuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

/**
 * Trang đang chạy trên Cloudflare Worker? (null = không — GitHub Pages / chạy local thuần).
 * Bản build Cloudflare KHÔNG bao giờ trả null: lỗi đăng nhập được báo rõ (CloudAuthError),
 * không âm thầm chuyển sang chế độ GitHub.
 */
export function useCloudMe() {
  return useQuery({
    queryKey: ["cloud-me"],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<CloudMe | null> => {
      let r: Response;
      try {
        r = await fetch("/api/me", { cache: "no-store", credentials: "same-origin" });
      } catch (e) {
        if (IS_CLOUD_BUILD) throw new CloudAuthError(`Không gọi được máy chủ: ${e instanceof Error ? e.message : e}`, 0);
        return null;
      }
      const isJson = (r.headers.get("content-type") ?? "").includes("json");
      if (r.ok && isJson) {
        const d = (await r.json()) as CloudMe;
        if (d.kind === "cloud") return d;
      }
      if (!IS_CLOUD_BUILD) return null;
      const detail = isJson ? ((await r.json().catch(() => ({}))) as { error?: string }).error : undefined;
      throw new CloudAuthError(detail ?? (r.redirected || r.type === "opaqueredirect" ? "Phiên Cloudflare Access đã hết hạn" : `HTTP ${r.status}`), r.status);
    },
  });
}
