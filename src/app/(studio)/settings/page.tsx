"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { proposalHref } from "@/lib/client/links";
import type { PullSummary } from "@/lib/domain/types";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import { useProject } from "@/lib/client/hooks";
import { clearConnection, DEFAULT_REPO, saveConnection, useConnection } from "@/lib/client/connection";
import { resetBackend } from "@/lib/client/backend";
import { useToast } from "@/components/Toast";

type Step = { step: string; ok: boolean; detail: string };

const TOKEN_URL =
  "https://github.com/settings/personal-access-tokens/new?" +
  new URLSearchParams({
    name: "The Last Miracle Studio",
    description: "Đọc/ghi bản thảo và duyệt đề xuất từ trang The Last Miracle. Chỉ chọn repo bản thảo.",
    contents: "write",
    pull_requests: "write",
    expires_in: "180",
  }).toString();

export default function ConnectPage() {
  const conn = useConnection();
  const project = useProject(!!conn);
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [repo, setRepo] = useState(conn?.mode === "github" ? `${conn.owner}/${conn.repo}` : DEFAULT_REPO);
  const [branch, setBranch] = useState(conn?.mode === "github" ? conn.branch : "main");
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(false);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [busy, setBusy] = useState(false);
  const notInit = (project.error as { code?: string } | null)?.code === "not_initialized";
  // Cấu trúc bản thảo có thể đang nằm trong một đề xuất chưa nhập (ví dụ đề xuất nhập từ Google Docs).
  const pendingInit = useQuery({
    queryKey: ["proposals", "open", "init"],
    enabled: notInit,
    queryFn: () => api<{ pulls: PullSummary[] }>("/api/proposals?state=open"),
    select: (d) => d.pulls.filter((p) => p.files.some((f) => f.path === "content/project.json" && f.status === "added")),
  });

  const diagnose = async () => {
    const r = await api<{ steps: Step[] }>("/api/status/diagnose", { body: {} });
    setSteps(r.steps);
    return r.steps;
  };

  const connect = async () => {
    const m = /^\s*([\w.-]+)\/([\w.-]+)\s*$/.exec(repo);
    if (!m) return toast("Nhập repo dạng chủ-sở-hữu/tên-repo", "error");
    if (!token.trim()) return toast("Dán token vào ô Token", "error");
    setBusy(true);
    try {
      saveConnection({ mode: "github", owner: m[1], repo: m[2], branch: branch.trim() || "main", token: token.trim(), remember });
      resetBackend();
      const s = await diagnose();
      const fatal = s.find((x) => !x.ok && (x.step.startsWith("Token") || x.step.startsWith("Đọc repository")));
      if (fatal) {
        clearConnection();
        toast(`Không kết nối được: ${fatal.detail}`, "error");
        return;
      }
      setToken("");
      await qc.invalidateQueries();
      toast(s.every((x) => x.ok) ? "Đã kết nối." : "Đã kết nối, nhưng còn mục cần xử lý (xem danh sách).");
    } catch (e) {
      clearConnection();
      toast(`Không kết nối được: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Kết nối GitHub</h1>
            <div className="sub">Trang này chạy hoàn toàn trên trình duyệt (GitHub Pages). Bản thảo nằm trong repo private của bạn và chỉ được tải bằng token bạn dán vào đây.</div>
          </div>
        </div>

        {conn && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <h2>Đang kết nối</h2>
            <dl className="kv">
              <dt>Chế độ</dt><dd>{conn.mode === "github" ? <span className="chip info">GitHub</span> : <span className="chip warn">Demo</span>}</dd>
              {conn.mode === "github" && <><dt>Repo bản thảo</dt><dd className="mono">{conn.owner}/{conn.repo} @ {conn.branch}</dd><dt>Token lưu ở</dt><dd>{conn.remember ? "trình duyệt này (đến khi bấm Ngắt kết nối)" : "tab này (mất khi đóng tab)"}</dd></>}
              {conn.mode === "demo" && <><dt>Dữ liệu</dt><dd>IndexedDB của trình duyệt này — không phải bản thảo thật</dd></>}
            </dl>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary" disabled={busy} data-testid="diagnose" onClick={async () => { setBusy(true); try { await diagnose(); } catch (e) { setSteps([{ step: "Kiểm tra", ok: false, detail: e instanceof Error ? e.message : String(e) }]); } finally { setBusy(false); } }}>Kiểm tra kết nối</button>
              {project.data && <button className="btn" onClick={() => router.push("/")}>Vào bản thảo →</button>}
              {conn.mode === "demo" && <button className="btn danger" onClick={async () => {
                if (!window.confirm("Xóa toàn bộ dữ liệu demo trong trình duyệt này và tạo lại?")) return;
                await api("/api/demo/reset", { body: {} });
                await qc.invalidateQueries();
                toast("Đã tạo lại dữ liệu demo.");
              }}>Tạo lại dữ liệu demo</button>}
              <button className="btn ghost" onClick={() => { clearConnection(); setSteps(null); }}>Ngắt kết nối</button>
            </div>
            {notInit && conn.mode === "github" && (pendingInit.data?.length ?? 0) > 0 && (
              <div className="banner info" style={{ marginTop: 12 }} data-testid="pending-init">
                <div className="b-body">
                  <div className="b-title">Cấu trúc bản thảo đang nằm trong một đề xuất chưa nhập</div>
                  <div className="small">Nhánh chính còn trống. Hãy mở đề xuất bên dưới, xem trước và bấm “Chấp nhận toàn bộ & nhập vào bản chính”. Đừng bấm Khởi tạo cấu trúc — sẽ xung đột với đề xuất này.</div>
                  <div className="b-actions">
                    {pendingInit.data!.map((p) => (
                      <Link key={p.number} className="btn sm primary" href={proposalHref(p.number)}>Mở đề xuất #{p.number}: {p.title}</Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {notInit && conn.mode === "github" && !pendingInit.isLoading && (pendingInit.data?.length ?? 0) === 0 && (
              <div className="banner warn" style={{ marginTop: 12 }}>
                <div className="b-body">
                  <div className="b-title">Repo chưa có cấu trúc bản thảo</div>
                  <div className="small">Tạo content/project.json, Act đầu tiên, các thư mục canon/outline/summaries và AGENTS.md trong một commit.</div>
                  <div className="b-actions"><button className="btn sm" onClick={async () => {
                    try {
                      await api("/api/project/init", { body: { title: "The Last Miracle" } });
                      toast("Đã khởi tạo cấu trúc.");
                      await qc.invalidateQueries();
                    } catch (e) {
                      toast(`Không khởi tạo được: ${e instanceof Error ? e.message : e}`, "error");
                    }
                  }}>Khởi tạo cấu trúc</button></div>
                </div>
              </div>
            )}
          </div>
        )}

        {steps && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <h2>Kết quả kiểm tra</h2>
            <div className="checklist" data-testid="diagnose-result">
              {steps.map((x) => <div key={x.step} className="check"><span style={{ color: x.ok ? "var(--ok)" : "var(--danger)" }}>{x.ok ? "✓" : "✗"}</span><span><b>{x.step}</b> — <span className="small">{x.detail}</span></span></div>)}
            </div>
          </div>
        )}

        <div className="grid cols-2" style={{ alignItems: "start" }}>
          <div className="card card-pad grid" style={{ gap: 10 }}>
            <h2 style={{ margin: 0 }}>{conn?.mode === "github" ? "Đổi repo hoặc token" : "Kết nối repo bản thảo"}</h2>
            <label className="field">Repo bản thảo (private)
              <input className="input mono" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="tranquangtong/the-last-miracle-manuscript" data-testid="conn-repo" />
            </label>
            <label className="field">Nhánh chính
              <input className="input mono" value={branch} onChange={(e) => setBranch(e.target.value)} />
            </label>
            <label className="field">Fine-grained personal access token
              <input className="input mono" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" data-testid="conn-token" />
            </label>
            <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Ghi nhớ trên thiết bị này (chỉ bật trên máy riêng của bạn)</label>
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={connect} data-testid="conn-submit">Kết nối & kiểm tra</button>
              {!conn && <button className="btn" data-testid="use-demo" onClick={() => { saveConnection({ mode: "demo" }); resetBackend(); router.push("/"); }}>Thử với dữ liệu demo</button>}
            </div>
            <div className="small muted">Token chỉ được gửi tới <code>api.github.com</code> (trang chặn mọi địa chỉ khác bằng Content-Security-Policy). Không có máy chủ trung gian.</div>
          </div>

          <div className="card card-pad">
            <h2>Tạo token (làm một lần)</h2>
            <ol className="steps">
              <li>Tạo repo <b>private</b> cho bản thảo trên GitHub (tick “Add a README”).</li>
              <li>Mở <a href={TOKEN_URL} target="_blank" rel="noreferrer">trang tạo fine-grained token</a> (đã điền sẵn quyền).</li>
              <li><b>Repository access</b> → <i>Only select repositories</i> → chọn <b>đúng repo bản thảo</b>.</li>
              <li>Kiểm tra quyền: <b>Contents: Read and write</b>, <b>Pull requests: Read and write</b> (Metadata: Read tự có). Không cần quyền nào khác.</li>
              <li>Bấm Generate token, sao chép <code>github_pat_…</code> và dán vào ô bên trái.</li>
            </ol>
            <div className="banner info" style={{ marginTop: 12 }}>
              <div className="small">Token hết hạn sau thời gian bạn chọn (mặc định 180 ngày). Khi hết hạn, tạo token mới và dán lại. Mất máy hoặc nghi lộ token: thu hồi ngay tại GitHub → Settings → Developer settings → Personal access tokens.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
