"use client";

// Insights: what the last week, month, two months or year actually looked like. It opens with the plain record,
// one line a day (weight, closed or not and why not, what was done), because that is the part with no room for
// flattery. Counts only; no claims the data cannot support.

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Days } from "@/lib/api";
import { dayLog, insights, type Factor, type LogRow } from "@/lib/insights";
import { addDays, dayKey, indexDays, WEEKDAYS, type DayMap } from "@/lib/today";
import { Bar, Button, Card, DayGlyph, Icon, Input, Segmented, Stat } from "@/components/ui";
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
type Range = "7" | "30" | "60" | "365";
const RANGE_LABEL: Record<Range, string> = { "7": "7 days", "30": "30 days", "60": "60 days", "365": "year" };
const LOG_PREVIEW = 7;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The shared day map holds 60 days, which every other screen needs. A year is fetched here, only when asked for. */
async function fetchYear(today: Date): Promise<DayMap> {
  const from = addDays(today, -365);
  const start = new Date(from); start.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setHours(23, 59, 59, 999);
  return indexDays(await api<Days>("GET", `/days?from=${dayKey(from)}&to=${dayKey(today)}&fromMs=${start.getTime()}&toMs=${end.getTime()}`));
}

export function InsightsScreen() {
  const { settings } = useSession();
  const { map, error, reload, change, today } = useDays();
  const { target } = useRounds();
  const health = useHealth();
  const { vault, openVault } = useJournal();
  const [range, setRange] = useState<Range>("30");
  const [year, setYear] = useState<DayMap | null>(null);
  const [yearError, setYearError] = useState(false);
  const [allDays, setAllDays] = useState(false);
  const todayKey = dayKey(today);

  useEffect(() => {
    if (range !== "365" || year) return;
    let alive = true;
    fetchYear(today).then((y) => { if (alive) setYear(y); }, () => { if (alive) setYearError(true); });
    return () => { alive = false; };
    // todayKey, not the Date object: a new Date each render must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, year, todayKey]);

  if (error) return <div className={a.page}><span className="d" style={{ fontSize: 28 }}>Couldn&apos;t load insights</span><p className="muted">{error}</p><div><Button onClick={reload}>Try again</Button></div></div>;
  if (!map) return <div className={a.page}><span className="eb">Loading</span></div>;

  const n = Number(range);
  const waiting = range === "365" && !year && !yearError;
  // The live 60 days go on top of the fetched year, so a tap made a minute ago on Today is already counted here.
  const data = range === "365" && year ? { ...year, ...map } : map;
  const i = insights(data, settings, today, n, target, health.nights);
  const log = dayLog(data, settings, today, n);
  const closedDays = log.filter((r) => r.closed).length;
  const more = i.factors.filter((f) => f.lift >= LIFT).slice(0, 6);
  const less = i.factors.filter((f) => f.lift <= -LIFT).slice(-3).reverse();
  const linked = health.status === "connected" || health.status === "reconnect";
  const maxMood = Math.max(1, ...i.moods.map((m) => m.count));
  const enough = i.checkedIn >= MIN_DAYS;

  return (
    <div className={a.page}>
      <div className={a.pageHead}>
        <div>
          <div className="eb">{waiting ? "Loading a year…" : `Last ${RANGE_LABEL[range]} · ${i.closed} closed`}</div>
          <div className={`d ${a.pageTitle}`}>Insights</div>
        </div>
        <Segmented label="Window" value={range} onChange={(v) => { setRange(v as Range); setAllDays(false); }} options={[{ value: "7", label: "7d" }, { value: "30", label: "30d" }, { value: "60", label: "60d" }, { value: "365", label: "1y" }]} />
      </div>

      {yearError && <div className={a.unsaved} role="alert"><span>Couldn&apos;t load the year. Showing the last 60 days.</span><Button size="sm" variant="secondary" onClick={() => setYearError(false)}>Retry</Button></div>}

      <WeightCard
        days={Array.from({ length: n }, (_, d) => data[dayKey(addDays(today, d - (n - 1)))]?.weight)}
        label={RANGE_LABEL[range]}
        current={map[todayKey]?.weight}
        onLog={(v) => change("weight", todayKey, (d) => { d.weight.value = v; })}
      />

      <Card>
        <div className={a.entryHead}>
          <span className="eb" style={{ color: "var(--ink)" }}>Day by day</span>
          <span className="muted" style={{ fontSize: 11 }}>{log.length ? `${closedDays} of ${log.length} closed` : ""}</span>
        </div>
        {log.length === 0 && <p className={a.signal}>Nothing logged in this window yet.</p>}
        {(allDays ? log : log.slice(0, LOG_PREVIEW)).map((r) => <LogLine key={r.day} r={r} today={todayKey} />)}
        {log.length > LOG_PREVIEW && <button type="button" className={a.lnk} style={{ alignSelf: "center", minHeight: 44 }} onClick={() => setAllDays((v) => !v)}>{allDays ? "Show the last week only" : `Show all ${log.length} days`}</button>}
      </Card>

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

/** A day as it was: the scale, closed or what kept it open, and what was done. Nothing is rounded up. */
function LogLine({ r, today }: { r: LogRow; today: string }) {
  const d = new Date(Number(r.day.slice(0, 4)), Number(r.day.slice(5, 7)) - 1, Number(r.day.slice(8, 10)), 12);
  return (
    <div className={`${a.logRow} ${r.empty ? a.logEmpty : ""}`}>
      <div className={a.logDate}><span className="eb" style={{ color: r.day === today ? "var(--ink)" : undefined }}>{r.day === today ? "Today" : WEEKDAYS[d.getDay()]}</span><span className="m" style={{ fontSize: 12 }}>{MONTHS[d.getMonth()]} {d.getDate()}</span></div>
      <div className={a.logBody}>
        <div className={a.logTop}>
          <span className="m" style={{ fontSize: 14, fontWeight: 500 }}>{r.weight !== null ? `${r.weight} lb` : "no weight"}</span>
          <span className={r.closed ? a.logClosed : a.logOpen}>{r.empty ? "nothing logged" : r.closed ? "closed" : `${r.done}/${r.total} · missed ${r.missed.join(", ").toLowerCase()}`}</span>
        </div>
        {!r.empty && <span className="muted" style={{ fontSize: 12 }}>{r.did.length ? r.did.join(" · ") : "no activity"}{r.mood ? ` · ${r.mood.toLowerCase()}` : ""}</span>}
      </div>
      <DayGlyph done={r.done} total={r.total} />
    </div>
  );
}

/** Weight over the chosen window, and a box to log today's. Moved here from Food (David, 2026-09-23): the trend is
 *  a reading of the record, and Today keeps the tap that closes the day. */
function WeightCard({ days, label, current, onLog }: { days: (number | undefined)[]; label: string; current: number | undefined; onLog: (v: number) => void }) {
  const [value, setValue] = useState("");
  const logged = days.filter((v): v is number => v !== undefined);
  const min = Math.min(...logged), max = Math.max(...logged), span = Math.max(1, max - min);
  const step = 326 / Math.max(1, days.length - 1);
  const points = days.map((v, idx) => (v === undefined ? null : `${(idx * step).toFixed(1)},${(48 - ((v - min) / span) * 40).toFixed(1)}`)).filter(Boolean).join(" ");
  const first = logged[0];
  const parsed = parseFloat(value);
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 2000;

  return (
    <Card>
      <div className={a.entryHead}>
        <span className="eb" style={{ color: "var(--ink)" }}>Weight · {label}</span>
        <span className="m" style={{ fontSize: 13 }}>
          {current !== undefined
            ? <><span style={{ fontWeight: 500 }}>{current} lb</span>{first !== undefined && logged.length > 1 && <span className="muted"> · {current - first <= 0 ? "↓" : "↑"}{Math.abs(current - first).toFixed(1)}</span>}</>
            : <span className="muted">not logged today</span>}
        </span>
      </div>
      {logged.length > 1 ? (
        <svg viewBox="0 0 326 56" style={{ width: "100%", height: 56 }} role="img" aria-label={`Weight over the last ${label}, from ${first} to ${logged[logged.length - 1]} pounds`}>
          <path d="M0 48 L326 48" stroke="var(--surface-2)" /><path d="M0 8 L326 8" stroke="var(--surface-2)" />
          <polyline fill="none" stroke="var(--food)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={points} />
        </svg>
      ) : <p className="muted" style={{ fontSize: 13 }}>Log a couple of days and the trend shows up here.</p>}
      <form className={a.extraForm} onSubmit={(e) => { e.preventDefault(); if (!valid) return; onLog(Math.round(parsed * 10) / 10); setValue(""); }}>
        <Input placeholder={current !== undefined ? String(current) : "182.0"} aria-label="Weight in pounds" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} />
        <Button type="submit" disabled={!valid}>Log weight</Button>
      </form>
    </Card>
  );
}
