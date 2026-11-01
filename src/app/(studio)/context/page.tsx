"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, short } from "@/lib/client/api";
import { useProject } from "@/lib/client/hooks";
import { KIND_LABEL, type FileKind } from "@/lib/domain/paths";
import { useToast } from "@/components/Toast";
import { chapterLabel } from "@/lib/domain/labels";

type F = { path: string; title: string; kind: FileKind; stale?: boolean; data: Record<string, unknown> };
type Manifest = { commit: string; repo: string; branch: string; task: string; files: { role: string; path: string; blob: string; label: string; words?: number; stale?: boolean; note?: string }[]; totals: { files: number; chapter_words: number; manuscript_chapters: number }; rules: string[] };

/** "10-11, 14" → [10, 11, 14] */
function parseRanges(s: string): number[] {
  const out = new Set<number>();
  for (const part of s.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b) && i - Math.min(a, b) < 300; i++) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

export default function ContextPackPage() {
  const project = useProject();
  const toast = useToast();
  const [task, setTask] = useState("");
  const [range, setRange] = useState("");
  const [radius, setRadius] = useState(1);
  const [neighborOff, setNeighborOff] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<Set<string>>(new Set());
  const [withSummaries, setWithSummaries] = useState(true);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [busy, setBusy] = useState(false);
  const all = useQuery({
    queryKey: ["pack-files"],
    queryFn: async () => (await Promise.all(["content/canon/", "content/outlines/", "content/summaries/"].map((p) => api<{ files: F[] }>(`/api/files?prefix=${p}`)))).flatMap((x) => x.files).filter((f) => !f.path.endsWith(".gitkeep")),
  });
  const chapters = useMemo(() => (project.data?.chapters ?? []).filter((c) => !c.note), [project.data]);
  const notes = useMemo(() => (project.data?.chapters ?? []).filter((c) => c.note), [project.data]);
  const targets = useMemo(() => {
    const nums = new Set(parseRanges(range));
    return chapters.filter((c) => nums.has(c.number));
  }, [range, chapters]);
  const neighbors = useMemo(() => {
    const t = new Set(targets.map((c) => c.number));
    const n = new Set<number>();
    for (const x of t) for (let d = 1; d <= radius; d++) { n.add(x - d); n.add(x + d); }
    return chapters.filter((c) => n.has(c.number) && !t.has(c.number));
  }, [targets, radius, chapters]);

  const groups = useMemo(() => {
    const g = new Map<FileKind, F[]>();
    for (const f of all.data ?? []) g.set(f.kind, [...(g.get(f.kind) ?? []), f]);
    return [...g.entries()];
  }, [all.data]);

  const build = async () => {
    setBusy(true);
    try {
      setManifest(await api<Manifest>("/api/context-pack", { body: { task, targets: targets.map((c) => c.id), neighbors: neighbors.filter((c) => !neighborOff.has(c.id)).map((c) => c.id), files: [...files], includeSummariesForNeighbors: withSummaries } }));
    } catch (e) {
      toast(`Không tạo được gói: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setBusy(false);
    }
  };
  const json = manifest ? JSON.stringify(manifest, null, 2) : "";
  const md = manifest ? toMarkdown(manifest) : "";
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      toast("Đã sao chép.");
    } catch {
      toast("Trình duyệt không cho sao chép — hãy dùng nút Tải xuống.", "error");
    }
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = `goi-tai-lieu-${short(manifest?.commit)}.json`;
    a.click();
  };

  return (
    <div className="page">
      <div className="page-inner" style={{ maxWidth: 1240 }}>
        <div className="page-head">
          <div>
            <h1>Gói tài liệu cho nhiệm vụ</h1>
            <div className="sub">Chọn đúng phạm vi cho agent. Gói chỉ chứa đường dẫn và phiên bản nguồn (blob sha) tại một commit cố định — không nạp toàn bộ bản thảo.</div>
          </div>
        </div>
        <div className="grid cols-2" style={{ alignItems: "start" }}>
          <div className="grid" style={{ gap: 14 }}>
            <div className="card card-pad grid" style={{ gap: 10 }}>
              <label className="field">Nhiệm vụ<textarea className="textarea" value={task} onChange={(e) => setTask(e.target.value)} placeholder="Ví dụ: Kiểm tra continuity Ch 10–11 với canon Kiếm Tro; chỉ sửa lỗi continuity, không đổi giọng văn." /></label>
              <label className="field">Chương cần xử lý (số chương, ví dụ “10-11, 14”)<input className="input" value={range} onChange={(e) => setRange(e.target.value)} data-testid="pack-range" /></label>
              <div className="small">{targets.length ? targets.map((c) => `Ch ${c.number} · ${c.title}`).join("; ") : <span className="muted">Chưa chọn chương.</span>}</div>
              <label className="field" style={{ maxWidth: 220 }}>Chương lân cận mỗi bên
                <input className="input" type="number" min={0} max={5} value={radius} onChange={(e) => setRadius(Math.max(0, Math.min(5, Number(e.target.value) || 0)))} />
              </label>
              {neighbors.map((c) => (
                <label key={c.id} className="check"><input type="checkbox" checked={!neighborOff.has(c.id)} onChange={(e) => setNeighborOff((s) => { const n = new Set(s); if (e.target.checked) n.delete(c.id); else n.add(c.id); return n; })} /> {chapterLabel(c)}</label>
              ))}
              <label className="check"><input type="checkbox" checked={withSummaries} onChange={(e) => setWithSummaries(e.target.checked)} /> Kèm tóm tắt của chương lân cận (nếu có)</label>
            </div>
            <div className="card card-pad">
              <h2>Ghi chú Act 0, tóm tắt, hồ sơ</h2>
              {notes.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div className="pane-label">Act 0 · Outline & Trivia</div>
                  <div className="checklist">
                    {notes.map((n) => (
                      <label key={n.id} className="check">
                        <input type="checkbox" checked={files.has(n.path)} onChange={(e) => setFiles((s) => { const x = new Set(s); if (e.target.checked) x.add(n.path); else x.delete(n.path); return x; })} />
                        {n.title}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {groups.map(([kind, fs]) => (
                <div key={kind} style={{ marginBottom: 10 }}>
                  <div className="pane-label">{KIND_LABEL[kind]}</div>
                  <div className="checklist">
                    {fs.map((f) => (
                      <label key={f.path} className="check">
                        <input type="checkbox" checked={files.has(f.path)} onChange={(e) => setFiles((s) => { const n = new Set(s); if (e.target.checked) n.add(f.path); else n.delete(f.path); return n; })} />
                        {f.title} {f.data.status === "proposed" && <span className="chip warn">đề xuất</span>} {f.stale && <span className="chip warn">tóm tắt đã cũ</span>}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div><button className="btn primary" disabled={!targets.length || busy} onClick={build} data-testid="pack-build">Tạo gói tài liệu</button></div>
          </div>
          <div className="card card-pad">
            <h2>Manifest</h2>
            {!manifest && <div className="small muted">Chưa tạo.</div>}
            {manifest && (
              <>
                <div className="small muted" style={{ marginBottom: 8 }}>{manifest.totals.files} file · {manifest.totals.chapter_words.toLocaleString("vi-VN")} chữ chương · trên tổng {manifest.totals.manuscript_chapters} chương · commit <span className="mono">{short(manifest.commit)}</span></div>
                {manifest.files.some((f) => f.stale) && <div className="banner warn" style={{ marginBottom: 8 }}><div className="small">Có tóm tắt đã cũ trong gói — agent cần đọc nguyên văn để xác minh.</div></div>}
                <div className="row" style={{ marginBottom: 8 }}>
                  <button className="btn sm" onClick={() => copy(json)}>Sao chép JSON</button>
                  <button className="btn sm" onClick={() => copy(md)}>Sao chép dạng prompt</button>
                  <button className="btn sm" onClick={download}>Tải JSON</button>
                </div>
                <pre className="code-block" data-testid="pack-manifest" style={{ maxHeight: 640 }}>{json}</pre>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function toMarkdown(m: Manifest) {
  const lines = [
    `# Nhiệm vụ`, m.task || "(chưa ghi)", "",
    `Repository: ${m.repo} · nhánh ${m.branch} · commit ${m.commit}`, "",
    "## Quy tắc", ...m.rules.map((r) => `- ${r}`), "",
    "## File trong phạm vi",
    ...m.files.map((f) => `- [${f.role}] ${f.path} (blob ${f.blob.slice(0, 12)}) — ${f.label}${f.stale ? " — TÓM TẮT ĐÃ CŨ" : ""}${f.note ? ` — ${f.note}` : ""}`),
  ];
  return lines.join("\n");
}
