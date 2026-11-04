"use client";

// Steps, a tap away from the steps pill on Today and Activity (David, 2026-11-04: "When I click on steps I want to be
// able to see the history of steps just like clicking on the sleep"). The day against your goal, then the last 7 or
// 30 days as bars under the goal line, with the average, how many days reached it and the best one. Tap a bar, or
// slide a finger along them, and the top shows that day. Steps are Google Health's daily totals, kept in the day map,
// so the history reaches back as far as the screens load (Days.tsx).

import { useState, type CSSProperties, type PointerEvent } from "react";
import { Button, Segmented, Sheet } from "@/components/ui";
import { clock12 } from "@/lib/sleep";
import { kSteps, lastDays, scaleOf, summaryOf } from "@/lib/steps";
import { dayKey, fromKey, WEEKDAYS } from "@/lib/today";
import { longDay } from "./DayBanner";
import { useDays } from "./Days";
import { useHealth } from "./Health";
import { useJournal } from "./Journal";
import { useSession } from "./Session";
import { useGoTab } from "./tabs";
import z from "./steps.module.css";

const fmt = (n: number) => n.toLocaleString("en-US");
type Range = "7" | "30";
const RANGES: { value: Range; label: string }[] = [{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }];
const dateShort = (key: string) => fromKey(key).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** When the last sync ran: "at 10:42 am" today, else "3 Nov, 10:42 am". */
function syncedAt(ms: number, todayKey: string) {
  const t = new Date(ms);
  const time = clock12(`${t.getHours()}:${String(t.getMinutes()).padStart(2, "0")}`);
  return dayKey(t) === todayKey ? `at ${time}` : `${t.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${time}`;
}

export function StepsSheet({ open, onClose, day }: { open: boolean; onClose: () => void; day: string }) {
  return (
    <Sheet open={open} title="Steps" onClose={onClose}>
      <StepsBody day={day} onClose={onClose} />
    </Sheet>
  );
}

