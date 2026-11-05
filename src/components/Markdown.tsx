"use client";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadConnection } from "@/lib/client/connection";

/** Đường dẫn tới ảnh của bộ truyện trên Cloudflare (`asset:<khóa>` trong Markdown). */
export function assetUrl(key: string, novelId?: string) {
  const c = typeof window !== "undefined" && !novelId ? loadConnection() : null;
  const nid = novelId ?? (c?.mode === "cloud" ? c.novelId : null);
  if (!nid) return "";
  return `/api/novels/${nid}/assets/file/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Hiển thị Markdown. HTML thô trong nội dung KHÔNG được render (an toàn với nội dung từ agent). */
export function Markdown({ text, compact, novelId }: { text: string; compact?: boolean; novelId?: string }) {
  const urlTransform = (url: string) => (url.startsWith("asset:") ? assetUrl(url.slice("asset:".length), novelId) : defaultUrlTransform(url));
  return (
    <div className={`prose ${compact ? "compact" : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform}>{text}</ReactMarkdown>
    </div>
  );
}
