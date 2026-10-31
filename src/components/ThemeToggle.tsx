"use client";
import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";
const LABEL: Record<Mode, string> = { system: "◐ Tự động", light: "☀ Sáng", dark: "☾ Tối" };

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("nb-theme");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- đọc lựa chọn đã lưu sau khi mount
      if (t === "light" || t === "dark") setMode(t);
    } catch {
      /* ignore */
    }
  }, []);
  const next = () => {
    const m: Mode = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    setMode(m);
    try {
      if (m === "system") localStorage.removeItem("nb-theme");
      else localStorage.setItem("nb-theme", m);
    } catch {
      /* ignore */
    }
    if (m === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = m;
  };
  return <button className="btn ghost sm" onClick={next} title="Đổi giao diện sáng/tối" data-testid="theme-toggle">{LABEL[mode]}</button>;
}
