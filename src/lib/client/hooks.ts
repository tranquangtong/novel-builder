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
