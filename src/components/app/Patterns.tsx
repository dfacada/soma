"use client";

// Insights → Patterns (David, 2026-10-21, from the Phase 2 proposal): the weight trend with a seven-day average and
// the days activity was logged, and weight by day of the week. Plain SVG drawn to one scale, sized for a phone.
// The mood split by condition joins this section once David picks its protein threshold.

import { Card } from "@/components/ui";
import { activityDays, byWeekday, heaviestWeekday, trailingAverage, weighIns, type WeighIn } from "@/lib/patterns";
import type { DayMap } from "@/lib/today";
import a from "./app.module.css";

const W = 312; // viewBox width: about the width it is drawn at on a phone, so its type stays readable there
const FULL: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const fmtDay = (day: string) => new Date(day + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Gridlines every 1, 2 or 5 lb, whichever gives three to six lines, covering every weigh-in. */
function scale(weights: number[]) {
  const lo = Math.min(...weights), hi = Math.max(...weights);
  const step = hi - lo <= 4 ? 1 : hi - lo <= 10 ? 2 : 5;
  const from = Math.floor(lo / step) * step, to = Math.max(Math.ceil(hi / step) * step, from + step);
  const ticks: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10);
  return { from, to, ticks };
}

export function Patterns({ map, days }: { map: DayMap; days: string[] }) {
  const points = weighIns(map, days);
  return (
    <Card>
      <div className={a.entryHead}>
        <span className="eb" style={{ color: "var(--ink)" }}>Patterns</span>
        <span className="muted" style={{ fontSize: 11 }}>{points.length} weigh-in{points.length === 1 ? "" : "s"}</span>
      </div>
      {points.length < 3 ? (
        <p className={a.signal}>Log your weight on a few more days in this window to see its trend and how it moves through the week.</p>
      ) : (
        <>
          <WeightTrend points={points} days={days} active={activityDays(map, days)} />
          <WeekdayWeight points={points} />
        </>
      )}
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
        {points.length < 20 ? `Small sample: ${points.length} weigh-in${points.length === 1 ? "" : "s"} in this window. ` : ""}
        These charts show what goes together in your own record, not what causes what. Read them as hints that firm up as the days add up.
      </p>
    </Card>
  );
}

function WeightTrend({ points, days, active }: { points: WeighIn[]; days: string[]; active: string[] }) {
  const avg = trailingAverage(points);
  const { from, to, ticks } = scale(points.map((p) => p.weight));
  const H = 170, L = 34, R = 8, T = 8, B = 38;
  const index = new Map(days.map((d, i) => [d, i]));
  const x = (day: string) => L + ((index.get(day) ?? 0) / Math.max(1, days.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - from) / (to - from)) * (H - T - B);
  const last = avg[avg.length - 1];
  const line = avg.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)} ${y(p.avg).toFixed(1)}`).join(" ");
  return (
    <figure className={a.pattern}>
      <span className={a.patternTitle}>Weight with the noise taken out</span>
      <svg viewBox={`0 0 ${W} ${H}`} className={a.patternSvg} role="img"
        aria-label={`Weight in this window: ${points.length} weigh-ins from ${points[0].weight} to ${points[points.length - 1].weight} pounds. Seven-day average now ${last.avg.toFixed(1)} pounds. Activity logged on ${active.length} days.`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--hairline)" strokeWidth={1} />
            <text x={L - 6} y={y(v) + 3.5} textAnchor="end" className={a.patternAxis}>{v}</text>
          </g>
        ))}
        {active.map((d) => <rect key={d} x={x(d) - 2} y={H - B + 8} width={4} height={8} rx={1.5} fill="var(--activity)" />)}
        <path d={line} fill="none" stroke="var(--food)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p) => <circle key={p.day} cx={x(p.day)} cy={y(p.weight)} r={2.4} fill="var(--muted)" opacity={0.7} />)}
        <circle cx={x(last.day)} cy={y(last.avg)} r={3.8} fill="var(--food)" stroke="var(--surface)" strokeWidth={1.5} />
        <text x={L} y={H - 4} className={a.patternAxis}>{fmtDay(days[0])}</text>
        <text x={W - R} y={H - 4} textAnchor="end" className={a.patternAxis}>{fmtDay(days[days.length - 1])}</text>
      </svg>
      <div className={a.patternLegend}>
        <span><i style={{ background: "var(--food)" }} />7-day average · {last.avg.toFixed(1)} lb</span>
        <span><i style={{ background: "var(--muted)" }} />Each weigh-in</span>
        <span><i style={{ background: "var(--activity)" }} />Activity day</span>
      </div>
    </figure>
  );
}

function WeekdayWeight({ points }: { points: WeighIn[] }) {
  const groups = byWeekday(points);
  const top = heaviestWeekday(points);
  const { from, to, ticks } = scale(points.map((p) => p.weight));
  const H = 166, L = 34, R = 8, T = 16, B = 40;
  const col = (W - L - R) / 7;
  const y = (v: number) => T + (1 - (v - from) / (to - from)) * (H - T - B);
  return (
    <figure className={a.pattern}>
      <span className={a.patternTitle}>Weight by day of the week</span>
      <svg viewBox={`0 0 ${W} ${H}`} className={a.patternSvg} role="img"
        aria-label={`Average weight by weekday: ${groups.map((g) => `${g.label} ${g.mean === null ? "no weigh-ins" : `${g.mean.toFixed(1)} pounds from ${g.weights.length}`}`).join(", ")}.`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--hairline)" strokeWidth={1} />
            <text x={L - 6} y={y(v) + 3.5} textAnchor="end" className={a.patternAxis}>{v}</text>
          </g>
        ))}
        {groups.map((g, i) => {
          const cx = L + col * i + col / 2;
          const hot = top?.label === g.label;
          return (
            <g key={g.label}>
              {g.weights.map((w, j) => <circle key={j} cx={cx + (j - (g.weights.length - 1) / 2) * Math.min(5, (col - 8) / Math.max(1, g.weights.length))} cy={y(w)} r={2.2} fill="var(--muted)" opacity={0.7} />)}
              {g.mean !== null && <rect x={cx - col * 0.32} y={y(g.mean) - 1.25} width={col * 0.64} height={2.5} rx={1.25} fill={hot ? "var(--activity)" : "var(--food)"} />}
              <text x={cx} y={H - 21} textAnchor="middle" className={hot ? a.patternAxisInk : a.patternAxis}>{g.label}</text>
              <text x={cx} y={H - 5} textAnchor="middle" className={a.patternAxis}>n {g.weights.length}</text>
            </g>
          );
        })}
      </svg>
      <p className={a.signal}>
        {top
          ? <>Your <strong>{FULL[top.label]}</strong> weigh-ins average <strong>{top.over} lb</strong> over every other day. Weekend eating, salt and water tend to show up the next morning, so read that day&apos;s number calmly.</>
          : "No day of the week stands out yet."}
      </p>
    </figure>
  );
}
