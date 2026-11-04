"use client";

import { createContext, useContext, useEffect, useId, useRef, useSyncExternalStore, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { haptic } from "@/lib/haptics";
import { Icon } from "./Icon";
import s from "./ui.module.css";

type Props = { open: boolean; title: string; onClose: () => void; children: ReactNode };

/** False inside a tab screen that is mounted but not showing (Shell keeps every visited tab mounted). */
export const TabVisible = createContext(true);
export const useTabVisible = () => useContext(TabVisible);

const subscribeNothing = () => () => undefined;
/** True once running in the browser (false while the static HTML is built and while it hydrates). */
export const useInBrowser = () => useSyncExternalStore(subscribeNothing, () => true, () => false);

/** Overlays (sheets, toasts, the full-screen moments) render at the end of <body>, not where they are used. Inside
 *  a card that is animating in, `position: fixed` would be fixed to the card and its z-index trapped under the tab
 *  bar; up here nothing on the page can do that to them. */
export function Overlay({ children }: { children: ReactNode }) {
  return useInBrowser() ? createPortal(children, document.body) : null;
}

/** Bottom sheet on phones, centred dialog from 900px. Closes on Escape and backdrop tap; returns focus to the opener. */
export function Sheet({ open: wanted, title, onClose, children }: Props) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // A sheet left open in a tab that is now hidden (Back was pressed) must not keep the page locked or answer
  // Escape; it comes back when its tab does.
  const visible = useTabVisible();
  const open = wanted && visible;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  // Swipe down to close, like an iPhone sheet (David, 2026-11-03). Only from the grab handle and the title row, so a
  // ruler, a list or a text box inside the sheet never closes it by accident. Past 100px, or a quick flick, it goes;
  // short of that it springs back. Moved by hand, not by React state, so the drag keeps up with the finger.
  const drag = useRef<{ y: number; t: number } | null>(null);
  const grab = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || window.innerWidth >= 900 || (e.target as HTMLElement).closest("button")) return;
      drag.current = { y: e.clientY, t: performance.now() };
      e.currentTarget.setPointerCapture(e.pointerId);
      if (panel.current) panel.current.style.transition = "none";
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const el = panel.current;
      if (!drag.current || !el) return;
      const dy = Math.max(0, e.clientY - drag.current.y);
      el.style.transform = `translateY(${dy}px)`;
      if (el.parentElement) el.parentElement.style.opacity = String(Math.max(0.3, 1 - dy / 500));
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current, el = panel.current;
      drag.current = null;
      if (!d || !el) return;
      const dy = Math.max(0, e.clientY - d.y), speed = dy / Math.max(1, performance.now() - d.t);
      const bg = el.parentElement;
      if (dy > 100 || (dy > 30 && speed > 0.5)) {
        haptic();
        el.style.transition = "transform 0.22s ease-in";
        el.style.transform = "translateY(110%)";
        if (bg) { bg.style.transition = "opacity 0.22s ease"; bg.style.opacity = "0"; }
        window.setTimeout(onClose, 200);
      } else {
        el.style.transition = "transform 0.4s var(--spring)";
        el.style.transform = "";
        if (bg) { bg.style.transition = "opacity 0.2s ease"; bg.style.opacity = ""; }
      }
    },
  };

  if (!open) return null;
  return (
    <Overlay>
      <div className={s.sheetBg} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={panel} className={s.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <div className={s.sheetGrab} aria-hidden {...grab} onPointerCancel={grab.onPointerUp} />
          <div className={s.sheetHead} {...grab} onPointerCancel={grab.onPointerUp}>
            <span id={titleId} className={s.sheetTitle}>{title}</span>
            <button type="button" className={s.sheetClose} aria-label="Close" onClick={onClose}>
              <Icon name="close" size={18} strokeWidth={2} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </Overlay>
  );
}

/** Transient confirmation. The parent owns the message; pass null to hide. A hidden tab's toast stays hidden, as it
 *  did when it lived inside the tab. */
export function Toast({ message }: { message: string | null }) {
  const visible = useTabVisible();
  if (!visible) return null;
  return (
    <Overlay>
      <div className={`${s.toast} ${message ? s.toastShow : ""}`} role="status" aria-live="polite">
        {message}
      </div>
    </Overlay>
  );
}
