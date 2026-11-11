"use client";

// Dayhub Ops · Overview: today in tiles, the people-a-day chart, the sign-up cohorts and the funnel, and what the issues
// are about. Live counts from the API; the history comes from the hourly job (soma_jobs/ops.js).

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BUILD, report } from "@/lib/log";
import { fmtClock, fmtIsoDay, fmtLong, localMidnight, n, pct, zone, type Overview as Data } from "@/lib/ops";
import { useOps } from "./OpsShell";
import o from "./ops.module.css";

const AI_NAMES: Record<string, string> = { food: "food", tone: "journal readings", review: "weekly reviews", transcribe: "transcriptions", day: "Say your day" };
/** The kinds counted as calls (reading aloud is counted in characters, and shown apart). */
const AI_CALLS = ["food", "tone", "review", "transcribe", "day"];

export function Overview() {
  const { badges } = useOps();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api<Data>("GET", `/ops/overview?since=${localMidnight()}&tz=${encodeURIComponent(zone())}`)
      .then((d) => { if (alive) setData(d); }, (e) => { report("ops", "overview_failed", e); if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) return <p className={o.empty}>Couldn&apos;t load the overview. The log has the reason.</p>;
  if (!data) return <p className={o.empty}>Counting…</p>;

  const t = data.tiles;
  const calls = AI_CALLS.reduce((sum, k) => sum + (t.ai[k] || 0), 0);
  const split = AI_CALLS.filter((k) => t.ai[k]).sort((a, b) => (t.ai[b] || 0) - (t.ai[a] || 0)).slice(0, 2).map((k) => `${AI_NAMES[k]} ${pct(t.ai[k] || 0, calls)}`).join(", ");
  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const tiles: { label: string; value: string; note: string; tone?: "hot" | "bad" }[] = [
    { label: "Active today", value: n(t.seenToday), note: `of ${n(t.seenWeek)} this week` },
    { label: "Active this week", value: n(t.seenWeek), note: `${pct(t.seenWeek, t.members)} of ${n(t.members)} members` },
    { label: "Sign-ups this week", value: n(t.signupsWeek) + (t.signupsCapped ? "+" : ""), note: `${n(t.invitedWeek)} came through an invite link` },
    t.closedYesterday && t.closedYesterday.of > 0
      ? { label: "Days closed yesterday", value: pct(t.closedYesterday.closed, t.closedYesterday.of), note: `${n(t.closedYesterday.closed)} of ${n(t.closedYesterday.of)} people active yesterday`, tone: "hot" }
      : { label: "Days closed yesterday", value: "–", note: "counted each day after noon UTC" },
    { label: "Open issues", value: badges ? n(badges.open) : "…", note: badges ? (badges.needs ? `${n(badges.needs)} need you` : "nothing needs you") : "counting", tone: badges && badges.needs ? "bad" : undefined },
    { label: "Errors, last 24 h", value: n(t.errors24), note: t.errorsNormal !== null ? `normal for a ${weekday}: about ${n(t.errorsNormal)}` : "not enough history for a normal yet" },
    { label: "AI calls today", value: n(calls), note: calls ? split + (t.ai.speech ? ` · ${n(t.ai.speech)} characters read aloud` : "") : "none yet today (UTC)" },
    { label: "Live now", value: BUILD, note: `web ${BUILD} · API and jobs ${t.release || "unknown"}` },
  ];

  const counted = data.days.filter((d) => d.seen !== null);
  const top = Math.max(1, ...counted.map((d) => d.seen || 0));
  const kinds = Object.entries(badges?.byKind || {}).sort((a, b) => b[1] - a[1]);
  const kindTop = Math.max(1, ...kinds.map(([, v]) => v));
  const cohorts = data.cohorts;

  return (
    <>
      <div className={o.title}>
        <h1 className={o.h1}>Overview</h1>
        <span className={o.sub}>{fmtLong(data.at)} · live counts at {fmtClock(data.at)}{cohorts ? `, cohorts from the job at ${fmtClock(cohorts.at)}` : ""}</span>
      </div>

      <div className={o.tiles}>
        {tiles.map((x) => (
          <div key={x.label} className={o.tile}>
            <span className="eb">{x.label}</span>
            <span className={`${o.tileValue} ${x.tone === "hot" ? o.tileHot : x.tone === "bad" ? o.tileBad : ""}`}>{x.value}</span>
            <span className={o.tileNote}>{x.note}</span>
          </div>
        ))}
      </div>

      <div className={o.pair}>
        <section aria-label="Still closing days" className={`${o.panel} ${o.wide}`}>
          <div className={o.panelHead}>
            <h2 className={o.h2}>Still closing days</h2>
            <span className={o.note}>Share of each sign-up week who closed 4 or more days in that week of theirs</span>
          </div>
          {cohorts && cohorts.table.length ? (
            <div className={o.scroll}>
              <table className={o.cohort}>
                <thead>
                  <tr>
                    <th scope="col" style={{ textAlign: "left" }}>Signed up</th>
                    <th scope="col">People</th>
                    {[1, 2, 3, 4, 5, 6].map((w) => <th key={w} scope="col" className={w === 3 ? o.cohortKey : undefined}>Week {w}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.table.map((r) => (
                    <tr key={r.week}>
                      <th scope="row">{fmtIsoDay(r.week)}</th>
                      <td className="muted">{r.n}</td>
                      {r.cells.map((v, i) => (
                        v === null
                          ? <td key={i} className="muted" aria-label="not over yet">·</td>
                          : <td key={i} className={i === 2 ? o.cell3 : undefined} style={{ background: `color-mix(in srgb, var(--activity) ${Math.round(8 + v * 0.5)}%, transparent)`, color: "var(--ink)" }}>{v}%</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={o.note}>Nothing to show yet. The job counts closed days each afternoon (UTC); cohorts appear once people who signed up in the last six weeks have lived a week of theirs.</p>}
          <p className={o.note}>Week 3 is the beta&apos;s number: a third or more still closing days by then means people are keeping the habit.</p>
        </section>

        <section aria-label="From sign-up to habit" className={`${o.panel} ${o.narrow}`}>
          <div className={o.title}>
            <h2 className={o.h2}>From sign-up to habit</h2>
            <span className={o.note}>{cohorts?.funnel ? `Everyone who signed up the week of ${fmtIsoDay(cohorts.funnel.week)}` : "The newest sign-up week past its third week"}</span>
          </div>
          {cohorts?.funnel ? cohorts.funnel.steps.map(([label, v]) => {
            const all = cohorts.funnel!.steps[0][1] || 1;
            return (
              <div key={label} className={o.meter}>
                <div className={o.meterHead}><span>{label}</span><span>{n(v)} <span className="muted">{pct(v, all)}</span></span></div>
                <div className={o.track}><div className={o.fill} style={{ width: `${(v / all) * 100}%` }} /></div>
              </div>
            );
          }) : <p className={o.note}>Appears three weeks after the first sign-ups the job has counted.</p>}
        </section>
      </div>

      <div className={o.pair}>
        <section aria-label="People active each day" className={`${o.panel} ${o.wide}`}>
          <div className={o.panelHead}>
            <h2 className={o.h2}>People active each day</h2>
            <span className={o.sub}>{counted.length < data.days.length ? `counted since ${fmtIsoDay(counted[0]?.day || data.days[data.days.length - 1].day)}` : "last 14 days"}</span>
          </div>
          <div className={o.chart} role="img" aria-label={`People who opened Dayhub each day: ${counted.map((d) => `${fmtIsoDay(d.day)} ${d.seen}`).join(", ") || "not counted yet"}`}>
            {data.days.map((d, i) => (
              <div key={d.day} className={o.col}>
                <div className={`${o.colBar} ${d.seen === null ? o.colNone : i === data.days.length - 1 ? o.colToday : ""}`} style={d.seen === null ? undefined : { height: `${Math.max(2, ((d.seen || 0) / top) * 100)}%` }} title={d.seen === null ? "not counted" : `${d.seen} people`} />
                <span className={o.colDay}>{d.day.slice(8).replace(/^0/, "")}</span>
              </div>
            ))}
          </div>
          <p className={o.note}>People who opened Dayhub that day (UTC). A day is only known on the day, so the chart fills from when Ops began counting.</p>
        </section>

        <section aria-label="Issues by kind" className={`${o.panel} ${o.narrow}`}>
          <div className={o.panelHead}>
            <h2 className={o.h2}>Open issues by kind</h2>
            <Link href="/ops/issues/" className={o.lnk}>Open Issues</Link>
          </div>
          {kinds.length ? kinds.map(([k, v]) => (
            <div key={k} className={o.meter}>
              <div className={o.meterHead}><span>{k}</span><span>{v}</span></div>
              <div className={`${o.track} ${o.trackThin}`}><div className={`${o.fill} ${o.fillWarn}`} style={{ width: `${(v / kindTop) * 100}%` }} /></div>
            </div>
          )) : <p className={o.note}>{badges ? "Nothing open." : "Counting…"}</p>}
          {kinds[0]?.[0] === "Fitbit" && <p className={o.note}>Fitbit leads until Google verifies Dayhub: unverified connections end about every 7 days.</p>}
        </section>
      </div>
    </>
  );
}
