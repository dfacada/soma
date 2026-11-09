"use client";

// Soma Ops · Issues: people who need a look, found from signals in the data (lib/ops.js detectIssues). Each one
// clears itself when its signal does; Mark handled only hides it until the signal comes back newer.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { ago, fmtTime, SEV_WORDS, zone, type Issue, type IssueCounts, type Sev } from "@/lib/ops";
import { Button } from "@/components/ui";
import { useOps } from "./OpsShell";
import o from "./ops.module.css";

type Data = { issues: Issue[]; counts: IssueCounts; partial: boolean; at: number };
type Tab = "open" | Sev;
const KINDS = ["Fitbit", "Journal", "Errors", "Reminders", "AI limits", "Approval", "Gone quiet", "Messages"];

export const sevClass = (s: Sev) => (s === "needs" ? o.sevNeeds : s === "watching" ? o.sevWatching : "");

export function Issues() {
  const { refresh, say } = useOps();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("open");
  const [kind, setKind] = useState("All");
  const [picked, setPicked] = useState<string | null>(null);

  const load = useCallback(() => api<Data>("GET", `/ops/issues?tz=${encodeURIComponent(zone())}`).then(setData, (e) => { report("ops", "issues_failed", e); setFailed(true); }), []);
  useEffect(() => { void load(); }, [load]);

  if (failed) return <p className={o.empty}>Couldn&apos;t load the issues. The log has the reason.</p>;
  if (!data) return <p className={o.empty}>Looking for issues…</p>;

  const inTab = (it: Issue) => (tab === "open" ? it.sev !== "handled" : it.sev === tab);
  const shown = data.issues.filter((it) => inTab(it) && (kind === "All" || it.kind === kind));
  const pick = shown.find((it) => it.key === picked) || shown[0] || null;
  const c = data.counts;
  const oldest = c.oldestMs ? Math.max(0, Math.floor((data.at - c.oldestMs) / 86400000)) : 0;

  return (
    <>
      <div className={o.head}>
        <div className={o.title}>
          <h1 className={o.h1}>Issues</h1>
          <span className={o.sub}>{c.open} open · {c.newToday} new today{c.open ? ` · oldest ${oldest === 0 ? "today" : oldest === 1 ? "1 day" : `${oldest} days`}` : ""}{data.partial ? " · reading was capped, some may be missing" : ""}</span>
        </div>
        <div className={o.tabs} role="group" aria-label="Show">
          {([["open", "Open", c.open], ["needs", "Needs you", c.needs], ["watching", "Watching", c.watching], ["handled", "Handled", c.handled]] as [Tab, string, number][]).map(([id, label, count]) => (
            <button key={id} type="button" aria-pressed={tab === id} className={`${o.tab} ${tab === id ? o.tabOn : ""}`} onClick={() => setTab(id)}>{label}<span className={o.tabCount}>{count}</span></button>
          ))}
        </div>
      </div>

      <div className={o.filters} role="group" aria-label="Kind">
        {["All", ...KINDS].map((k) => {
          const count = k === "All" ? data.issues.filter(inTab).length : data.issues.filter((it) => inTab(it) && it.kind === k).length;
          if (k !== "All" && !count) return null;
          return <button key={k} type="button" aria-pressed={kind === k} className={`${o.filter} ${kind === k ? o.filterOn : ""}`} onClick={() => setKind(k)}>{k === "All" ? "All" : `${k} ${count}`}</button>;
        })}
      </div>

      <div className={o.pair} style={{ alignItems: "flex-start" }}>
        <div className={`${o.list} ${o.wide}`}>
          {shown.length === 0 && <p className={o.empty}>Nothing here. Every issue closes itself when its signal clears.</p>}
          {shown.map((it) => (
            <button key={it.key} type="button" aria-pressed={pick?.key === it.key} className={`${o.item} ${pick?.key === it.key ? o.itemOn : ""}`} onClick={() => setPicked(it.key)}>
              <span className={o.itemTop}>
                <span className={`${o.sev} ${sevClass(it.sev)}`}>{SEV_WORDS[it.sev]}</span>
                <span className={o.itemTitle}>{it.title}</span>
                <span className={o.itemKind}>{it.kind}</span>
              </span>
              <span className={o.itemMeta}>{it.person} · {it.meta}</span>
              <span className={o.itemFix}>Fix: {it.fix}</span>
            </button>
          ))}
        </div>
        {pick && <IssueDetail key={pick.key} it={pick} onChanged={() => { void load(); refresh(); }} say={say} />}
      </div>
    </>
  );
}

