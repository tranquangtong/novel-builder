"use client";
import { chapterHref, proposalHref } from "@/lib/client/links";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, short } from "@/lib/client/api";
import { useProject } from "@/lib/client/hooks";
import type { PullSummary } from "@/lib/domain/types";
import { Markdown } from "@/components/Markdown";
import { StatusChip, stripFm } from "@/components/ChapterEditor";
import { useToast } from "@/components/Toast";

type F = { path: string; blob: string; kind: string; title: string; data: Record<string, unknown>; stale?: boolean; sourceCurrentBlob?: string | null };

const TABS = [
  { key: "canon", label: "Canon đã chốt", prefixes: ["content/canon/characters/", "content/canon/world/"], desc: "Sự thật của thế giới và nhân vật. Không có nghĩa là nhân vật trong truyện đã biết." },
  { key: "timeline", label: "Sự kiện đã xảy ra", prefixes: ["content/canon/timeline/"], desc: "Chỉ những gì đã thực sự xảy ra trong bản thảo, kèm chương nguồn." },
  { key: "knowledge", label: "Kiến thức nhân vật", prefixes: ["content/canon/knowledge/"], desc: "Ai biết gì, nghi ngờ gì, chưa biết gì — tại từng thời điểm." },
  { key: "outline", label: "Outline (kế hoạch)", prefixes: ["content/outlines/"], desc: "Dự định cho các chương sau. Chưa phải sự thật." },
  { key: "summaries", label: "Tóm tắt", prefixes: ["content/summaries/"], desc: "Dẫn xuất từ chương, ghi phiên bản nguồn. Không thay thế nguyên văn khi xác minh chi tiết." },
  { key: "proposed", label: "Đề xuất chưa duyệt", prefixes: ["content/canon/"], desc: "Hồ sơ đánh dấu status: proposed và đề xuất đang mở có sửa canon." },
] as const;

const KSTATE: Record<string, { label: string; color: string }> = {
  knows: { label: "Biết", color: "var(--ok)" },
  suspects: { label: "Nghi ngờ", color: "var(--warn)" },
  unaware: { label: "Chưa biết", color: "var(--muted)" },
  misbelieves: { label: "Tin sai", color: "var(--danger)" },
};

