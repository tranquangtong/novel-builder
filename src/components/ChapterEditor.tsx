"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, fmtDate, relTime, short } from "@/lib/client/api";
import { useProject } from "@/lib/client/hooks";
import { deleteDraft, deleteDraftIfMatches, draftKey, getDraft, newTabId, putDraftGuarded, tabChannel, type Draft, type TabMessage } from "@/lib/client/drafts";
import { countWords } from "@/lib/domain/wordcount";
import { CHAPTER_STATUSES, STATUS_LABEL, type ChapterMeta, type ChapterVersion, type CommitInfo, type PullSummary } from "@/lib/domain/types";
import { MarkdownEditor, type EditorHandle } from "./MarkdownEditor";
import { Markdown } from "./Markdown";
import { WordMeter } from "./WordMeter";
import { DiffView } from "./DiffView";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

type Meta = Omit<ChapterMeta, "id">;
const metaOf = (m: ChapterMeta): Meta => ({ title: m.title, act_id: m.act_id, order: m.order, status: m.status, pov: m.pov || undefined });
const metaEq = (a: Meta, b: Meta) => a.title === b.title && a.act_id === b.act_id && a.order === b.order && a.status === b.status && (a.pov || "") === (b.pov || "");

type SaveState = { kind: "synced" | "local" | "saving" | "error"; at?: number; msg?: string };
type Conflict = { reason: "draft-base" | "save" | "external"; server: ChapterVersion; draftBaseCommit?: string };

