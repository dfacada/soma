"use client";

// Sleep, a tap away from Today's sleep pill (David, 2026-11-03, after Google Health's Today: "especially the sleep").
// The night you woke from on the day shown: time asleep against your goal, bed and wake, and the stages as one bar;
// then seven nights as windows on an evening-to-morning axis, so when you slept shows as well as how long. All of it
// from the nights Google Health reports, decrypted on this phone (useHealth). No sleep score: Google does not share
// Fitbit's, and Dayhub does not make one up (CLAUDE.md).

import { Sheet } from "@/components/ui";
import { clock12, hm, lastNights, stagesOf, weekOf, windowOf } from "@/lib/sleep";
import { fromKey, WEEKDAYS } from "@/lib/today";
import { longDay } from "./DayBanner";
import { useHealth } from "./Health";
import { useSession } from "./Session";
import z from "./sleep.module.css";

// The axis runs 6 pm to 2 pm (src/lib/sleep.ts), 20 hours; the chart shows only the hours the week used.
const HOURS = 20;
const hourLabel = (h: number) => { const c = (18 + h) % 24; return c === 0 ? "12 am" : c === 12 ? "noon" : `${c % 12} ${c < 12 ? "am" : "pm"}`; };
/** Time asleep under a column, in the sheet's own unit made compact (a clock face would read as a time of day on an
 *  axis of clock times): 336 → "5h36m", 420 → "7h00m", 45 → "45m". */
const short = (min: number) => {
  const m = Math.max(0, Math.round(min)), h = Math.floor(m / 60);
  return h ? `${h}h${String(m % 60).padStart(2, "0")}m` : `${m}m`;
};

export function SleepSheet({ open, onClose, day, isToday }: { open: boolean; onClose: () => void; day: string; isToday: boolean }) {
  const { nights } = useHealth();
  const { settings } = useSession();
  const goal = settings.sleepGoal;
  const night = nights?.[day] ?? null;
  const week = lastNights(nights, day);
  const sum = weekOf(week, goal);
  const stages = night ? stagesOf(night) : [];

  // Crop the axis to the week, an hour either side, on whole hours.
  const wins = week.map((d) => (d.night ? windowOf(d.night) : null));
  const shown = wins.filter((w): w is NonNullable<typeof w> => w !== null);
  const lo = shown.length ? Math.max(0, Math.floor(Math.min(...shown.map((w) => w.from)) * HOURS) - 1) : 4;
  const hi = shown.length ? Math.min(HOURS, Math.ceil(Math.max(...shown.map((w) => w.to)) * HOURS) + 1) : 14;
  const at = (f: number) => `${(((f * HOURS) - lo) / (hi - lo)) * 100}%`;
  const grid = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((h) => h % 2 === 0);

  return (
    <Sheet open={open} title={isToday ? "Last night" : `The night before ${longDay(fromKey(day))}`} onClose={onClose}>
      <div className={z.sleep}>
        {night ? (
          <div className={z.hero}>
            <div className={z.big}><span className="dc">{hm(night.asleep)}</span><span className={z.unit}>asleep</span></div>
            <div className={z.goal} role="img" aria-label={`${Math.round((night.asleep / goal) * 100)}% of your ${hm(goal)} goal`}>
              <span className={z.goalTrack}><i className={night.asleep >= goal ? z.met : undefined} style={{ width: `${Math.min(100, (night.asleep / goal) * 100).toFixed(1)}%` }} /></span>
              <span className="m">{Math.round((night.asleep / goal) * 100)}% of {hm(goal)}</span>
            </div>
            {night.start && night.end && (
              <p className={z.when}>In bed <b>{clock12(night.start)}</b> to <b>{clock12(night.end)}</b>{night.inBed ? ` · ${hm(night.inBed)}` : ""}{night.awake ? ` · awake ${hm(night.awake)}` : ""}</p>
            )}
          </div>
        ) : (
          <p className={z.none}>{isToday ? "Nothing for last night yet. Trackers often sync later in the morning; Dayhub checks every half hour while it's open." : "No night was reported for this day."}</p>
        )}

        {stages.length > 0 && (
          <section className={z.part}>
            <span className="eb">Stages</span>
            <div className={z.stages} role="img" aria-label={stages.map((s) => `${s.label} ${hm(s.min)}`).join(", ")}>
              {stages.filter((s) => s.min > 0).map((s) => <i key={s.key} className={z[s.key]} style={{ flexGrow: s.min }} />)}
            </div>
            <div className={z.legend}>
              {stages.map((s) => (
                <div key={s.key} className={z.leg}>
                  <i className={z[s.key]} aria-hidden />
                  <span className={z.legName}>{s.label}</span>
                  <span className="m">{hm(s.min)}</span>
                  <span className={`m ${z.legPct}`}>{Math.round(s.share * 100)}%</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={z.part}>
          <div className={z.partHead}>
            <span className="eb">Seven nights</span>
            {sum.nights > 0 && <span className="m muted">avg {hm(sum.avg)}</span>}
          </div>
          <div className={z.chart} role="img" aria-label={week.map((d) => `${WEEKDAYS[fromKey(d.key).getDay()]}: ${d.night ? hm(d.night.asleep) : "no data"}`).join(", ")}>
            <div className={z.axis} aria-hidden>
              {grid.map((h) => <span key={h} style={{ top: at(h / HOURS) }}>{hourLabel(h)}</span>)}
            </div>
            <div className={z.cols}>
              {grid.map((h) => <i key={h} className={z.gridLine} style={{ top: at(h / HOURS) }} aria-hidden />)}
              {week.map((d, i) => {
                const w = wins[i];
                return (
                  <div key={d.key} className={`${z.col} ${d.key === day ? z.colOn : ""}`}>
                    <span className={z.lane}>
                      {w && <i className={d.night!.asleep >= goal ? z.met : undefined} style={{ top: at(w.from), height: `calc(${at(w.to)} - ${at(w.from)})` }} />}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className={z.foot} aria-hidden>
            <span />
            {week.map((d) => (
              <span key={d.key} className={d.key === day ? z.footOn : undefined}>
                <span className="m">{d.night ? short(d.night.asleep) : "–"}</span>
                <span className={z.footDay}>{WEEKDAYS[fromKey(d.key).getDay()]}</span>
              </span>
            ))}
          </div>
          {sum.nights > 0 && (
            <p className={z.line}>
              {sum.met} of {sum.nights} {sum.nights === 1 ? "night" : "nights"} reached {hm(goal)}.{sum.bed && sum.wake ? ` Usually in bed by ${sum.bed}, up at ${sum.wake}.` : ""}
            </p>
          )}
        </section>

        <p className={z.note}>From Google Health, and encrypted with your vault key. Google doesn&apos;t share Fitbit&apos;s sleep score, so Dayhub doesn&apos;t show one.</p>
      </div>
    </Sheet>
  );
}
