"use client";
import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useConnection } from "@/lib/client/connection";
import { Shell } from "@/components/Shell";

/**
 * Trang tĩnh: không có máy chủ kiểm tra phiên. Nội dung chỉ được tải từ GitHub bằng token
 * của tác giả (GitHub tự kiểm tra quyền). Chưa kết nối thì chỉ vào được trang Kết nối.
 */
function Gate({ children }: { children: React.ReactNode }) {
  const conn = useConnection();
  const pathname = usePathname();
  const router = useRouter();
  const onConnect = pathname === "/settings" || pathname === "/settings/";
  useEffect(() => {
    if (conn === null && !onConnect) router.replace("/settings");
  }, [conn, onConnect, router]);
  if (conn === undefined) return null;
  if (conn === null && !onConnect) return null;
  return <Shell conn={conn}>{children}</Shell>;
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}><Gate>{children}</Gate></Suspense>;
}