export function ChapterEditor({ id }: { id: string }) {
  const project = useProject();
  const toast = useToast();
  const qc = useQueryClient();
  const editor = useRef<EditorHandle>(null);
  const [tabId] = useState(newTabId);

  const [loadErr, setLoadErr] = useState<string | null>(null);
  /** Phiên bản mới nhất đã biết trên kho. */
  const [server, setServer] = useState<ChapterVersion | null>(null);
  /** Phiên bản mà nội dung đang viết dựa vào (dùng khi lưu để phát hiện xung đột). */
  const [work, setWork] = useState<{ blob: string; commit: string } | null>(null);
  const [body, setBody] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [mode, setMode] = useState<"write" | "read">("write");
  const [panel, setPanel] = useState<"info" | "versions" | "canon" | "notes" | "review" | null>("info");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "synced" });
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [otherTab, setOtherTab] = useState<Draft | null>(null);
  const [compare, setCompare] = useState<null | { title: string; before: string; after: string; beforeLabel: string; afterLabel: string; extra?: { before: string; after: string; label: string } }>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const lastSynced = useRef(0);
  const savingRef = useRef(false);
  const loaded = !!(server && work && meta);
  const repoKey = server?.repo;
  const key = repoKey ? draftKey(repoKey, id) : null;
  const isDemo = repoKey === "demo";
  const target = project.data?.project.word_target ?? { min: 2500, max: 3000 };
  const summary = project.data?.chapters.find((c) => c.id === id);

  useEffect(() => {
    // Tablet: mặc định đóng panel phụ để editor đủ rộng.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- phụ thuộc kích thước cửa sổ, chỉ biết sau khi mount
    if (window.innerWidth < 1200) setPanel(null);
  }, []);

  const apply = useCallback((text: string, m: Meta) => {
    setBody(text);
    setMeta(m);
    editor.current?.setValue(text);
  }, []);

  // ---------- tải chương + khôi phục nháp ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await api<ChapterVersion>(`/api/chapters/${id}`);
        if (!alive) return;
        const k = draftKey(v.repo, id);
        const d = await getDraft(k).catch(() => undefined);
        setServer(v);
        lastSynced.current = Date.now();
        if (d && (d.body !== v.doc.body || !metaEq(d.meta, metaOf(v.doc.meta)) || d.baseBlob !== v.blob)) {
          setWork({ blob: d.baseBlob ?? v.blob, commit: d.baseCommit });
          apply(d.body, d.meta);
          setRestoredAt(d.updatedAt);
          setSaveState({ kind: "local", at: d.updatedAt });
          if (d.baseBlob !== v.blob) setConflict({ reason: "draft-base", server: v, draftBaseCommit: d.baseCommit });
        } else {
          setWork({ blob: v.blob, commit: v.commitSha });
          apply(v.doc.body, metaOf(v.doc.meta));
          if (d) await deleteDraft(k).catch(() => {});
        }
      } catch (e) {
        if (alive) setLoadErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, apply]);

  const serverMeta = server ? metaOf(server.doc.meta) : null;
  const dirty = loaded && (work!.blob !== server!.blob || body !== server!.doc.body || !metaEq(meta!, serverMeta!));

  // ---------- tự lưu nháp vào IndexedDB ----------
  const persist = useCallback(async () => {
    if (!loaded || !key || !repoKey) return;
    if (!dirty) {
      await deleteDraft(key).catch(() => {});
      window.dispatchEvent(new Event("nb:drafts-changed"));
      if (!savingRef.current) setSaveState((s) => (s.kind === "error" ? s : { kind: "synced" }));
      return;
    }
    const d: Draft = { key, repoKey, chapterId: id, baseBlob: work!.blob, baseCommit: work!.commit, body, meta: meta!, updatedAt: Date.now(), tabId };
    const r = await putDraftGuarded(d, lastSynced.current);
    if (!r.ok) {
      setOtherTab(r.other);
      return;
    }
    lastSynced.current = d.updatedAt;
    tabChannel()?.postMessage({ type: "draft", key, tabId, updatedAt: d.updatedAt } satisfies TabMessage);
    window.dispatchEvent(new Event("nb:drafts-changed"));
    if (!savingRef.current) setSaveState((s) => (s.kind === "error" ? { ...s, at: d.updatedAt } : { kind: "local", at: d.updatedAt }));
  }, [loaded, key, repoKey, dirty, work, body, meta, id, tabId]);

  useEffect(() => {
    if (!loaded || otherTab) return;
    const t = setTimeout(() => void persist(), 400);
    return () => clearTimeout(t);
  }, [loaded, body, meta, work, persist, otherTab]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden" && !otherTab) void persist();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [persist, otherTab]);

  // ---------- phát hiện thay đổi từ bên ngoài ----------
  const serverBlob = server?.blob;
  const checkHead = useCallback(async () => {
    if (!work || savingRef.current) return;
    try {
      const h = await api<{ headSha: string; blob: string | null }>(`/api/chapters/${id}/head`);
      if (h.blob && h.blob !== work.blob && h.blob !== serverBlob) {
        const v = await api<ChapterVersion>(`/api/chapters/${id}`);
        setServer(v);
        setConflict((c) => c ?? { reason: "external", server: v });
      }
    } catch {
      /* mạng chập chờn: thử lại lần sau */
    }
  }, [id, work, serverBlob]);

  useEffect(() => {
    if (!loaded) return;
    const t = setInterval(checkHead, 15000);
    const onFocus = () => void checkHead();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [loaded, checkHead]);

  useEffect(() => {
    const ch = tabChannel();
    if (!ch || !key) return;
    const onMsg = (e: MessageEvent<TabMessage>) => {
      const m = e.data;
      if (m.key !== key || m.tabId === tabId) return;
      if (m.type === "draft" && m.updatedAt > lastSynced.current) void getDraft(key).then((d) => d && d.tabId !== tabId && setOtherTab(d));
      if (m.type === "saved") void checkHead();
    };
    ch.addEventListener("message", onMsg);
    return () => ch.removeEventListener("message", onMsg);
  }, [key, tabId, checkHead]);

  // ---------- lưu phiên bản ----------
  const save = useCallback(async (withNote?: string) => {
    if (!loaded || savingRef.current || !key) return;
    if (conflict && conflict.reason !== "external") {
      toast("Hãy xử lý khác biệt với bản trên kho trước khi lưu.", "error");
      return;
    }
    savingRef.current = true;
    setSaveState({ kind: "saving" });
    const savedBody = body, savedMeta = meta!;
    await persist();
    try {
      const r = await api<{ commitSha: string; blob: string }>(`/api/chapters/${id}`, { method: "PUT", body: { meta: savedMeta, body: savedBody, baseBlob: work!.blob, note: withNote } });
      const v: ChapterVersion = { ...server!, blob: r.blob, commitSha: r.commitSha, doc: { ...server!.doc, body: savedBody, meta: { id, ...savedMeta } }, words: countWords(savedBody) };
      setServer(v);
      setWork({ blob: r.blob, commit: r.commitSha });
      setConflict(null);
      setRestoredAt(null);
      await deleteDraftIfMatches(key, savedBody, JSON.stringify(savedMeta)).catch(() => {});
      tabChannel()?.postMessage({ type: "saved", key, tabId, blob: r.blob } satisfies TabMessage);
      window.dispatchEvent(new Event("nb:drafts-changed"));
      setSaveState({ kind: "synced", at: Date.now() });
      toast(`Đã lưu phiên bản ${short(r.commitSha)} ${isDemo ? "vào kho demo" : "lên GitHub"}.`);
      void qc.invalidateQueries({ queryKey: ["project"] });
      void qc.invalidateQueries({ queryKey: ["history", id] });
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict") {
        try {
          const v = await api<ChapterVersion>(`/api/chapters/${id}`);
          setServer(v);
          setConflict({ reason: "save", server: v, draftBaseCommit: work!.commit });
        } catch {
          /* ignore */
        }
        setSaveState({ kind: "error", msg: "Chưa lưu: bản trên kho đã thay đổi kể từ phiên bản bạn dựa vào. Nháp vẫn an toàn trên thiết bị này." });
      } else {
        setSaveState({ kind: "error", msg: `Lưu thất bại: ${e instanceof Error ? e.message : e}. Nháp vẫn an toàn trên thiết bị này.` });
      }
    } finally {
      savingRef.current = false;
    }
  }, [loaded, key, conflict, body, meta, persist, id, work, server, toast, isDemo, qc, tabId]);

  // ---------- xử lý xung đột ----------
  const openCompare = async () => {
    if (!conflict) return;
    let extra: { before: string; after: string; label: string } | undefined;
    if (conflict.draftBaseCommit && conflict.draftBaseCommit !== conflict.server.commitSha) {
      const baseV = await api<ChapterVersion>(`/api/chapters/${id}?commit=${conflict.draftBaseCommit}`).catch(() => null);
      if (baseV) extra = { before: baseV.doc.body, after: conflict.server.doc.body, label: `Thay đổi bên ngoài (${short(baseV.commitSha)} → ${short(conflict.server.commitSha)})` };
    }
    setCompare({ title: "So sánh bản trên kho với nội dung đang viết", before: conflict.server.doc.body, after: body, beforeLabel: `Trên kho (${short(conflict.server.commitSha)})`, afterLabel: "Đang viết (nháp)", extra });
  };
  const keepMine = () => {
    if (!conflict) return;
    if (!window.confirm("Giữ nội dung đang viết và dựa trên bản mới nhất trên kho?\n\nKhi bấm “Lưu phiên bản”, nội dung trên kho sẽ được thay bằng nội dung của bạn. Thay đổi bên ngoài vẫn còn trong lịch sử và có thể phục hồi.")) return;
    setWork({ blob: conflict.server.blob, commit: conflict.server.commitSha });
    setConflict(null);
  };
  const takeServer = async () => {
    if (!conflict || !key) return;
    if (dirty && !window.confirm("Bỏ nháp trên thiết bị và dùng bản trên kho?\n\nNháp hiện tại sẽ bị xóa khỏi thiết bị. (Bạn có thể bấm “Tải nháp (.md)” trước để giữ một bản.)")) return;
    const v = conflict.server;
    setServer(v);
    setWork({ blob: v.blob, commit: v.commitSha });
    apply(v.doc.body, metaOf(v.doc.meta));
    setConflict(null);
    setRestoredAt(null);
    await deleteDraft(key).catch(() => {});
    window.dispatchEvent(new Event("nb:drafts-changed"));
    setSaveState({ kind: "synced" });
  };
  const downloadDraft = () => {
    const blob = new Blob([`## ${meta?.title ?? ""}\n\n${body}`], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nhap-${id}-${new Date().toISOString().slice(0, 16)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const words = useMemo(() => countWords(body), [body]);

  if (loadErr) return <div className="page"><div className="page-inner"><div className="banner danger">Không mở được chương: {loadErr}</div></div></div>;

  const act = project.data?.acts.find((a) => a.id === meta?.act_id);

  return (
    <div className={`editor-wrap ${panel ? "" : "panel-closed"}`} style={{ height: "100%", minHeight: 0, flex: 1 }}>
      <div className="editor-col">
        <div className="editor-top">
          <span className="crumbs">{act?.title ?? "—"} · Ch {summary?.number ?? "?"}</span>
          <span className="grow" />
          <div className="tabs" style={{ margin: 0, border: 0 }}>
            <button className={`tab ${mode === "write" ? "active" : ""}`} onClick={() => setMode("write")}>Viết</button>
            <button className={`tab ${mode === "read" ? "active" : ""}`} onClick={() => setMode("read")} data-testid="mode-read">Đọc</button>
          </div>
          <a className="btn sm" href={`/api/export?chapter=${id}`}>Xuất .md</a>
          <button className="btn sm" onClick={() => setPanel((p) => (p ? null : "info"))} aria-pressed={!!panel}>{panel ? "Ẩn panel" : "Hiện panel"}</button>
          <button className="btn primary" disabled={!loaded || !dirty || saveState.kind === "saving"} onClick={() => void save()} data-testid="save-version" title="Tạo một phiên bản trên kho (Ctrl/⌘+S)">
            {saveState.kind === "saving" ? <><span className="spinner" /> Đang lưu…</> : "Lưu phiên bản"}
          </button>
          <button className="btn icon" disabled={!loaded || !dirty} onClick={() => setNoteOpen(true)} title="Lưu kèm ghi chú phiên bản">✎</button>
        </div>
        {mode === "write" && (
          <div className="toolbar" role="toolbar" aria-label="Định dạng">
            <button className="tb" onClick={() => editor.current?.wrap("**")} title="In đậm (Ctrl+B)"><b>B</b></button>
            <button className="tb" onClick={() => editor.current?.wrap("*")} title="In nghiêng (Ctrl+I)"><i>I</i></button>
            <span className="sep" />
            <button className="tb" onClick={() => editor.current?.linePrefix("## ")} title="Tiêu đề phần">H2</button>
            <button className="tb" onClick={() => editor.current?.linePrefix("### ")} title="Tiêu đề nhỏ">H3</button>
            <button className="tb" onClick={() => editor.current?.linePrefix("> ")} title="Trích dẫn">❝</button>
            <button className="tb" onClick={() => editor.current?.linePrefix("- ")} title="Danh sách">•</button>
            <button className="tb" onClick={() => editor.current?.insertBlock("***")} title="Ngắt cảnh">⁂</button>
            <span className="sep" />
            <button className="tb" onClick={() => editor.current?.undo()} title="Hoàn tác (Ctrl+Z)">↶</button>
            <button className="tb" onClick={() => editor.current?.redo()} title="Làm lại (Ctrl+Shift+Z)">↷</button>
            <span className="sep" />
            <button className="tb" onClick={() => editor.current?.toggleSearch()} title="Tìm trong chương (Ctrl+F)" data-testid="toggle-search">Tìm…</button>
          </div>
        )}
        {(restoredAt || conflict || otherTab) && (
          <div className="alerts">
            {otherTab && (
              <div className="banner warn" data-testid="other-tab-banner">
                <div className="b-body">
                  <div className="b-title">Chương này đang được sửa ở một tab khác</div>
                  <div className="small">Tab kia đã ghi nháp lúc {fmtDate(new Date(otherTab.updatedAt).toISOString())}. Tab này tạm dừng tự lưu để không ghi đè.</div>
                  <div className="b-actions">
                    <button className="btn sm" onClick={() => setCompare({ title: "So sánh nháp hai tab", before: otherTab.body, after: body, beforeLabel: "Tab kia", afterLabel: "Tab này" })}>So sánh</button>
                    <button className="btn sm" onClick={() => { apply(otherTab.body, otherTab.meta); setWork({ blob: otherTab.baseBlob ?? work!.blob, commit: otherTab.baseCommit }); lastSynced.current = Date.now(); setOtherTab(null); }}>Dùng nội dung của tab kia</button>
                    <button className="btn sm" onClick={() => { lastSynced.current = Date.now(); setOtherTab(null); }}>Tiếp tục với tab này (ghi đè nháp tab kia)</button>
                  </div>
                </div>
              </div>
            )}
            {conflict && (
              <div className="banner danger" data-testid="conflict-banner">
                <div className="b-body">
                  <div className="b-title">
                    {conflict.reason === "external" ? "Chương vừa được thay đổi ở nơi khác" : conflict.reason === "save" ? "Không lưu được: bản trên kho đã mới hơn" : "Bản trên kho đã thay đổi kể từ khi bạn bắt đầu nháp này"}
                  </div>
                  <div className="small">
                    Phiên bản trên kho: {short(conflict.server.commitSha)} ({conflict.server.words} chữ). {dirty ? "Nháp của bạn vẫn được giữ nguyên trên thiết bị — không có gì bị ghi đè." : "Bạn chưa sửa gì, có thể tải bản mới."}
                  </div>
                  <div className="b-actions">
                    <button className="btn sm" onClick={() => void openCompare()} data-testid="conflict-compare">So sánh</button>
                    {dirty && <button className="btn sm" onClick={keepMine} data-testid="conflict-keep">Giữ nội dung của tôi</button>}
                    <button className="btn sm" onClick={() => void takeServer()} data-testid="conflict-take-server">{dirty ? "Bỏ nháp, dùng bản trên kho" : "Tải bản mới"}</button>
                    {dirty && <button className="btn sm ghost" onClick={downloadDraft}>Tải nháp (.md)</button>}
                  </div>
                </div>
              </div>
            )}
            {restoredAt && !conflict && (
              <div className="banner info" data-testid="draft-restored">
                <div className="b-body">
                  <span className="b-title">Đã khôi phục nháp chưa lưu</span> <span className="small">từ {relTime(restoredAt)} trên thiết bị này. Nháp dựa trên phiên bản {short(work?.commit)}.</span>
                </div>
                <button className="btn sm ghost" onClick={() => setRestoredAt(null)}>Đã hiểu</button>
              </div>
            )}
          </div>
        )}
        <div className="editor-scroll">
          <div className="manuscript">
            <div className="chapter-kicker">Chương {summary?.number ?? ""}{meta?.pov ? ` · POV ${meta.pov}` : ""}</div>
            {mode === "write" ? (
              <input className="title-input" value={meta?.title ?? ""} placeholder="Tên chương" onChange={(e) => meta && setMeta({ ...meta, title: e.target.value })} aria-label="Tên chương" data-testid="chapter-title" disabled={!loaded} />
            ) : (
              <h1 className="title-input" style={{ display: "block" }}>{meta?.title}</h1>
            )}
            <div style={{ display: mode === "write" ? "block" : "none" }}>
              <MarkdownEditor ref={editor} initial="" onChange={setBody} onSave={() => void save()} readOnly={!loaded} />
            </div>
            {mode === "read" && <div data-testid="read-view"><Markdown text={body} /></div>}
          </div>
        </div>
        <div className="statusbar">
          <WordMeter words={words} target={target} />
          <span className="grow" />
          <span className="save-state" data-testid="save-state" data-state={saveState.kind}>
            <span className={`pip ${saveState.kind}`} />
            {saveState.kind === "synced" && `Đã lưu ${isDemo ? "trong kho demo" : "lên GitHub"} · phiên bản ${short(work?.commit)}`}
            {saveState.kind === "local" && `Nháp chỉ có trên thiết bị này · tự lưu ${saveState.at ? relTime(saveState.at) : ""} · chưa lưu phiên bản`}
            {saveState.kind === "saving" && "Đang lưu phiên bản…"}
            {saveState.kind === "error" && <span style={{ color: "var(--danger)" }}>{saveState.msg}</span>}
          </span>
        </div>
      </div>
      {panel && (
        <aside className="panel" aria-label="Panel phụ">
          <div className="panel-tabs">
            {(["info", "versions", "canon", "notes", "review"] as const).map((p) => (
              <button key={p} className={`tab ${panel === p ? "active" : ""}`} onClick={() => setPanel(p)}>
                {p === "info" ? "Thông tin" : p === "versions" ? "Phiên bản" : p === "canon" ? "Canon" : p === "notes" ? "Ghi chú" : "Review"}
              </button>
            ))}
          </div>
          <div className="panel-body">
            {panel === "info" && meta && <InfoPanel meta={meta} setMeta={setMeta} id={id} words={words} summaryStale={undefined} />}
            {panel === "versions" && server && <VersionsPanel id={id} current={server} dirty={dirty} currentBody={body} onCompare={setCompare} onRestored={async () => {
              const v = await api<ChapterVersion>(`/api/chapters/${id}`);
              setServer(v);
              setWork({ blob: v.blob, commit: v.commitSha });
              apply(v.doc.body, metaOf(v.doc.meta));
              if (key) await deleteDraft(key).catch(() => {});
              setSaveState({ kind: "synced" });
              void qc.invalidateQueries({ queryKey: ["project"] });
            }} />}
            {panel === "canon" && <CanonPanel />}
            {panel === "notes" && <NotesPanel id={id} />}
            {panel === "review" && <ReviewPanel id={id} />}
          </div>
        </aside>
      )}
      {compare && (
        <Modal title={compare.title} onClose={() => setCompare(null)}>
          {compare.extra && (
            <details style={{ marginBottom: 14 }}>
              <summary className="small" style={{ cursor: "pointer" }}>{compare.extra.label}</summary>
              <div style={{ marginTop: 10 }}><DiffView before={compare.extra.before} after={compare.extra.after} beforeLabel="Bản gốc của nháp" afterLabel="Trên kho" /></div>
            </details>
          )}
          <DiffView before={compare.before} after={compare.after} beforeLabel={compare.beforeLabel} afterLabel={compare.afterLabel} />
        </Modal>
      )}
      {noteOpen && (
        <Modal title="Lưu phiên bản kèm ghi chú" narrow onClose={() => setNoteOpen(false)} footer={<>
          <button className="btn" onClick={() => setNoteOpen(false)}>Hủy</button>
          <button className="btn primary" onClick={() => { setNoteOpen(false); void save(note.trim() || undefined); setNote(""); }}>Lưu phiên bản</button>
        </>}>
          <label className="field">Ghi chú (sẽ hiện trong lịch sử)
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: viết lại cảnh quán trọ, thêm đối thoại Rei" autoFocus />
          </label>
        </Modal>
      )}
    </div>
  );
}

function InfoPanel({ meta, setMeta, id, words }: { meta: Meta; setMeta: (m: Meta) => void; id: string; words: number; summaryStale?: boolean }) {
  const project = useProject();
  const acts = project.data?.acts ?? [];
  return (
    <>
      <label className="field">Trạng thái
        <select className="select" value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value as Meta["status"] })} data-testid="status-select">
          {CHAPTER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      <label className="field">POV
        <input className="input" value={meta.pov ?? ""} onChange={(e) => setMeta({ ...meta, pov: e.target.value || undefined })} placeholder="Không bắt buộc" />
      </label>
      <label className="field">Thuộc Act
        <select className="select" value={meta.act_id} onChange={(e) => setMeta({ ...meta, act_id: e.target.value })} data-testid="act-select">
          {acts.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
      </label>
      <dl className="kv">
        <dt>ID ổn định</dt><dd className="mono" data-testid="chapter-id">{id}</dd>
        <dt>File</dt><dd className="mono small">content/chapters/{id}.md</dd>
        <dt>Số chữ</dt><dd>{words.toLocaleString("vi-VN")}</dd>
      </dl>
      <div className="small muted">
        Đổi tên hoặc chuyển Act không làm đổi ID hay đường dẫn file. Thay đổi metadata được ghi cùng nội dung trong một phiên bản khi bạn bấm “Lưu phiên bản”.
      </div>
      <div className="small muted">
        <b>Cách đếm chữ:</b> chỉ đếm thân chương (không gồm tiêu đề, metadata, ghi chú HTML), tách theo khoảng trắng; cụm chỉ có ký hiệu như <code>***</code>, <code>—</code> không tính.
      </div>
    </>
  );
}

function VersionsPanel({ id, current, dirty, currentBody, onCompare, onRestored }: {
  id: string; current: ChapterVersion; dirty: boolean; currentBody: string;
  onCompare: (c: { title: string; before: string; after: string; beforeLabel: string; afterLabel: string }) => void;
  onRestored: () => Promise<void>;
}) {
  const toast = useToast();
  const hist = useQuery({ queryKey: ["history", id], queryFn: () => api<{ versions: CommitInfo[] }>(`/api/chapters/${id}/history`) });
  const [a, setA] = useState<string | null>(null);
  const [restore, setRestore] = useState<null | { v: ChapterVersion }>(null);
  const [keepMeta, setKeepMeta] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = (sha: string) => api<ChapterVersion>(`/api/chapters/${id}?commit=${sha}`);
  return (
    <>
      <div className="small muted">Mỗi lần “Lưu phiên bản”, mỗi đề xuất được nhập và mỗi lần phục hồi đều tạo một phiên bản. Lịch sử không bao giờ bị viết lại.</div>
      {hist.isLoading && <span className="spinner" />}
      {hist.data?.versions.map((c, i) => (
        <div key={c.sha} className={`version-item ${a === c.sha ? "sel" : ""}`} data-testid="version-item">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="msg">{c.message.split("\n")[0]}</div>
            <div className="muted">{fmtDate(c.date)} · {c.author} · <span className="mono">{short(c.sha)}</span>{i === 0 && <span className="chip ok" style={{ marginLeft: 6 }}>hiện tại</span>}</div>
            <div className="row" style={{ marginTop: 6, gap: 4 }}>
              <button className="btn sm" onClick={async () => {
                const v = await load(c.sha);
                onCompare({ title: `So sánh ${short(c.sha)} với nội dung đang viết`, before: v.doc.body, after: currentBody, beforeLabel: `Phiên bản ${short(c.sha)}`, afterLabel: "Đang viết" });
              }}>So với bản đang viết</button>
              {a && a !== c.sha ? (
                <button className="btn sm" onClick={async () => {
                  const [va, vb] = await Promise.all([load(a), load(c.sha)]);
                  const [older, newer] = va.commitSha === c.sha ? [va, vb] : new Date(hist.data!.versions.find((x) => x.sha === a)!.date) < new Date(c.date) ? [va, vb] : [vb, va];
                  onCompare({ title: "So sánh hai phiên bản", before: older.doc.body, after: newer.doc.body, beforeLabel: short(older.commitSha), afterLabel: short(newer.commitSha) });
                }}>So với {short(a)}</button>
              ) : (
                <button className="btn sm ghost" onClick={() => setA(a === c.sha ? null : c.sha)}>{a === c.sha ? "Bỏ chọn" : "Chọn để so sánh"}</button>
              )}
              {i > 0 && <button className="btn sm" data-testid="restore-version" onClick={async () => setRestore({ v: await load(c.sha) })}>Phục hồi…</button>}
            </div>
          </div>
        </div>
      ))}
      {restore && (
        <Modal title={`Phục hồi chương về phiên bản ${short(restore.v.commitSha)}`} onClose={() => setRestore(null)} footer={<>
          <label className="small row" style={{ gap: 4, marginRight: "auto" }}><input type="checkbox" checked={keepMeta} onChange={(e) => setKeepMeta(e.target.checked)} /> Giữ tiêu đề, Act, trạng thái hiện tại (chỉ phục hồi nội dung)</label>
          <button className="btn" onClick={() => setRestore(null)}>Hủy</button>
          <button className="btn primary" disabled={busy || dirty} data-testid="confirm-restore" onClick={async () => {
            setBusy(true);
            try {
              const r = await api<{ commitSha: string }>("/api/restore", { body: { fromCommit: restore.v.commitSha, chapterIds: [id], current: { [id]: current.blob }, keepMeta } });
              toast(`Đã phục hồi bằng phiên bản mới ${short(r.commitSha)}.`);
              setRestore(null);
              await onRestored();
              void hist.refetch();
            } catch (e) {
              toast(`Phục hồi thất bại: ${e instanceof Error ? e.message : e}`, "error");
            } finally {
              setBusy(false);
            }
          }}>Tạo phiên bản mới với nội dung cũ</button>
        </>}>
          {dirty && <div className="banner warn" style={{ marginBottom: 12 }}>Bạn đang có nháp chưa lưu. Hãy lưu phiên bản hoặc bỏ nháp trước khi phục hồi.</div>}
          <p className="small muted" style={{ marginTop: 0 }}>Xem trước: thay đổi từ bản hiện tại trên kho ({short(current.commitSha)}) sang nội dung của {short(restore.v.commitSha)}. Chỉ chương này bị ảnh hưởng; lịch sử cũ được giữ nguyên.</p>
          <DiffView before={current.doc.body} after={restore.v.doc.body} beforeLabel="Hiện tại" afterLabel="Sau khi phục hồi" />
        </Modal>
      )}
    </>
  );
}

function CanonPanel() {
  const files = useQuery({ queryKey: ["files", "content/canon/"], queryFn: () => api<{ files: { path: string; title: string; kind: string; data: Record<string, unknown> }[] }>("/api/files?prefix=content/canon/") });
  const [open, setOpen] = useState<string | null>(null);
  const content = useQuery({ queryKey: ["file", open], enabled: !!open, queryFn: () => api<{ content: string }>(`/api/file?path=${encodeURIComponent(open!)}`) });
  return (
    <>
      <div className="small muted">Canon đã chốt, sự kiện đã xảy ra và kiến thức nhân vật. <Link href="/canon">Mở trang Canon →</Link></div>
      {files.data?.files.map((f) => (
        <div key={f.path}>
          <button className="list-item" onClick={() => setOpen(open === f.path ? null : f.path)} style={{ padding: "6px 4px" }}>
            <span style={{ flex: 1 }}>{f.title}</span>
            <StatusChip status={String(f.data.status ?? f.data.type ?? "")} />
          </button>
          {open === f.path && content.data && <div style={{ padding: "6px 4px" }}><Markdown compact text={stripFm(content.data.content)} /></div>}
        </div>
      ))}
    </>
  );
}

export function StatusChip({ status }: { status: string }) {
  if (status === "canon") return <span className="chip ok">canon</span>;
  if (status === "proposed") return <span className="chip warn">đề xuất</span>;
  if (status === "planned") return <span className="chip info">kế hoạch</span>;
  if (status === "knowledge") return <span className="chip accent">kiến thức</span>;
  if (status === "timeline") return <span className="chip">đã xảy ra</span>;
  return status ? <span className="chip">{status}</span> : null;
}

export function stripFm(t: string) {
  return t.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function NotesPanel({ id }: { id: string }) {
  const path = `content/notes/${id}.md`;
  const toast = useToast();
  const q = useQuery({ queryKey: ["file", path], queryFn: () => api<{ content: string; blob: string }>(`/api/file?path=${encodeURIComponent(path)}`).catch((e) => (e instanceof ApiError && e.status === 404 ? null : Promise.reject(e))) });
  const [text, setText] = useState<string | null>(null);
  const value = text ?? q.data?.content ?? "";
  return (
    <>
      <div className="small muted">Ghi chú riêng của tác giả cho chương này, lưu tại <code>{path}</code> (cũng có phiên bản).</div>
      <textarea className="textarea" style={{ minHeight: 220 }} value={value} onChange={(e) => setText(e.target.value)} placeholder="Ý tưởng, việc cần sửa, câu hỏi cho agent…" />
      <button className="btn" disabled={text === null || text === (q.data?.content ?? "")} onClick={async () => {
        try {
          await api("/api/file", { method: "PUT", body: { path, content: value, baseBlob: q.data?.blob ?? null, message: `Ghi chú chương\n\nChapter-Id: ${id}` } });
          toast("Đã lưu ghi chú.");
          setText(null);
          void q.refetch();
        } catch (e) {
          toast(`Không lưu được ghi chú: ${e instanceof Error ? e.message : e}`, "error");
        }
      }}>Lưu ghi chú</button>
    </>
  );
}

function ReviewPanel({ id }: { id: string }) {
  const pulls = useQuery({ queryKey: ["proposals", "open"], queryFn: () => api<{ pulls: (PullSummary & { chapters: { id: string }[] })[] }>("/api/proposals?state=open") });
  const related = pulls.data?.pulls.filter((p) => p.chapters.some((c) => c.id === id)) ?? [];
  return (
    <>
      <div className="small muted">Đề xuất đang mở có chỉnh sửa chương này.</div>
      {pulls.isLoading && <span className="spinner" />}
      {!pulls.isLoading && !related.length && <div className="small muted">Không có đề xuất nào.</div>}
      {related.map((p) => (
        <Link key={p.number} href={`/proposals/${p.number}`} className="version-item" style={{ textDecoration: "none" }}>
          <div><div className="msg">#{p.number} {p.title}</div><div className="muted">{p.author} · {fmtDate(p.updatedAt)}</div></div>
        </Link>
      ))}
    </>
  );
}
