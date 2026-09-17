import s from "./ui.module.css";

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** The Today hero ring: one segment per daily task, equal arcs with a small gap between them. */
export type RingSegment = { value: number; color: string };

export function DayRing({ segments, size = 120, closed = false }: { segments: RingSegment[]; size?: number; closed?: boolean }) {
  // r=48 → circumference 301.6. Each task gets an equal arc, less a 6-unit gap (3.6° of lead-in each side).
  const R = 48;
  const n = Math.max(1, segments.length);
  const arc = 360 / n;
  const SEG = (2 * Math.PI * R) / n - 6;
  const done = segments.filter((s) => s.value >= 1).length;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${done} of ${n} done today`}>
      <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" stroke={closed ? "rgba(255,255,255,0.12)" : "var(--surface-2)"} />
      {segments.map((seg, i) => clamp(seg.value) > 0 && (
        <circle
          key={i}
          className={s.ringSeg}
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={seg.color}
          strokeWidth="10"
          strokeLinecap="butt"
          strokeDasharray={`${(clamp(seg.value) * SEG).toFixed(1)} 400`}
          transform={`rotate(${-90 + i * arc + 3.6} 60 60)`}
        />
      ))}
    </svg>
  );
}

/** One value against a target (kcal, protein, push-ups). Rounded cap, starts at 12 o'clock. */
export function ProgressRing({ value, max, size = 96, width = 9, color, label }: { value: number; max: number; size?: number; width?: number; color: string; label: string }) {
  const r = 48 - width / 2 - 1;
  const c = 2 * Math.PI * r;
  const f = max > 0 ? clamp(value / max) : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={`${label}: ${value} of ${max}`}>
      <circle cx="48" cy="48" r={r} fill="none" stroke="var(--surface-2)" strokeWidth={width} />
      {f > 0 && <circle className={s.ringSeg} cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={`${(f * c).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 48 48)" />}
    </svg>
  );
}

/** Week strip glyph: a day's completion out of `total` tasks. A full day becomes a solid activity-hue check. */
export function DayGlyph({ done, total = 4, today = false }: { done: number; total?: number; today?: boolean }) {
  if (done >= total) {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" role="img" aria-label="All done">
        <circle cx="14" cy="14" r="13" fill="var(--activity)" />
        <path d="M8 14l4 4 8-9" fill="none" stroke="var(--on-hue)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const stroke = today ? "var(--activity)" : "currentColor";
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" role="img" aria-label={`${done} of ${total} done`}>
      <circle cx="14" cy="14" r="11" fill="none" stroke={stroke} strokeOpacity={today ? 0.35 : 0.18} strokeWidth="4" />
      {/* A zero-length dash with round caps still paints its cap as a dot, so nothing is drawn at zero. */}
      {done > 0 && <circle cx="14" cy="14" r="11" fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${((clamp(done / total)) * 69.1).toFixed(1)} 100`} transform="rotate(-90 14 14)" />}
    </svg>
  );
}
