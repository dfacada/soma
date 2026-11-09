"use client";

// Admin section of Settings: the way into Soma Ops (src/app/ops/), where approvals, people, issues, errors, messages
// and the audit now live, and the one admin tool that has to stay in the app: transcribing your own recordings, which
// needs your vault key on this device. Only rendered for admins; every route behind it checks the role again.

import { useCallback, useRef, useState } from "react";
import { report } from "@/lib/log";
import { Bar, Button, ButtonLink, Card, Row, Tag } from "@/components/ui";
import { needsTranscript, useJournal, type BatchResult } from "./Journal";
import a from "./app.module.css";

export function Admin({ say }: { say: (m: string) => void }) {
  return (
    <>
      <Card>
        <span className="eb">Soma Ops</span>
        <p style={{ fontSize: 14, lineHeight: 1.5 }}>Run Soma from one place: who needs a look, everyone&apos;s days done or not, errors grouped into problems, messages, invites and the audit of what admins did. Best on a computer; it works on a phone too.</p>
        <div><ButtonLink href="/ops/" variant="activity">Open Soma Ops</ButtonLink></div>
      </Card>
      <TranscribeMissing say={say} />
    </>
  );
}

/** Transcribes your own recordings that have none, one by one. It has to run here: the audio is encrypted with your
 *  vault key, which only this device holds, so the server cannot do it alone. Only your entries are listed. */
function TranscribeMissing({ say }: { say: (m: string) => void }) {
  const j = useJournal();
  const stop = useRef({ now: false });
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const [total, setTotal] = useState(0);

  const missing = j.items ? j.items.filter((i) => !i.pending && needsTranscript(i.entry)).length : 0;
  const run = useCallback(async () => {
    stop.current = { now: false };
    setRunning(true); setResults([]); setTotal(missing);
    try {
      const out = await j.transcribeMissing((r, now) => { setResults(r); setCurrent(now); }, stop.current);
      const failed = out.filter((r) => r.outcome === "failed").length;
      say(failed ? `${out.length - failed} transcribed, ${failed} failed` : `${out.length} transcribed`);
    } catch (e) {
      report("journal", "transcribe_batch_failed", e);
      say("The run stopped unexpectedly");
    } finally { setRunning(false); setCurrent(null); }
  }, [j, missing, say]);

  const ready = j.vault === "open" && j.items !== null;
  return (
    <Card>
      <div className={a.entryHead}>
        <span className="eb">Transcribe missing</span>
        {ready && !running && <span className="m muted" style={{ fontSize: 12 }}>{missing} without a transcript</span>}
      </div>
      {!ready ? <p className="muted" style={{ fontSize: 13 }}>Open your vault to see which of your recordings have no transcript.</p>
        : !j.cloudOn ? <p className="muted" style={{ fontSize: 13 }}>Cloud transcription is off. Turn it on under Journal &amp; vault first.</p>
        : <p className="muted" style={{ fontSize: 13 }}>Your recordings only, one at a time, on this device. Keep this screen open until it finishes. Transcripts and notes you already have are left alone.</p>}
      {running && <Bar label={current ?? "Next…"} value={results?.length ?? 0} max={Math.max(total, 1)} domain="journal" text={`${results?.length ?? 0} of ${total}`} />}
      {results?.map((r) => (
        <Row key={r.id} name={r.title} sub={r.outcome === "failed" ? `${r.stage}: ${r.code}${r.message ? ` · ${r.message}` : ""}` : r.outcome === "empty" ? "Nothing could be made out" : "Transcribed"}
          trail={<Tag tone={r.outcome === "failed" ? "critical" : r.outcome === "done" ? "journal" : undefined}>{r.outcome}</Tag>} />
      ))}
      <div className={a.rowButtons}>
        {running ? <Button size="sm" variant="secondary" onClick={() => { stop.current.now = true; }}>Stop after this one</Button>
          : <Button size="sm" variant="journal" disabled={!ready || !j.cloudOn || missing === 0} onClick={() => void run()}>{missing ? `Transcribe ${missing}` : "Nothing to transcribe"}</Button>}
      </div>
    </Card>
  );
}
