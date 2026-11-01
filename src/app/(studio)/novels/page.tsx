"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCloudMe } from "@/lib/client/hooks";
import { CloudNovels } from "@/components/CloudNovels";

/** Quản lý tất cả bộ truyện (chỉ có khi trang chạy trên Cloudflare). */
export default function NovelsPage() {
  const me = useCloudMe();
  const router = useRouter();
  useEffect(() => {
    if (me.isSuccess && !me.data) router.replace("/settings");
  }, [me.isSuccess, me.data, router]);
  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Bộ truyện</h1>
            <div className="sub">Mọi bộ truyện lưu trên Cloudflare (nội dung ở R2, danh sách ở D1). Chọn một bộ để viết; nháp tự lưu lên R2 trong lúc gõ.</div>
          </div>
        </div>
        {me.isLoading && <span className="spinner" />}
        {me.data && <CloudNovels me={me.data} />}
      </div>
    </div>
  );
}
