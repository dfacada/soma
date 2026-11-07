import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import s from "./ui.module.css";

export type Domain = "journal" | "food" | "activity";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

// ── Button, and ButtonLink: the same look on a link ──
type ButtonLook = {
  /** primary is ink; a domain name paints the button in that domain's hue */
  variant?: "primary" | "secondary" | "danger" | Domain;
  size?: "md" | "sm";
  block?: boolean;
  className?: string;
};
function buttonClass({ variant = "primary", size = "md", block, className }: ButtonLook) {
  const hue = variant === "journal" || variant === "food" || variant === "activity";
  return cx(
    s.btn,
    variant === "secondary" && s.btnSecondary,
    variant === "danger" && s.btnDanger,
    hue && s[variant],
    hue && s.btnHue,
    size === "sm" && s.btnSm,
    block && s.btnBlock,
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonLook;
export function Button({ variant, size, block, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, size, block, className })} {...rest} />;
}

/** A link that looks like a Button (Settings' How to install, Tomorrow's Open Settings), so it stays in step with it. */
export function ButtonLink({ variant, size, block, className, ...rest }: ComponentProps<typeof Link> & ButtonLook) {
  return <Link className={cx(buttonClass({ variant, size, block, className }), s.btnLink)} {...rest} />;
}

// ── Chip: mood (42) and habit (34). A count turns a habit chip into a counter; a value is a number that belongs to the
//    label (a quick snack's kcal), set after it in mono like every number. ──
type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "value"> & {
  label: string;
  on?: boolean;
  kind?: "mood" | "habit";
  count?: number;
  value?: number | string;
};
export function Chip({ label, on = false, kind = "mood", count, value, className, ...rest }: ChipProps) {
  return (
    <button type="button" aria-pressed={on} className={cx(s.chip, kind === "habit" && s.chipHabit, on && s.chipOn, className)} {...rest}>
      {label}
      {count !== undefined && <span className={s.chipCount}>×{count}</span>}
      {value !== undefined && <span className={s.chipCount}>{value}</span>}
    </button>
  );
}

// ── Card. With onClick it renders as a button: every daily task completes with a tap. ──
type CardProps = { children: ReactNode; onClick?: () => void; recording?: boolean; className?: string; id?: string; "aria-label"?: string };
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
type MiniProps = { domain: Domain; icon?: IconName; label: string; state?: "empty" | "on" | "due"; onClick?: () => void; disabled?: boolean; children?: ReactNode };
/** Shows `children` when given (the push-up count), otherwise the icon. */
export function Mini({ domain, icon, label, state = "empty", onClick, disabled, children }: MiniProps) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={state === "on"} disabled={disabled} onClick={onClick} className={cx(s.mini, s[domain], state === "on" && s.miniOn, state === "due" && s.miniDue)}>
      {children ?? (icon && <Icon name={icon} />)}
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
  // Nothing to show yet ("—"): a quiet dash, not a heavy bar in the condensed face.
  const empty = value === "—";
  return (
    <div className={s.stat}>
      <span className="eb">{label}</span>
      <span className={cx(s.statValue, empty && s.statEmpty)}>{value}</span>
      {note && <span className={s.statNote}>{note}</span>}
    </div>
  );
}

/** `domain` paints the fill in that hue; `color` overrides it (the secondary food bar for carbs and fat). */
export function Bar({ label, value, max, unit = "g", domain, color, text }: { label: string; value: number; max: number; unit?: string; domain?: Domain; color?: string; /** Replaces the "value / max unit" readout. */ text?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cx(s.bar, domain && s[domain])}>
      <div className={s.barHead}>
        <span>{label}</span>
        <span>{text ?? `${value} / ${max} ${unit}`}</span>
      </div>
      <div className={s.barTrack} role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <div className={s.barFill} style={{ width: pct + "%", background: color }} />
      </div>
    </div>
  );
}

/** A number on a pill that fills toward its goal: an icon chip, a label, the value large (David, 2026-11-03, after
 *  Google Health's Today: steps and sleep). `fill` is 0–1, null for nothing to fill. A tap does `onClick`. */
