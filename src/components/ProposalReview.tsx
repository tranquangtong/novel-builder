"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, fmtDate, short } from "@/lib/client/api";
import { parseChapter } from "@/lib/domain/chapter";
import { parseFrontmatter } from "@/lib/domain/frontmatter";
import { KIND_LABEL, type FileKind } from "@/lib/domain/paths";
import { STATUS_LABEL, type PullDetail } from "@/lib/domain/types";
import { useProject } from "@/lib/client/hooks";
import { DiffView } from "./DiffView";
import { Markdown } from "./Markdown";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

interface PFile {
  path: string;
  status: string;
  kind: FileKind;
  chapter: { id: string; number: number; title: string } | null;
  beforeBlob: string | null;
  afterBlob: string | null;
  changedOnMainSinceBase: boolean;
  before: string | null;
  after: string | null;
}
interface Detail {
  pr: PullDetail;
  files: PFile[];
  otherFiles: string[];
  mainHead: string;
  actor: string | null;
  mode: "demo" | "github";
}

export function ProposalReview({ number }: { number: number }) {
  const toast = useToast();
  const qc = useQueryClient();
  const project = useProject();
  const q = useQuery({ queryKey: ["proposal", number], queryFn: () => api<Detail>(`/api/proposals/${number}`), refetchInterval: 20000, refetchOnWindowFocus: true });
  /** Phiên bản của đề xuất mà tác giả đang xem — dùng khi chấp nhận (merge). */
  const [seen, setSeen] = useState<{ head: string; data: Detail } | null>(null);
  const [active, setActive] = useState(0);
  const [dialog, setDialog] = useState<null | "accept" | "changes" | "close" | "approve">(null);
  const [text, setText] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chốt phiên bản lần đầu mở review
    if (q.data && !seen) setSeen({ head: q.data.pr.headSha, data: q.data });
  }, [q.data, seen]);

  const view = seen?.data;
  const latest = q.data;
  const headMoved = !!(latest && seen && latest.pr.headSha !== seen.head);
  const mainMoved = !!(latest && view && latest.pr.baseHeadSha !== view.pr.baseHeadSha);
  const pr = latest?.pr ?? view?.pr;
  const actorIsAuthor = !!(latest?.actor && pr && latest.actor === pr.author);
  const actStr = useMemo(() => new Map(project.data?.acts.map((a) => [a.id, a.title]) ?? []), [project.data]);

  if (q.error && !view) return <div className="page"><div className="page-inner"><div className="banner danger">{(q.error as Error).message}</div></div></div>;
  if (!view || !pr) return <div className="page"><div className="page-inner"><span className="spinner" /></div></div>;

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      const msg = await fn();
      toast(msg);
      setDialog(null);
      setText("");
      await q.refetch();
      void qc.invalidateQueries({ queryKey: ["proposals"] });
      void qc.invalidateQueries({ queryKey: ["project"] });
    } catch (e) {
      const m = e instanceof ApiError ? (e.code === "head_changed" ? "Đề xuất đã có thay đổi mới sau khi bạn mở. Hãy xem lại trước khi chấp nhận." : e.message) : String(e);
      toast(m, "error");
      setResult(m);
      await q.refetch();
    } finally {
      setBusy(false);
    }
  };

  const f = view.files[active];
  const open = pr.state === "open";

  return (
    <div className="page review-page">
      <div className="page-inner" style={{ maxWidth: 1240 }}>
        <div className="small muted" style={{ marginBottom: 6 }}><Link href="/proposals">← Đề xuất chỉnh sửa</Link></div>
        <div className="page-head">
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 24 }}>#{pr.number} {pr.title}</h1>
            <div className="sub">
              {pr.author} · nhánh <span className="mono">{pr.headRef}</span> → <span className="mono">{pr.baseRef}</span> · mở {fmtDate(pr.createdAt)}
              {pr.url && <> · <a href={pr.url} target="_blank" rel="noreferrer">xem trên GitHub</a></>}
            </div>
          </div>
          <div className="actions">
            <span className={`chip ${pr.state === "open" ? "warn" : pr.state === "merged" ? "ok" : ""}`} data-testid="proposal-state">{pr.state === "open" ? "Đang chờ duyệt" : pr.state === "merged" ? "Đã nhập vào bản chính" : "Đã đóng"}</span>
          </div>
        </div>

        <div className="grid" style={{ gap: 10, marginBottom: 16 }}>
          {headMoved && (
            <div className="banner warn" data-testid="head-moved">
              <div className="b-body">
                <div className="b-title">Đề xuất đã thay đổi sau khi bạn mở review</div>
                <div className="small">Bạn đang xem phiên bản {short(seen!.head)}; agent đã cập nhật thành {short(latest!.pr.headSha)}. Nút “Chấp nhận” chỉ nhập đúng phiên bản bạn đã xem, nên cần xem lại.</div>
                <div className="b-actions"><button className="btn sm" onClick={() => setSeen({ head: latest!.pr.headSha, data: latest! })}>Xem phiên bản mới</button></div>
              </div>
            </div>
          )}
          {mainMoved && !headMoved && open && (
            <div className="banner info"><div className="b-body"><div className="small">Bản chính đã có phiên bản mới ({short(latest!.pr.baseHeadSha)}) từ lúc bạn mở trang. Trạng thái xung đột bên dưới đã được cập nhật.</div></div></div>
          )}
          {open && latest && latest.pr.mergeable === false && (
            <div className="banner danger" data-testid="conflict">
              <div className="b-body">
                <div className="b-title">Xung đột với bản chính — chưa thể nhập</div>
                <div className="small">Bản chính và đề xuất cùng sửa: {latest.pr.conflictFiles.length ? latest.pr.conflictFiles.map((p) => <code key={p} style={{ marginRight: 6 }}>{p}</code>) : "(GitHub không cho biết file cụ thể)"}. Hãy yêu cầu agent cập nhật nhánh từ bản chính, hoặc đóng đề xuất.</div>
              </div>
            </div>
          )}
          {open && latest && latest.pr.mergeable === null && <div className="banner info"><div className="small">GitHub đang kiểm tra khả năng nhập… (trạng thái: {latest.pr.mergeableState})</div></div>}
          {result && <div className="banner danger"><div className="b-body small">{result}</div><button className="btn sm ghost" onClick={() => setResult(null)}>✕</button></div>}
        </div>

        <div className="two-col review-cols" style={{ gridTemplateColumns: "300px minmax(0,1fr)" }}>
          <div className="grid review-col" style={{ gap: 12, minWidth: 0 }} data-testid="review-col-left">
            <div className="card card-pad">
              <h2>Mô tả của agent</h2>
              {pr.body ? <Markdown compact text={pr.body} /> : <div className="small muted">Không có mô tả.</div>}
            </div>
            <div className="card">
              <div className="card-pad" style={{ paddingBottom: 6 }}><h2 style={{ margin: 0 }}>File thay đổi ({view.files.length + view.otherFiles.length})</h2></div>
              <div className="list">
                {view.files.map((x, i) => (
                  <button key={x.path} className={`list-item ${i === active ? "active" : ""}`} onClick={() => setActive(i)} data-testid="proposal-file">
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 500 }}>{x.chapter ? `Ch ${x.chapter.number} · ${x.chapter.title}` : x.path.split("/").pop()}</span>
                      <span className="small muted">{KIND_LABEL[x.kind]} · {x.status === "added" ? "thêm mới" : x.status === "removed" ? "xóa" : "sửa"}</span>
                      {x.changedOnMainSinceBase && <span className="chip warn" style={{ marginTop: 4 }}>bản chính cũng đã sửa</span>}
                    </span>
                  </button>
                ))}
                {view.otherFiles.map((p) => <div key={p} className="list-item small muted">{p} (không phải nội dung)</div>)}
              </div>
            </div>
            {open && (
              <div className="card card-pad grid decision" style={{ gap: 8 }}>
                <h2 style={{ margin: 0 }}>Quyết định</h2>
                <button className="btn primary" disabled={busy || headMoved || latest?.pr.mergeable !== true} onClick={() => setDialog("accept")} data-testid="accept">Chấp nhận toàn bộ & nhập vào bản chính</button>
                {!busy && (headMoved || latest?.pr.mergeable !== true) && (
                  <div className="small" style={{ color: "var(--warn)" }} data-testid="accept-blocked">
                    {headMoved
                      ? "Chưa nhập được: đề xuất vừa thay đổi — bấm “Xem phiên bản mới” ở trên."
                      : latest?.pr.mergeable === false
                        ? "Chưa nhập được: đề xuất xung đột với bản chính (xem khung đỏ ở trên). Nhờ agent cập nhật đề xuất từ bản chính, rồi tải lại trang."
                        : "GitHub đang kiểm tra khả năng nhập — trang tự cập nhật sau vài giây."}
                  </div>
                )}
                <button className="btn" disabled={busy} onClick={() => setDialog("changes")} data-testid="request-changes">Yêu cầu sửa…</button>
                <button className="btn danger" disabled={busy} onClick={() => setDialog("close")} data-testid="close-proposal">Đóng đề xuất…</button>
                <div className="small muted">Chấp nhận từng câu/đoạn riêng lẻ chưa có trong bản này — hiện chỉ có thể nhập toàn bộ đề xuất.</div>
                <details className="small">
                  <summary style={{ cursor: "pointer" }}>Approval chính thức trên GitHub</summary>
                  <p className="muted">“Chấp nhận” ở trên là thao tác của ứng dụng: nhập đề xuất vào bản chính (merge). Approval chính thức là một review “Approve” trên GitHub, chỉ cần nếu repo có quy tắc bắt buộc review. GitHub không cho tác giả PR tự approve PR của mình{view.mode === "github" ? `; review từ trang này được gửi bằng tài khoản của token (${latest?.actor ?? "?"}). Nếu agent mở PR bằng chính tài khoản đó thì không approve được — điều này không ảnh hưởng tới “Chấp nhận”` : ""}.</p>
                  <button className="btn sm" disabled={busy || actorIsAuthor} onClick={() => setDialog("approve")}>Gửi approval chính thức</button>
                  {actorIsAuthor && <div className="muted">Không khả dụng: đề xuất này do chính danh tính {latest?.actor} tạo.</div>}
                </details>
              </div>
            )}
          </div>

          <div className="grid review-col" style={{ gap: 12, minWidth: 0 }} data-testid="review-col-right">
            {f ? <FileDiff file={f} actStr={actStr} /> : <div className="card empty">Đề xuất không có file nội dung.</div>}
            <div className="card card-pad">
              <h2>Thảo luận</h2>
              <div className="grid" style={{ gap: 10 }}>
                {(latest?.pr.comments ?? view.pr.comments).map((c) => (
                  <div key={c.id} className="version-item" data-testid="comment">
                    <div style={{ flex: 1 }}>
                      <div className="muted">{c.author} · {fmtDate(c.createdAt)} {c.kind === "review" && <span className={`chip ${c.reviewState === "APPROVED" ? "ok" : c.reviewState === "CHANGES_REQUESTED" ? "danger" : ""}`}>{c.reviewState === "APPROVED" ? "approval" : c.reviewState === "CHANGES_REQUESTED" ? "yêu cầu sửa" : "review"}</span>}</div>
                      <Markdown compact text={c.body} />
                    </div>
                  </div>
                ))}
                {!(latest?.pr.comments ?? view.pr.comments).length && <div className="small muted">Chưa có bình luận.</div>}
                <textarea className="textarea" placeholder="Bình luận chung cho đề xuất…" value={comment} onChange={(e) => setComment(e.target.value)} data-testid="comment-input" />
                <div><button className="btn" disabled={!comment.trim() || busy} data-testid="comment-send" onClick={() => run(async () => {
                  await api(`/api/proposals/${number}/comment`, { body: { body: comment } });
                  setComment("");
                  return "Đã gửi bình luận.";
                })}>Gửi bình luận</button></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {dialog === "accept" && (
        <Modal title="Chấp nhận toàn bộ đề xuất?" narrow onClose={() => setDialog(null)} footer={<>
          <button className="btn" onClick={() => setDialog(null)}>Hủy</button>
          <button className="btn primary" disabled={busy} data-testid="confirm-accept" onClick={() => run(async () => {
            const r = await api<{ sha: string }>(`/api/proposals/${number}/merge`, { body: { expectedHeadSha: seen!.head } });
            return `Đã nhập đề xuất vào bản chính (phiên bản ${short(r.sha)}).`;
          })}>Nhập vào bản chính</button>
        </>}>
          <p>Toàn bộ {view.files.length} file trong đề xuất (phiên bản <span className="mono">{short(seen!.head)}</span> mà bạn đã xem) sẽ được nhập vào bản chính bằng một phiên bản mới. Lịch sử được giữ nguyên; có thể phục hồi từng chương sau này.</p>
          {view.files.some((x) => x.kind.startsWith("canon")) && <div className="banner warn">Đề xuất này có thay đổi canon.</div>}
        </Modal>
      )}
      {dialog === "changes" && (
        <Modal title="Yêu cầu agent sửa" narrow onClose={() => setDialog(null)} footer={<>
          <button className="btn" onClick={() => setDialog(null)}>Hủy</button>
          <button className="btn primary" disabled={busy || !text.trim()} onClick={() => run(async () => {
            const r = await api<{ delivered: string; note?: string }>(`/api/proposals/${number}/review`, { body: { event: "REQUEST_CHANGES", body: text } });
            return r.delivered === "comment" ? `Đã gửi dưới dạng bình luận. ${r.note ?? ""}` : "Đã gửi yêu cầu sửa.";
          })}>Gửi yêu cầu sửa</button>
        </>}>
          <textarea className="textarea" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Cần sửa gì? Ví dụ: giữ nguyên đối thoại của Rei ở đoạn 3, chỉ sửa lỗi continuity." />
        </Modal>
      )}
      {dialog === "close" && (
        <Modal title="Đóng đề xuất mà không nhập?" narrow onClose={() => setDialog(null)} footer={<>
          <button className="btn" onClick={() => setDialog(null)}>Hủy</button>
          <button className="btn danger" disabled={busy} data-testid="confirm-close" onClick={() => run(async () => {
            await api(`/api/proposals/${number}/close`, { body: { reason: text } });
            return "Đã đóng đề xuất.";
          })}>Đóng đề xuất</button>
        </>}>
          <label className="field">Lý do (tùy chọn, sẽ gửi thành bình luận)<textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} /></label>
        </Modal>
      )}
      {dialog === "approve" && (
        <Modal title="Gửi approval chính thức trên GitHub" narrow onClose={() => setDialog(null)} footer={<>
          <button className="btn" onClick={() => setDialog(null)}>Hủy</button>
          <button className="btn primary" disabled={busy} onClick={() => run(async () => {
            await api(`/api/proposals/${number}/review`, { body: { event: "APPROVE", body: text } });
            return "Đã gửi approval chính thức. (Đề xuất CHƯA được nhập — bấm “Chấp nhận” để nhập.)";
          })}>Gửi approval</button>
        </>}>
          <p className="small">Approval không nhập đề xuất vào bản chính. Nó chỉ ghi nhận một review “Approve” trên GitHub.</p>
          <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ghi chú (tùy chọn)" />
        </Modal>
      )}
    </div>
  );
}

