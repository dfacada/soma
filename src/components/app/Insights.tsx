"use client";

// Insights, rebuilt (David, 2026-11-02: "way too much information … talk about the insights that really matter").
// In this order: what makes a great day; weight, with this week against last (David: "is my weight drastically going
// up, and what have I been doing that's causing that?"); day by day, everything each day held; what the journal says
// on the good days; how the window went. Every finding is worked out on this device (src/lib/great-days.ts) and is a pattern in the person's
// own record, never a claim about cause. The journal is read on the phone, or by Claude with names and details taken
// out first, as the person chooses in Settings (JournalTone.tsx).

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import Link from "next/link";
import { api, type Days } from "@/lib/api";
import { greatDays, journalTone, MIN_CHECKINS, progress, TASK_LABEL, weekCompare, type Driver, type ToneDriver, type WeekCompare } from "@/lib/great-days";
import { dayLog, type LogRow } from "@/lib/insights";
import { trailingAverage, weighIns } from "@/lib/patterns";
import { addDays, dayKey, indexDays, streak, WEEKDAYS, type DayMap } from "@/lib/today";
import { Button, Card, Icon, Segmented } from "@/components/ui";
import { useDays } from "./Days";
import { useHealth } from "./Health";
import { useJournal } from "./Journal";
import { useJournalTone } from "./JournalTone";
import { useRounds } from "./Rounds";
import { useSession } from "./Session";
import { useGoTab } from "./tabs";
import a from "./app.module.css";
import s from "./insights.module.css";

/** Fewer check-ins than this and there is nothing honest to say about great days yet. */
const MIN_TONE_DAYS = 6;
type Range = "30" | "60" | "365";
const RANGE_LABEL: Record<Range, string> = { "30": "30 days", "60": "60 days", "365": "year" };
const pct = (n: number) => Math.round(n * 100);

/** The shared day map holds 60 days, which every other screen needs. A year is fetched here, only when asked for. */
async function fetchYear(today: Date): Promise<DayMap> {
  const from = addDays(today, -365);
  const start = new Date(from); start.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setHours(23, 59, 59, 999);
  return indexDays(await api<Days>("GET", `/days?from=${dayKey(from)}&to=${dayKey(today)}&fromMs=${start.getTime()}&toMs=${end.getTime()}`));
}

