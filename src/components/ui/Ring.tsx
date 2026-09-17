import s from "./ui.module.css";

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** The Today hero ring: four quarter segments, one per daily task (check-in, journal, food, activity). */
export type DayProgress = { checkin: number; journal: number; food: number; activity: number };

export function DayRing({ progress, size = 120, closed = false }: { progress: DayProgress; size?: number; closed?: boolean }) {
  // r=48 → circumference 301.6, quarter 75.4; a 6-unit gap leaves 69.4 per segment.
  const R = 48;
  const SEG = 69.4;
  const segments: [number, string][] = [
    [progress.checkin, "var(--journal)"],
    [progress.journal, "var(--journal-soft)"],
    [progress.food, "var(--food)"],
    [progress.activity, "var(--activity)"],
  ];
  const done = segments.filter(([f]) => f >= 1).length;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${done} of 4 done today`}>
      <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" stroke={closed ? "rgba(255,255,255,0.12)" : "var(--surface-2)"} />
      {segments.map(([frac, color], i) => (
        <circle
          key={i}
          className={s.ringSeg}
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="butt"
          strokeDasharray={`${(clamp(frac) * SEG).toFixed(1)} 400`}
          transform={`rotate(${-90 + i * 90 + 3.6} 60 60)`}
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

/** Week strip glyph: a day's completion out of 4. A full day becomes a solid activity-hue check. */
export function DayGlyph({ done, today = false }: { done: number; today?: boolean }) {
  if (done >= 4) {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" role="img" aria-label="All four done">
        <circle cx="14" cy="14" r="13" fill="var(--activity)" />
        <path d="M8 14l4 4 8-9" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const stroke = today ? "var(--activity)" : "currentColor";
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" role="img" aria-label={`${done} of 4 done`}>
      <circle cx="14" cy="14" r="11" fill="none" stroke={stroke} strokeOpacity={today ? 0.35 : 0.18} strokeWidth="4" />
      {/* A zero-length dash with round caps still paints its cap as a dot, so nothing is drawn at zero. */}
      {done > 0 && <circle cx="14" cy="14" r="11" fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${((clamp(done / 4)) * 69.1).toFixed(1)} 100`} transform="rotate(-90 14 14)" />}
    </svg>
  );
}
