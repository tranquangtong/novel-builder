"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Hiển thị Markdown. HTML thô trong nội dung KHÔNG được render (an toàn với nội dung từ agent). */
export function Markdown({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div className={`prose ${compact ? "compact" : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
