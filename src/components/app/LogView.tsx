"use client";

// Admin → Log. Everything that failed, anywhere: reported by browsers, by the API and by the jobs, newest first.
// Rows from the synthetic test member are hidden unless asked for, so test runs never bury a real failure.

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, Segmented, Switch, Tag, useTabVisible } from "@/components/ui";
import a from "./app.module.css";

type Item = { id: string; at: number; level: "error" | "warn" | "info"; source: "client" | "api" | "job"; area: string; event: string; message: string | null; detail: string | null; status: number | null; user: string | null; test: boolean };
type Summary = { day: { error: number; warn: number }; week: { error: number; warn: number }; capped: boolean; areas: { area: string; errors: number }[] };
type Level = "all" | "error" | "warn";
type Source = "all" | "client" | "api" | "job";

const SOURCE_NAME = { client: "app", api: "api", job: "job" } as const;
const stamp = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });

/** Detail is JSON when the app wrote it, free text otherwise. The stack comes out on its own, to show as a block. */
function parts(detail: string | null): { pairs: [string, string][]; stack: string | null; text: string | null } {
  if (!detail) return { pairs: [], stack: null, text: null };
  try {
    const d = JSON.parse(detail) as Record<string, unknown>;
    const pairs = Object.entries(d).filter(([k, v]) => k !== "stack" && v !== undefined && v !== null && v !== "")
      .map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)] as [string, string]);
    return { pairs, stack: typeof d.stack === "string" && d.stack ? d.stack : null, text: null };
  } catch { return { pairs: [], stack: null, text: detail }; }
}

/** The whole row as plain text, for pasting into a conversation about it. */
function asText(r: Item): string {
  const p = parts(r.detail);
  return [`${r.level} · ${r.area} · ${r.event}${r.status ? ` · ${r.status}` : ""} · ${stamp(r.at)} · ${SOURCE_NAME[r.source]}${r.user ? ` · ${r.user}` : ""}`,
    r.message || "No message", ...p.pairs.map(([k, v]) => `${k}: ${v}`), p.text || "", p.stack ? `stack:\n${p.stack}` : ""].filter(Boolean).join("\n");
}

/** One row as a card: the gist when closed, everything (message, detail, stack) when open. Nothing scrolls sideways. */
function LogCard({ r, open, onToggle }: { r: Item; open: boolean; onToggle: () => void }) {
  const [copied, setCopied] = useState(false);
  const p = open ? parts(r.detail) : null;
  const copy = () => void navigator.clipboard?.writeText(asText(r)).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined);
  const bodyId = `log-${r.id}`;
  return (
    <div className={`${a.logCard} ${r.level === "error" ? a.logCardError : r.level === "warn" ? a.logCardWarn : ""}`}>
      <button type="button" className={a.logCardHead} aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className={a.logCardTop}>
          <Tag tone={r.level === "error" ? "critical" : r.level === "warn" ? "warning" : undefined}>{r.level}</Tag>
          <span className="m muted" style={{ fontSize: 11 }}>{stamp(r.at)}</span>
        </span>
        <span className={`m ${a.logCardEvent}`}>{r.area} · {r.event}{r.status ? ` · ${r.status}` : ""}</span>
        <span className={open ? a.logCardMsgOpen : a.logCardMsg}>{r.message || "No message"}</span>
        <span className={a.logCardFoot}>
          <span className="muted">{SOURCE_NAME[r.source]}{r.user ? ` · ${r.user}` : ""}{r.test ? " · test" : ""}</span>
          <span className={a.logCardMore}>{open ? "Hide" : "Details"}</span>
        </span>
      </button>
      {open && p && (
        <div id={bodyId} className={a.logCardBody}>
          {p.pairs.length > 0 && (
            <dl className={a.logPairs}>
              {p.pairs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          )}
          {p.text && <pre className={a.logDetail}>{p.text}</pre>}
          {p.stack && <><span className="eb">Stack</span><pre className={a.logDetail}>{p.stack}</pre></>}
          {!p.pairs.length && !p.text && !p.stack && <p className="muted" style={{ fontSize: 12 }}>No detail was recorded.</p>}
          <div><Button size="sm" variant="secondary" onClick={copy}>{copied ? "Copied" : "Copy row"}</Button></div>
        </div>
      )}
    </div>
  );
}

