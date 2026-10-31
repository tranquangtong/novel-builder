"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import { useProject } from "@/lib/client/hooks";
import { parseImport, type ImportResult } from "@/lib/domain/importer";
import { formatNumber } from "@/lib/domain/wordcount";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

type Action = "new" | "replace" | "skip";
interface Row { action: Action; title: string; act: string; replaceId?: string }

export default function ImportExportPage() {
  const project = useProject();
  const qc = useQueryClient();
  const toast = useToast();
  const [source, setSource] = useState<{ name: string; text: string } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [peek, setPeek] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ commitSha: string; ids: string[] } | null>(null);
  const snap = project.data;
  const parsed: ImportResult | null = useMemo(() => (source ? parseImport(source.text, source.name) : null), [source]);

  const load = (name: string, text: string) => {
    const r = parseImport(text, name);
    setSource({ name, text });
    setDone(null);
    const actByLabel = new Map<string, string>();
    r.acts.forEach((a, i) => actByLabel.set(a, `new:${i}`));
    const defaultAct = snap?.acts.at(-1)?.id ?? "";
    setRows(r.chapters.map((c) => {
      const existing = snap?.chapters.find((x) => x.number === c.number);
      const idClash = c.frontmatterId && snap?.chapters.some((x) => x.id === c.frontmatterId);
      return {
        action: c.isPreamble || existing || idClash ? "skip" : "new",
        title: c.title,
        act: c.actLabel ? actByLabel.get(c.actLabel)! : defaultAct,
      };
    }));
  };

  const warningsFor = (i: number) => {
    const c = parsed!.chapters[i];
    const w = [...c.warnings];
    const existing = snap?.chapters.find((x) => x.number === c.number);
    if (existing) w.push(`Bản thảo đã có Ch ${existing.number}: “${existing.title}” — mặc định bỏ qua, không ghi đè.`);
    if (c.frontmatterId && snap?.chapters.some((x) => x.id === c.frontmatterId)) w.push(`ID ${c.frontmatterId} đã tồn tại.`);
    return w;
  };

  const confirm = async () => {
    if (!parsed || !snap) return;
    setBusy(true);
    try {
      const items = rows.map((r, i) => ({ r, c: parsed.chapters[i] })).filter(({ r }) => r.action !== "skip").map(({ r, c }) => {
        const target = r.action === "replace" ? snap.chapters.find((x) => x.id === r.replaceId) : undefined;
        return { title: r.title, body: c.body, act: r.act, action: r.action as "new" | "replace", replaceId: target?.id, replaceBlob: target?.blob, keepId: r.action === "new" && c.frontmatterId && !snap.chapters.some((x) => x.id === c.frontmatterId) ? c.frontmatterId : undefined };
      });
      const usedNew = new Set(items.map((i) => i.act).filter((a) => a.startsWith("new:")).map((a) => a.slice(4)));
      const newActs = parsed.acts.map((t, i) => ({ key: String(i), title: t })).filter((a) => usedNew.has(a.key));
      const r = await api<{ commitSha: string; ids: string[] }>("/api/import", { body: { items, newActs, sourceName: source?.name } });
      setDone(r);
      toast(`Đã nhập ${r.ids.length} chương trong một phiên bản.`);
      await qc.invalidateQueries({ queryKey: ["project"] });
    } catch (e) {
      toast(`Nhập thất bại, không có gì được ghi: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const selected = rows.filter((r) => r.action !== "skip").length;

  return (
    <div className="page">
      <div className="page-inner" style={{ maxWidth: 1240 }}>
        <div className="page-head">
          <div>
            <h1>Nhập & xuất</h1>
            <div className="sub">Nhập từ Markdown hoặc văn bản thuần. Nguyên văn được giữ nguyên — không sửa câu chữ, dấu câu hay tình tiết.</div>
          </div>
        </div>

        <div className="grid cols-2" style={{ marginBottom: 18 }}>
          <div className="card card-pad">
            <h2>Nhập bản thảo</h2>
            <p className="small muted" style={{ marginTop: 0 }}>Từ Google Docs: <b>Tệp → Tải xuống → Văn bản thuần (.txt)</b> hoặc <b>Markdown (.md)</b>, rồi chọn file ở đây. Ứng dụng <b>không</b> đọc trực tiếp từ URL Google Docs (chưa có tích hợp). Tiêu đề được nhận diện: “Chương 12: …”, “Chapter 12 – …”, “# Chương 12”, và “Act/Hồi/Phần II …”.</p>
            <input type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" data-testid="import-file" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) load(f.name, await f.text());
            }} />
            <details style={{ marginTop: 10 }}>
              <summary className="small" style={{ cursor: "pointer" }}>…hoặc dán văn bản</summary>
              <PasteBox onLoad={(t) => load("dan-van-ban.txt", t)} />
            </details>
          </div>
          <div className="card card-pad">
            <h2>Xuất</h2>
            <div className="grid" style={{ gap: 8 }}>
              <a className="btn" href="/api/export">Tải toàn bộ bản thảo (.md)</a>
              <div className="small muted">Toàn bộ chương theo thứ tự, có tiêu đề Act. Xuất từng chương: mở chương → “Xuất .md”. DOCX/PDF để giai đoạn sau.</div>
            </div>
            <div className="banner info" style={{ marginTop: 12 }}>
              <div className="small"><b>Nguồn chính sau khi chuyển:</b> repository là bản chính duy nhất. Không có đồng bộ hai chiều với Google Docs — sau khi nhập, hãy coi Google Docs là bản lưu trữ chỉ đọc.</div>
            </div>
          </div>
        </div>

        {parsed && snap && !done && (
          <div className="card card-pad">
            <div className="row" style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0, flex: 1 }}>Xem trước: {source?.name} — nhận diện {parsed.chapters.filter((c) => !c.isPreamble).length} chương{parsed.acts.length ? `, ${parsed.acts.length} Act` : ""}</h2>
              <button className="btn" onClick={() => setSource(null)}>Hủy</button>
              <button className="btn primary" disabled={!selected || busy} onClick={confirm} data-testid="import-confirm">Nhập {selected} chương</button>
            </div>
            {parsed.lineEndingsNormalized && <div className="small muted">Xuống dòng kiểu Windows (CRLF) sẽ được chuẩn hóa thành LF; ngoài ra nội dung giữ nguyên.</div>}
            {parsed.warnings.map((w) => <div key={w} className="banner warn" style={{ marginTop: 8 }}><div className="small">{w}</div></div>)}
            <table className="table" style={{ marginTop: 12 }} data-testid="import-preview">
              <thead><tr><th>#</th><th>Tiêu đề</th><th>Act</th><th className="num">Chữ</th><th>Cảnh báo</th><th>Hành động</th><th></th></tr></thead>
              <tbody>
                {parsed.chapters.map((c, i) => {
                  const r = rows[i];
                  if (!r) return null;
                  const w = warningsFor(i);
                  const set = (p: Partial<Row>) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...p } : x)));
                  return (
                    <tr key={i} style={{ opacity: r.action === "skip" ? 0.6 : 1 }}>
                      <td className="num muted">{c.number ?? "—"}</td>
                      <td><input className="input" value={r.title} onChange={(e) => set({ title: e.target.value })} /></td>
                      <td>
                        <select className="select" value={r.act} onChange={(e) => set({ act: e.target.value })} disabled={r.action === "replace"}>
                          {snap.acts.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                          {parsed.acts.map((a, k) => <option key={`n${k}`} value={`new:${k}`}>+ Act mới: {a}</option>)}
                        </select>
                      </td>
                      <td className="num">{formatNumber(c.words)}</td>
                      <td className="small" style={{ color: w.length ? "var(--warn)" : "var(--muted)" }}>{w.length ? w.map((x) => <div key={x}>• {x}</div>) : "—"}</td>
                      <td>
                        <select className="select" value={r.action} onChange={(e) => set({ action: e.target.value as Action, replaceId: e.target.value === "replace" ? snap.chapters.find((x) => x.number === c.number)?.id : undefined })} data-testid="import-action">
                          <option value="new">Thêm làm chương mới</option>
                          <option value="skip">Bỏ qua</option>
                          {snap.chapters.some((x) => x.number === c.number) && <option value="replace">Ghi đè Ch {c.number} (tạo phiên bản mới)</option>}
                        </select>
                      </td>
                      <td><button className="btn sm ghost" onClick={() => setPeek(i)}>Xem</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {done && (
          <div className="banner ok">
            <div className="b-body">
              <div className="b-title">Đã nhập {done.ids.length} chương</div>
              <div className="small">Một phiên bản duy nhất: <span className="mono">{done.commitSha.slice(0, 7)}</span>. <Link href="/library">Mở thư viện →</Link></div>
            </div>
          </div>
        )}
      </div>
      {peek !== null && parsed && (
        <Modal title={`Nguyên văn sẽ được nhập: ${parsed.chapters[peek].title}`} onClose={() => setPeek(null)}>
          <div className="small muted" style={{ marginBottom: 8 }}>Bắt đầu ở dòng {parsed.chapters[peek].sourceLine} của file nguồn · {formatNumber(parsed.chapters[peek].words)} chữ</div>
          <pre className="code-block" style={{ fontFamily: "var(--font-prose)", fontSize: 15, maxHeight: "60vh" }}>{parsed.chapters[peek].body}</pre>
        </Modal>
      )}
    </div>
  );
}

function PasteBox({ onLoad }: { onLoad: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <div className="grid" style={{ gap: 8, marginTop: 8 }}>
      <textarea className="textarea" value={t} onChange={(e) => setT(e.target.value)} style={{ minHeight: 140 }} data-testid="import-paste" />
      <div><button className="btn sm" disabled={!t.trim()} onClick={() => onLoad(t)} data-testid="import-paste-load">Phân tích</button></div>
    </div>
  );
}
