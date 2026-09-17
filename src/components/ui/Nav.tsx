import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cx } from "./primitives";
import s from "./ui.module.css";

export type Section = "today" | "journal" | "food" | "activity" | "insights" | "settings";

export const SECTIONS: { id: Section; label: string; icon: IconName }[] = [
  { id: "today", label: "Today", icon: "today" },
  { id: "journal", label: "Journal", icon: "mic" },
  { id: "food", label: "Food", icon: "leaf" },
  { id: "activity", label: "Activity", icon: "barbell" },
  { id: "insights", label: "Insights", icon: "spark" },
];
const SETTINGS = { id: "settings" as const, label: "Settings", icon: "gear" as const };

type NavProps = { current: Section; onSelect: (s: Section) => void };

/** Phones: five tabs. Settings is reached from the Today header, as in the prototype. */
export function TabBar({ current, onSelect, className }: NavProps & { className?: string }) {
  return (
    <nav className={cx(s.tabbar, className)} aria-label="Sections">
      {SECTIONS.map((t) => (
        <button key={t.id} type="button" className={cx(s.tab, current === t.id && s.tabOn)} aria-current={current === t.id ? "page" : undefined} onClick={() => onSelect(t.id)}>
          <Icon name={t.icon} size={22} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Desktop: the same five sections plus Settings, with a footer slot for the record button and account note. */
export function Sidebar({ current, onSelect, footer, className }: NavProps & { footer?: ReactNode; className?: string }) {
  return (
    <nav className={cx(s.side, className)} aria-label="Sections">
      <div className={s.sideBrand}>Soma</div>
      {[...SECTIONS, SETTINGS].map((t) => (
        <button key={t.id} type="button" className={cx(s.nav, current === t.id && s.navOn)} aria-current={current === t.id ? "page" : undefined} onClick={() => onSelect(t.id)}>
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
