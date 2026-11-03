import { useId, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { cx, type Domain } from "./primitives";
import s from "./ui.module.css";

/** One task around the orb. `value` is 0–1: food fills meal by meal, the rest are whole or nothing. */
export type OrbBead = { key: string; domain: Domain; icon: IconName; value: number; label: string };

const R = 118; // the bead ring, in the 280 box
const C = 2 * Math.PI * R;

/** The Today hero (Soma Night): a sphere holding the three hues, brighter as their tasks get done, with one bead
 *  per task on a ring around it and an arc for the day's progress. Closed, the ring turns into a spinning glow.
 *  `children` sits in the middle (the count, or the closed mark). */
export function Orb({ beads, progress, closed = false, label, children }: { beads: OrbBead[]; progress: number; closed?: boolean; label: string; children?: ReactNode }) {
  const grad = "orb" + useId().replace(/[^a-zA-Z0-9]/g, "");
  // How lit each hue is: the mean of its tasks' values, so a half-eaten day half-lights the green.
  const lit = (d: Domain) => { const of = beads.filter((b) => b.domain === d); return of.length ? of.reduce((n, b) => n + b.value, 0) / of.length : 0; };
  const style = { "--pj": lit("journal").toFixed(2), "--pf": lit("food").toFixed(2), "--pa": lit("activity").toFixed(2) } as CSSProperties;
  return (
    <div className={cx(s.orb, closed && s.orbClosed)} style={style} role="img" aria-label={label}>
      <div className={s.orbHalo} aria-hidden><i className={s.haloJ} /><i className={s.haloF} /><i className={s.haloA} /></div>
      <div className={s.orbTrack} />
      <svg className={s.orbArc} viewBox="0 0 280 280" aria-hidden>
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--journal)" /><stop offset="0.5" stopColor="var(--food)" /><stop offset="1" stopColor="var(--activity)" />
          </linearGradient>
        </defs>
        {progress > 0 && <circle cx="140" cy="140" r={R} stroke={`url(#${grad})`} strokeDasharray={`${(Math.min(1, progress) * C).toFixed(1)} ${C.toFixed(1)}`} />}
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
