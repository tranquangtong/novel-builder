"use client";
import { useEffect, useId, useRef } from "react";

export function Modal({ title, onClose, children, footer, narrow, testId }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; narrow?: boolean; testId?: string }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement;
    const restoreFocus = previous instanceof HTMLElement && !dialog.contains(previous) ? previous : null;
    if (restoreFocus || !previous) dialog.focus();
    return () => {
      if (restoreFocus?.isConnected) restoreFocus.focus();
    };
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className={`modal ${narrow ? "narrow" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const focusable = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(
            "a[href], button, input, select, textarea, [tabindex]",
          )).filter((el) => el.tabIndex >= 0 && !el.matches(":disabled") && el.getClientRects().length > 0);
          const target = e.shiftKey ? focusable.at(-1) : focusable[0];
          const boundary = e.shiftKey ? focusable[0] : focusable.at(-1);
          if (e.target === boundary || !focusable.some((el) => el === e.target)) {
            e.preventDefault();
            target?.focus();
          }
        }}
      >
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="Đóng">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
