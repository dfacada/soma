import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cx } from "./primitives";
import s from "./ui.module.css";

export type Section = "today" | "journal" | "food" | "activity" | "insights" | "settings";

/** `hue` is the colour a section lights in when picked: its domain, or ink for the ones that belong to none. */
export const SECTIONS: { id: Section; label: string; icon: IconName; hue: "journal" | "food" | "activity" | "ink" }[] = [
  { id: "today", label: "Today", icon: "today", hue: "ink" },
  { id: "journal", label: "Journal", icon: "mic", hue: "journal" },
  { id: "food", label: "Food", icon: "leaf", hue: "food" },
  { id: "activity", label: "Activity", icon: "barbell", hue: "activity" },
  { id: "insights", label: "Insights", icon: "spark", hue: "ink" },
];
const SETTINGS = { id: "settings" as const, label: "Settings", icon: "gear" as const, hue: "ink" as const };

type NavProps = { current: Section; onSelect: (s: Section) => void };

/** How far today has got, for the ring round the Today tab. */
export type TodayProgress = { done: number; total: number; closed: boolean };
const RING = 2 * Math.PI * 13;

/** Phones: five tabs in a floating bar, icons only until picked. Settings is reached from the Today header. The Today
 *  tab wears the day's progress as a ring round its icon (David, 2026-11-03), so it can be read from any screen; a
 *  closed day lights the whole ring. */
export function TabBar({ current, onSelect, className, todayProgress }: NavProps & { className?: string; todayProgress?: TodayProgress }) {
  return (
    <nav className={cx(s.tabbar, className)} aria-label="Sections">
      {SECTIONS.map((t) => {
        const p = t.id === "today" ? todayProgress : undefined;
        return (
          <button key={t.id} type="button" className={cx(s.tab, s[t.hue], current === t.id && s.tabOn)} aria-current={current === t.id ? "page" : undefined} onClick={() => onSelect(t.id)}
            aria-label={p ? `${t.label}, ${p.closed ? "day closed" : `${p.done} of ${p.total} done`}` : t.label}>
            {p ? (
              <span className={cx(s.tabRing, p.closed && s.tabRingClosed)}>
                <svg viewBox="0 0 30 30" aria-hidden>
                  <circle cx="15" cy="15" r="13" className={s.tabRingTrack} />
                  {p.done > 0 && <circle cx="15" cy="15" r="13" className={s.tabRingFill} transform="rotate(-90 15 15)" strokeDasharray={`${((p.done / Math.max(1, p.total)) * RING).toFixed(1)} ${RING.toFixed(1)}`} />}
                </svg>
                <Icon name={t.icon} size={16} strokeWidth={2} />
              </span>
            ) : <Icon name={t.icon} size={22} />}
            <span className={s.tabLabel}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Desktop: the same five sections plus Settings, with a footer slot for the record button and account note. */
export function Sidebar({ current, onSelect, footer, className }: NavProps & { footer?: ReactNode; className?: string }) {
  return (
    <nav className={cx(s.side, className)} aria-label="Sections">
      <div className={s.sideBrand}>Soma</div>
      {[...SECTIONS, SETTINGS].map((t) => (
        <button key={t.id} type="button" className={cx(s.nav, s[t.hue], current === t.id && s.navOn)} aria-current={current === t.id ? "page" : undefined} onClick={() => onSelect(t.id)}>
          <Icon name={t.icon} size={t.id === "settings" ? 18 : 22} />
          <span>{t.label}</span>
        </button>
      ))}
      {footer && <div className={s.sideFoot}>{footer}</div>}
    </nav>
  );
}

export function SideNote({ children }: { children: ReactNode }) {
  return <div className={s.sideNote}>{children}</div>;
}