function FileDiff({ file, actStr }: { file: PFile; actStr: Map<string, string> }) {
  if (file.kind === "chapter") {
    const b = file.before ? safeChapter(file.before) : null;
    const a = file.after ? safeChapter(file.after) : null;
    const metaChanges: string[] = [];
    if (b && a) {
      if (b.meta.title !== a.meta.title) metaChanges.push(`Tiêu đề: “${b.meta.title}” → “${a.meta.title}”`);
      if (b.meta.act_id !== a.meta.act_id) metaChanges.push(`Act: ${actStr.get(b.meta.act_id) ?? b.meta.act_id} → ${actStr.get(a.meta.act_id) ?? a.meta.act_id}`);
      if (b.meta.status !== a.meta.status) metaChanges.push(`Trạng thái: ${STATUS_LABEL[b.meta.status]} → ${STATUS_LABEL[a.meta.status]}`);
      if (b.meta.order !== a.meta.order) metaChanges.push(`Thứ tự: ${b.meta.order} → ${a.meta.order}`);
      if ((b.meta.pov ?? "") !== (a.meta.pov ?? "")) metaChanges.push(`POV: ${b.meta.pov ?? "—"} → ${a.meta.pov ?? "—"}`);
      if (b.meta.id !== a.meta.id) metaChanges.push(`⚠ ID bị đổi: ${b.meta.id} → ${a.meta.id}`);
    }
    return (
      <div className="card card-pad">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-prose)", fontSize: 18 }}>{file.chapter ? `Ch ${file.chapter.number} · ${file.chapter.title}` : file.path}</h2>
          <span className="mono small muted">{file.path}</span>
        </div>
        {file.changedOnMainSinceBase && <div className="banner warn" style={{ marginBottom: 10 }}><div className="small">Bản chính đã sửa chương này sau khi agent bắt đầu. “Trước” bên dưới là bản agent dựa vào, không phải bản chính hiện tại.</div></div>}
        {metaChanges.length > 0 && <div className="banner info" style={{ marginBottom: 10 }}><div className="small">{metaChanges.map((m) => <div key={m}>{m}</div>)}</div></div>}
        <DiffView before={b?.body ?? ""} after={a?.body ?? ""} beforeLabel="Trước" afterLabel="Sau" />
      </div>
    );
  }
  const isMd = file.path.endsWith(".md");
  const split = (t: string | null) => {
    if (!t) return { fm: "", body: "" };
    try {
      const p = parseFrontmatter(t);
      return { fm: p.hasFrontmatter ? t.slice(0, t.length - p.body.length) : "", body: p.body };
    } catch {
      return { fm: "", body: t };
    }
  };
  const b = split(file.before), a = split(file.after);
  return (
    <div className="card card-pad">
      <div className="row" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{KIND_LABEL[file.kind]}</h2>
        <span className="mono small muted">{file.path}</span>
      </div>
      {file.kind.startsWith("canon") && <div className="banner warn" style={{ marginBottom: 10 }}><div className="small"><b>Thay đổi canon.</b> Kiểm tra mô tả đề xuất đã nêu rõ ảnh hưởng chưa.</div></div>}
      {(b.fm || a.fm) && b.fm !== a.fm && <><div className="pane-label">Thuộc tính (frontmatter)</div><DiffView before={b.fm} after={a.fm} prose={false} /><div style={{ height: 12 }} /></>}
      <DiffView before={isMd ? b.body : file.before ?? ""} after={isMd ? a.body : file.after ?? ""} prose={isMd} />
    </div>
  );
}

function safeChapter(t: string) {
  try {
    return parseChapter(t, "unknown");
  } catch {
    return { meta: { id: "?", title: "?", act_id: "", order: 0, status: "draft" as const }, body: t, extra: {} };
  }
}
