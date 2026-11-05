"use client";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IS_CLOUD_BUILD, useConnection } from "@/lib/client/connection";
import { CloudAuthError, useCloudMe } from "@/lib/client/hooks";
import { FIREBASE_ENABLED } from "@/lib/client/firebase";
import { LoginScreen } from "@/components/LoginScreen";
import { CloudLoginError } from "@/components/CloudLoginError";
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
    // Người đọc chỉ có chế độ đọc
    if (cloud.data?.role === "viewer") router.replace("/read");
    else if (conn === null && !onPicker) router.replace(home);
    // Trên Cloudflare, trang Kết nối GitHub/demo không còn cần — gom về trang Bộ truyện.
    else if (isCloud && path === "/settings") router.replace("/novels");
  }, [conn, onPicker, home, isCloud, path, loading, router, cloud.data?.role]);
  if (IS_CLOUD_BUILD && cloud.error) {
    if (FIREBASE_ENABLED && cloud.error instanceof CloudAuthError && cloud.error.status === 401) return <LoginScreen onDone={() => void cloud.refetch()} />;
    return <CloudLoginError message={cloud.error.message} onRetry={() => void cloud.refetch()} />;
  }
  if (conn === undefined || loading || cloud.data?.role === "viewer") return null;
  if (conn === null && !onPicker) return null;
  return <Shell conn={conn} cloud={isCloud}>{children}</Shell>;
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}><Gate>{children}</Gate></Suspense>;
}
