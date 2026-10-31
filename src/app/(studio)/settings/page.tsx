"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import { useProject } from "@/lib/client/hooks";
import { useToast } from "@/components/Toast";

type Status = { mode: "demo" | "github"; repo: string; branch: string; allowedLogin: string | null; missing: string[]; env: Record<string, boolean> };
type Step = { step: string; ok: boolean; detail: string };

export default function SettingsPage() {
  const st = useQuery({ queryKey: ["status"], queryFn: () => api<Status>("/api/status") });
  const project = useProject();
  const qc = useQueryClient();
  const toast = useToast();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [busy, setBusy] = useState(false);
  const s = st.data;
  const notInit = (project.error as { code?: string } | null)?.code === "not_initialized";
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-app.example";

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Kết nối GitHub</h1>
            <div className="sub">Thiết lập kỹ thuật. Phần này dùng thuật ngữ Git/GitHub chính xác.</div>
          </div>
        </div>
        {s && (
          <div className="grid cols-2" style={{ marginBottom: 16 }}>
            <div className="card card-pad">
              <h2>Trạng thái</h2>
              <dl className="kv">
                <dt>Chế độ</dt><dd>{s.mode === "github" ? <span className="chip info">GitHub</span> : <span className="chip warn">Demo</span>}</dd>
                <dt>Repository</dt><dd className="mono">{s.repo}</dd>
                <dt>Nhánh chính</dt><dd className="mono">{s.branch}</dd>
                <dt>Chủ sở hữu được phép</dt><dd className="mono">{s.allowedLogin ?? "—"}</dd>
              </dl>
              {s.missing.length > 0 && <div className="banner danger" style={{ marginTop: 12 }}><div className="small">Thiếu: {s.missing.join(", ")}</div></div>}
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn primary" disabled={busy} data-testid="diagnose" onClick={async () => {
                  setBusy(true);
                  try {
                    setSteps((await api<{ steps: Step[] }>("/api/status/diagnose", { body: {} })).steps);
                  } catch (e) {
                    setSteps([{ step: "Kiểm tra", ok: false, detail: e instanceof Error ? e.message : String(e) }]);
                  } finally {
                    setBusy(false);
                  }
                }}>Kiểm tra kết nối thật</button>
                {s.mode === "demo" && <button className="btn danger" onClick={async () => {
                  if (!window.confirm("Xóa toàn bộ dữ liệu demo và tạo lại từ đầu?")) return;
                  await api("/api/demo/reset", { body: {} });
                  await qc.invalidateQueries();
                  toast("Đã tạo lại dữ liệu demo.");
                }}>Tạo lại dữ liệu demo</button>}
              </div>
              {steps && (
                <div className="checklist" style={{ marginTop: 12 }} data-testid="diagnose-result">
                  {steps.map((x) => <div key={x.step} className="check"><span style={{ color: x.ok ? "var(--ok)" : "var(--danger)" }}>{x.ok ? "✓" : "✗"}</span><span><b>{x.step}</b> — <span className="small">{x.detail}</span></span></div>)}
                </div>
              )}
              {notInit && s.mode === "github" && (
                <div className="banner warn" style={{ marginTop: 12 }}>
                  <div className="b-body">
                    <div className="b-title">Repository chưa có cấu trúc bản thảo</div>
                    <div className="small">Tạo content/project.json, một Act đầu tiên, các thư mục canon/outline/summaries và AGENTS.md trong một commit.</div>
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
            <div className="card card-pad">
              <h2>Biến môi trường trên máy chủ</h2>
              <div className="small muted" style={{ marginBottom: 8 }}>Chỉ hiển thị biến nào đã được đặt — không bao giờ hiển thị giá trị.</div>
              <div className="checklist">
                {Object.entries(s.env).map(([k, v]) => <div key={k} className="check"><span style={{ color: v ? "var(--ok)" : "var(--muted)" }}>{v ? "●" : "○"}</span><code>{k}</code></div>)}
              </div>
            </div>
          </div>
        )}
        <div className="card card-pad">
          <h2>Hướng dẫn kết nối GitHub thật</h2>
          <ol className="steps">
            <li>Tạo <b>private repository</b> cho bản thảo (ví dụ <code>the-last-miracle-manuscript</code>), khởi tạo với README để có nhánh <code>main</code>.</li>
            <li>
              Tạo GitHub App: <i>Settings → Developer settings → GitHub Apps → New GitHub App</i>.
              <ul className="small">
                <li>Callback URL: <code>{origin}/api/auth/github/callback</code></li>
                <li>Tắt Webhook (bản này không cần).</li>
                <li>Repository permissions: <b>Contents: Read and write</b>, <b>Pull requests: Read and write</b>, Metadata: Read-only (bắt buộc). Không cần quyền nào khác.</li>
                <li>“Where can this GitHub App be installed?” → Only on this account.</li>
              </ul>
            </li>
            <li>Tạo <b>client secret</b> và <b>private key</b> (file .pem) trong trang của App.</li>
            <li><b>Install App</b> → chọn “Only select repositories” → chỉ repo bản thảo. Lấy <code>installation id</code> từ URL trang cài đặt (…/installations/<b>12345678</b>).</li>
            <li>Đặt biến môi trường theo <code>.env.example</code> (<code>DATA_MODE=github</code>, App ID, Client ID/Secret, private key, installation id, owner/repo, <code>ALLOWED_GITHUB_LOGIN</code>, <code>SESSION_SECRET</code>), khởi động lại máy chủ.</li>
            <li>Đăng nhập bằng GitHub, bấm “Kiểm tra kết nối thật”. Nếu repo trống cấu trúc, bấm “Khởi tạo cấu trúc”.</li>
          </ol>
          <div className="banner info" style={{ marginTop: 14 }}>
            <div className="small">
              <b>Danh tính khi ghi:</b> mọi thao tác với repo dùng installation token của GitHub App (chỉ ở máy chủ). Commit ghi tác giả là tài khoản của bạn; bình luận/review hiển thị là <code>&lt;app&gt;[bot]</code> kèm tên bạn. Token đăng nhập của bạn chỉ dùng để xác minh danh tính rồi bỏ đi.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
