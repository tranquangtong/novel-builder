"use client";
import { useState } from "react";
import { signInWithGoogle } from "@/lib/client/firebase";

/** Màn hình đăng nhập (bản Cloudflare có Firebase). */
export function LoginScreen({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="login-wrap" data-testid="login-screen">
      <div className="login-card card card-pad">
        <h1>Novel Builder</h1>
        <p className="muted">Đăng nhập bằng tài khoản Google để đọc truyện.</p>
        <button
          className="btn primary login-google"
          disabled={busy}
          data-testid="login-google"
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await signInWithGoogle();
              onDone();
            } catch (e) {
              const code = (e as { code?: string }).code;
              setErr(code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" ? null : code === "auth/popup-blocked" ? "Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép popup cho trang này rồi thử lại." : `Không đăng nhập được: ${e instanceof Error ? e.message : e}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <><span className="spinner" /> Đang mở Google…</> : "Đăng nhập bằng Google"}
        </button>
        {err && <div className="banner danger" style={{ marginTop: 12 }}><div className="small">{err}</div></div>}
        <p className="small muted" style={{ marginTop: 16 }}>Trang chỉ dùng tên và email Google của bạn để nhận diện người đọc.</p>
      </div>
    </div>
  );
}
