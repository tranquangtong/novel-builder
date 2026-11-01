"use client";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadConnection } from "@/lib/client/connection";

/** Đường dẫn tới ảnh của bộ truyện trên Cloudflare (`asset:<khóa>` trong Markdown). */
export function assetUrl(key: string) {
  const c = typeof window !== "undefined" ? loadConnection() : null;
  if (c?.mode !== "cloud") return "";
  return `/api/novels/${c.novelId}/assets/file/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function urlTransform(url: string) {
  if (url.startsWith("asset:")) return assetUrl(url.slice("asset:".length));
  return defaultUrlTransform(url);
}

/** Hiển thị Markdown. HTML thô trong nội dung KHÔNG được render (an toàn với nội dung từ agent). */
export function Markdown({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div className={`prose ${compact ? "compact" : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform}>{text}</ReactMarkdown>
    </div>
  );
}
