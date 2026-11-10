"use client";

// Messages between a member and the admin (catalyst/functions/soma_api/routes/messages.js). The admin writes from
// Dayhub Ops; here the member reads and answers. MessageCard sits on Today while a message is unread; MessagesThread is
// Settings → Messages, which replaced the one-way feedback form (old feedback shows in the thread).

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { Button, useTabVisible } from "@/components/ui";
import a from "./app.module.css";

export type Message = { id: string; sender: "admin" | "member"; from: string | null; body: string; at: number; read: boolean; feedback?: boolean };
type Thread = { messages: Message[]; unread: number };

const when = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const AGAIN_MS = 10 * 60 * 1000;

/** Today: the newest unread message from the admin, with Reply and Got it. Looked for when Today shows, at most every
 *  ten minutes. */
export function MessageCard() {
  const visible = useTabVisible();
  const [msg, setMsg] = useState<Message | null>(null);
  const [more, setMore] = useState(0);
  const last = useRef(0);

  useEffect(() => {
    if (!visible || Date.now() - last.current < AGAIN_MS) return;
    last.current = Date.now();
    let alive = true;
    api<Thread>("GET", "/messages").then((t) => {
      if (!alive) return;
      const unread = t.messages.filter((m) => m.sender === "admin" && !m.read);
      setMsg(unread[unread.length - 1] || null);
      setMore(Math.max(0, unread.length - 1));
    }, (e) => report("messages", "load_failed", e, undefined, "warn"));
    return () => { alive = false; };
  }, [visible]);

  if (!msg) return null;
  const seen = () => {
    haptic("done");
    setMsg(null);
    void api("POST", "/messages/read").catch((e) => report("messages", "read_failed", e, undefined, "warn"));
  };
  return (
    <section className={a.msgCard} aria-label={`A message from ${msg.from || "Dayhub"}`}>
      <span className="eb">From {msg.from || "Dayhub"} · {when(msg.at)}{more ? ` · ${more} more` : ""}</span>
      <p className={a.msgBody}>{msg.body}</p>
      <div className={a.msgActions}>
        <Link href="/settings/#messages" className={a.lnk} onClick={seen}>Reply</Link>
        <Button size="sm" variant="secondary" onClick={seen}>Got it</Button>
      </div>
    </section>
  );
}

/** Settings → Messages: the whole thread and a box to write in. Opening it marks the admin's messages read. */
export function MessagesThread({ say }: { say: (m: string) => void }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [failed, setFailed] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(() => api<Thread>("GET", "/messages").then((t) => {
    setThread(t);
    setFailed(false);
    if (t.unread) void api("POST", "/messages/read").catch((e) => report("messages", "read_failed", e, undefined, "warn"));
  }, (e) => { report("messages", "load_failed", e); setFailed(true); }), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [thread]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    haptic("done");
    setBusy(true);
    try {
      const m = await api<Message>("POST", "/messages", { body: text });
      setThread((t) => ({ messages: [...(t?.messages || []), { ...m, from: null }], unread: 0 }));
      setBody("");
      say("Sent");
    } catch (err) {
      report("messages", "send_failed", err);
      say(err instanceof Error && err.message ? err.message : "Couldn't send that");
    } finally { setBusy(false); }
  }

  return (
    <>
      {failed && <p className="muted" style={{ fontSize: 13 }}>Couldn&apos;t load your messages. <button type="button" className={a.lnk} onClick={() => void load()}>Try again</button></p>}
      {thread && thread.messages.length > 0 && (
        <div className={a.thread}>
          {thread.messages.map((m) => (
            <div key={m.id} className={`${a.bubble} ${m.sender === "member" ? a.bubbleMine : ""}`}>
              <span className={a.bubbleWho}>{m.sender === "admin" ? m.from || "Dayhub" : "You"} · {when(m.at)}{m.feedback ? " · feedback" : ""}</span>
              <span className={a.bubbleBody}>{m.body}</span>
            </div>
          ))}
          <div ref={end} />
        </div>
      )}
      <form className={a.vaultForm} onSubmit={send}>
        <textarea className={a.note} rows={3} maxLength={2000} value={body} aria-label="Message to David" placeholder="Something broken, confusing or missing? A question? It goes straight to David." onChange={(e) => setBody(e.target.value)} />
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>David reads these to help you, so they aren&apos;t sealed like your journal. His replies show here, and on Today until you&apos;ve read them.</p>
        <div><Button type="submit" variant="secondary" disabled={busy || !body.trim()}>{busy ? "Sending…" : "Send"}</Button></div>
      </form>
    </>
  );
}
