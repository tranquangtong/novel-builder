"use client";
import { chapterHref } from "@/lib/client/links";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import { useProject } from "@/lib/client/hooks";
import { CHAPTER_STATUSES, STATUS_LABEL, type ChapterStatus, type ChapterSummary } from "@/lib/domain/types";
import { WordMeter } from "@/components/WordMeter";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useLocalDraftIds } from "@/components/Shell";

export default function LibraryPage() {
  const project = useProject();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ChapterStatus | "">("");
  const [newCh, setNewCh] = useState<{ act_id: string; title: string } | null>(null);
  const [newAct, setNewAct] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const drafts = useLocalDraftIds(project.data?.repo);
  const snap = project.data;

  const filtered = useMemo(() => {
    if (!snap) return [];
    const f = q.trim().toLowerCase();
    return snap.chapters.filter((c) => (!status || c.status === status) && (!f || c.title.toLowerCase().includes(f) || String(c.number) === f || (c.pov ?? "").toLowerCase().includes(f)));
  }, [snap, q, status]);

  if (!snap) return <div className="page"><div className="page-inner">{project.error ? <div className="banner danger">{(project.error as Error).message}</div> : <span className="spinner" />}</div></div>;

  const move = async (c: ChapterSummary, dir: -1 | 1) => {
    const i = snap.chapters.findIndex((x) => x.id === c.id);
    const o = snap.chapters[i + dir];
    if (!o) return;
    setBusy(true);
    try {
      await api("/api/chapters/swap", { body: { a: { id: c.id, blob: c.blob }, b: { id: o.id, blob: o.blob } } });
      await qc.invalidateQueries({ queryKey: ["project"] });
    } catch (e) {
      toast(`Không đổi được thứ tự: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const acts = [...snap.acts.map((a) => ({ id: a.id, title: a.title, description: a.description })), ...(snap.chapters.some((c) => !snap.acts.find((a) => a.id === c.act_id)) ? [{ id: "_none", title: "Chưa xếp Act", description: undefined }] : [])];

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Thư viện Act & chương</h1>
            <div className="sub">{snap.chapters.length} chương. Danh sách chỉ tải metadata — nội dung chỉ được tải khi mở chương.</div>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => setNewAct("")}>+ Act mới</button>
          </div>
        </div>
        <div className="row" style={{ marginBottom: 16 }}>
          <input className="input" style={{ maxWidth: 320 }} placeholder="Tìm theo tên, số chương, POV…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" style={{ maxWidth: 200 }} value={status} onChange={(e) => setStatus(e.target.value as ChapterStatus | "")}>
            <option value="">Mọi trạng thái</option>
            {CHAPTER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <span className="small muted">{filtered.length} kết quả</span>
        </div>
        {acts.map((a) => {
          const cs = filtered.filter((c) => (a.id === "_none" ? !snap.acts.find((x) => x.id === c.act_id) : c.act_id === a.id));
          if (!cs.length && (q || status)) return null;
          return (
            <section key={a.id} className="card" style={{ marginBottom: 18 }}>
              <div className="card-pad row" style={{ paddingBottom: 8 }}>
                <div className="grow">
                  <h2 style={{ marginBottom: 2, fontFamily: "var(--font-prose)", fontSize: 18 }}>{a.title}</h2>
                  {a.description && <div className="small muted">{a.description}</div>}
                </div>
                {a.id !== "_none" && <button className="btn sm" onClick={() => setNewCh({ act_id: a.id, title: "" })}>+ Chương mới</button>}
              </div>
              <table className="table">
                <thead><tr><th style={{ width: 54 }}>Ch</th><th>Tiêu đề</th><th>POV</th><th>Trạng thái</th><th>Số chữ</th><th style={{ width: 90 }}></th></tr></thead>
                <tbody>
                  {cs.map((c) => (
                    <tr key={c.id}>
                      <td className="num muted">{c.number}</td>
                      <td>
                        <Link href={chapterHref(c.id)} style={{ textDecoration: "none", fontWeight: 500 }}>{c.title}</Link>
                        {drafts.has(c.id) && <span className="chip accent" style={{ marginLeft: 8 }}>nháp chưa lưu</span>}
                      </td>
                      <td className="small">{c.pov ?? <span className="muted">—</span>}</td>
                      <td><span className={`chip ${c.status === "approved" ? "ok" : c.status === "in_review" ? "warn" : ""}`}>{STATUS_LABEL[c.status]}</span></td>
                      <td><WordMeter words={c.words} target={snap.project.word_target} compact /></td>
                      <td>
                        <button className="btn ghost sm" disabled={busy || c.number === 1 || !!q || !!status} onClick={() => move(c, -1)} title="Lên trước" aria-label="Lên trước">↑</button>
                        <button className="btn ghost sm" disabled={busy || c.number === snap.chapters.length || !!q || !!status} onClick={() => move(c, 1)} title="Xuống sau" aria-label="Xuống sau">↓</button>
                      </td>
                    </tr>
                  ))}
                  {!cs.length && <tr><td colSpan={6} className="muted small">Chưa có chương.</td></tr>}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
      {newCh && (
        <Modal title="Chương mới" narrow onClose={() => setNewCh(null)} footer={<>
          <button className="btn" onClick={() => setNewCh(null)}>Hủy</button>
          <button className="btn primary" disabled={!newCh.title.trim() || busy} onClick={async () => {
            setBusy(true);
            try {
              const r = await api<{ id: string }>("/api/chapters", { body: newCh });
              await qc.invalidateQueries({ queryKey: ["project"] });
              router.push(chapterHref(r.id));
            } catch (e) {
              toast(`Không tạo được chương: ${e instanceof Error ? e.message : e}`, "error");
            } finally {
              setBusy(false);
              setNewCh(null);
            }
          }}>Tạo chương</button>
        </>}>
          <label className="field">Tên chương<input className="input" autoFocus value={newCh.title} onChange={(e) => setNewCh({ ...newCh, title: e.target.value })} /></label>
          <div className="small muted" style={{ marginTop: 8 }}>Chương được thêm vào cuối Act và tạo ngay một phiên bản (rỗng) trên kho với ID cố định.</div>
        </Modal>
      )}
      {newAct !== null && (
        <Modal title="Act mới" narrow onClose={() => setNewAct(null)} footer={<>
          <button className="btn" onClick={() => setNewAct(null)}>Hủy</button>
          <button className="btn primary" disabled={!newAct.trim() || busy} onClick={async () => {
            setBusy(true);
            try {
              await api("/api/acts", { body: { title: newAct } });
              await qc.invalidateQueries({ queryKey: ["project"] });
            } catch (e) {
              toast(`Không tạo được Act: ${e instanceof Error ? e.message : e}`, "error");
            } finally {
              setBusy(false);
              setNewAct(null);
            }
          }}>Tạo Act</button>
        </>}>
          <label className="field">Tên Act<input className="input" autoFocus value={newAct} onChange={(e) => setNewAct(e.target.value)} placeholder="Act V · …" /></label>
        </Modal>
      )}
    </div>
  );
}