export function InsightsScreen() {
  const { settings } = useSession();
  const { map, error, reload, today, windowDays } = useDays();
  const { target } = useRounds();
  const health = useHealth();
  const [range, setRange] = useState<Range>("30");
  const [year, setYear] = useState<DayMap | null>(null);
  const [yearError, setYearError] = useState(false);
  const todayKey = dayKey(today);

  useEffect(() => {
    if (range !== "365" || year) return;
    let alive = true;
    fetchYear(today).then((y) => { if (alive) setYear(y); }, () => { if (alive) setYearError(true); });
    return () => { alive = false; };
    // todayKey, not the Date object: a new Date each render must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, year, todayKey]);

  const n = range === "365" && !year ? 60 : Number(range);
  const days = useMemo(() => Array.from({ length: n }, (_, i) => dayKey(addDays(today, i - (n - 1)))), [n, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tone = useJournalTone(days);

  if (error) return <div className={a.page}><span className="d" style={{ fontSize: 28 }}>Couldn&apos;t load insights</span><p className="muted">{error}</p><div><Button onClick={reload}>Try again</Button></div></div>;
  if (!map) return <div className={a.page}><span className="eb">Loading</span></div>;

  // The live 60 days go on top of the fetched year, so a tap made a minute ago on Today is already counted here.
  const data = range === "365" && year ? { ...year, ...map } : map;
  const g = greatDays(data, days, settings, target, health.nights);
  const jt = journalTone(data, days, settings, target, health.nights, tone.tones, tone.themes);
  const p = progress(data, days, settings);
  const run = streak(map, settings, today, windowDays);
  const log = dayLog(data, settings, today, days.length);
  const week = weekCompare(data, settings, todayKey);
  const waiting = range === "365" && !year && !yearError;

  return (
    <div className={a.page}>
      <div className={a.pageHead}>
        <div>
          <div className="eb">{waiting ? "Loading a year…" : `The last ${RANGE_LABEL[range]}`}</div>
          <div className={`d ${a.pageTitle}`}>Insights</div>
        </div>
      </div>
      <Segmented block label="Window" value={range} onChange={(v) => setRange(v as Range)}
        options={[{ value: "30", label: "30 days" }, { value: "60", label: "60 days" }, { value: "365", label: "1 year" }]} />
      {yearError && <div className={a.unsaved} role="alert"><span>Couldn&apos;t load the year. Showing the last 60 days.</span><Button size="sm" variant="secondary" onClick={() => { setYearError(false); setYear(null); }}>Retry</Button></div>}

      <GreatDaysCard g={g} />
      <WeightCard data={data} days={days} label={RANGE_LABEL[range]} week={week} />
      <DayByDay log={log} todayKey={todayKey} proteinGoal={settings.goals.protein} />
      <JournalCard jt={jt} tone={tone} />
      <ProgressCard p={p} now={run.now} best={run.best} />

      <Card>
        <div className={s.head}>
          <span className="eb">Week in review</span>
          <Link href="/review/" className={a.lnk}>Open</Link>
        </div>
        <p className={s.note}>What your journal said last week, written up and read aloud. Encrypted like the journal itself.</p>
      </Card>

      <p className={s.footnote}>All of this is worked out on this phone from what you logged. It shows what tends to go together in your own days, not what causes what.</p>
    </div>
  );
}

/** Did it against didn't, as two bars on one scale, with the share on each. */
function Compare({ did, didnt, hue, unit }: { did: number; didnt: number; hue: string; unit: (v: number) => string }) {
  return (
    <div className={s.compare} style={{ "--hue": hue } as CSSProperties} aria-hidden>
      <div className={s.cmpRow}><span className={s.cmpLabel}>Did</span><span className={s.cmpTrack}><i style={{ width: `${Math.max(2, did * 100)}%` }} /></span><span className="m">{unit(did)}</span></div>
      <div className={`${s.cmpRow} ${s.cmpOff}`}><span className={s.cmpLabel}>Didn&apos;t</span><span className={s.cmpTrack}><i style={{ width: `${Math.max(2, didnt * 100)}%` }} /></span><span className="m">{unit(didnt)}</span></div>
    </div>
  );
}

function GreatDaysCard({ g }: { g: ReturnType<typeof greatDays> }) {
  const goTab = useGoTab();
  const enough = g.checkedIn >= MIN_CHECKINS;
  const share = (d: Driver["did"]) => d.hits / d.days;
  return (
    <Card className={s.hero}>
      <span className="eb">What makes a great day</span>
      <div className={s.big}><span className="dc">{g.great}</span><span className="muted">great day{g.great === 1 ? "" : "s"} of {g.checkedIn} checked in</span></div>
      {!enough ? (
        <>
          <p className={s.note}>A great day is one you check in as Great, Focused, Peaceful, Grateful or Excited. Check in on {MIN_CHECKINS - g.checkedIn} more day{MIN_CHECKINS - g.checkedIn === 1 ? "" : "s"} and this starts showing what your great days have in common.</p>
          <div><Button size="sm" variant="journal" onClick={() => goTab("today")}>Check in on Today</Button></div>
        </>
      ) : g.lifts.length === 0 ? (
        <p className={s.note}>Nothing stands out yet: your great days and the rest look alike so far. It sharpens as the days add up.</p>
      ) : (
        <>
          <p className={s.lead}>On your great days, you more often…</p>
          <ol className={s.list}>
            {g.lifts.slice(0, 3).map((d) => (
              <li key={d.key} className={s.item}>
                <span className={s.itemTitle}>{d.label}</span>
                <Compare did={share(d.did)} didnt={share(d.didnt)} hue="var(--journal)" unit={(v) => `${pct(v)}%`} />
                <span className={s.itemSub}>Great on {d.did.hits} of {d.did.days} days you did, {d.didnt.hits} of {d.didnt.days} when you didn&apos;t.</span>
              </li>
            ))}
          </ol>
          {g.drags[0] && <p className={s.note}><span className={s.dragDot} />Days you {lowerFirst(g.drags[0].label)} are less often great ({pct(share(g.drags[0].did))}% against {pct(share(g.drags[0].didnt))}%).</p>}
        </>
      )}
    </Card>
  );
}

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
/** -1…1 tone as a 0…1 bar, and as words. */
const toneBar = (t: number) => (t + 1) / 2;
const toneWord = (t: number) => (t >= 0.45 ? "bright" : t >= 0.15 ? "upbeat" : t > -0.15 ? "even" : t > -0.45 ? "low" : "heavy");

function JournalCard({ jt, tone }: { jt: ReturnType<typeof journalTone>; tone: ReturnType<typeof useJournalTone> }) {
  const { openVault } = useJournal();
  const goTab = useGoTab();
  const how = tone.source === "claude"
    ? "Read by Claude with names, places and details taken out first, under no account, and nothing kept on the server."
    : "Read on this phone. Nothing left it.";
  return (
    <Card>
      <div className={s.head}><span className="eb">What your journal says</span>{tone.status === "ready" && jt.days > 0 && <span className={s.meta}>{jt.days} day{jt.days === 1 ? "" : "s"} read</span>}</div>
      {tone.status === "locked" ? (
        <>
          <p className={s.note}>Your journal is encrypted. Unlock your vault to see how your entries sound on your good days.</p>
          <div><Button size="sm" variant="journal" onClick={openVault}><Icon name="lock" size={15} />Unlock</Button></div>
        </>
      ) : tone.status === "loading" ? (
        <p className={s.note}>Opening your entries…</p>
      ) : tone.total === 0 ? (
        <p className={s.note}>No words to read yet in this window. Written entries count, and recordings once they are transcribed (Settings → Journal & vault).</p>
      ) : jt.days < MIN_TONE_DAYS ? (
        <p className={s.note}>{tone.status === "reading" ? `Reading your entries… ${tone.read} of ${tone.total} days.` : `${jt.days} day${jt.days === 1 ? "" : "s"} with words so far. A few more and this shows which habits come with your brightest entries.`}</p>
      ) : (
        <>
          <div className={s.big}><span className="d" style={{ fontSize: 30 }}>{cap(toneWord(jt.mean))}</span><span className="muted">is how your entries sound, on average</span></div>
          {jt.brighter.length > 0 ? (
            <>
              <p className={s.lead}>Your entries sound brightest on days you…</p>
              <ol className={s.list}>
                {jt.brighter.slice(0, 3).map((d: ToneDriver) => (
                  <li key={d.key} className={s.item}>
                    <span className={s.itemTitle}>{d.label}</span>
                    <Compare did={toneBar(d.did.mean)} didnt={toneBar(d.didnt.mean)} hue="var(--food)" unit={(v) => toneWord(v * 2 - 1)} />
                  </li>
                ))}
              </ol>
            </>
          ) : <p className={s.note}>No habit stands out against how your entries sound yet.</p>}
          {jt.brightThemes.length > 0 && (
            <div className={s.themes}>
              <span className={s.lead} style={{ margin: 0 }}>On your brightest days you talk about</span>
              <div className={s.chips}>{jt.brightThemes.map((t) => <span key={t} className={s.chip}>{t}</span>)}</div>
            </div>
          )}
          {tone.status === "reading" && <p className={s.note}>Still reading: {tone.read} of {tone.total} days.</p>}
          {tone.status === "failed" && <p className={s.note}>Some days couldn&apos;t be read just now; those use the phone&apos;s reading until next time.</p>}
        </>
      )}
      {tone.status !== "locked" && <p className={s.how}><Icon name="lock" size={13} />{how} <button type="button" className={a.lnk} onClick={() => goTab("settings", "journal")}>Change</button></p>}
    </Card>
  );
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function ProgressCard({ p, now, best }: { p: ReturnType<typeof progress>; now: number; best: number }) {
  // Up to two months: fifteen days a row. A year: a column a week, seven rows, like a wall calendar turned sideways.
  const year = p.perDay.length > 60;
  return (
    <Card>
      <div className={s.head}><span className="eb">How you&apos;re doing</span><span className={s.meta}><Icon name="flame" size={13} />{now} in a row · best {best}</span></div>
      <div className={s.big}><span className="dc">{p.days ? pct(p.closed / p.days) : 0}%</span><span className="muted">of days closed, {p.closed} of {p.days}</span></div>
      {/* One square a day, oldest first, filled by how much of it got done. */}
      <div className={`${s.cal} ${year ? s.calYear : ""}`} style={year ? { gridTemplateColumns: `repeat(${Math.ceil(p.perDay.length / 7)}, minmax(0, 1fr))` } : undefined} role="img" aria-label={`${p.closed} of ${p.days} days closed`}>
        {p.perDay.map((d) => (
          <i key={d.day} title={d.day} className={d.done >= d.total ? s.calFull : undefined} style={d.done > 0 && d.done < d.total ? { "--f": `${Math.round((d.done / d.total) * 70)}%` } as CSSProperties : undefined} />
        ))}
      </div>
      <div className={s.rates}>
        {p.rates.map((r) => (
          <div key={r.key} className={`${s.rate} ${p.weakest === r.key ? s.rateLow : ""}`}>
            <span>{TASK_LABEL[r.key]}</span>
            <span className={s.rateTrack}><i style={{ width: `${pct(r.rate)}%` }} /></span>
            <span className="m">{pct(r.rate)}%</span>
          </div>
        ))}
      </div>
      {p.weakest && <p className={s.note}>{TASK_LABEL[p.weakest]} is what most often keeps a day open.</p>}
    </Card>
  );
}

const shortDay = (k: string) => { const d = new Date(k + "T12:00:00"); return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`; };
const whole = (v: number) => Math.round(v).toLocaleString("en-US");

function WeightCard({ data, days, label, week }: { data: DayMap; days: string[]; label: string; week: WeekCompare }) {
  const points = weighIns(data, days);
  const avg = trailingAverage(points);
  const plot = useRef<SVGSVGElement>(null);
  const [at, setAt] = useState<number | null>(null);
  if (points.length < 2) {
    return (
      <Card>
        <span className="eb">Weight</span>
        <p className={s.note}>{points.length ? "One weigh-in so far." : "No weigh-ins in this window."} Log your weight on Today on a few more days and the trend shows here, with the day-to-day swings smoothed out.</p>
      </Card>
    );
  }
  const last = avg[avg.length - 1].avg, first = avg[0].avg, change = Math.round((last - first) * 10) / 10;
  // The drawing's size is the plot's on a phone (the card's 320 less the 32 of the scale beside it), so it is drawn
  // one to one there and the dots stay round.
  const W = 288, H = 120, P = 6;
  // The weigh-ins with half a pound either side, and never under two pounds tall: a few ounces' drift can't fill the
  // chart, and there are always two whole pounds inside it to draw the scale on.
  const wLo = Math.min(...points.map((q) => q.weight)), wHi = Math.max(...points.map((q) => q.weight));
  const pad = Math.max(0.5, (2 - (wHi - wLo)) / 2);
  const lo = wLo - pad, hi = wHi + pad;
  const scale = [Math.floor(hi), Math.ceil(lo)];
  const x = (day: string) => P + (days.indexOf(day) / Math.max(1, days.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
  const top = (v: number) => `${((y(v) / H) * 100).toFixed(2)}%`;
  const line = avg.map((q, i) => `${i ? "L" : "M"}${x(q.day).toFixed(1)} ${y(q.avg).toFixed(1)}`).join(" ");
  // The weigh-in nearest the finger or pointer, read through the drawing's own transform so it matches what is seen.
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const m = plot.current?.getScreenCTM();
    if (!m) return;
    const ux = (e.clientX - m.e) / m.a;
    let best = 0;
    points.forEach((q, i) => { if (Math.abs(x(q.day) - ux) < Math.abs(x(points[best].day) - ux)) best = i; });
    setAt(best);
  };
  const shown = at === null ? null : points[at];
  const wk = week.weight;
  const wkChange = wk ? Math.round((wk.now - wk.before) * 10) / 10 : 0;
  return (
    <Card>
      <div className={s.head}><span className="eb">Weight · seven-day average</span><span className={s.meta}>{shown ? `${shown.weight} lb · ${shortDay(shown.day)}` : `${points.length} weigh-ins`}</span></div>
      <div className={s.big}>
        <span className="dc">{last.toFixed(1)}</span><span className="muted">lb</span>
        <span className={`m ${s.delta} ${change < 0 ? s.down : change > 0 ? s.up : ""}`}>{change === 0 ? "level" : `${change < 0 ? "↓" : "↑"} ${Math.abs(change).toFixed(1)} lb`} over {label}</span>
      </div>
      {/* Two whole pounds up the left on dashed lines, as the steps chart has its counts, so the slope reads against a
          scale. The numbers are beside the drawing, not in it: it is stretched to fit and would squash them. */}
      <div className={s.plot}>
        <div className={s.axis} aria-hidden>{scale.map((v) => <span key={v} style={{ top: top(v) }}>{v}</span>)}</div>
        <div className={s.area}>
          {scale.map((v) => <i key={v} className={s.gridLine} style={{ top: top(v) }} aria-hidden />)}
          <svg ref={plot} className={s.chart} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Seven-day average from ${first.toFixed(1)} to ${last.toFixed(1)} pounds. Touch a point for its day.`}
            onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setAt(null)} style={{ touchAction: "pan-y" }}>
            {points.map((q, i) => <circle key={q.day} cx={x(q.day)} cy={y(q.weight)} r={i === at ? 4.5 : 2.2} className={i === at ? s.dotOn : s.dot} />)}
            <path key={label} d={line} pathLength={1} className={s.line} />
          </svg>
        </div>
      </div>
      {/* What changed around the weight: the last seven days next to the seven before. */}
      {wk && (
        <div className={s.week}>
          <div className={s.weekHead}>
            <span className="eb">This week against last</span>
            <span className={`m ${s.delta} ${wkChange < 0 ? s.down : wkChange > 0 ? s.up : ""}`}>{wkChange === 0 ? "level" : `${wkChange < 0 ? "↓" : "↑"} ${Math.abs(wkChange).toFixed(1)} lb`}</span>
          </div>
          <div className={`${s.weekRow} ${s.weekCols}`}><span /><span>Last</span><span>This</span></div>
          {week.rows.map((r) => {
            const moved = r.now !== null && r.before !== null && Math.round(r.now) !== Math.round(r.before);
            const good = moved && (r.better === "up" ? r.now! > r.before! : r.now! < r.before!);
            return (
              <div key={r.label} className={s.weekRow}>
                <span>{r.label}</span>
                <span className={`m ${s.weekBefore}`}>{r.before === null ? "—" : whole(r.before)}</span>
                <span className={`m ${moved ? (good ? s.weekGood : s.weekBad) : ""}`}>{r.now === null ? "—" : whole(r.now)}</span>
              </div>
            );
          })}
          <p className={s.note} style={{ fontSize: 12 }}>Green moved the way that usually helps, amber the other way. Side by side, not a cause.</p>
        </div>
      )}
    </Card>
  );
}

const LOG_PREVIEW = 7;

/** Everything each day held, newest first: closed or not, weight, mood, food against the goals, what was done, and
 *  what kept it open. A week shows; the rest of the window opens on a tap. */
function DayByDay({ log, todayKey, proteinGoal }: { log: LogRow[]; todayKey: string; proteinGoal: number }) {
  const [all, setAll] = useState(false);
  return (
    <Card>
      <div className={s.head}><span className="eb">Day by day</span>{log.length > 0 && <span className={s.meta}>{log.filter((r) => r.closed).length} of {log.length} closed</span>}</div>
      {log.length === 0 && <p className={s.note}>Nothing logged in this window yet.</p>}
      <div className={s.days}>
        {(all ? log : log.slice(0, LOG_PREVIEW)).map((r) => {
          const d = new Date(r.day + "T12:00:00");
          const met = !!r.food && r.food.meals === 4 && r.food.proteinHit && r.food.kcalOk;
          return (
            <div key={r.day} className={`${s.day} ${r.empty ? s.dayEmpty : ""}`}>
              <div className={s.dayDate}><span className="eb">{r.day === todayKey ? "Today" : WEEKDAYS[d.getDay()]}</span><span className="dc">{d.getDate()}</span></div>
              <div className={s.dayBody}>
                <div className={s.dayTop}>
                  {r.closed ? <span className={s.closed}><Icon name="check" size={12} strokeWidth={2.6} />Closed</span> : <span className={s.open}>{r.done}/{r.total}</span>}
                  {r.weight !== null && <span className="m">{r.weight} lb</span>}
                  {r.mood && <span className={s.mood}>{r.mood}</span>}
                </div>
                {(r.food || r.did.length > 0) && (
                  <div className={s.dayChips}>
                    {r.food && (
                      <span className={`${s.food} ${met ? s.foodMet : ""}`} aria-label={`${r.food.meals} of 4 meals, ${r.food.kcal} calories, ${r.food.protein} of ${proteinGoal} grams protein${met ? ", every eating goal met" : ""}`}>
                        {met && <Icon name="check" size={12} strokeWidth={2.6} />}
                        {r.food.meals}/4 meals · <span className={r.food.kcalOk ? "" : s.over}>{r.food.kcal.toLocaleString("en-US")} kcal</span> · <span className={r.food.proteinHit ? s.hit : ""}>{r.food.protein}/{proteinGoal} g</span>
                      </span>
                    )}
                    {r.did.map((x) => <span key={x} className={s.did}>{x}</span>)}
                  </div>
                )}
                {r.empty ? <span className={s.missed}>Nothing logged</span> : r.missed.length > 0 && <span className={s.missed}>Open: {r.missed.join(", ")}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {log.length > LOG_PREVIEW && <Button size="sm" variant="secondary" className={s.more} onClick={() => setAll((v) => !v)}>{all ? "Show the last week only" : `Show all ${log.length} days`}</Button>}
    </Card>
  );
}
