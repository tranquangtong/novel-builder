"use client";
import { useEffect, useMemo, useState } from "react";

/**
 * Bảo vệ nội dung ở chế độ đọc — CHỈ là biện pháp gây khó và truy vết, không thể chặn tuyệt đối:
 *  - không bôi đen / copy / cắt / kéo / chuột phải; chặn Ctrl/⌘ + C, X, A, S, P, U;
 *  - không in được (bản in trống);
 *  - mờ nội dung khi cửa sổ mất focus hoặc khi bấm PrintScreen (và xoá clipboard nếu được);
 *  - watermark mờ ghi email người đọc + ngày: ảnh chụp bị lộ vẫn biết của ai.
 * Trình duyệt không cho trang web chặn ảnh chụp màn hình của hệ điều hành hay chụp bằng điện thoại.
 */
export function ProtectedContent({ viewer, children }: { viewer: string; children: React.ReactNode }) {
  const [veiled, setVeiled] = useState(false);

  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["c", "x", "a", "s", "p", "u"].includes(k)) e.preventDefault();
      if (e.key === "PrintScreen") {
        setVeiled(true);
        void navigator.clipboard?.writeText("").catch(() => {});
        setTimeout(() => setVeiled(false), 1500);
      }
    };
    const hide = () => setVeiled(true);
    const show = () => setVeiled(document.visibilityState === "hidden");
    const onVis = () => setVeiled(document.visibilityState === "hidden");
    const evs = ["copy", "cut", "contextmenu", "selectstart", "dragstart"] as const;
    evs.forEach((t) => document.addEventListener(t, stop));
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeprint", hide);
    window.addEventListener("afterprint", show);
    return () => {
      evs.forEach((t) => document.removeEventListener(t, stop));
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", show);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeprint", hide);
      window.removeEventListener("afterprint", show);
    };
  }, []);

  const watermark = useMemo(() => {
    const day = new Date().toLocaleDateString("vi-VN");
    const text = `${viewer} · ${day}`.replace(/[<>&"]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200"><text x="20" y="120" transform="rotate(-24 180 100)" font-family="sans-serif" font-size="14" fill="rgba(60,40,20,0.10)">${text}</text></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [viewer]);

  return (
    <div className={`protected ${veiled ? "veiled" : ""}`} data-testid="protected">
      <div className="protected-body">{children}</div>
      <div className="watermark" aria-hidden style={{ backgroundImage: watermark }} data-testid="watermark" data-viewer={viewer} />
      {veiled && <div className="veil" data-testid="veil">Nội dung được ẩn khi rời khỏi trang</div>}
    </div>
  );
}
