"use client";
import { useEffect, useId, useInsertionEffect, useLayoutEffect, useRef } from "react";

export function Modal({ title, onClose, children, footer, narrow, testId, fallbackFocus }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; narrow?: boolean; testId?: string; fallbackFocus?: () => HTMLElement | null }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useInsertionEffect(() => {
    // React runs child autoFocus during the layout phase.
    const opener = document.activeElement;
    if (opener instanceof HTMLElement && opener !== document.body) openerRef.current = opener;
  }, []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.isConnected) return;
      const opener = openerRef.current;
      (opener?.isConnected ? opener : fallbackFocus?.())?.focus();
    };
  }, [fallbackFocus]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const dialog = dialogRef.current;
      if (e.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, [tabindex]",
      )).filter((el) => el.tabIndex >= 0 && !el.matches(":disabled") && el.getClientRects().length > 0);
      const focused = document.activeElement;
      const boundary = e.shiftKey ? focusable[0] : focusable.at(-1);
      if (focused === boundary || !focusable.some((el) => el === focused)) {
        e.preventDefault();
        const target = e.shiftKey ? focusable.at(-1) : focusable[0];
        (target ?? dialog).focus();
      }
    };
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
