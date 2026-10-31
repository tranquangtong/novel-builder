"use client";
import { proposalHref } from "@/lib/client/links";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtDate } from "@/lib/client/api";
import { useMe, useProject } from "@/lib/client/hooks";
import type { PullSummary } from "@/lib/domain/types";
import { useToast } from "@/components/Toast";

type P = PullSummary & { chapters: { id: string; number: number; title: string }[] };

const STATE_LABEL = { open: "Đang chờ", closed: "Đã đóng", merged: "Đã nhập" } as const;

export default function ProposalsPage() {
  const [state, setState] = useState<"open" | "closed">("open");
  const [onlyContent, setOnlyContent] = useState(true);
  const q = useQuery({ queryKey: ["proposals", state], queryFn: () => api<{ pulls: P[] }>(`/api/proposals?state=${state}`), refetchInterval: 30000 });
  const me = useMe();
  const list = (q.data?.pulls ?? []).filter((p) => !onlyContent || p.contentRelated);
  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Đề xuất chỉnh sửa</h1>
            <div className="sub">Mỗi đề xuất là một pull request do agent (hoặc người khác) mở trên nhánh riêng. Bạn xem trước–sau rồi quyết định nhập vào bản chính.</div>
          </div>
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="tabs" style={{ margin: 0 }}>
            <button className={`tab ${state === "open" ? "active" : ""}`} onClick={() => setState("open")}>Đang chờ</button>
            <button className={`tab ${state === "closed" ? "active" : ""}`} onClick={() => setState("closed")}>Đã xử lý</button>
          </div>
          <label className="small row" style={{ gap: 4 }}><input type="checkbox" checked={onlyContent} onChange={(e) => setOnlyContent(e.target.checked)} /> Chỉ đề xuất liên quan nội dung</label>
          <span className="grow" />
          <button className="btn sm" onClick={() => q.refetch()}>Làm mới</button>
        </div>
        <div className="card">
          {q.isLoading && <div className="empty"><span className="spinner" /></div>}
          {q.error && <div className="banner danger" style={{ margin: 12 }}>{(q.error as Error).message}</div>}
          {q.data && !list.length && <div className="empty">Không có đề xuất nào.</div>}
          <div className="list" data-testid="proposal-list">
            {list.map((p) => (
              <Link key={p.number} href={proposalHref(p.number)} className="list-item" style={{ alignItems: "flex-start" }}>
                <span className="mono small muted" style={{ paddingTop: 2 }}>#{p.number}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{p.title}</span>
                  <span className="small muted" style={{ display: "block" }}>
                    {p.author} · nhánh <span className="mono">{p.headRef}</span> · cập nhật {fmtDate(p.updatedAt)} · {p.files.length} file
                  </span>
                  {p.chapters.length > 0 && <span className="small" style={{ display: "block", marginTop: 2 }}>Chương: {p.chapters.map((c) => `Ch ${c.number} · ${c.title}`).join("; ")}</span>}
                </span>
                <span className={`chip ${p.state === "open" ? "warn" : p.state === "merged" ? "ok" : ""}`}>{STATE_LABEL[p.state]}</span>
              </Link>
            ))}
          </div>
        </div>
        {me.data?.mode === "demo" && <DemoAgentTools />}
      </div>
    </div>
  );
}

function DemoAgentTools() {
  const project = useProject();
  const qc = useQueryClient();
  const toast = useToast();
  const [ch, setCh] = useState<string[]>([]);
  const [canon, setCanon] = useState(false);
  const [mainCh, setMainCh] = useState("");
  const chapters = project.data?.chapters ?? [];
  return (
    <div className="card card-pad" style={{ marginTop: 20, borderStyle: "dashed" }} data-testid="demo-agent-tools">
      <h2>Mô phỏng agent (chỉ có ở chế độ demo)</h2>
      <p className="small muted" style={{ marginTop: 0 }}>Ở chế độ GitHub thật, agent bên ngoài (ví dụ Claude Code) làm việc trực tiếp trên repo theo AGENTS.md. Ở đây bạn có thể giả lập thao tác của agent để thử luồng review.</p>
      <div className="grid cols-2">
        <div>
          <label className="field">Agent mở đề xuất sửa các chương
            <select className="select" multiple size={6} value={ch} onChange={(e) => setCh([...e.target.selectedOptions].map((o) => o.value))} data-testid="demo-propose-chapters">
              {chapters.map((c) => <option key={c.id} value={c.id}>Ch {c.number} · {c.title}</option>)}
            </select>
          </label>
          <label className="small row" style={{ gap: 4, marginTop: 6 }}><input type="checkbox" checked={canon} onChange={(e) => setCanon(e.target.checked)} /> kèm một thay đổi canon</label>
          <button className="btn sm" style={{ marginTop: 8 }} disabled={!ch.length} data-testid="demo-propose" onClick={async () => {
            const r = await api<{ number: number }>("/api/demo/agent", { body: { action: "propose", chapterIds: ch, touchCanon: canon } });
            toast(`Agent mô phỏng đã mở đề xuất #${r.number}.`);
            void qc.invalidateQueries({ queryKey: ["proposals"] });
          }}>Mở đề xuất</button>
        </div>
        <div>
          <label className="field">Agent sửa thẳng bản chính (để thử phát hiện thay đổi bên ngoài)
            <select className="select" value={mainCh} onChange={(e) => setMainCh(e.target.value)} data-testid="demo-main-chapter">
              <option value="">Chọn chương…</option>
              {chapters.map((c) => <option key={c.id} value={c.id}>Ch {c.number} · {c.title}</option>)}
            </select>
          </label>
          <button className="btn sm" style={{ marginTop: 8 }} disabled={!mainCh} data-testid="demo-edit-main" onClick={async () => {
            await api("/api/demo/agent", { body: { action: "edit-main", chapterId: mainCh } });
            toast("Agent mô phỏng đã sửa bản chính.");
            void qc.invalidateQueries({ queryKey: ["project"] });
          }}>Sửa bản chính</button>
        </div>
      </div>
    </div>
  );
}