export function StatPill({ domain, icon, label, value, fill, onClick, ariaLabel, dim, compact }: {
  domain: Domain; icon: IconName;
  /** A number that belongs to the label (the steps goal) goes after it in a `.m` span: mono, like every number. */
  label: ReactNode;
  value: ReactNode; fill: number | null; onClick?: () => void;
  /** What a screen reader says: the label, the value and the goal in words. */
  ariaLabel: string;
  /** A quieter value: "Unlock to see", "Not synced yet". */
  dim?: boolean;
  /** Two to a row (Today): a smaller chip and number. */
  compact?: boolean;
}) {
  const pct = fill === null ? 0 : Math.max(0, Math.min(1, fill)) * 100;
  const body = (
    <>
      <span className={s.spFill} style={{ width: `${pct.toFixed(1)}%` }} aria-hidden />
      <span className={s.spIcon} aria-hidden><Icon name={icon} size={20} strokeWidth={2} /></span>
      <span className={s.spText}>
        <span className={s.spLabel}>{label}</span>
        <span className={cx(dim ? s.spDim : "dc", s.spValue)}>{value}</span>
      </span>
    </>
  );
  return onClick
    ? <button type="button" className={cx(s.statPill, s[domain], compact && s.spCompact, s.spTap)} onClick={onClick} aria-label={ariaLabel}>{body}</button>
    : <div className={cx(s.statPill, s[domain], compact && s.spCompact)} role="img" aria-label={ariaLabel}>{body}</div>;
}

/** How far the current step is: a fraction 0–1; "unknown" when its size is not known (a moving stripe); "atomic"
 *  for one call that reports nothing until it ends (fills toward 90% while it runs, full once the next step starts). */
export type StepProgress = number | "unknown" | "atomic";

/** A slim bar for a job of named steps, one segment per step that will run, with the current step's name under it.
 *  `failed` replaces that name with the failure, in the critical colour. `note` replaces it without failing. */
/** `labelMotion` slides each new step name up into place (the opening splash); off, names simply change. */
export function StageBar({ steps, at, progress, detail, failed, note, domain, labelMotion = false }: { steps: string[]; at: number; progress: StepProgress; detail?: string; failed?: string; note?: string; domain?: Domain; labelMotion?: boolean }) {
  const frac = typeof progress === "number" ? Math.max(0, Math.min(1, progress)) : 0;
  const pct = Math.round(((at + frac) / steps.length) * 100);
  const label = failed ?? note ?? steps[at];
  return (
    <div className={cx(s.stages, domain && s[domain], failed && s.stagesFailed)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
      aria-valuetext={failed ?? `${label}${steps.length > 1 ? `, step ${at + 1} of ${steps.length}` : ""}${detail ? `, ${detail}` : ""}`}>
      <div className={s.stageTrack}>
        {steps.map((name, i) => (
          <span key={name} className={s.stageSeg}>
            {i < at ? <span className={s.stageFill} style={{ width: "100%" }} />
              : i > at ? null
              : failed ? <span className={cx(s.stageFill, s.stageFailFill)} style={{ width: "100%" }} />
              : progress === "unknown" ? <span className={cx(s.stageFill, s.stageUnknown)} />
              : progress === "atomic" ? <span className={cx(s.stageFill, s.stageAtomic)} />
              : <span className={s.stageFill} style={{ width: frac * 100 + "%" }} />}
          </span>
        ))}
      </div>
      <div className={s.stageHead} aria-hidden>
        <span key={labelMotion ? label : undefined} className={labelMotion ? s.stageLabelIn : undefined}>{label}</span>
        {!failed && detail && <span>{detail}</span>}
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
/** `block` spans the full width, every option the same size. */
type SegmentedProps<T extends string> = { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; block?: boolean };
export function Segmented<T extends string>({ options, value, onChange, label, block = false }: SegmentedProps<T>) {
  return (
    <div className={cx(s.segmented, block && s.segmentedBlock)} role="radiogroup" aria-label={label}>
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

// `ref` is a plain prop in React 19; declared here so a caller can focus the field (Food's "Ate something else").
export function Input({ compact, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { compact?: boolean; ref?: Ref<HTMLInputElement> }) {
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