export default function CanonPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("canon");
  const t = TABS.find((x) => x.key === tab)!;
  const project = useProject();
  const qc = useQueryClient();
  const toast = useToast();
  const byId = useMemo(() => new Map(project.data?.chapters.map((c) => [c.id, c]) ?? []), [project.data]);
  const chapterLabel = (id: unknown) => <ChapterRef id={id} byId={byId} />;

  const lists = useQuery({
    queryKey: ["canon-lists", tab],
    queryFn: async () => {
      const all = await Promise.all(t.prefixes.map((p) => api<{ files: F[] }>(`/api/files?prefix=${encodeURIComponent(p)}`)));
      let files = all.flatMap((x) => x.files).filter((f) => !f.path.endsWith(".gitkeep"));
      if (tab === "proposed") files = files.filter((f) => f.data.status === "proposed");
      else if (tab === "canon") files = files.filter((f) => f.data.status !== "proposed");
      return files;
    },
  });
  const pulls = useQuery({ queryKey: ["proposals", "open"], enabled: tab === "proposed", queryFn: () => api<{ pulls: PullSummary[] }>("/api/proposals?state=open") });
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [newPath, setNewPath] = useState<string | null>(null);
  const file = useQuery({ queryKey: ["file", sel], enabled: !!sel, queryFn: () => api<{ content: string; blob: string; path: string }>(`/api/file?path=${encodeURIComponent(sel!)}`) });
  const selMeta = lists.data?.find((f) => f.path === sel);

  const saveFile = async (path: string, content: string, baseBlob: string | null) => {
    try {
      await api("/api/file", { method: "PUT", body: { path, content, baseBlob, message: `Lưu phiên bản: ${path}` } });
      toast("Đã lưu phiên bản.");
      setEdit(null);
      setNewPath(null);
      setSel(path);
      await qc.invalidateQueries({ queryKey: ["canon-lists"] });
      await qc.invalidateQueries({ queryKey: ["file", path] });
    } catch (e) {
      toast(e instanceof ApiError && e.code === "conflict" ? "File đã được sửa ở nơi khác. Tải lại để xem bản mới; nội dung bạn sửa vẫn còn trong ô soạn." : `Lưu thất bại: ${e instanceof Error ? e.message : e}`, "error");
    }
  };

  return (
    <div className="page">
      <div className="page-inner" style={{ maxWidth: 1240 }}>
        <div className="page-head">
          <div>
            <h1>Canon & outline</h1>
            <div className="sub">Tách bạch: canon đã chốt · kế hoạch · đề xuất chưa duyệt · sự kiện đã xảy ra · kiến thức nhân vật.</div>
          </div>
          <div className="actions">
            {tab !== "proposed" && tab !== "summaries" && <button className="btn" onClick={() => { setNewPath(t.prefixes[0]); setSel(null); setEdit(null); }}>+ Hồ sơ mới</button>}
          </div>
        </div>
        <div className="tabs">
          {TABS.map((x) => <button key={x.key} className={`tab ${tab === x.key ? "active" : ""}`} onClick={() => { setTab(x.key); setSel(null); setEdit(null); }}>{x.label}</button>)}
        </div>
        <p className="small muted" style={{ marginTop: -4 }}>{t.desc}</p>
        <div className="two-col">
          <div className="card">
            <div className="list" data-testid="canon-list">
              {lists.isLoading && <div className="empty"><span className="spinner" /></div>}
              {lists.data && !lists.data.length && <div className="empty small">Chưa có hồ sơ.</div>}
              {lists.data?.map((f) => (
                <button key={f.path} className={`list-item ${sel === f.path ? "active" : ""}`} onClick={() => { setSel(f.path); setEdit(null); setNewPath(null); }}>
                  <span style={{ flex: 1 }}>{f.title}</span>
                  {f.stale === true && <span className="chip warn">đã cũ</span>}
                  {f.stale === false && <span className="chip ok">khớp</span>}
                  <StatusChip status={String(f.data.status ?? "")} />
                </button>
              ))}
            </div>
            {tab === "proposed" && (
              <div className="card-pad">
                <div className="pane-label">Đề xuất đang mở có sửa canon</div>
                {pulls.data?.pulls.filter((p) => p.files.some((x) => x.path.startsWith("content/canon/"))).map((p) => (
                  <Link key={p.number} href={proposalHref(p.number)} className="list-item small">#{p.number} {p.title}</Link>
                ))}
                {pulls.data && !pulls.data.pulls.some((p) => p.files.some((x) => x.path.startsWith("content/canon/"))) && <div className="small muted">Không có.</div>}
              </div>
            )}
          </div>
          <div>
            {newPath !== null && <NewFile prefix={t.prefixes[0]} onSave={(p, c) => saveFile(p, c, null)} onCancel={() => setNewPath(null)} kind={tab} />}
            {sel && file.data && edit === null && (
              <div className="card card-pad">
                <div className="row" style={{ marginBottom: 8 }}>
                  <h2 style={{ margin: 0, flex: 1, fontFamily: "var(--font-prose)", fontSize: 20 }}>{selMeta?.title}</h2>
                  <StatusChip status={String(selMeta?.data.status ?? "")} />
                  <button className="btn sm" onClick={() => setEdit(file.data!.content)}>Sửa</button>
                </div>
                <div className="small muted mono" style={{ marginBottom: 12 }}>{sel} · blob {short(file.data.blob)}</div>
                {tab === "summaries" && selMeta && (
                  <div className={`banner ${selMeta.stale ? "warn" : "ok"}`} style={{ marginBottom: 12 }}>
                    <div className="small">
                      {selMeta.stale ? <>Tóm tắt <b>đã cũ</b>: viết từ phiên bản {short(String(selMeta.data.source_blob))} của chương, hiện chương là {short(selMeta.sourceCurrentBlob)}.</> : <>Tóm tắt khớp với phiên bản hiện tại của chương.</>} Nguồn: {chapterLabel(selMeta.data.chapter_id)}. Khi xác minh chi tiết, hãy đọc nguyên văn.
                    </div>
                  </div>
                )}
                {Array.isArray(selMeta?.data.entries) && (
                  <table className="table" style={{ marginBottom: 12 }}>
                    <thead><tr><th>Điều</th><th>Trạng thái hiểu biết</th><th>Từ chương</th><th>Ghi chú</th></tr></thead>
                    <tbody>
                      {(selMeta!.data.entries as Record<string, unknown>[]).map((e, i) => {
                        const st = KSTATE[String(e.state)] ?? { label: String(e.state ?? "?"), color: "var(--ink)" };
                        return (
                          <tr key={i}>
                            <td>{String(e.fact ?? "")}{e.fact_ref ? <div className="small muted mono">{String(e.fact_ref)}</div> : null}</td>
                            <td><span className="knowledge-state" style={{ color: st.color }}>{st.label}</span></td>
                            <td>{chapterLabel(e.from_chapter)}</td>
                            <td className="small">{String(e.note ?? "")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {Array.isArray(selMeta?.data.events) && (
                  <table className="table" style={{ marginBottom: 12 }}>
                    <thead><tr><th>Thời điểm</th><th>Sự kiện</th><th>Chương nguồn</th></tr></thead>
                    <tbody>
                      {(selMeta!.data.events as Record<string, unknown>[]).map((e, i) => (
                        <tr key={i}><td className="small">{String(e.when ?? "")}</td><td>{String(e.event ?? "")}</td><td>{chapterLabel(e.source_chapter)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <Markdown compact text={stripFm(file.data.content)} />
              </div>
            )}
            {sel && edit !== null && file.data && (
              <div className="card card-pad grid" style={{ gap: 10 }}>
                <div className="row"><h2 style={{ margin: 0, flex: 1 }}>Sửa {sel}</h2></div>
                <div className="small muted">Phần giữa hai dòng <code>---</code> là thuộc tính (YAML): <code>status: canon | proposed</code>, <code>entries</code>, <code>events</code>…</div>
                <textarea className="textarea mono" style={{ minHeight: 420 }} value={edit} onChange={(e) => setEdit(e.target.value)} />
                <div className="row">
                  <button className="btn" onClick={() => setEdit(null)}>Hủy</button>
                  <button className="btn primary" onClick={() => saveFile(sel, edit, file.data!.blob)}>Lưu phiên bản</button>
                </div>
              </div>
            )}
            {!sel && newPath === null && <div className="card empty">Chọn một hồ sơ.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

const TEMPLATES: Record<string, string> = {
  canon: "---\ntitle: Tên hồ sơ\ntype: character\nstatus: canon\n---\nMô tả.\n",
  timeline: "---\ntitle: Sự kiện đã xảy ra — …\ntype: timeline\nevents:\n  - when: Ngày 1\n    event: …\n    source_chapter: ch_xxxxxxxxxx\n---\n",
  knowledge: "---\ntitle: Kiến thức của …\ntype: knowledge\ncharacter: …\nentries:\n  - fact: …\n    state: unaware # knows | suspects | unaware | misbelieves\n    from_chapter: ch_xxxxxxxxxx\n---\n",
  outline: "---\ntitle: Outline …\ntype: outline\nstatus: planned\n---\n- …\n",
};

function NewFile({ prefix, kind, onSave, onCancel }: { prefix: string; kind: string; onSave: (p: string, c: string) => void; onCancel: () => void }) {
  const [dir, setDir] = useState(prefix);
  const [name, setName] = useState("");
  const [content, setContent] = useState(TEMPLATES[kind] ?? TEMPLATES.canon);
  const slug = name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <div className="card card-pad grid" style={{ gap: 10 }}>
      <h2 style={{ margin: 0 }}>Hồ sơ mới</h2>
      <div className="row">
        {kind === "canon" && (
          <select className="select" style={{ maxWidth: 240 }} value={dir} onChange={(e) => setDir(e.target.value)}>
            <option value="content/canon/characters/">Nhân vật</option>
            <option value="content/canon/world/">Thế giới / vật phẩm / địa danh</option>
          </select>
        )}
        <input className="input grow" placeholder="Tên file, ví dụ: kiem-tro" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="small muted mono">{dir}{slug || "…"}.md</div>
      <textarea className="textarea mono" style={{ minHeight: 300 }} value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="row"><button className="btn" onClick={onCancel}>Hủy</button><button className="btn primary" disabled={!slug} onClick={() => onSave(`${dir}${slug}.md`, content)}>Tạo & lưu phiên bản</button></div>
    </div>
  );
}

function ChapterRef({ id, byId }: { id: unknown; byId: Map<string, { id: string; number: number }> }) {
  const c = typeof id === "string" ? byId.get(id) : undefined;
  if (c) return <Link href={chapterHref(c.id)}>Ch {c.number}</Link>;
  return id ? <span className="mono small">{String(id)}</span> : <span className="muted">—</span>;
}
