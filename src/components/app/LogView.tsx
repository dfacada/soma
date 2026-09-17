"use client";

// Admin → Log. Everything that failed, anywhere: reported by browsers, by the API and by the jobs, newest first.
// Rows from the synthetic test member are hidden unless asked for, so test runs never bury a real failure.

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, Segmented, Switch, Tag } from "@/components/ui";
import a from "./app.module.css";

type Item = { id: string; at: number; level: "error" | "warn" | "info"; source: "client" | "api" | "job"; area: string; event: string; message: string | null; detail: string | null; status: number | null; user: string | null; test: boolean };
type Summary = { day: { error: number; warn: number }; week: { error: number; warn: number }; capped: boolean; areas: { area: string; errors: number }[] };
type Level = "all" | "error" | "warn";
type Source = "all" | "client" | "api" | "job";

const SOURCE_NAME = { client: "app", api: "api", job: "job" } as const;
const stamp = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });

/** Detail is JSON when the app wrote it, free text otherwise. Shown as lines either way. */
function lines(detail: string): string {
  try {
    const d = JSON.parse(detail) as Record<string, unknown>;
    return Object.entries(d).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n");
  } catch { return detail; }
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

  useEffect(() => {
    let alive = true;
    Promise.all([api<{ items: Item[]; more: boolean }>("GET", query(level, source, tests)), api<Summary>("GET", "/admin/logs/summary")]).then(
      ([l, s]) => { if (alive) { setItems(l.items); setMore(l.more); setSummary(s); setFailed(false); } },
      () => { if (alive) setFailed(true); },
    );
    return () => { alive = false; };
  }, [level, source, tests, tick]);

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
      {items?.map((r) => (
        <div key={r.id} className={a.logItem}>
          <button type="button" className={a.logItemHead} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
            <span className={a.entryTags}>
              <Tag tone={r.level === "error" ? "critical" : r.level === "warn" ? "warning" : undefined}>{r.level}</Tag>
              <span className="m" style={{ fontSize: 12 }}>{r.area} · {r.event}{r.status ? ` · ${r.status}` : ""}</span>
            </span>
            <span style={{ fontSize: 13, lineHeight: 1.4, overflowWrap: "anywhere", textAlign: "left" }}>{r.message || "No message"}</span>
            <span className="muted" style={{ fontSize: 11 }}>{stamp(r.at)} · {SOURCE_NAME[r.source]}{r.user ? ` · ${r.user}` : ""}{r.test ? " · test" : ""}</span>
          </button>
          {open === r.id && <pre className={a.logDetail}>{r.detail ? lines(r.detail) : "No detail was recorded."}</pre>}
        </div>
      ))}
      {more && <div><Button size="sm" variant="secondary" disabled={busy} onClick={() => void older()}>{busy ? "Loading…" : "Older"}</Button></div>}

      <div className={a.entryHead} style={{ paddingTop: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>Kept for 30 days. Anything that looks like a key or a token is cut before it is stored.</span>
        <Switch checked={tests} label="Show test rows" onChange={setTests} />
      </div>
    </Card>
  );
}
