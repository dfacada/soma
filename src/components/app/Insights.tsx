"use client";

// Insights: what the last few weeks actually looked like. Counts only; no claims the data cannot support.

import { useState } from "react";
import Link from "next/link";
import { insights, type Factor } from "@/lib/insights";
import { Bar, Button, Card, Icon, Segmented, Stat } from "@/components/ui";
import { useDays } from "./Days";
import { useHealth } from "./Health";
import { useJournal } from "./Journal";
import { useRounds } from "./Rounds";
import { useSession } from "./Session";
import a from "./app.module.css";

const MIN_DAYS = 5;
const pct = (n: number) => Math.round(n * 100);
const of = (n: number, total: number) => `${n} of ${total}`;
const hm = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
/** A difference smaller than this between good days and the rest is not worth a line. */
const LIFT = 0.15;

export function InsightsScreen() {
  const { settings } = useSession();
  const { map, error, reload, today } = useDays();
  const { target } = useRounds();
  const health = useHealth();
  const { vault, openVault } = useJournal();
  const [range, setRange] = useState<"14" | "30" | "60">("30");

  if (error) return <div className={a.page}><span className="d" style={{ fontSize: 28 }}>Couldn&apos;t load insights</span><p className="muted">{error}</p><div><Button onClick={reload}>Try again</Button></div></div>;
  if (!map) return <div className={a.page}><span className="eb">Loading</span></div>;

  const n = Number(range);
  const i = insights(map, settings, today, n, target, health.nights);
  const more = i.factors.filter((f) => f.lift >= LIFT).slice(0, 6);
  const less = i.factors.filter((f) => f.lift <= -LIFT).slice(-3).reverse();
  const linked = health.status === "connected" || health.status === "reconnect";
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
        <Bar label="Weight" value={pct(i.rates.weight)} max={100} text={`${pct(i.rates.weight)}%`} color="var(--food-bar)" />
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
            <span className="eb" style={{ color: "var(--ink)" }}>What your best days have in common</span>
            {more.length || less.length ? (
              <>
                {more.map((f) => <FactorRow key={f.label} f={f} />)}
                {less.length > 0 && <span className="eb" style={{ paddingTop: 6 }}>Less often on your best days</span>}
                {less.map((f) => <FactorRow key={f.label} f={f} />)}
                <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Each bar pair is your best days against every other day you checked in. It shows what tends to go together in your own record, not what causes what.</p>
              </>
            ) : <p className={a.signal}>{i.good.days < 3 ? "This needs at least three days rated as good ones, and three that were not." : "Nothing stands out yet: your best days and the rest look alike on everything Soma records."}</p>}
          </Card>

          <Card>
            <div className={a.entryHead}><span className="eb" style={{ color: "var(--ink)" }}>Mood by sleep</span>{i.sleep && <span className="muted" style={{ fontSize: 11 }}>{i.sleep.nights} nights · avg {hm(i.sleep.avg)}</span>}</div>
            {i.sleep ? (
              <>
                {i.sleep.buckets.map((b, x) => <Bar key={b.label} label={`${b.label} · ${b.nights} night${b.nights === 1 ? "" : "s"}`} value={b.nights ? pct(b.good / b.nights) : 0} max={100} text={b.nights ? `${pct(b.good / b.nights)}% good days` : "no nights"} color={["var(--journal-pale)", "var(--journal-soft)", "var(--journal)"][x]} />)}
                <p className={a.signal}>
                  {i.sleep.goodAvg !== null ? <>The night before your good days you slept <strong>{hm(i.sleep.goodAvg)}</strong> on average{i.sleep.hardAvg !== null ? <>, and <strong>{hm(i.sleep.hardAvg)}</strong> before the hard ones</> : null}. </> : null}
                  {i.sleep.hardNights > 0 ? `${of(i.sleep.hardShort, i.sleep.hardNights)} hard day${i.sleep.hardNights === 1 ? "" : "s"} came after a night under six hours.` : ""}
                </p>
              </>
            ) : vault !== "open" && linked ? (
              <p className={a.signal}>Sleep is stored encrypted. <button type="button" className={a.lnk} style={{ color: "var(--journal)", fontSize: 14 }} onClick={openVault}>Unlock your vault</button> to see it here.</p>
            ) : linked && health.sleepAllowed === false ? (
              <p className={a.signal}>Your Fitbit connection was made before Soma asked for sleep. <Link href="/settings/" className={a.lnk} style={{ color: "var(--journal)", fontSize: 14 }}>Reconnect in Settings</Link> and allow sleep.</p>
            ) : linked ? (
              <p className={a.signal}>No nights recorded in this window yet. They arrive with the next sync.</p>
            ) : (
              <p className={a.signal}><Link href="/settings/" className={a.lnk} style={{ color: "var(--journal)", fontSize: 14 }}>Connect Fitbit in Settings</Link> to compare your days with the night before.</p>
            )}
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
        {i.steps.days > 0 && <Stat label="Avg steps" value={<span className="m">{i.steps.avg.toLocaleString("en-US")}</span>} note={`${i.steps.days} days · goal ${settings.goals.steps.toLocaleString("en-US")}`} />}
        {i.sleep && <Stat label="Avg sleep" value={<span className="m">{hm(i.sleep.avg)}</span>} note={`${i.sleep.nights} nights asleep time`} />}
        <Stat label="Weight" value={<span className="m">{i.weight ? `${i.weight.change > 0 ? "+" : ""}${i.weight.change}` : "—"}</span>} note={i.weight ? `${i.weight.first} → ${i.weight.last} lb` : "log two days to see a change"} />
      </div>

      <div className={a.privacy}>
        <Icon name="lock" size={16} />
        <p>These numbers come from check-ins, food, activity and, with your vault open, your sleep. All of it is compared on this device. Journal entries are encrypted and are not read here; written pattern analysis arrives with the Claude job, and only with your consent.</p>
      </div>
    </div>
  );
}

/** One thing a day can have: how often on the best days (solid) against every other checked-in day (pale). */
function FactorRow({ f }: { f: Factor }) {
  const good = pct(f.good / f.goodDays), rest = pct(f.rest / f.restDays);
  return (
    <div className={a.factor}>
      <div className={a.factorHead}><span>{f.label}</span><span className="m muted">{good}% · {rest}%</span></div>
      <div className={a.factorTrack} role="img" aria-label={`${f.label}: ${of(f.good, f.goodDays)} best days, ${of(f.rest, f.restDays)} other days`}>
        <i style={{ width: good + "%", background: "var(--journal)" }} />
        <i style={{ width: rest + "%", background: "var(--hairline)" }} />
      </div>
      <span className="muted" style={{ fontSize: 11 }}>{of(f.good, f.goodDays)} best days · {of(f.rest, f.restDays)} other days</span>
    </div>
  );
}
