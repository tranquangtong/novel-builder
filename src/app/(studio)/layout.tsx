"use client";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IS_CLOUD_BUILD, useConnection } from "@/lib/client/connection";
import { useCloudMe } from "@/lib/client/hooks";
import { Shell } from "@/components/Shell";

const strip = (p: string) => p.replace(/\/+$/, "") || "/";

/**
 * Chưa chọn bộ truyện / chưa kết nối thì chỉ vào được trang chọn:
 * - trên Cloudflare: trang Bộ truyện (/novels);
 * - trên trang tĩnh (GitHub Pages / demo): trang Kết nối (/settings).
 */
function Gate({ children }: { children: React.ReactNode }) {
  const conn = useConnection();
  const cloud = useCloudMe();
  const path = strip(usePathname());
  const router = useRouter();
  // Môi trường (Cloudflare hay trang tĩnh) không đổi lúc chạy. Ghi nhớ lại, vì đổi kết nối sẽ
  // xoá cache truy vấn (qc.clear) — nếu không, Gate sẽ tháo trang xuống trong lúc tải lại.
  const [known, setKnown] = useState<boolean | null>(null);
  if (cloud.isSuccess && known !== !!cloud.data) setKnown(!!cloud.data);
  const isCloud = !!known;
  const loading = known === null;
  const home = isCloud ? "/novels" : "/settings";
  const onPicker = path === "/novels" || path === "/settings";
  useEffect(() => {
    if (loading) return;
    if (conn === null && !onPicker) router.replace(home);
    // Trên Cloudflare, trang Kết nối GitHub/demo không còn cần — gom về trang Bộ truyện.
    else if (isCloud && path === "/settings") router.replace("/novels");
  }, [conn, onPicker, home, isCloud, path, loading, router]);
  if (IS_CLOUD_BUILD && cloud.error) return <CloudLoginError message={cloud.error.message} onRetry={() => void cloud.refetch()} />;
  if (conn === undefined || loading) return null;
  if (conn === null && !onPicker) return null;
  return <Shell conn={conn} cloud={isCloud}>{children}</Shell>;
}

/** Bản Cloudflare: không xác thực được thì báo rõ lý do (không rơi về chế độ GitHub). */
function CloudLoginError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="page" data-testid="cloud-login-error">
      <div className="page-inner" style={{ maxWidth: 640 }}>
        <div className="banner danger" style={{ marginTop: 40 }}>
          <div className="b-body">
            <div className="b-title">Không xác thực được với Cloudflare</div>
            <div className="small">Máy chủ trả lời: <b>{message}</b></div>
            <div className="small" style={{ marginTop: 8 }}>
              Nếu vừa đăng nhập xong mà vẫn thấy lỗi này, nhiều khả năng biến <code>ACCESS_AUD</code> hoặc <code>ACCESS_TEAM_DOMAIN</code> trên GitHub chưa khớp với ứng dụng Access (xem docs/CLOUDFLARE_SETUP.md, bước 6). Gửi ảnh chụp trang này cho Claude.
            </div>
            <div className="b-actions">
              <button className="btn sm primary" onClick={onRetry}>Thử lại</button>
              <a className="btn sm" href="/cdn-cgi/access/logout">Đăng xuất Access rồi đăng nhập lại</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}><Gate>{children}</Gate></Suspense>;
}
