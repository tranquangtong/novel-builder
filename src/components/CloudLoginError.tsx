"use client";
import { FIREBASE_ENABLED, signOutEverywhere } from "@/lib/client/firebase";

/** Bản Cloudflare: không xác thực được thì báo rõ lý do (không rơi về chế độ GitHub). */
export function CloudLoginError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="page" data-testid="cloud-login-error">
      <div className="page-inner" style={{ maxWidth: 640 }}>
        <div className="banner danger" style={{ marginTop: 40 }}>
          <div className="b-body">
            <div className="b-title">Không đăng nhập được</div>
            <div className="small">Máy chủ trả lời: <b>{message}</b></div>
            <div className="small" style={{ marginTop: 8 }}>
              {FIREBASE_ENABLED
                ? "Nếu lỗi lặp lại, thử đăng xuất rồi đăng nhập lại bằng tài khoản Google khác. Gửi ảnh chụp trang này cho tác giả nếu vẫn không được."
                : <>Nếu vừa đăng nhập xong mà vẫn thấy lỗi này, nhiều khả năng biến <code>ACCESS_AUD</code> hoặc <code>ACCESS_TEAM_DOMAIN</code> trên GitHub chưa khớp với ứng dụng Access (xem docs/CLOUDFLARE_SETUP.md, bước 6). Gửi ảnh chụp trang này cho Claude.</>}
            </div>
            <div className="b-actions">
              <button className="btn sm primary" onClick={onRetry}>Thử lại</button>
              {FIREBASE_ENABLED
                ? <button className="btn sm" onClick={() => void signOutEverywhere()}>Đăng xuất</button>
                : <a className="btn sm" href="/cdn-cgi/access/logout">Đăng xuất rồi đăng nhập lại</a>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