/** One issue: what happened, the suggested fix, a message ready to send, and what can be done from here. */
export function IssueDetail({ it, onChanged, say, compact = false }: { it: Issue; onChanged: () => void; say: (m: string) => void; compact?: boolean }) {
  const [draft, setDraft] = useState(it.template);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const act = async (key: string, work: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try { await work(); say(done); onChanged(); return true; }
    catch (e) { report("ops", "issue_action_failed", e, { key }, "warn"); say(e instanceof Error ? e.message : "That didn't work"); return false; }
    finally { setBusy(null); }
  };
  const handled = it.sev === "handled";

  return (
    <aside aria-label="Issue" className={o.aside}>
      <div className={o.title} style={{ gap: 8 }}>
        <span className={`${o.sev} ${sevClass(it.sev)}`} style={{ alignSelf: "flex-start" }}>{SEV_WORDS[it.sev]}</span>
        <h2 className={o.asideTitle}>{it.title}</h2>
        {!compact && <Link href={`/ops/person/?id=${it.userId}`} className={o.lnk} style={{ fontSize: 14 }}>{it.person} · {it.email}</Link>}
        <span className={o.sub}>last {ago(it.lastMs)}{it.handledBy ? " · marked handled" : ""}</span>
      </div>
      <div className={o.timeline}>
        <span className="eb">What happened</span>
        {it.timeline.map((ev, i) => <span key={i} className={o.tl}>{ev.text || fmtTime(ev.at)}</span>)}
      </div>
      <div className={o.fixBox}>
        <span className="eb">Suggested fix</span>
        <p>{it.fixLong}</p>
      </div>
      {it.kind !== "Approval" && (
        <label className={o.label}>
          <span className="eb">Message {it.first}</span>
          <textarea className={o.ta} rows={4} value={draft} maxLength={2000} placeholder={`Write to ${it.first}. It shows in Soma as a message from you.`} onChange={(e) => { setDraft(e.target.value); setSent(false); }} />
        </label>
      )}
      {sent && <span className={o.ok}>Sent. It shows in Soma as a message from you, and in Support.</span>}
      <div className={o.btnRow}>
        {it.approve && <Button size="sm" variant="food" disabled={busy !== null} onClick={() => { haptic(); void act("approve", () => api("POST", `/admin/profiles/${it.userId}/status`, { status: "active" }), `${it.first} is in`); }}>Approve</Button>}
        {it.kind !== "Approval" && <Button size="sm" variant="activity" disabled={busy !== null || !draft.trim()} onClick={() => { haptic(); void act("send", () => api("POST", `/ops/people/${it.userId}/messages`, { body: draft.trim() }), "Message sent").then((ok) => { if (ok) setSent(true); }); }}>{busy === "send" ? "Sending…" : "Send message"}</Button>}
        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => { haptic(); void act("handle", () => api("POST", `/ops/issues/${encodeURIComponent(it.key)}/handled`, { handled: !handled }), handled ? "Reopened" : "Marked handled"); }}>{handled ? "Reopen" : "Mark handled"}</Button>
        {!compact && <Link href={`/ops/person/?id=${it.userId}`} className={o.lnk}>Open person</Link>}
      </div>
    </aside>
  );
}
