"use client";

// Soma Ops · Support: one thread a person, the ones waiting for an answer first. A thread opens on the person's page,
// where the reply box is.

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { report } from "@/lib/log";
import { ago, type SupportThread } from "@/lib/ops";
import o from "./ops.module.css";

export function Support() {
  const [threads, setThreads] = useState<SupportThread[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    api<{ threads: SupportThread[] }>("GET", "/ops/support").then((r) => { if (alive) setThreads(r.threads); }, (e) => { report("ops", "support_failed", e); if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) return <p className={o.empty}>Couldn&apos;t load the threads. The log has the reason.</p>;
  if (!threads) return <p className={o.empty}>Loading…</p>;
  const waiting = threads.filter((t) => t.unanswered).length;

  return (
    <>
      <div className={o.title}>
        <h1 className={o.h1}>Support</h1>
        <span className={o.sub}>{waiting ? `${waiting} waiting for an answer` : "nobody is waiting"} · {threads.length} thread{threads.length === 1 ? "" : "s"} in 90 days</span>
      </div>
      <p className={o.note}>People write from Settings → Messages in Soma; you answer on their page, and it shows in Soma as a message from you. Messages are not end-to-end encrypted, and the screen where people write says so.</p>
      {threads.length === 0 ? <p className={o.empty}>Nobody has written yet.</p> : (
        <div className={o.list}>
          {threads.map((t) => (
            <Link key={t.userId} href={`/ops/person/?id=${t.userId}`} className={o.rowLink}>
              {t.unanswered ? <span className={`${o.sev} ${o.sevWatching}`}>Waiting</span> : <span className={o.sev}>Answered</span>}
              <span className={o.rowMain}>
                <span className={o.rowName}>{t.person}</span>
                <span className={o.rowSub}>{t.lastSender === "admin" ? "You: " : ""}{t.preview}</span>
              </span>
              <span className={o.rowWhen}>{ago(t.lastMs, now)}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
