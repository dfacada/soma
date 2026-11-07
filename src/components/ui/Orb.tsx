import { type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cx, type Domain } from "./primitives";
import s from "./ui.module.css";

/** One task around the orb. `value` is 0–1: food fills meal by meal, the rest are whole or nothing. */
export type OrbBead = { key: string; domain: Domain; icon: IconName; value: number; label: string };

const R = 118; // the bead ring, in the 280 box
const C = 2 * Math.PI * R;
const GAP = 6; // degrees of bare track between two tasks' arcs

/** The Today hero (Soma Night): a sphere holding the three hues, brighter as their tasks get done, with one bead
 *  per task on a ring around it. Each bead owns the stretch of ring centred on it and lights it in its own hue for the
 *  share done (food meal by meal), so the ring always says what its beads say. Closed, the ring turns into a spinning
 *  glow. `children` sits in the middle (the count, or the closed mark). */
export function Orb({ beads, closed = false, label, children }: { beads: OrbBead[]; closed?: boolean; label: string; children?: ReactNode }) {
  // How lit each hue is: the mean of its tasks' values, so a half-eaten day half-lights the green.
  const lit = (d: Domain) => { const of = beads.filter((b) => b.domain === d); return of.length ? of.reduce((n, b) => n + b.value, 0) / of.length : 0; };
  const style = { "--pj": lit("journal").toFixed(2), "--pf": lit("food").toFixed(2), "--pa": lit("activity").toFixed(2) } as CSSProperties;
  const slot = 360 / Math.max(1, beads.length);
  const span = ((slot - GAP) / 360) * C; // one task's arc when done, in ring units
  return (
    <div className={cx(s.orb, closed && s.orbClosed)} style={style} role="img" aria-label={label}>
      <div className={s.orbHalo} aria-hidden><i className={s.haloJ} /><i className={s.haloF} /><i className={s.haloA} /></div>
      <div className={s.orbTrack} />
      <svg className={s.orbArc} viewBox="0 0 280 280" aria-hidden>
        {beads.map((b, i) => {
          const v = Math.max(0, Math.min(1, b.value));
          // The svg is turned a quarter back, so 0° is 12 o'clock, where the first bead sits. Each arc starts half a
          // slot before its bead and fills clockwise. Not done, it is hidden rather than removed (a zero dash with
          // round caps still paints a dot), so finishing a task grows its arc instead of popping it in.
          return <circle key={b.key} cx="140" cy="140" r={R} stroke={`var(--${b.domain})`} opacity={v > 0 ? 1 : 0}
            strokeDasharray={`${(v * span).toFixed(1)} ${C.toFixed(1)}`} transform={`rotate(${(i * slot - slot / 2 + GAP / 2).toFixed(1)} 140 140)`} />;
        })}
      </svg>
      <div className={s.orbGlow} />
      <div className={s.orbSphere} aria-hidden><i className={cx(s.blob, s.blobJ)} /><i className={cx(s.blob, s.blobF)} /><i className={cx(s.blob, s.blobA)} /><span className={s.orbGloss} /></div>
      <div className={s.orbCore}>{children}</div>
      {beads.map((b, i) => {
        const a = ((-90 + (i * 360) / beads.length) * Math.PI) / 180;
        return (
          <span key={b.key} title={b.label} aria-hidden
            className={cx(s.bead, s[b.domain], b.value >= 1 && s.beadOn, b.value > 0 && b.value < 1 && s.beadPart)}
            style={{ left: 140 + R * Math.cos(a) - 15, top: 140 + R * Math.sin(a) - 15 }}>
            <Icon name={b.icon} size={14} strokeWidth={2.1} />
          </span>
        );
      })}
    </div>
  );
}
