"use client";

// Insights, rebuilt (David, 2026-11-02: "way too much information … talk about the insights that really matter").
// Four things, in this order: what makes a great day, what the journal says on the good days, how the window went,
// and weight. Every finding is worked out on this device (src/lib/great-days.ts) and is a pattern in the person's
// own record, never a claim about cause. The journal is read on the phone, or by Claude with names and details taken
// out first, as the person chooses in Settings (JournalTone.tsx).

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { api, type Days } from "@/lib/api";
import { greatDays, journalTone, progress, TASK_LABEL, type Driver, type ToneDriver } from "@/lib/great-days";
import { trailingAverage, weighIns } from "@/lib/patterns";
import { addDays, dayKey, indexDays, streak, type DayMap } from "@/lib/today";
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
const MIN_CHECKINS = 6;
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
      <JournalCard jt={jt} tone={tone} />
      <ProgressCard p={p} now={run.now} best={run.best} />
      <WeightCard data={data} days={days} label={RANGE_LABEL[range]} />

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
      {tone.status !== "locked" && <p className={s.how}><Icon name="lock" size={13} />{how} <button type="button" className={a.lnk} onClick={() => goTab("settings")}>Change</button></p>}
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

function WeightCard({ data, days, label }: { data: DayMap; days: string[]; label: string }) {
  const points = weighIns(data, days);
  const avg = trailingAverage(points);
  if (points.length < 2) {
    return (
      <Card>
        <span className="eb">Weight</span>
        <p className={s.note}>{points.length ? "One weigh-in so far." : "No weigh-ins in this window."} Log your weight on Today on a few more days and the trend shows here, with the day-to-day swings smoothed out.</p>
      </Card>
    );
  }
  const last = avg[avg.length - 1].avg, first = avg[0].avg, change = Math.round((last - first) * 10) / 10;
  const W = 320, H = 110, P = 6;
  const lo = Math.min(...points.map((q) => q.weight)) - 0.5, hi = Math.max(...points.map((q) => q.weight)) + 0.5;
  const x = (day: string) => P + (days.indexOf(day) / Math.max(1, days.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
  const line = avg.map((q, i) => `${i ? "L" : "M"}${x(q.day).toFixed(1)} ${y(q.avg).toFixed(1)}`).join(" ");
  return (
    <Card>
      <div className={s.head}><span className="eb">Weight · seven-day average</span><span className={s.meta}>{points.length} weigh-ins</span></div>
      <div className={s.big}>
        <span className="dc">{last.toFixed(1)}</span><span className="muted">lb</span>
        <span className={`${s.delta} ${change < 0 ? s.down : change > 0 ? s.up : ""}`}>{change === 0 ? "level" : `${change < 0 ? "↓" : "↑"} ${Math.abs(change).toFixed(1)} lb`} over {label}</span>
      </div>
      <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Seven-day average from ${first.toFixed(1)} to ${last.toFixed(1)} pounds`}>
        {points.map((q) => <circle key={q.day} cx={x(q.day)} cy={y(q.weight)} r="2.2" className={s.dot} />)}
        <path key={label} d={line} pathLength={1} className={s.line} />
      </svg>
    </Card>
  );
}
