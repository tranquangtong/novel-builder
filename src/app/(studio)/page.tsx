"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtDate, relTime, short } from "@/lib/client/api";
import { useProject } from "@/lib/client/hooks";
import { listDrafts, type Draft } from "@/lib/client/drafts";
import { STATUS_LABEL, type CommitInfo, type PullSummary } from "@/lib/domain/types";
import { formatNumber, targetState } from "@/lib/domain/wordcount";
import { useToast } from "@/components/Toast";

export default function OverviewPage() {
  const project = useProject();
  const qc = useQueryClient();
  const toast = useToast();
  const pulls = useQuery({ queryKey: ["proposals", "open"], queryFn: () => api<{ pulls: (PullSummary & { chapters: { id: string; number: number; title: string }[] })[] }>("/api/proposals?state=open") });
  const hist = useQuery({ queryKey: ["history", "repo", 1], queryFn: () => api<{ commits: CommitInfo[] }>("/api/history") });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  useEffect(() => {
    if (project.data?.repo) listDrafts(project.data.repo).then(setDrafts).catch(() => {});
  }, [project.data?.repo]);

  if (project.error) return <NotReady error={project.error as Error} />;
  const snap = project.data;
  if (!snap) return <div className="page"><div className="page-inner"><span className="spinner" /></div></div>;
  const total = snap.chapters.reduce((s, c) => s + c.words, 0);
  const byStatus = { draft: 0, in_review: 0, approved: 0 };
  snap.chapters.forEach((c) => byStatus[c.status]++);
  const inTarget = snap.chapters.filter((c) => targetState(c.words, snap.project.word_target) === "within").length;
  const byId = new Map(snap.chapters.map((c) => [c.id, c]));

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>{snap.project.title}</h1>
            <div className="sub">{snap.project.subtitle ?? "Tổng quan dự án"}</div>
          </div>
          <div className="actions">
            <Link className="btn" href="/library">Thư viện chương</Link>
            {snap.chapters[0] && <Link className="btn primary" href={`/chapters/${(drafts[0]?.chapterId && byId.has(drafts[0].chapterId) ? drafts[0].chapterId : snap.chapters[0].id)}`}>Tiếp tục viết</Link>}
          </div>
        </div>

        {snap.indexStale > 0 && (
          <div className="banner warn" style={{ marginBottom: 16 }}>
            <div className="b-body">
              <div className="b-title">Chỉ mục chương lệch với {snap.indexStale} file</div>
              <div className="small">Có chương được sửa bên ngoài ứng dụng (ví dụ agent). Danh sách vẫn đúng vì đã đọc trực tiếp các file đó; cập nhật chỉ mục để tải nhanh hơn.</div>
              <div className="b-actions"><button className="btn sm" onClick={async () => { await api("/api/project/reindex", { body: {} }); toast("Đã cập nhật chỉ mục."); void qc.invalidateQueries({ queryKey: ["project"] }); }}>Cập nhật chỉ mục</button></div>
            </div>
          </div>
        )}

        <div className="grid cols-3" style={{ marginBottom: 16 }}>
          <div className="card card-pad stat"><div className="v">{snap.chapters.length}</div><div className="l">chương · {snap.acts.length} Act</div></div>
          <div className="card card-pad stat"><div className="v">{formatNumber(total)}</div><div className="l">chữ trong bản thảo · {inTarget} chương trong mục tiêu {formatNumber(snap.project.word_target.min)}–{formatNumber(snap.project.word_target.max)}</div></div>
          <div className="card card-pad stat"><div className="v">{pulls.data?.pulls.filter((p) => p.contentRelated).length ?? "…"}</div><div className="l">đề xuất đang chờ duyệt</div></div>
        </div>

        <div className="grid cols-2">
          <div className="card card-pad">
            <h2>Tiến độ theo Act</h2>
            <table className="table">
              <thead><tr><th>Act</th><th className="num">Chương</th><th className="num">Chữ</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {snap.acts.map((a) => {
                  const cs = snap.chapters.filter((c) => c.act_id === a.id);
                  const ap = cs.filter((c) => c.status === "approved").length;
                  return (
                    <tr key={a.id}>
                      <td>{a.title}</td>
                      <td className="num">{cs.length}</td>
                      <td className="num">{formatNumber(cs.reduce((s, c) => s + c.words, 0))}</td>
                      <td className="small muted">{ap} đã duyệt · {cs.filter((c) => c.status === "in_review").length} đang duyệt</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="row small muted" style={{ marginTop: 10 }}>
              {(Object.keys(byStatus) as (keyof typeof byStatus)[]).map((s) => <span key={s}><span className={`dot ${s}`} style={{ display: "inline-block", marginRight: 4 }} />{STATUS_LABEL[s]}: {byStatus[s]}</span>)}
            </div>
          </div>

          <div className="card card-pad">
            <h2>Nháp chưa lưu trên thiết bị này</h2>
            {!drafts.length && <div className="small muted">Không có. Mọi chương đều khớp với phiên bản đã lưu.</div>}
            <div className="list">
              {drafts.map((d) => {
                const c = byId.get(d.chapterId);
                return (
                  <Link key={d.key} href={`/chapters/${d.chapterId}`} className="list-item">
                    <span className="dot local" />
                    <span style={{ flex: 1 }}>{c ? `Ch ${c.number} · ` : ""}{d.meta.title}</span>
                    <span className="small muted">{relTime(d.updatedAt)}</span>
                  </Link>
                );
              })}
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>Nháp chỉ nằm trong trình duyệt này (IndexedDB). Bấm “Lưu phiên bản” trong chương để lưu lên {snap.repo === "demo" ? "kho demo" : "GitHub"}.</div>
          </div>

          <div className="card card-pad">
            <h2>Đề xuất đang chờ</h2>
            {pulls.isLoading && <span className="spinner" />}
            {pulls.data && !pulls.data.pulls.length && <div className="small muted">Không có đề xuất nào.</div>}
            <div className="list">
              {pulls.data?.pulls.slice(0, 6).map((p) => (
                <Link key={p.number} href={`/proposals/${p.number}`} className="list-item">
                  <span className="mono small muted">#{p.number}</span>
                  <span style={{ flex: 1 }}>{p.title}</span>
                  <span className="small muted">{p.chapters.map((c) => `Ch ${c.number}`).join(", ")}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <h2>Phiên bản gần đây</h2>
            <div className="list">
              {hist.data?.commits.slice(0, 6).map((c) => (
                <Link key={c.sha} href={`/history?sha=${c.sha}`} className="list-item">
                  <span className="mono small muted">{short(c.sha)}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.message.split("\n")[0]}</span>
                  <span className="small muted">{fmtDate(c.date)}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotReady({ error }: { error: Error & { code?: string } }) {
  return (
    <div className="page"><div className="page-inner">
      <div className="banner warn">
        <div className="b-body">
          <div className="b-title">{error.code === "not_initialized" ? "Repository chưa có cấu trúc bản thảo" : "Không tải được dự án"}</div>
          <div className="small">{error.message}</div>
          <div className="b-actions"><Link className="btn sm" href="/settings">Mở thiết lập kết nối</Link></div>
        </div>
      </div>
    </div></div>
  );
}
