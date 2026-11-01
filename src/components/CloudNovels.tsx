"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cloudFetch, fmtDate } from "@/lib/client/api";
import { DEFAULT_REPO, saveConnection, useConnection } from "@/lib/client/connection";
import { resetBackend } from "@/lib/client/backend";
import type { CloudMe } from "@/lib/client/hooks";
import { GitHubStore } from "@/lib/store/github/github-store";
import { mapLimit } from "@/lib/core/service";
import { useToast } from "./Toast";

type Stats = { chapters: number; words: number; acts: number; headSha: string } | null;
type Novel = { id: string; title: string; created_at: string; created_by: string; stats?: Stats };

/** Danh sách bộ truyện trên Cloudflare: mở, tạo mới, chuyển từ repo GitHub sang. */
export function CloudNovels({ me }: { me: CloudMe }) {
  const conn = useConnection();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const novels = useQuery({ queryKey: ["cloud-novels"], queryFn: () => cloudFetch<{ novels: Novel[] }>("/api/novels?stats=1") });
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [mig, setMig] = useState({ repo: DEFAULT_REPO, branch: "main", token: "", title: "" });
  const [progress, setProgress] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const editor = me.role === "editor";

  const rename = async () => {
    if (!renaming?.title.trim()) return;
    setBusy(true);
    try {
      const r = await cloudFetch<{ id: string; title: string }>(`/api/novels/${renaming.id}`, "PATCH", { title: renaming.title.trim() });
      if (conn?.mode === "cloud" && conn.novelId === r.id) saveConnection({ mode: "cloud", novelId: r.id, novelTitle: r.title });
      setRenaming(null);
      toast("Đã đổi tên.");
      await qc.invalidateQueries();
    } catch (e) {
      toast(`Không đổi tên được: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const open = (n: { id: string; title: string }) => {
    saveConnection({ mode: "cloud", novelId: n.id, novelTitle: n.title });
    resetBackend();
    qc.clear();
    router.push("/");
  };

  const create = async () => {
    setBusy(true);
    try {
      const r = await cloudFetch<{ id: string; title: string }>("/api/novels", "POST", { title: title.trim() });
      toast(`Đã tạo bộ truyện “${r.title}”.`);
      setTitle("");
      await novels.refetch();
      open(r);
    } catch (e) {
      toast(`Không tạo được: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setBusy(false);
    }
  };

  /** Đọc toàn bộ file văn bản ở bản chính của repo GitHub (trong trình duyệt) rồi gửi lên Cloudflare. */
  const migrate = async () => {
    const m = /^\s*([\w.-]+)\/([\w.-]+)\s*$/.exec(mig.repo);
    if (!m || !mig.token.trim()) return toast("Cần repo dạng chủ-sở-hữu/tên-repo và token", "error");
    setBusy(true);
    try {
      const gh = new GitHubStore({ token: mig.token.trim(), owner: m[1], repo: m[2], branch: mig.branch.trim() || "main" });
      setProgress("Đang đọc cây thư mục…");
      const head = await gh.getBranchHead(gh.defaultBranch);
      const tree = await gh.getTree(head);
      const paths = [...tree.keys()].filter((p) => (p.startsWith("content/") || p === "AGENTS.md") && !p.endsWith(".gitkeep"));
      if (!paths.includes("content/project.json")) throw new Error("Repo không có content/project.json — chưa phải repo bản thảo");
      let done = 0;
      const contents = await mapLimit(paths, 8, async (p) => {
        const t = await gh.readBlob(tree.get(p)!);
        setProgress(`Đã đọc ${++done}/${paths.length} file…`);
        return [p, t] as const;
      });
      const files = Object.fromEntries(contents);
      const project = JSON.parse(files["content/project.json"]) as { title?: string };
      setProgress("Đang tải lên Cloudflare…");
      const r = await cloudFetch<{ id: string; title: string; chapters: number }>("/api/novels", "POST", { title: mig.title.trim() || project.title || m[2], files });
      toast(`Đã chuyển “${r.title}” (${r.chapters} chương) lên Cloudflare.`);
      setProgress(`Xong: ${r.chapters} chương, ${paths.length} file, từ phiên bản ${head.slice(0, 7)} của ${m[1]}/${m[2]}.`);
      setMig({ ...mig, token: "" });
      await novels.refetch();
      open(r);
    } catch (e) {
      setProgress(null);
      toast(`Không chuyển được: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid" style={{ gap: 16, marginBottom: 16 }}>
      <div className="card card-pad">
        <div className="row" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0, flex: 1 }}>Tất cả bộ truyện</h2>
          <span className="small muted">{me.name} · {editor ? <span className="chip ok">biên tập</span> : <span className="chip">chỉ đọc</span>}</span>
        </div>
        {novels.isLoading && <span className="spinner" />}
        {novels.error && <div className="banner danger"><div className="small">{(novels.error as Error).message}</div></div>}
        {novels.data && !novels.data.novels.length && <div className="small muted">Chưa có bộ truyện nào trên Cloudflare. Tạo mới bên dưới, hoặc chuyển bộ đang nằm trong repo GitHub sang.</div>}
        <div className="list" data-testid="cloud-novels">
          {novels.data?.novels.map((n) => {
            const current = conn?.mode === "cloud" && conn.novelId === n.id;
            return (
              <div key={n.id} className={`list-item ${current ? "active" : ""}`}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {renaming?.id === n.id ? (
                    <span className="row" style={{ gap: 6 }}>
                      <input className="input grow" value={renaming.title} autoFocus onChange={(e) => setRenaming({ ...renaming, title: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void rename(); if (e.key === "Escape") setRenaming(null); }} data-testid="rename-input" />
                      <button className="btn sm primary" disabled={busy} onClick={() => void rename()}>Lưu</button>
                      <button className="btn sm ghost" onClick={() => setRenaming(null)}>Huỷ</button>
                    </span>
                  ) : (
                    <span style={{ fontWeight: 500, display: "block" }}>{n.title}</span>
                  )}
                  <span className="small muted" data-testid="novel-stats">
                    {n.stats ? `${n.stats.acts} Act · ${n.stats.chapters} chương · ${n.stats.words.toLocaleString("vi-VN")} chữ · ` : ""}tạo {fmtDate(n.created_at)} · {n.created_by}
                  </span>
                </span>
                {editor && renaming?.id !== n.id && <button className="btn sm ghost" onClick={() => setRenaming({ id: n.id, title: n.title })}>Đổi tên</button>}
                {current ? <span className="chip accent">đang mở</span> : <button className="btn sm" onClick={() => open(n)} data-testid="open-novel">Mở</button>}
              </div>
            );
          })}
        </div>
        {editor && (
          <div className="row" style={{ marginTop: 12 }}>
            <input className="input grow" placeholder="Tên bộ truyện mới" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="new-novel-title" />
            <button className="btn primary" disabled={busy || !title.trim()} onClick={create} data-testid="create-novel">Tạo bộ truyện</button>
          </div>
        )}
      </div>

      {editor && (
        <details className="card card-pad" open={novels.data ? novels.data.novels.length === 0 : undefined} data-testid="migrate">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Chuyển một bộ truyện từ repo GitHub sang Cloudflare</summary>
          <p className="small muted">Trình duyệt đọc toàn bộ file trong <code>content/</code> và <code>AGENTS.md</code> ở bản chính của repo, rồi tạo một bộ truyện mới trên Cloudflare với đúng nội dung đó (nguyên văn). Lịch sử cũ vẫn ở GitHub, không được chuyển. Token chỉ dùng cho lần chuyển này, không được lưu. Hãy nhập các đề xuất (PR) cần giữ vào bản chính trước khi chuyển.</p>
          <div className="grid cols-2" style={{ gap: 10 }}>
            <label className="field">Repo<input className="input mono" value={mig.repo} onChange={(e) => setMig({ ...mig, repo: e.target.value })} /></label>
            <label className="field">Nhánh<input className="input mono" value={mig.branch} onChange={(e) => setMig({ ...mig, branch: e.target.value })} /></label>
            <label className="field">Token GitHub (chỉ cần quyền đọc)<input className="input mono" type="password" autoComplete="off" value={mig.token} onChange={(e) => setMig({ ...mig, token: e.target.value })} placeholder="github_pat_…" /></label>
            <label className="field">Tên bộ truyện (bỏ trống = lấy từ project.json)<input className="input" value={mig.title} onChange={(e) => setMig({ ...mig, title: e.target.value })} /></label>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" disabled={busy} onClick={migrate}>Chuyển sang Cloudflare</button>
            {progress && <span className="small muted">{progress}</span>}
          </div>
        </details>
      )}
    </div>
  );
}
