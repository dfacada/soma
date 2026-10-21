"use client";

// Insights → Patterns (David, 2026-10-21, from the Phase 2 proposal): mood on days you did a thing against days you
// did not, the weight trend with a seven-day average and the days activity was logged, and weight by day of the week.
// Plain SVG drawn to one scale, sized for a phone. The protein row tests the person's own goal (David chose the exact
// goal over a softer line); any row with too few days on a side says so instead of drawing a share.

import { Card } from "@/components/ui";
import type { Nights } from "@/lib/health";
import { activityDays, byWeekday, heaviestWeekday, moodSplit, trailingAverage, weighIns, MIN_SIDE, type SplitRow, type SplitSide, type WeighIn } from "@/lib/patterns";
import type { Settings } from "@/lib/settings";
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

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function Patterns({ map, days, settings, nights }: { map: DayMap; days: string[]; settings: Settings; nights: Nights | null }) {
  const points = weighIns(map, days);
  const split = moodSplit(map, days, settings, nights);
  const small = [split.checkedIn < 20 && plural(split.checkedIn, "check-in"), points.length < 20 && plural(points.length, "weigh-in")].filter(Boolean);
  return (
    <Card>
      <div className={a.entryHead}>
        <span className="eb" style={{ color: "var(--ink)" }}>Patterns</span>
        <span className="muted" style={{ fontSize: 11 }}>{plural(split.checkedIn, "check-in")} · {plural(points.length, "weigh-in")}</span>
      </div>
      {split.checkedIn >= MIN_SIDE * 2
        ? <MoodSplit rows={split.rows} goal={settings.goals.protein} />
        : <p className={a.signal}>Check in on a few more days in this window to compare your mood with what you did.</p>}
      {points.length < 3 ? (
        <p className={a.signal}>Log your weight on a few more days in this window to see its trend and how it moves through the week.</p>
      ) : (
        <>
          <WeightTrend points={points} days={days} active={activityDays(map, days)} />
          <WeekdayWeight points={points} />
        </>
      )}
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
        {small.length ? `Small sample: ${small.join(" and ")} in this window. ` : ""}
        These charts show what goes together in your own record, not what causes what. Read them as hints that firm up as the days add up.
      </p>
    </Card>
  );
}

const BANDS = [["good", "Good day", "var(--journal)"], ["other", "Other", "var(--surface-2)"], ["hard", "Hard day", "var(--activity)"]] as const;
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/** Chart A: for each thing, its days against the rest, as shares of good, other and hard days. */
function MoodSplit({ rows, goal }: { rows: SplitRow[]; goal: number }) {
  // Each row's name on its own line, the bars under it: names like "Hit your 200 g protein goal" need the full width.
  const label = 74, nW = 30, barW = W - label - nW, head = 16, rowH = 20, gap = 5, groupGap = 14, thinH = 20;
  const tops: number[] = [];
  let y = 0;
  for (const r of rows) { tops.push(y); y += head + (r.enough ? 2 * (rowH + gap) - gap : thinH) + groupGap; }
  const H = Math.max(10, y - groupGap);
  const protein = rows[0];
  const bars = (s: SplitSide, top: number) => {
    const xs: number[] = [];
    BANDS.reduce((x, [key]) => { xs.push(x); return x + (s.days ? (s[key] / s.days) * barW : 0); }, label);
    return BANDS.map(([key, , fill], i) => {
      const w = s.days ? (s[key] / s.days) * barW : 0;
      return w > 0 ? (
        <g key={key}>
          <rect x={xs[i]} y={top} width={Math.max(0, w - 1.5)} height={rowH} rx={3} fill={fill} />
          {key === "good" && w > 26 && <text x={xs[i] + 5} y={top + rowH / 2 + 3.5} className={a.patternOnHue}>{pct(s.good, s.days)}%</text>}
        </g>
      ) : null;
    });
  };
  return (
    <figure className={a.pattern}>
      <span className={a.patternTitle}>Mood on days you did a thing, and days you didn&apos;t</span>
      <svg viewBox={`0 0 ${W} ${H}`} className={a.patternSvg} role="img"
        aria-label={rows.map((r) => (r.enough ? `${r.label}: ${pct(r.yes.good, r.yes.days)}% good days of ${r.yes.days}, against ${pct(r.no.good, r.no.days)}% of the other ${r.no.days}` : `${r.label}: not enough days yet`)).join(". ") + "."}>
        {rows.map((r, i) => {
          const top = tops[i] + head;
          return r.enough ? (
            <g key={r.label}>
              <text x={0} y={tops[i] + 11} className={a.patternAxisInk}>{r.label}</text>
              <text x={0} y={top + rowH / 2 + 3.5} className={a.patternAxis}>these days</text>
              {bars(r.yes, top)}
              <text x={W} y={top + rowH / 2 + 3.5} textAnchor="end" className={a.patternAxis}>n {r.yes.days}</text>
              <text x={0} y={top + rowH + gap + rowH / 2 + 3.5} className={a.patternAxis}>the rest</text>
              {bars(r.no, top + rowH + gap)}
              <text x={W} y={top + rowH + gap + rowH / 2 + 3.5} textAnchor="end" className={a.patternAxis}>n {r.no.days}</text>
            </g>
          ) : (
            <g key={r.label}>
              <text x={0} y={tops[i] + 11} className={a.patternAxisInk}>{r.label}</text>
              <rect x={0.5} y={top} width={W - 1} height={thinH} rx={3} fill="none" stroke="var(--hairline)" strokeDasharray="3 3" />
              <text x={8} y={top + thinH / 2 + 3.5} className={a.patternAxis}>not enough days yet ({plural(r.yes.days, "day")} with it)</text>
            </g>
          );
        })}
      </svg>
      <div className={a.patternLegend}>
        {BANDS.map(([key, name, fill]) => <span key={key}><i style={{ background: fill }} />{name}</span>)}
      </div>
      <p className={a.signal}>
        {protein.enough
          ? <>Good days on <strong>{pct(protein.yes.good, protein.yes.days)}%</strong> of the days you hit your {goal} g protein goal, against <strong>{pct(protein.no.good, protein.no.days)}%</strong> of days you logged less.</>
          : <>Only <strong>{plural(protein.yes.days, "day")}</strong> reached your {goal} g protein goal, too few to compare yet. The row appears once there are {MIN_SIDE} on each side.</>}
      </p>
    </figure>
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