/** Inside the sheet, so the range and the picked day start over each time it opens. */
function StepsBody({ day, onClose }: { day: string; onClose: () => void }) {
  const { map, todayKey } = useDays();
  const { settings } = useSession();
  const health = useHealth();
  const { vault } = useJournal();
  const goTab = useGoTab();
  const goal = Math.max(1, settings.goals.steps);
  const [range, setRange] = useState<Range>("7");
  const [pick, setPick] = useState<string | null>(null);

  const days = lastDays(map, day, Number(range));
  const month = range === "30";
  const shown = pick ?? day;
  const raw = map?.[shown]?.activity?.steps;
  const n = typeof raw === "number" ? raw : null;
  const going = shown === todayKey;
  const pct = n === null ? 0 : Math.round((n / goal) * 100);
  const sum = summaryOf(days, goal, todayKey);

  // Round numbers up the side; one that would crowd the goal line gives way to it.
  const { top, ticks } = scaleOf(days.map((d) => d.steps ?? 0), goal);
  const at = (v: number) => `${Math.min(100, (v / top) * 100).toFixed(2)}%`;
  const lines = ticks.filter((t) => Math.abs(t - goal) > top * 0.09);
  const best = sum.best ? (sum.best.key === todayKey ? "today" : `on ${month ? fromKey(sum.best.key).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : fromKey(sum.best.key).toLocaleDateString("en-GB", { weekday: "long" })}`) : "";

  const choose = (key: string) => setPick(key === day ? null : key);
  // Slide along the bars to read each day: the finger's place across the chart picks the day under it.
  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" ? e.buttons !== 1 : !e.isPrimary) return;
    const r = e.currentTarget.getBoundingClientRect();
    const d = days[Math.max(0, Math.min(days.length - 1, Math.floor(((e.clientX - r.left) / r.width) * days.length)))];
    if (d && d.key !== shown) choose(d.key);
  };
  const cols = { "--n": days.length } as CSSProperties;

  return (
    <div className={z.steps}>
      <div className={z.hero}>
        <span className="eb">{going ? "Today" : longDay(fromKey(shown))}</span>
        {n !== null ? (
          <>
            <div className={z.big}><span key={shown} className={`dc ${z.roll}`}>{fmt(n)}</span><span className={z.unit}>steps</span></div>
            <div className={z.goal} role="img" aria-label={`${pct}% of your ${fmt(goal)} goal`}>
              <span className={z.goalTrack}><i key={shown} className={n >= goal ? z.met : undefined} style={{ width: `${Math.min(100, (n / goal) * 100).toFixed(1)}%` }} /></span>
              <span className="m">{pct}% of {fmt(goal)}</span>
            </div>
            <p className={z.when}>
              {n >= goal ? <>Goal reached{n > goal ? <>, <b>{fmt(n - goal)}</b> over</> : null}.</>
                : going ? <><b>{fmt(goal - n)}</b> to go.</>
                : <><b>{fmt(goal - n)}</b> short of your goal.</>}
            </p>
          </>
        ) : (
          <p className={z.none}>{going ? "Nothing synced for today yet. Trackers send steps through the day, and Soma checks every half hour while it's open." : "No steps were reported for this day."}</p>
        )}
      </div>

      <section className={z.part}>
        <div className={z.partHead}>
          <Segmented options={RANGES} value={range} label="How many days" onChange={(v) => { setRange(v); setPick(null); }} />
          {sum.avg > 0 && <span className="m muted" aria-label={`Average ${fmt(sum.avg)} a day${day === todayKey ? ", not counting today" : ""}`}>avg {fmt(sum.avg)}</span>}
        </div>
        <div key={range} className={z.chart}>
          <div className={z.axis} aria-hidden>
            {lines.map((t) => <span key={t} style={{ bottom: at(t) }}>{kSteps(t)}</span>)}
            <span className={z.axisGoal} style={{ bottom: at(goal) }}>{kSteps(goal)}</span>
          </div>
          <div className={`${z.cols} ${month ? z.month : ""} ${pick ? z.picking : ""}`} style={cols} role="group" aria-label="Steps by day" onPointerDown={scrub} onPointerMove={scrub}>
            {lines.map((t) => <i key={t} className={z.gridLine} style={{ bottom: at(t) }} aria-hidden />)}
            <i className={z.goalLine} style={{ bottom: at(goal) }} aria-hidden />
            {days.map((d, i) => (
              <button key={d.key} type="button" className={`${z.col} ${d.key === shown ? z.colOn : ""}`} aria-pressed={d.key === shown}
                aria-label={`${d.key === todayKey ? "Today" : longDay(fromKey(d.key))}: ${d.steps === null ? "nothing synced" : `${fmt(d.steps)} steps`}`}
                onClick={() => choose(d.key)}>
                <span className={z.lane}>
                  {d.steps ? <i className={d.steps >= goal ? z.met : undefined} style={{ height: at(d.steps), animationDelay: `${i * (month ? 12 : 40)}ms` }} /> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className={`${z.foot} ${month ? z.month : ""}`} style={cols} aria-hidden>
          <span />
          {days.map((d, i) => {
            const on = d.key === shown;
            if (!month) {
              return (
                <span key={d.key} className={on ? z.footOn : undefined}>
                  <span className="m">{d.steps === null ? "–" : kSteps(d.steps)}</span>
                  <span className={z.footDay}>{WEEKDAYS[fromKey(d.key).getDay()]}</span>
                </span>
              );
            }
            // Thirty days: a date every week, counted back from the last day, so the last day always has one.
            const label = (days.length - 1 - i) % 7 === 0;
            return <span key={d.key} className={`${on ? z.footOn : ""} ${i === days.length - 1 ? z.footEnd : ""}`}>{label && <span className={z.footDay}>{dateShort(d.key)}</span>}</span>;
          })}
        </div>
        {sum.counted > 0 && (
          <p className={z.line}>
            {sum.met} of {sum.counted} {sum.counted === 1 ? "day" : "days"} reached {fmt(goal)}.{sum.best ? ` Most ${best}: ${fmt(sum.best.steps)}.` : ""}
          </p>
        )}
      </section>

      <div className={z.sync}>
        <p className={z.note}>
          {health.status === "reconnect" ? "Google ended the Fitbit connection, so new steps have stopped." : `From Google Health${health.status === "connected" && health.lastSyncMs ? `, synced ${syncedAt(health.lastSyncMs, todayKey)}` : ""}.`}
          {sum.avg > 0 && day === todayKey ? " Today joins the average once it's over." : ""}
        </p>
        {health.status === "connected" && vault === "open" && (
          <Button size="sm" variant="secondary" disabled={health.syncing} onClick={health.syncNow}>{health.syncing ? "Syncing…" : "Sync now"}</Button>
        )}
        {health.status === "reconnect" && <Button size="sm" variant="activity" onClick={() => { onClose(); goTab("settings", "fitbit"); }}>Reconnect</Button>}
      </div>
    </div>
  );
}
