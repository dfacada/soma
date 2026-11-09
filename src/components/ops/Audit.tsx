"use client";

// Soma Ops · Audit: what admins did to or saw of someone else's account, newest first. Written by the API
// (lib/audit.js) as it happens; nothing here can change or delete a row.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { report } from "@/lib/log";
import { ACTION_WORDS, fmtTime, type AuditItem } from "@/lib/ops";
import { Button } from "@/components/ui";
import o from "./ops.module.css";

type Page = { items: AuditItem[]; more: boolean };

/** The detail worth a line: the problem, the new status or role, the switches. */
function detailText(d: unknown): string {
  if (!d || typeof d !== "object") return "";
  const x = d as Record<string, unknown>;
  if (typeof x.problem === "string") return x.problem;
  if (x.from !== undefined && x.to !== undefined) return `${String(x.from)} → ${String(x.to)}`;
  if (typeof x.chars === "number") return `${x.chars} characters`;
  if (typeof x.issue === "string") return x.issue;
  const flags = Object.entries(x).filter(([, v]) => typeof v === "boolean").map(([k, v]) => `${k} ${v ? "on" : "off"}`);
  return flags.join(", ");
}

export function Audit() {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback((before?: number) => api<Page>("GET", `/ops/audit${before ? `?before=${before}` : ""}`).then((page) => {
    setItems((cur) => (before && cur ? [...cur, ...page.items] : page.items));
    setMore(page.more);
  }, (e) => { report("ops", "audit_failed", e); setFailed(true); }), []);
  useEffect(() => { void load(); }, [load]);

  if (failed) return <p className={o.empty}>Couldn&apos;t load the audit. The log has the reason.</p>;
  if (!items) return <p className={o.empty}>Loading…</p>;

  return (
    <>
      <div className={o.title}>
        <h1 className={o.h1}>Audit</h1>
        <span className={o.sub}>every admin action on someone else&apos;s account, and every look past what Ops shows</span>
      </div>
      <section aria-label="Audit" className={o.panel}>
        {items.length === 0 ? <p className={o.note}>Nothing yet.</p> : items.map((it, i) => (
          <div key={i} className={o.auditRow}>
            <span className={o.auditWhen}>{fmtTime(it.at)}</span>
            <span className={o.auditWhat}>
              <strong>{it.actor || "An admin"}</strong> {ACTION_WORDS[it.action] || it.action.replace(/_/g, " ")}
              {it.targetId ? <> <Link href={`/ops/person/?id=${it.targetId}`} className={o.lnk} style={{ fontSize: 14 }}>{it.target}</Link></> : null}
              {detailText(it.detail) ? <span className={o.dim}> · {detailText(it.detail)}</span> : null}
              {it.reason && <span className={o.reason}>Reason: {it.reason}</span>}
            </span>
          </div>
        ))}
        {more && <div><Button size="sm" variant="secondary" onClick={() => void load(items[items.length - 1]?.at)}>Older</Button></div>}
      </section>
    </>
  );
}
