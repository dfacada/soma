"use client";

// Insights: what the last few weeks actually looked like. Counts only; no claims the data cannot support.

import { useState } from "react";
import { insights } from "@/lib/insights";
import { Bar, Button, Card, Icon, Segmented, Stat } from "@/components/ui";
import { useDays } from "./Days";
import { useRounds } from "./Rounds";
import { useSession } from "./Session";
import a from "./app.module.css";

const MIN_DAYS = 5;
const pct = (n: number) => Math.round(n * 100);
const of = (n: number, total: number) => `${n} of ${total}`;

export function InsightsScreen() {
  const { settings } = useSession();
  const { map, error, reload, today } = useDays();
  const { target } = useRounds();
  const [range, setRange] = useState<"14" | "30" | "60">("30");

  if (error) return <div className={a.page}><span className="d" style={{ fontSize: 28 }}>Couldn&apos;t load insights</span><p className="muted">{error}</p><div><Button onClick={reload}>Try again</Button></div></div>;
  if (!map) return <div className={a.page}><span className="eb">Loading</span></div>;

  const n = Number(range);
  const i = insights(map, settings, today, n, target);
  const maxMood = Math.max(1, ...i.moods.map((m) => m.count));
  const enough = i.checkedIn >= MIN_DAYS;

  return (
    <div className={a.page}>
      <div className={a.pageHead}>
        <div>
          <div className="eb">Last {n} days · {i.closed} closed</div>
          <div className={`d ${a.pageTitle}`}>Insights</div>
        </div>
        <Segmented label="Window" value={range} onChange={setRange} options={[{ value: "14", label: "14d" }, { value: "30", label: "30d" }, { value: "60", label: "60d" }]} />
      </div>

      <Card>
        <span className="eb" style={{ color: "var(--ink)" }}>How often each thing got done</span>
        <Bar label="Check-in" value={pct(i.rates.checkin)} max={100} text={`${pct(i.rates.checkin)}%`} domain="journal" />
        <Bar label="Journal" value={pct(i.rates.journal)} max={100} text={`${pct(i.rates.journal)}%`} color="var(--journal-soft)" />
        <Bar label="All four meals" value={pct(i.rates.food)} max={100} text={`${pct(i.rates.food)}%`} domain="food" />
        <Bar label="Any activity" value={pct(i.rates.activity)} max={100} text={`${pct(i.rates.activity)}%`} domain="activity" />
      </Card>

      {!enough ? (
        <Card>
          <span className="d" style={{ fontSize: 20 }}>Not enough yet</span>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Patterns need a few days to mean anything. Check in on {MIN_DAYS - i.checkedIn} more day{MIN_DAYS - i.checkedIn === 1 ? "" : "s"} and this page starts comparing your good days with your hard ones.</p>
        </Card>
      ) : (
        <>
          <Card>
            <div className={a.signalHead}><i style={{ background: "var(--journal)" }} /><span className="eb" style={{ color: "var(--ink)" }}>Your best-day signal</span></div>
            {i.good.days ? (
              <p className={a.signal}>
                You rated <strong>{i.good.days}</strong> day{i.good.days === 1 ? "" : "s"} as a good one. On <strong>{of(i.good.withActivity, i.good.days)}</strong> you had logged some activity, against {pct(i.baselineActivity)}% of all the days you checked in. You ate all four meals on {of(i.good.withAllMeals, i.good.days)}.
              </p>
            ) : <p className={a.signal}>No days rated Focused, Great, Peaceful, Grateful or Excited in this window.</p>}
          </Card>

          <Card>
            <div className={a.signalHead}><i style={{ background: "var(--activity)" }} /><span className="eb" style={{ color: "var(--ink)" }}>Your hardest-day signal</span></div>
            {i.hard.days ? (
              <p className={a.signal}>
                <strong>{i.hard.days}</strong> day{i.hard.days === 1 ? " was" : "s were"} rated Down, Anxious or Overwhelmed. Activity was logged on {of(i.hard.withActivity, i.hard.days)} and all four meals on {of(i.hard.withAllMeals, i.hard.days)}.
                {i.hard.limitLabel && i.hard.overLimit > 0 ? ` On ${i.hard.overLimit} you were over your ${i.hard.limitLabel.toLowerCase()} limit.` : ""}
              </p>
            ) : <p className={a.signal}>No days rated Down, Anxious or Overwhelmed in this window.</p>}
          </Card>

          <Card>
            <span className="eb" style={{ color: "var(--ink)" }}>Mood mix · {i.checkedIn} check-ins</span>
            {i.moods.map((m) => (
              <div key={m.label} className={a.moodRow}>
                <span className={a.moodLabel}>{m.label}</span>
                <div className={a.moodTrack}><div className={a.moodFill} style={{ width: `${(m.count / maxMood) * 100}%` }} /></div>
                <span className="m muted" style={{ fontSize: 12, width: 20, textAlign: "right" }}>{m.count}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      <div className={a.statGrid}>
        <Stat label="Avg kcal" value={<span className="m">{i.food.loggedDays ? i.food.avgKcal.toLocaleString("en-US") : "—"}</span>} note={i.food.loggedDays ? `${i.food.loggedDays} days logged · ${i.food.onTarget} within 10% of target` : "no food logged"} />
        <Stat label="Avg protein" value={<span className="m">{i.food.loggedDays ? `${i.food.avgProtein} g` : "—"}</span>} note={`target ${settings.goals.protein} g`} />
        <Stat label="Push-ups" value={<span className="m">{i.pushups.total.toLocaleString("en-US")}</span>} note={i.pushups.days ? `${i.pushups.hitDays} target days · best ${i.pushups.best}` : "none logged"} />
        <Stat label="Weight" value={<span className="m">{i.weight ? `${i.weight.change > 0 ? "+" : ""}${i.weight.change}` : "—"}</span>} note={i.weight ? `${i.weight.first} → ${i.weight.last} lb` : "log two days to see a change"} />
      </div>

      <div className={a.privacy}>
        <Icon name="lock" size={16} />
        <p>These numbers come from check-ins, food and activity. Journal entries are encrypted and are not read here. Sleep comparisons arrive with Fitbit; written pattern analysis arrives with the Claude job, and only with your consent.</p>
      </div>
    </div>
  );
}
