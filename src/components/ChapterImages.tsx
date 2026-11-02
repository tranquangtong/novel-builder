"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, cloudFetch, fmtDate } from "@/lib/client/api";
import { assetUrl } from "./Markdown";
import { IMAGE_DRAG_TYPE } from "./MarkdownEditor";
import { useToast } from "./Toast";

type Asset = { key: string; kind: string; caption: string; fileName: string; size: number; uploadedAt: string; uploadedBy: string };

export const KINDS = [
  { v: "character", label: "Nhân vật" },
  { v: "scenery", label: "Cảnh quan" },
  { v: "action", label: "Cảnh hành động" },
  { v: "sketch", label: "Phác thảo" },
  { v: "illustration", label: "Minh hoạ" },
  { v: "reference", label: "Tham khảo" },
  { v: "other", label: "Khác" },
];
const kindLabel = (k: string) => KINDS.find((x) => x.v === k)?.label ?? k;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

/** Ảnh đi kèm một chương (chỉ ở chế độ Cloudflare). */
export const imageMarkdown = (a: { caption: string; fileName: string; key: string }) => `![${(a.caption || a.fileName).replace(/[[\]]/g, "")}](asset:${a.key})`;

export function ChapterImages({ novelId, chapterId, canEdit, onInsert, insertHint }: { novelId: string; chapterId: string; canEdit: boolean; onInsert: (markdown: string) => void; insertHint?: React.ReactNode }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("character");
  const [filter, setFilter] = useState("");
  const [drag, setDrag] = useState(false);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["assets", novelId, chapterId], queryFn: () => cloudFetch<{ assets: Asset[] }>(`/api/novels/${novelId}/assets?chapter=${chapterId}`) });

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      let i = 0;
      for (const f of Array.from(files)) {
        setBusy(`Đang tải ${++i}/${files.length}: ${f.name}`);
        if (f.size > 15 * 1024 * 1024) throw new Error(`${f.name} lớn hơn 15 MB`);
        const qs = new URLSearchParams({ chapter: chapterId, kind, caption: caption.trim(), name: f.name });
        const res = await fetch(`/api/novels/${novelId}/assets?${qs}`, { method: "POST", body: f, headers: { "Content-Type": f.type || "application/octet-stream" }, credentials: "same-origin" });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(`${f.name}: ${d.error ?? res.status}`);
        }
      }
      toast(`Đã tải lên ${files.length} ảnh.`);
      setCaption("");
      void q.refetch();
    } catch (e) {
      toast(`Tải ảnh thất bại: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const trash = async (a: Asset) => {
    if (!window.confirm(`Bỏ ảnh “${a.caption || a.fileName}” vào thùng rác?\n\nẢnh được chuyển sang thùng rác trên R2, không mất hẳn. Nếu chương đang chèn ảnh này, chỗ đó sẽ không hiện ảnh nữa.`)) return;
    try {
      await cloudFetch(`/api/novels/${novelId}/assets/file/${a.key.split("/").map(encodeURIComponent).join("/")}`, "DELETE");
      void q.refetch();
    } catch (e) {
      toast(`Không xoá được: ${e instanceof ApiError ? e.message : e}`, "error");
    }
  };

  return (
    <>
      <div className="small muted">Ảnh nhân vật, cảnh quan, cảnh hành động… cho chương này. Lưu trên Cloudflare R2, chỉ người đăng nhập mới xem được. Tối đa 15 MB/ảnh (JPG, PNG, WebP, GIF, AVIF). Chọn hoặc kéo-thả nhiều ảnh một lúc.</div>
      {canEdit && (insertHint ?? <div className="small muted">Để đặt ảnh vào giữa chương: <b>kéo ảnh thả vào đúng chỗ</b> trong bài viết, hoặc bấm vào chỗ đó trong bài rồi bấm “Chèn vào chương” (ảnh nằm ngay sau đoạn có con trỏ).</div>)}
      {canEdit && (
        <div className={`grid image-drop${drag ? " over" : ""}`} style={{ gap: 8 }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); }}>
          <div className="row">
            <select className="select" style={{ maxWidth: 170 }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Loại ảnh">
              {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
            </select>
            <input className="input grow" placeholder="Chú thích (tuỳ chọn)" value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <input ref={input} type="file" accept={ACCEPT} multiple onChange={(e) => void upload(e.target.files)} disabled={!!busy} data-testid="image-upload" />
          {busy && <div className="small"><span className="spinner" /> {busy}</div>}
        </div>
      )}
      {q.isLoading && <span className="spinner" />}
      {q.data && !q.data.assets.length && <div className="small muted">Chưa có ảnh nào.</div>}
      {q.data && q.data.assets.length > 0 && (
        <div className="row" style={{ gap: 4 }} data-testid="image-filter">
          <button className={`btn sm ${filter === "" ? "" : "ghost"}`} onClick={() => setFilter("")}>Tất cả ({q.data.assets.length})</button>
          {KINDS.filter((k) => q.data.assets.some((a) => a.kind === k.v)).map((k) => (
            <button key={k.v} className={`btn sm ${filter === k.v ? "" : "ghost"}`} onClick={() => setFilter(k.v)}>{k.label} ({q.data.assets.filter((a) => a.kind === k.v).length})</button>
          ))}
        </div>
      )}
      <div className="image-grid" data-testid="image-list">
        {q.data?.assets.filter((a) => !filter || a.kind === filter).map((a) => (
          <figure key={a.key} className="version-item image-figure" style={{ flexDirection: "column", margin: 0 }} draggable={canEdit}
            onDragStart={(e) => { e.dataTransfer.setData(IMAGE_DRAG_TYPE, imageMarkdown(a)); e.dataTransfer.setData("text/plain", imageMarkdown(a)); e.dataTransfer.effectAllowed = "copy"; }}
            title={canEdit ? "Kéo thả vào bài viết để đặt ảnh ở đó" : undefined}>
            <a href={assetUrl(a.key)} target="_blank" rel="noreferrer" style={{ display: "block", width: "100%" }} draggable={false}>
              {/* eslint-disable-next-line @next/next/no-img-element -- ảnh riêng tư từ R2, không qua tối ưu ảnh của Next */}
              <img src={assetUrl(a.key)} alt={a.caption || a.fileName} loading="lazy" draggable={false} style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 6, background: "var(--bg)" }} />
            </a>
            <figcaption style={{ width: "100%" }}>
              <div className="row" style={{ gap: 6 }}>
                <span className="chip">{kindLabel(a.kind)}</span>
                <span className="small" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{a.caption || a.fileName}</span>
              </div>
              <div className="small muted">{fmtDate(a.uploadedAt)} · {Math.ceil(a.size / 1024)} KB</div>
              {canEdit && (
                <div className="row" style={{ gap: 4, marginTop: 6 }}>
                  <button className="btn sm" onClick={() => onInsert(imageMarkdown(a))}>Chèn vào chương</button>
                  <button className="btn sm ghost" onClick={() => void trash(a)}>Bỏ vào thùng rác</button>
                </div>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
