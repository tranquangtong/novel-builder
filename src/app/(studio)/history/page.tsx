"use client";
import { chapterLabel } from "@/lib/domain/labels";
import { chapterHref } from "@/lib/client/links";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtDate, short } from "@/lib/client/api";
import { useProject } from "@/lib/client/hooks";
import { chapterIdFromPath, fileKind, KIND_LABEL } from "@/lib/domain/paths";
import type { CommitInfo, FileChange } from "@/lib/domain/types";
import { DiffView } from "@/components/DiffView";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

export default function HistoryPage() {
  return <Suspense fallback={<div className="page"><div className="page-inner"><span className="spinner" /></div></div>}><History /></Suspense>;
}

type PreviewItem = { id: string; number?: number; title?: string; currentBlob?: string; oldBlob?: string; oldTitle?: string; oldWords?: number; currentWords?: number; oldBody?: string; currentBody?: string; missing?: true };

function History() {
  const params = useSearchParams();
  const router = useRouter();
  const sel = params.get("sha");
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ["history", "repo", page], queryFn: () => api<{ commits: CommitInfo[] }>(`/api/history?page=${page}`) });
  const detail = useQuery({ queryKey: ["commit", sel], enabled: !!sel, queryFn: () => api<CommitInfo & { files: FileChange[] }>(`/api/history/${sel}`) });
  const project = useProject();
  const byId = new Map(project.data?.chapters.map((c) => [c.id, c]) ?? []);
  const [restoreFrom, setRestoreFrom] = useState<string | null>(null);

  return (
    <div className="page">
      <div className="page-inner" style={{ maxWidth: 1240 }}>
        <div className="page-head">
          <div>
            <h1>Lịch sử & phục hồi</h1>
            <div className="sub">Mọi phiên bản của bản chính. Phục hồi luôn tạo phiên bản MỚI chứa nội dung cũ — không xóa hay viết lại lịch sử, không quay lui toàn bộ repo.</div>
          </div>
        </div>
        <div className="two-col" style={{ gridTemplateColumns: "380px minmax(0,1fr)" }}>
          <div className="card">
            <div className="list" data-testid="commit-list">
              {list.isLoading && <div className="empty"><span className="spinner" /></div>}
              {list.data?.commits.map((c) => (
                <button key={c.sha} className={`list-item ${sel === c.sha ? "active" : ""}`} onClick={() => router.replace(`/history?sha=${c.sha}`)} style={{ alignItems: "flex-start" }}>
                  <span className="mono small muted" style={{ paddingTop: 2 }}>{short(c.sha)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.message.split("\n")[0]}</span>
                    <span className="small muted">{c.author} · {fmtDate(c.date)}{c.parents.length > 1 ? " · nhập đề xuất" : ""}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="row card-pad" style={{ padding: 10 }}>
              <button className="btn sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Mới hơn</button>
              <span className="grow" />
              <button className="btn sm" disabled={(list.data?.commits.length ?? 0) < 30} onClick={() => setPage((p) => p + 1)}>Cũ hơn →</button>
            </div>
          </div>
          <div>
            {!sel && <div className="card empty">Chọn một phiên bản để xem chi tiết.</div>}
            {sel && detail.data && (
              <div className="card card-pad">
                <div className="row">
                  <h2 style={{ margin: 0, flex: 1 }}>{detail.data.message.split("\n")[0]}</h2>
                  <button className="btn primary" onClick={() => setRestoreFrom(sel)} data-testid="restore-from-commit">Phục hồi chương về phiên bản này…</button>
                </div>
                <div className="small muted" style={{ margin: "6px 0 12px" }}>{detail.data.author} · {fmtDate(detail.data.date)} · <span className="mono">{detail.data.sha}</span></div>
                {detail.data.message.includes("\n") && <pre className="code-block" style={{ marginBottom: 12 }}>{detail.data.message}</pre>}
                <div className="pane-label">File thay đổi trong phiên bản này</div>
                <table className="table">
                  <tbody>
                    {detail.data.files.map((f) => {
                      const id = chapterIdFromPath(f.path);
                      const c = id ? byId.get(id) : undefined;
                      return (
                        <tr key={f.path}>
                          <td style={{ width: 90 }}><span className={`chip ${f.status === "added" ? "ok" : f.status === "removed" ? "danger" : ""}`}>{f.status === "added" ? "thêm" : f.status === "removed" ? "xóa" : "sửa"}</span></td>
                          <td>{c ? <Link href={chapterHref(c.id)}>{chapterLabel(c)}</Link> : <span className="mono small">{f.path}</span>}</td>
                          <td className="small muted">{KIND_LABEL[fileKind(f.path)]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      {restoreFrom && <RestoreDialog fromCommit={restoreFrom} onClose={() => setRestoreFrom(null)} />}
    </div>
  );
}

function RestoreDialog({ fromCommit, onClose }: { fromCommit: string; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const cand = useQuery({ queryKey: ["restore-candidates", fromCommit], queryFn: () => api<{ items: PreviewItem[]; headSha: string }>("/api/restore/preview", { body: { fromCommit } }) });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [keepMeta, setKeepMeta] = useState(true);
  const [busy, setBusy] = useState(false);

  const doPreview = async () => {
    setBusy(true);
    try {
      const r = await api<{ items: PreviewItem[] }>("/api/restore/preview", { body: { fromCommit, chapterIds: [...picked] } });
      setPreview(r.items);
    } catch (e) {
      toast(`Không xem trước được: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const current = Object.fromEntries(preview.filter((p) => p.currentBlob).map((p) => [p.id, p.currentBlob!]));
      const r = await api<{ commitSha: string }>("/api/restore", { body: { fromCommit, chapterIds: preview.map((p) => p.id), current, keepMeta } });
      toast(`Đã phục hồi ${preview.length} chương bằng phiên bản mới ${short(r.commitSha)}.`);
      await qc.invalidateQueries();
      onClose();
      router.replace(`/history?sha=${r.commitSha}`);
    } catch (e) {
      toast(`Phục hồi thất bại: ${e instanceof Error ? e.message : e}. Không có gì bị thay đổi.`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Phục hồi chương về phiên bản ${short(fromCommit)}`} onClose={onClose} footer={preview ? <>
      <label className="small row" style={{ gap: 4, marginRight: "auto" }}><input type="checkbox" checked={keepMeta} onChange={(e) => setKeepMeta(e.target.checked)} /> Giữ tiêu đề, Act, trạng thái hiện tại (chỉ phục hồi nội dung)</label>
      <button className="btn" onClick={() => setPreview(null)}>← Chọn lại</button>
      <button className="btn primary" disabled={busy} onClick={confirm} data-testid="confirm-multi-restore">Tạo phiên bản mới cho {preview.length} chương</button>
    </> : <>
      <button className="btn" onClick={onClose}>Hủy</button>
      <button className="btn primary" disabled={!picked.size || busy} onClick={doPreview} data-testid="restore-preview">Xem trước ({picked.size})</button>
    </>}>
      {!preview && (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>Các chương có nội dung khác giữa phiên bản {short(fromCommit)} và bản chính hiện tại. Chỉ những chương bạn chọn mới bị thay đổi; mọi chương khác, canon và outline giữ nguyên.</p>
          {cand.isLoading && <span className="spinner" />}
          {cand.data && !cand.data.items.length && <div className="empty">Không có chương nào khác với bản hiện tại.</div>}
          <div className="list">
            {cand.data?.items.filter((i) => !i.missing).map((i) => (
              <label key={i.id} className="list-item" data-testid="restore-candidate">
                <input type="checkbox" checked={picked.has(i.id)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} />
                <span style={{ flex: 1 }}>{chapterLabel({ number: i.number ?? 0, title: i.title ?? "" })}{i.oldTitle && i.oldTitle !== i.title ? <span className="muted"> (khi đó: “{i.oldTitle}”)</span> : null}</span>
                <span className="small muted">{i.oldWords} → hiện {i.currentWords} chữ</span>
              </label>
            ))}
          </div>
        </>
      )}
      {preview && (
        <div className="grid" style={{ gap: 18 }}>
          <div className="banner info"><div className="small">Xem trước: từ <b>bản hiện tại</b> sang <b>nội dung sẽ phục hồi</b>. Chưa có gì được ghi.</div></div>
          {preview.map((p) => (
            <div key={p.id}>
              <h3 style={{ fontFamily: "var(--font-prose)", marginBottom: 8 }}>{chapterLabel({ number: p.number ?? 0, title: p.title ?? "" })}</h3>
              <DiffView before={p.currentBody ?? ""} after={p.oldBody ?? ""} beforeLabel="Hiện tại" afterLabel="Sau khi phục hồi" />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
