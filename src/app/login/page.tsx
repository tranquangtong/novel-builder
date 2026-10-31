import { redirect } from "next/navigation";
import { getConfig } from "@/lib/server/config";
import { getSession } from "@/lib/server/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  forbidden: "Tài khoản GitHub này không được phép truy cập bản thảo.",
  state: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy thử lại.",
  token: "GitHub không cấp token. Kiểm tra Client ID/Secret và Callback URL.",
  user: "Không đọc được thông tin tài khoản GitHub.",
  not_configured: "Chưa cấu hình GitHub App (xem README).",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSession()) redirect("/");
  const cfg = getConfig();
  const { error } = await searchParams;
  return (
    <main className="login">
      <div className="card login-card">
        <div className="chapter-kicker">Xưởng viết riêng tư</div>
        <h1>The Last Miracle</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          {cfg.mode === "github" ? "Đăng nhập bằng tài khoản GitHub của chủ sở hữu bản thảo." : "Chế độ DEMO — dữ liệu thử, không phải bản thảo thật, không kết nối GitHub."}
        </p>
        {error && <div className="banner danger" style={{ marginTop: 14 }}>{ERRORS[error] ?? "Đăng nhập thất bại."}</div>}
        {cfg.mode === "github" && cfg.missing.length > 0 && (
          <div className="banner warn" style={{ marginTop: 14 }}>
            <div className="b-body">
              <div className="b-title">Thiếu cấu hình máy chủ</div>
              <div className="small">{cfg.missing.join(", ")}</div>
            </div>
          </div>
        )}
        <div style={{ marginTop: 20 }}>
          <LoginForm mode={cfg.mode} demoHint={process.env.NODE_ENV !== "production" && !process.env.DEMO_PASSCODE} />
        </div>
      </div>
    </main>
  );
}
