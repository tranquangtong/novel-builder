"use client";
import { chapterHref } from "@/lib/client/links";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/lib/client/hooks";
import { api } from "@/lib/client/api";
import { listDrafts, tabChannel } from "@/lib/client/drafts";
import type { PullSummary } from "@/lib/domain/types";
import { ThemeToggle } from "./ThemeToggle";
import { clearConnection, type Connection } from "@/lib/client/connection";

const NAV = [
  { href: "/", label: "Tổng quan", icon: "◎" },
  { href: "/library", label: "Thư viện Act & chương", icon: "▤" },
  { href: "/canon", label: "Canon & outline", icon: "✦" },
  { href: "/proposals", label: "Đề xuất chỉnh sửa", icon: "⇄", count: true },
  { href: "/history", label: "Lịch sử & phục hồi", icon: "↺" },
  { href: "/context", label: "Gói tài liệu cho agent", icon: "▣" },
  { href: "/import", label: "Nhập & xuất", icon: "⇅" },
  { href: "/settings", label: "Bộ truyện & kết nối", icon: "⚙" },
];

export function useLocalDraftIds(repoKey: string | undefined) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!repoKey) return;
    let alive = true;
    const load = () => listDrafts(repoKey).then((d) => alive && setIds(new Set(d.map((x) => x.chapterId)))).catch(() => {});
    load();
    const ch = tabChannel();
    const onMsg = () => load();
    ch?.addEventListener("message", onMsg);
    window.addEventListener("nb:drafts-changed", onMsg);
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      ch?.removeEventListener("message", onMsg);
      window.removeEventListener("nb:drafts-changed", onMsg);
      clearInterval(t);
    };
  }, [repoKey]);
  return ids;
}

export function Shell({ children, conn }: { children: React.ReactNode; conn: Connection | null }) {
  const mode = conn?.mode;
  const repoLabel = !conn ? "chưa kết nối" : conn.mode === "demo" ? "kho demo (trên trình duyệt)" : conn.mode === "cloud" ? `${conn.novelTitle} · Cloudflare` : `${conn.owner}/${conn.repo}`;
  const connected = !!conn;
  const pathname = usePathname();
  const router = useRouter();
  const project = useProject(connected);
  const pulls = useQuery({ queryKey: ["proposals", "open"], enabled: connected, queryFn: () => api<{ pulls: PullSummary[] }>("/api/proposals?state=open"), staleTime: 30_000 });
  const search = useSearchParams();
  const [filter, setFilter] = useState("");
  const [collapsedActs, setCollapsedActs] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const drafts = useLocalDraftIds(project.data?.repo);

  useEffect(() => {
    const onUnauth = () => router.replace("/settings");
    window.addEventListener("nb:unauthenticated", onUnauth);
    return () => window.removeEventListener("nb:unauthenticated", onUnauth);
  }, [router]);

  const activeId = pathname.startsWith("/chapter") ? search.get("id") ?? undefined : undefined;
  const groups = useMemo(() => {
    const snap = project.data;
    if (!snap) return [];
    const f = filter.trim().toLowerCase();
    const match = (c: (typeof snap.chapters)[number]) => !f || c.title.toLowerCase().includes(f) || String(c.number) === f || `ch ${c.number}` === f;
    const known = new Set(snap.acts.map((a) => a.id));
    const out = snap.acts.map((a) => ({ id: a.id, title: a.title, chapters: snap.chapters.filter((c) => c.act_id === a.id && match(c)) }));
    const orphans = snap.chapters.filter((c) => !known.has(c.act_id) && match(c));
    if (orphans.length) out.push({ id: "_none", title: "Chưa xếp Act", chapters: orphans });
    return out;
  }, [project.data, filter]);

  const openCount = pulls.data?.pulls.filter((p) => p.contentRelated).length ?? 0;
  const isDemo = mode === "demo" || !!project.data?.project.demo_data;

  return (
    <div className={`shell ${sidebarOpen ? "sidebar-open" : ""}`}>
      <aside className="sidebar" aria-label="Điều hướng">
        <div className="sidebar-head">
          <div className="brand">
            <span className="brand-title">{project.data?.project.title ?? "The Last Miracle"}</span>
          </div>
          <div className="brand-sub">{repoLabel}{connected ? ` · ${project.data ? `${project.data.chapters.length} chương` : "đang tải…"}` : ""}</div>
        </div>
        <nav className="nav">
          {NAV.filter((n) => connected || n.href === "/settings").map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={active ? "active" : ""} onClick={() => setSidebarOpen(false)}>
                <span className="nav-icon" aria-hidden>{n.icon}</span>
                {n.label}
                {n.count && openCount > 0 && <span className="count">{openCount}</span>}
              </Link>
            );
          })}
        </nav>
        {connected && (
        <div className="tree">
          <div className="tree-filter">
            <input className="input" placeholder="Lọc chương (tên hoặc số)…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Lọc chương" />
          </div>
          <div className="tree-scroll" data-testid="chapter-tree">
            {project.isLoading && <div className="empty"><span className="spinner" /></div>}
            {project.error && <div className="small muted" style={{ padding: 10 }}>Không tải được danh sách chương.</div>}
            {groups.map((g) => (
              <div className="tree-act" key={g.id}>
                <button
                  className="tree-act-head"
                  onClick={() => setCollapsedActs((s) => {
                    const n = new Set(s);
                    if (n.has(g.id)) n.delete(g.id);
                    else n.add(g.id);
                    return n;
                  })}
                  aria-expanded={!collapsedActs.has(g.id)}
                >
                  <span aria-hidden>{collapsedActs.has(g.id) ? "▸" : "▾"}</span>
                  <span style={{ flex: 1 }}>{g.title}</span>
                  <span>{g.chapters.length}</span>
                </button>
                {!collapsedActs.has(g.id) &&
                  g.chapters.map((c) => (
                    <Link key={c.id} href={chapterHref(c.id)} className={`tree-ch ${activeId === c.id ? "active" : ""}`} title={`${c.title} · ${c.words} chữ`} onClick={() => setSidebarOpen(false)}>
                      <span className="n">{c.number}</span>
                      <span className="t">{c.title}</span>
                      <span className={`dot ${c.status} ${drafts.has(c.id) ? "local" : ""}`} title={drafts.has(c.id) ? "Có nháp chưa lưu trên thiết bị này" : c.status} />
                    </Link>
                  ))}
              </div>
            ))}
          </div>
        </div>
        )}
        <div className="sidebar-foot">
          <span className="who" title={repoLabel}>{conn?.mode === "github" ? conn.owner : conn?.mode === "cloud" ? "Cloudflare" : conn ? "Demo" : "—"}</span>
          <ThemeToggle />
          {connected && (
            <button
              className="btn ghost sm"
              title="Xóa token khỏi trình duyệt này"
              onClick={() => {
                if (!window.confirm("Ngắt kết nối và xóa token khỏi trình duyệt này? Nháp chưa lưu vẫn được giữ trên thiết bị.")) return;
                clearConnection();
                router.replace("/settings");
              }}
            >
              Ngắt kết nối
            </button>
          )}
        </div>
      </aside>
      <div className="main">
        {isDemo && (
          <div className="demo-ribbon" data-testid="demo-ribbon">
            DỮ LIỆU DEMO — không phải bản thảo thật · không kết nối GitHub · dữ liệu chỉ nằm trong trình duyệt này
          </div>
        )}
        <button className="btn ghost sm mobile-menu" style={{ display: "none" }} onClick={() => setSidebarOpen((v) => !v)}>☰</button>
        {children}
      </div>
    </div>
  );
}
