import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import s from "./ui.module.css";

export type Domain = "journal" | "food" | "activity";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

// ── Button ──
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary is ink; a domain name paints the button in that domain's hue */
  variant?: "primary" | "secondary" | "danger" | Domain;
  size?: "md" | "sm";
  block?: boolean;
};
export function Button({ variant = "primary", size = "md", block, className, type = "button", ...rest }: ButtonProps) {
  const hue = variant === "journal" || variant === "food" || variant === "activity";
  return (
    <button
      type={type}
      className={cx(
        s.btn,
        variant === "secondary" && s.btnSecondary,
        variant === "danger" && s.btnDanger,
        hue && s[variant],
        hue && s.btnHue,
        size === "sm" && s.btnSm,
        block && s.btnBlock,
        className,
      )}
      {...rest}
    />
  );
}

// ── Chip: mood (38) and habit (30). A count turns a habit chip into a counter. ──
type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  on?: boolean;
  kind?: "mood" | "habit";
  count?: number;
};
export function Chip({ label, on = false, kind = "mood", count, className, ...rest }: ChipProps) {
  return (
    <button type="button" aria-pressed={on} className={cx(s.chip, kind === "habit" && s.chipHabit, on && s.chipOn, className)} {...rest}>
      {label}
      {count !== undefined && <span className={s.chipCount}>×{count}</span>}
    </button>
  );
}

// ── Card. With onClick it renders as a button: every daily task completes with a tap. ──
type CardProps = { children: ReactNode; onClick?: () => void; recording?: boolean; className?: string; "aria-label"?: string };
export function Card({ children, onClick, recording, className, ...rest }: CardProps) {
  const cls = cx(s.card, onClick && s.cardTap, recording && s.cardRecording, className);
  if (onClick) {
    return (
      <div role="button" tabIndex={0} className={cls} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }} {...rest}>
        {children}
      </div>
    );
  }
  return <div className={cls} {...rest}>{children}</div>;
}

export function RowHead({ lead, title, sub, trail }: { lead?: ReactNode; title: string; sub?: string; trail?: ReactNode }) {
  return (
    <div className={s.rowHead}>
      {lead}
      <div className={s.rowHeadText}>
        <span className={s.rowHeadTitle}>{title}</span>
        {sub && <span className={s.rowHeadSub}>{sub}</span>}
      </div>
      {trail}
    </div>
  );
}

// ── Medallion ──
export type MedallionState = "idle" | "part" | "done" | "rec";
export function Medallion({ domain, state = "idle", icon }: { domain: Domain; state?: MedallionState; icon: IconName }) {
  return (
    <span className={cx(s.med, s[domain], state === "part" && s.medPart, state === "done" && s.medDone, state === "rec" && s.medRec)}>
      <Icon name={state === "done" ? "check" : icon} size={state === "done" ? 16 : 18} strokeWidth={state === "done" ? 2.5 : 1.75} />
    </span>
  );
}

// ── Mini: one tap slot inside a Today card ──
type MiniProps = { domain: Domain; icon: IconName; label: string; state?: "empty" | "on" | "due"; onClick?: () => void };
export function Mini({ domain, icon, label, state = "empty", onClick }: MiniProps) {
  return (
    <button type="button" aria-label={label} aria-pressed={state === "on"} onClick={onClick} className={cx(s.mini, s[domain], state === "on" && s.miniOn, state === "due" && s.miniDue)}>
      <Icon name={icon} />
    </button>
  );
}

// ── Tile ──
export function Tiles({ children }: { children: ReactNode }) {
  return <div className={s.tiles}>{children}</div>;
}
type TileProps = { domain: Domain; icon: IconName; name: string; plan?: string; stat?: string; done?: boolean; onClick?: () => void };
export function Tile({ domain, icon, name, plan, stat, done = false, onClick }: TileProps) {
  return (
    <button type="button" aria-pressed={done} onClick={onClick} className={cx(s.tile, s[domain], done && s.tileDone)}>
      <Icon name={icon} />
      <span className={s.tileName}>{name}</span>
      {plan && <span className={s.tilePlan}>{plan}</span>}
      {stat && <span className={s.tileStat}>{stat}</span>}
    </button>
  );
}

// ── Small data pieces ──
export function Tag({ children, tone }: { children: ReactNode; tone?: Domain | "warning" | "critical" }) {
  const hue = tone === "journal" || tone === "food" || tone === "activity";
  return <span className={cx(s.tag, hue && s[tone], hue && s.tagHue, tone === "warning" && s.tagWarning, tone === "critical" && s.tagCritical)}>{children}</span>;
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className={s.stat}>
      <span className="eb">{label}</span>
      <span className={s.statValue}>{value}</span>
      {note && <span className={s.statNote}>{note}</span>}
    </div>
  );
}

export function Bar({ label, value, max, unit = "g", domain }: { label: string; value: number; max: number; unit?: string; domain?: Domain }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cx(s.bar, domain && s[domain])}>
      <div className={s.barHead}>
        <span>{label}</span>
        <span>{value} / {max} {unit}</span>
      </div>
      <div className={s.barTrack} role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <div className={s.barFill} style={{ width: pct + "%" }} />
      </div>
    </div>
  );
}

export function Row({ name, sub, value, trail }: { name: string; sub?: string; value?: ReactNode; trail?: ReactNode }) {
  return (
    <div className={s.row}>
      <div className={s.rowName}>
        <span>{name}</span>
        {sub && <span className={s.rowSub}>{sub}</span>}
      </div>
      {value !== undefined && <span className={s.rowValue}>{value}</span>}
      {trail}
    </div>
  );
}

// ── Segmented control ──
type SegmentedProps<T extends string> = { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string };
export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  return (
    <div className={s.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={cx(s.seg, o.value === value && s.segOn)} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Settings field kit ──
export function Field({ name, help, children }: { name: string; help?: string; children: ReactNode }) {
  return (
    <div className={s.field}>
      <div className={s.fieldLabel}>
        <span className={s.fieldName}>{name}</span>
        {help && <span className={s.fieldHelp}>{help}</span>}
      </div>
      {children}
    </div>
  );
}

export function Input({ compact, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }) {
  return <input className={cx(s.input, compact && s.inputCompact, className)} {...rest} />;
}

export function Select({ compact, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }) {
  return <select className={cx(s.input, compact && s.inputCompact, className)} {...rest}>{children}</select>;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={s.switch} onClick={() => onChange(!checked)}>
      <span className={s.switchTrack} />
    </button>
  );
}

export function Pill({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className={s.pill}>
      {label}
      {onRemove && (
        <button type="button" className={s.pillX} aria-label={`Remove ${label}`} onClick={onRemove}>
          <Icon name="close" size={12} strokeWidth={2.25} />
        </button>
      )}
    </span>
  );
}

// ── Floating mic (Journal screen) ──
export function MicButton({ recording = false, onClick }: { recording?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={cx(s.mic, recording && s.micRec)} aria-label={recording ? "Stop recording" : "Record an entry"} aria-pressed={recording} onClick={onClick}>
      <Icon name="mic" size={26} />
    </button>
  );
}
