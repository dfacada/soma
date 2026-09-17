"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import s from "./ui.module.css";

type Props = { open: boolean; title: string; onClose: () => void; children: ReactNode };

/** Bottom sheet on phones, centred dialog from 900px. Closes on Escape and backdrop tap; returns focus to the opener. */
export function Sheet({ open, title, onClose, children }: Props) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={s.sheetBg} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} className={s.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className={s.sheetHead}>
          <span id={titleId} className={s.sheetTitle}>{title}</span>
          <button type="button" className={s.sheetClose} aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Transient confirmation. The parent owns the message; pass null to hide. */
export function Toast({ message }: { message: string | null }) {
  return (
    <div className={`${s.toast} ${message ? s.toastShow : ""}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
