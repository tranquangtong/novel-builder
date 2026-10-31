"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";

export function LoginForm({ mode, demoHint }: { mode: "demo" | "github"; demoHint: boolean }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  if (mode === "github") {
    return <a className="btn primary" href="/api/auth/github/login" style={{ width: "100%", justifyContent: "center", padding: "10px" }}>Đăng nhập với GitHub</a>;
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
          await api("/api/auth/demo", { body: { passcode: code } });
          router.replace("/");
          router.refresh();
        } catch (e) {
          setErr(e instanceof ApiError ? e.message : String(e));
          setBusy(false);
        }
      }}
      className="grid"
      style={{ gap: 10 }}
    >
      <label className="field">
        Mã truy cập demo
        <input className="input" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoFocus name="passcode" />
      </label>
      {demoHint && <div className="small muted">Mặc định khi chạy local: <code>demo</code> (đặt DEMO_PASSCODE để đổi).</div>}
      {err && <div className="banner danger">{err}</div>}
      <button className="btn primary" disabled={busy} style={{ justifyContent: "center", padding: 10 }}>Vào chế độ demo</button>
    </form>
  );
}
