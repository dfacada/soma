"use client";

// Soma Ops · Errors: a day of the log grouped into problems (one code each), with who it touches, its last twelve
// hours, when it first appeared and which build it came with; one of them as logged; mute or mark fixed; and when to
// hear about it on Telegram. Every row, unfiltered, is under it (LogView, the old Settings → Admin → Log).

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { ago, fmtDay, fmtTime, n, STATUS_WORDS, type Alerts, type ErrorsView, type Problem, type ProblemStatus, type Sample } from "@/lib/ops";
import { Button, Switch } from "@/components/ui";
import { LogView } from "@/components/app/LogView";
import { useOps } from "./OpsShell";
import o from "./ops.module.css";

type Filter = "all" | ProblemStatus;
const tagClass = (s: ProblemStatus) => (s === "new" || s === "back" ? o.sevNeeds : s === "spiking" ? o.sevWatching : "");
const ALERTS: [keyof Alerts, string][] = [
  ["fresh", "A new problem appears"],
  ["wide", "One problem reaches 10 or more people in an hour"],
  ["api", "Server errors run at twice their normal rate for 15 minutes"],
  ["deploy", "New errors start within an hour of a release"],
];

export function Errors() {
  const { say } = useOps();
  const [data, setData] = useState<ErrorsView | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState<string | null>(null);
  const [rows, setRows] = useState(false);

  const load = useCallback(() => api<ErrorsView>("GET", "/ops/errors").then(setData, (e) => { report("ops", "errors_failed", e); setFailed(true); }), []);
  useEffect(() => { void load(); }, [load]);

  if (failed) return <p className={o.empty}>Couldn&apos;t load the errors. The log has the reason.</p>;
  if (!data) return <p className={o.empty}>Grouping the log…</p>;

  const visible = data.problems.filter((p) => (filter === "all" ? p.status !== "fixed" : p.status === filter));
  const pick = data.problems.find((p) => p.id === picked) || visible[0] || null;
  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const count = (s: ProblemStatus) => data.problems.filter((p) => p.status === s).length;

  const setAlert = async (key: keyof Alerts, on: boolean) => {
    haptic();
    const before = data.alerts;
    setData({ ...data, alerts: { ...data.alerts, [key]: on } });
    try { await api("PUT", "/ops/alerts", { [key]: on }); }
    catch (e) { report("ops", "alerts_save_failed", e); setData({ ...data, alerts: before }); say("Couldn't save that"); }
  };

  return (
    <>
      <div className={o.head}>
        <div className={o.title}>
          <h1 className={o.h1}>Errors</h1>
          <span className={o.sub}>
            {n(data.errors24)} error{data.errors24 === 1 ? "" : "s"} and {n(data.warnings24)} warning{data.warnings24 === 1 ? "" : "s"} in the last 24 h
            {data.normal !== null ? ` · normal for a ${weekday} is about ${n(data.normal)} errors` : ""} · {data.problems.length} problem{data.problems.length === 1 ? "" : "s"}{data.capped ? " · counted from the newest 3,000 rows" : ""}
          </span>
        </div>
        <div className={o.tabs} role="group" aria-label="Show">
          {([["all", "All"], ["new", "New"], ["spiking", "Spiking"], ["steady", "Steady"], ["back", "Back"], ["muted", "Muted"], ["fixed", "Fixed"]] as [Filter, string][])
            .filter(([id]) => id === "all" || id === "new" || id === "spiking" || id === "steady" || count(id as ProblemStatus) > 0)
            .map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} className={`${o.tab} ${filter === id ? o.tabOn : ""}`} onClick={() => setFilter(id)}>{label}{id !== "all" && <span className={o.tabCount}>{count(id as ProblemStatus)}</span>}</button>)}
        </div>
      </div>

      {visible.length === 0 ? <p className={o.empty}>{filter === "all" ? "Nothing failed in the last 24 hours." : "None."}</p> : (
        <div className={o.scroll} style={{ borderRadius: 20, background: "var(--surface)", border: "1px solid var(--hairline)" }}>
          <table className={o.problems}>
            <thead>
              <tr><th scope="col">Status</th><th scope="col">Problem</th><th scope="col">What it says</th><th scope="col" className={o.num}>People</th><th scope="col" className={o.num}>24 h</th><th scope="col">Last 12 h</th><th scope="col">First seen</th><th scope="col">Build</th></tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className={pick?.id === p.id ? o.picked : undefined}>
                  <td><span className={`${o.sev} ${tagClass(p.status)}`}>{STATUS_WORDS[p.status]}</span></td>
                  <td><button type="button" className={o.problemBtn} onClick={() => setPicked(p.id)}>{p.area} · {p.event}</button></td>
                  <td className={o.dim} style={{ maxWidth: 260 }}>{p.message || "–"}</td>
                  <td className={o.num}>{n(p.people)}</td>
                  <td className={o.num}>{n(p.count)}</td>
                  <td><Spark p={p} /></td>
                  <td className={`${o.mono} ${o.dim}`} style={{ whiteSpace: "nowrap" }}>{firstSeen(p, data)}</td>
                  <td className={`${o.mono} ${o.dim}`} style={{ whiteSpace: "nowrap" }}>{p.release || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={o.pair} style={{ alignItems: "flex-start" }}>
        {pick ? <ProblemDetail key={pick.id} p={pick} onChanged={() => void load()} say={say} /> : <div className={o.wide} />}
        <section aria-label="Alerts" className={`${o.panel} ${o.narrow}`}>
          <h2 className={o.h2}>Telegram me when</h2>
          {ALERTS.map(([key, label]) => (
            <div key={key} className={o.alert}><span>{label}</span><Switch checked={data.alerts[key]} label={label} onChange={(v) => void setAlert(key, v)} /></div>
          ))}
          <p className={o.note}>Alerts go to your paired Telegram chat (Settings → Telegram), at most once a problem an hour, checked every 15 minutes. They name the problem and a count, never a person.</p>
        </section>
      </div>

      <section aria-label="Every row" className={o.panel}>
        <div className={o.panelHead}>
          <h2 className={o.h2}>Every row</h2>
          <button type="button" className={o.lnk} aria-expanded={rows} onClick={() => setRows(!rows)}>{rows ? "Hide the log" : "Show the log"}</button>
        </div>
        <p className={o.note}>The log itself, newest first, with every detail: what the problems above are made of. Kept {data.retentionDays} days.</p>
        {rows && <LogView />}
      </section>
    </>
  );
}

function firstSeen(p: Problem, data: ErrorsView) {
  const edge = data.at - (data.retentionDays - 1) * 86400000;
  if (p.firstMs < edge) return `${data.retentionDays}+ days`;
  return p.firstMs > data.at - 86400000 ? `today ${fmtTime(p.firstMs).split(", ")[1] || ""}`.trim() : fmtDay(p.firstMs);
}

function Spark({ p }: { p: Problem }) {
  const top = Math.max(1, ...p.trend);
  const hot = p.status === "new" || p.status === "back" ? o.sparkHot : p.status === "spiking" ? o.sparkWarm : o.sparkOn;
  return (
    <span className={o.spark} role="img" aria-label={`Last 12 hours, oldest first: ${p.trend.join(", ")}`}>
      {p.trend.map((v, i) => <span key={i} className={v ? hot : undefined} style={{ height: `${Math.max(8, (v / top) * 100)}%` }} />)}
    </span>
  );
}

function ProblemDetail({ p, onChanged, say }: { p: Problem; onChanged: () => void; say: (m: string) => void }) {
  const [sample, setSample] = useState<Sample | null | "loading">("loading");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    api<{ sample: Sample | null }>("GET", `/ops/errors/sample?area=${encodeURIComponent(p.area)}&event=${encodeURIComponent(p.event)}`)
      .then((r) => { if (alive) setSample(r.sample); }, (e) => { report("ops", "sample_failed", e, undefined, "warn"); if (alive) setSample(null); });
    return () => { alive = false; };
  }, [p.area, p.event]);

  const act = async (action: "mute" | "unmute" | "fixed" | "unfixed", done: string) => {
    haptic();
    setBusy(true);
    try { await api("POST", "/ops/errors/state", { area: p.area, event: p.event, action }); say(done); onChanged(); }
    catch (e) { report("ops", "problem_state_failed", e, { action }, "warn"); say(e instanceof Error ? e.message : "That didn't work"); }
    finally { setBusy(false); }
  };
  const muted = p.status === "muted";
  const fixed = p.status === "fixed" || p.status === "back";
  let pretty = "";
  if (sample && sample !== "loading" && sample.detail) { try { pretty = JSON.stringify(JSON.parse(sample.detail), null, 2); } catch { pretty = sample.detail; } }

  return (
    <section aria-label="Problem" className={`${o.panel} ${o.wide}`}>
      <div className={o.btnRow}>
        <span className={`${o.sev} ${tagClass(p.status)}`}>{STATUS_WORDS[p.status]}</span>
        <h2 className={`${o.h2} ${o.mono}`} style={{ fontSize: 17 }}>{p.area} · {p.event}</h2>
      </div>
      <p className={o.note} style={{ color: "var(--ink-2)", fontSize: 14 }}>
        {p.people === 0 ? "Nobody signed in" : p.people === 1 ? "One person" : `${n(p.people)} people`}, {n(p.count)} time{p.count === 1 ? "" : "s"} in 24 hours, the last {ago(p.lastMs)}.
        {p.status === "new" ? " New today: worth a look before it spreads." : p.status === "spiking" ? " Running well above its usual rate." : p.status === "back" ? " It was marked fixed and has happened again since." : p.status === "fixed" ? " Marked fixed, and quiet since." : ""}
        {p.mutedUntil && muted ? ` Muted until ${fmtTime(p.mutedUntil)}.` : ""}
      </p>
      <div className={o.sample}>
        <span className="eb">The newest one, as logged</span>
        {sample === "loading" ? <span>Loading…</span> : !sample ? <span>Couldn&apos;t load it.</span> : (
          <>
            <span>{fmtTime(sample.at)} · {sample.source} · {sample.level}{sample.status ? ` · ${sample.status}` : ""}</span>
            {sample.message && <span>{sample.message}</span>}
            {pretty && <pre>{pretty}</pre>}
          </>
        )}
      </div>
      <div className={o.btnRow}>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(muted ? "unmute" : "mute", muted ? "Unmuted" : "Muted for 24 hours")}>{muted ? "Unmute" : "Mute for 24 h"}</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(fixed ? "unfixed" : "fixed", fixed ? "Reopened" : "Marked fixed: it comes back if it happens again")}>{fixed ? "Reopen" : "Mark fixed"}</Button>
      </div>
    </section>
  );
}