const query = (level: Level, source: Source, tests: boolean, before?: number) =>
  "/admin/logs?limit=50" + (level !== "all" ? `&level=${level}` : "") + (source !== "all" ? `&source=${source}` : "") + (tests ? "&test=1" : "") + (before ? `&before=${before}` : "");

export function LogView() {
  const [level, setLevel] = useState<Level>("all");
  const [source, setSource] = useState<Source>("all");
  const [tests, setTests] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [more, setMore] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  // Fetched again each time Settings shows (it stays mounted between visits), so the log is never a stale page.
  const visible = useTabVisible();
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    Promise.all([api<{ items: Item[]; more: boolean }>("GET", query(level, source, tests)), api<Summary>("GET", "/admin/logs/summary")]).then(
      ([l, s]) => { if (alive) { setItems(l.items); setMore(l.more); setSummary(s); setFailed(false); } },
      () => { if (alive) setFailed(true); },
    );
    return () => { alive = false; };
  }, [level, source, tests, tick, visible]);

  const older = useCallback(async () => {
    if (!items?.length) return;
    setBusy(true);
    try {
      const l = await api<{ items: Item[]; more: boolean }>("GET", query(level, source, tests, items[items.length - 1].at));
      setItems([...items, ...l.items]); setMore(l.more);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }, [items, level, source, tests]);

  return (
    <Card>
      <div className={a.entryHead}>
        <span className="eb" style={{ color: "var(--ink)" }}>Log</span>
        <button type="button" className={a.lnk} onClick={() => setTick((t) => t + 1)}>Refresh</button>
      </div>
      {summary && (
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          Last 24 hours: <strong style={{ color: summary.day.error ? "var(--critical)" : "var(--ink)" }}>{summary.day.error} error{summary.day.error === 1 ? "" : "s"}</strong>, {summary.day.warn} warning{summary.day.warn === 1 ? "" : "s"}.
          {" "}Last 7 days: {summary.week.error}{summary.capped ? "+" : ""} and {summary.week.warn}{summary.capped ? "+" : ""}.
          {summary.areas.length > 0 && <> Most errors: {summary.areas.slice(0, 4).map((x) => `${x.area} (${x.errors})`).join(", ")}.</>}
        </p>
      )}
      <div className={a.logFilters}>
        <Segmented label="Level" value={level} onChange={(v) => setLevel(v as Level)} options={[{ value: "all", label: "All" }, { value: "error", label: "Errors" }, { value: "warn", label: "Warnings" }]} />
        <Segmented label="Source" value={source} onChange={(v) => setSource(v as Source)} options={[{ value: "all", label: "All" }, { value: "client", label: "App" }, { value: "api", label: "API" }, { value: "job", label: "Jobs" }]} />
      </div>

      {failed && <p className="muted" style={{ fontSize: 13 }}>Couldn&apos;t load the log.</p>}
      {!failed && !items && <p className="muted" style={{ fontSize: 13 }}>Loading…</p>}
      {items && items.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nothing logged. That is the good outcome.</p>}
      {items && items.length > 0 && (
        <div className={a.logCards}>
          {items.map((r) => <LogCard key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />)}
        </div>
      )}
      {more && <div><Button size="sm" variant="secondary" disabled={busy} onClick={() => void older()}>{busy ? "Loading…" : "Older"}</Button></div>}

      <div className={a.entryHead} style={{ paddingTop: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>Kept for 30 days. Anything that looks like a key or a token is cut before it is stored.</span>
        <Switch checked={tests} label="Show test rows" onChange={setTests} />
      </div>
    </Card>
  );
}
