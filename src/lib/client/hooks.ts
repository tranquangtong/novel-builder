"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { ProjectSnapshot } from "../domain/types";

export function useProject(enabled = true) {
  return useQuery({ queryKey: ["project"], enabled, queryFn: () => api<ProjectSnapshot>("/api/project"), staleTime: 10_000, refetchOnWindowFocus: true });
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<{ login: string; name?: string; mode: "demo" | "github"; repoKey: string; branch: string }>("/api/me"), staleTime: 60_000 });
}

export interface CloudMe { name: string; role: "editor" | "viewer" | "agent"; kind: "cloud" }

/** Trang đang chạy trên Cloudflare Worker? (null = không — ví dụ GitHub Pages hoặc chạy local thuần) */
export function useCloudMe() {
  return useQuery({
    queryKey: ["cloud-me"],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<CloudMe | null> => {
      try {
        const r = await fetch("/api/me", { cache: "no-store", credentials: "same-origin" });
        if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return null;
        const d = (await r.json()) as CloudMe;
        return d.kind === "cloud" ? d : null;
      } catch {
        return null;
      }
    },
  });
}
