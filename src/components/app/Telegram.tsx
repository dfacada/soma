"use client";

// Connecting Telegram, inside the Week in review card: a code, sent to the bot once, is all the pairing there is
// (routes/telegram.js explains why that is enough). Only a chat id is stored, and only the last four digits of it
// are ever shown back.

import { useCallback, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { report } from "@/lib/log";
import { Button, Field, Input } from "@/components/ui";
import a from "./app.module.css";

type Status = { connected: boolean; chat: string | null; configured: boolean };

export function TelegramCard({ say }: { say: (m: string) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const look = useCallback(async () => {
    setBusy(true);
    try { setStatus(await api<Status>("GET", "/telegram")); }
    catch (e) { report("telegram", "status_failed", e, undefined, "warn"); say("Couldn't check Telegram"); }
    finally { setBusy(false); }
  }, [say]);

  const start = async () => {
    setBusy(true);
    try {
      const { code: c } = await api<{ code: string }>("POST", "/telegram/code");
      setCode(c);
    } catch (e) {
      report("telegram", "code_failed", e);
      say(e instanceof ApiError ? e.message : "Couldn't start pairing");
    } finally { setBusy(false); }
  };

  const finish = async () => {
    setBusy(true);
    try {
      const done = await api<{ connected: boolean; chat: string }>("POST", "/telegram/pair", {});
      setStatus({ connected: true, chat: done.chat, configured: true });
      setCode(null);
      say("Telegram connected");
    } catch (e) {
      report("telegram", "pair_failed", e, undefined, e instanceof ApiError && e.status < 500 ? "warn" : "error");
      say(e instanceof ApiError ? e.message : "Couldn't connect Telegram");
    } finally { setBusy(false); }
  };

  const forget = async () => {
    setBusy(true);
    try { await api("DELETE", "/telegram"); setStatus({ connected: false, chat: null, configured: true }); say("Telegram disconnected"); }
    catch (e) { report("telegram", "forget_failed", e); say("Couldn't disconnect"); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try { await api("POST", "/telegram/send", { text: "This is Soma, testing. Your week in review will arrive here.", speak: false }); say("Sent. Check Telegram."); }
    catch (e) { report("telegram", "test_failed", e, undefined, "warn"); say(e instanceof ApiError ? e.message : "Couldn't send"); }
    finally { setBusy(false); }
  };

  if (!status) {
    return (
      <Field name="Telegram" help="Where the review is sent, if you want it there.">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void look()}>{busy ? "…" : "Check"}</Button>
      </Field>
    );
  }
  if (!status.configured) {
    return <Field name="Telegram" help="Not set up on the server yet."><span className="muted" style={{ fontSize: 12 }}>unavailable</span></Field>;
  }
  if (status.connected) {
    return (
      <Field name="Telegram" help={`Connected to the chat ending ${status.chat}.`}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void test()}>Test</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void forget()}>Disconnect</Button>
        </div>
      </Field>
    );
  }
  return (
    <>
      <Field name="Telegram" help="Connect once: Soma gives you a code, you send it to the bot, and it knows which chat is yours.">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void start()}>{code ? "New code" : "Connect"}</Button>
      </Field>
      {code && (
        <div className={a.draft}>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>
            Open <a className={a.lnk} href="https://t.me/Soma_me_bot" target="_blank" rel="noreferrer">@Soma_me_bot</a> in Telegram, send it this code, then tap Connected. The code lasts ten minutes.
          </p>
          <Input readOnly aria-label="Pairing code" value={code} onFocus={(e) => e.currentTarget.select()} style={{ textAlign: "center", letterSpacing: "0.12em" }} />
          <Button variant="journal" block disabled={busy} onClick={() => void finish()}>{busy ? "Looking…" : "I've sent it · Connect"}</Button>
        </div>
      )}
    </>
  );
}
