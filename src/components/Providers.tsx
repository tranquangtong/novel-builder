"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { resetBackend } from "@/lib/client/backend";
import { ToastProvider } from "./Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  useEffect(() => {
    // Đổi kết nối (repo/token/demo) → bỏ toàn bộ dữ liệu đã tải của kết nối cũ.
    const onChange = () => {
      resetBackend();
      qc.clear();
    };
    window.addEventListener("nb:connection-changed", onChange);
    return () => window.removeEventListener("nb:connection-changed", onChange);
  }, [qc]);
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
