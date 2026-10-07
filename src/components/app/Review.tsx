"use client";

// The week in review: what the journal said, written once a week, read or listened to here.
//
// The writing can only happen on this device, with the vault open, because the entries are encrypted: they are
// decrypted here, their text goes to the API for Claude to write up (routes/review.js), and what comes back is
// encrypted again before it is stored. Nothing of it is kept in the clear anywhere.
//
// Listening: the review is read aloud by the server's voice when it is available, in pieces so no request is huge,
// and by the phone's own voice when it is not. Sending to Telegram is a tap, or automatic when that is switched on.

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { report } from "@/lib/log";
import { listReviews, putReview, sendToTelegram, speak, writeReview } from "@/lib/review-api";
import { asSpeech, asText, reviewDue, weekDays, weekLabel, weekNumbers, type DaySummary, type Review } from "@/lib/review";
import { dayStatus } from "@/lib/today";
import { Button, Card, Tag, Toast } from "@/components/ui";
import { useDays } from "./Days";
import { useJournal } from "./Journal";
import { useSession } from "./Session";
import a from "./app.module.css";

/** One request of speech. The server caps this too; keeping pieces short also means it starts talking sooner. */
const SAY_MAX = 1500;

export function ReviewScreen() {
  const { settings } = useSession();
  const { map } = useDays();
  const journal = useJournal();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const say = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2600); }, []);
  const asked = useRef(false);

  const setting = settings.weeklyReview;
  const vaultOpen = journal.vault === "open";

  // Load what is already written, and decrypt it. Only possible with the vault open.
  useEffect(() => {
    if (!vaultOpen) return;
    let alive = true;
    void listReviews().then(async ({ reviews: rows }) => {
      const out: Review[] = [];
      for (const row of rows) {
        try { out.push(await journal.unseal<Review>(row.ciphertext)); }
        catch (e) { report("review", "unreadable", e, { week: row.weekStart }, "warn"); }
      }
      if (alive) setReviews(out.sort((x, y) => (x.weekStart < y.weekStart ? 1 : -1)));
    }, (e) => { report("review", "list_failed", e); if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [vaultOpen, journal]);

  /** Gather one week: the entries' text from the journal, and the numbers from the day map. */
  const gather = useCallback((week: string) => {
    const days = weekDays(week);
    const entries = (journal.items || [])
      .filter((i) => i.entry && days.includes(new Date(i.createdMs).toISOString().slice(0, 10)))
      .map((i) => ({ day: new Date(i.createdMs).toISOString().slice(0, 10), text: (i.entry!.transcript || "").trim(), mood: i.entry!.mood }))
      .filter((e) => e.text.length > 1)
      .sort((x, y) => (x.day < y.day ? -1 : 1));
    const summaries: DaySummary[] = days.map((day) => {
      const st = dayStatus(map?.[day], settings);
      return {
        day, closed: st.closed, weight: st.weight ?? undefined, kcal: st.kcal, protein: st.protein,
        pushups: st.pushups, activity: st.acts > 0, entries: entries.filter((e) => e.day === day).length,
      };
    });
    return { entries, numbers: weekNumbers(summaries) };
  }, [journal.items, map, settings]);

  const send = useCallback(async (review: Review, quiet = false) => {
    try {
      const { sent, spoke } = await sendToTelegram(asText(review), setting.speak);
      if (!quiet) say(sent ? (spoke ? "Sent to Telegram, with the audio" : "Sent to Telegram") : "Not sent");
    } catch (e) {
      report("review", "telegram_failed", e, { week: review.weekStart }, e instanceof ApiError && e.status < 500 ? "warn" : "error");
      say(e instanceof ApiError ? e.message : "Could not send to Telegram");
    }
  }, [say, setting.speak]);

  const write = useCallback(async (week: string) => {
    setBusy(week);
    try {
      const { entries, numbers } = gather(week);
      if (!entries.length) { say("No journal entries that week, so there is nothing to write up."); return; }
      const written = await writeReview(entries, numbers);
      const review: Review = { weekStart: week, ...written, numbers, writtenMs: Date.now(), entries: entries.length };
      await putReview(week, await journal.seal(review));
      setReviews((cur) => [review, ...(cur || []).filter((r) => r.weekStart !== week)]);
      say("Your week is written");
      if (setting.telegram) void send(review, true);
    } catch (e) {
      report("review", "write_failed", e, { week });
      say(e instanceof ApiError ? e.message : "The review could not be written. Try again.");
    } finally { setBusy(null); }
  }, [gather, journal, say, setting.telegram, send]);

  // When it is due and allowed, write it without being asked: once per load, and never without the vault.
  useEffect(() => {
    if (!vaultOpen || !reviews || asked.current || !setting.on || !setting.consent) return;
    const due = reviewDue(new Date(), reviews.map((r) => r.weekStart), setting);
    if (!due) return;
    asked.current = true;
    // After the render, not inside it: writing sets state and this effect only decides that it should start.
    const soon = window.setTimeout(() => void write(due), 0);
    return () => window.clearTimeout(soon);
  }, [vaultOpen, reviews, setting, write]);


  if (!vaultOpen) {
    return (
      <div className={a.page}>
        <div className={a.pageHead}><div><div className="eb">Weekly</div><div className={`d ${a.pageTitle}`}>Week in review</div></div></div>
        <Card>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>Your reviews are written from your journal, so they are encrypted like it. Unlock your vault to read them.</p>
          <Button variant="journal" onClick={journal.openVault}>Unlock</Button>
        </Card>
      </div>
    );
  }

  const due = reviews ? reviewDue(new Date(), reviews.map((r) => r.weekStart), { ...setting, on: true }) : null;

  return (
    <div className={a.page}>
      <div className={a.pageHead}>
        <div>
          <div className="eb">{reviews ? `${reviews.length} written` : "Weekly"}</div>
          <div className={`d ${a.pageTitle}`}>Week in review</div>
        </div>
      </div>

      {!setting.consent && (
        <Card>
          <span className="eb" style={{ color: "var(--ink)" }}>Not switched on</span>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
            To write this, Soma decrypts that week&apos;s journal entries on this device and sends the text to Claude
            through its own server, which keeps none of it. That is the one time your journal leaves your phone.
            Turn it on under Week in review in Settings.
          </p>
        </Card>
      )}

      {failed && <div className={a.unsaved} role="alert"><span>Couldn&apos;t load your reviews.</span></div>}
      {!reviews && <Card><span className="eb">Loading</span></Card>}

      {reviews && due && setting.consent && (
        <Card>
          <span className="eb" style={{ color: "var(--ink)" }}>Ready to write</span>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>{weekLabel(due)} is finished. Writing it up takes about half a minute.</p>
          <Button variant="journal" disabled={busy !== null} onClick={() => void write(due)}>{busy === due ? "Writing…" : "Write that week"}</Button>
        </Card>
      )}

      {reviews && reviews.length === 0 && !due && (
        <Card><p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>Nothing yet. Reviews are written once a week, from the entries you record.</p></Card>
      )}

      {reviews?.map((r) => <ReviewCard key={r.weekStart} review={r} busy={busy === r.weekStart} onSend={() => void send(r)} say={say} />)}

      <Toast message={toast} />
    </div>
  );
}

function ReviewCard({ review, busy, onSend, say }: { review: Review; busy: boolean; onSend: () => void; say: (m: string) => void }) {
  const [playing, setPlaying] = useState(false);
  const stop = useRef<() => void>(() => undefined);
  useEffect(() => () => stop.current(), []);

  const listen = async () => {
    if (playing) { stop.current(); setPlaying(false); return; }
    setPlaying(true);
    const pieces = split(asSpeech(review), SAY_MAX);
    let cancelled = false;
    stop.current = () => { cancelled = true; window.speechSynthesis?.cancel(); };
    try {
      for (const piece of pieces) {
        if (cancelled) break;
        const blob = await speak(piece);
        if (cancelled) break;
        await play(blob, (el) => { stop.current = () => { cancelled = true; el.pause(); }; });
      }
    } catch (e) {
      // The server voice can be unavailable (it needs its model terms accepted); the phone can always read.
      report("review", "speak_failed", e, { week: review.weekStart }, "warn");
      if (!cancelled && "speechSynthesis" in window) {
        say("Reading it with your phone's own voice");
        const said = new SpeechSynthesisUtterance(asSpeech(review));
        said.rate = 1;
        await new Promise<void>((done) => { said.onend = () => done(); said.onerror = () => done(); window.speechSynthesis.speak(said); });
      } else if (!cancelled) say("Could not read it aloud");
    } finally { setPlaying(false); }
  };

  const n = review.numbers;
  return (
    <Card>
      <div className={a.entryHead}>
        <span className="eb" style={{ color: "var(--ink)" }}>{weekLabel(review.weekStart)}</span>
        <span className={a.entryTags}><Tag>{review.entries} entr{review.entries === 1 ? "y" : "ies"}</Tag></span>
      </div>
      {review.synopsis.split("\n").filter(Boolean).map((p) => <p key={p.slice(0, 40)} style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>{p}</p>)}

      {review.remember.length > 0 && <>
        <span className="eb" style={{ color: "var(--ink)", paddingTop: 6 }}>Worth remembering</span>
        <ul className={a.reviewList}>{review.remember.map((x) => <li key={x}>{x}</li>)}</ul>
      </>}
      {review.threads.length > 0 && <>
        <span className="eb" style={{ color: "var(--ink)", paddingTop: 6 }}>Through the week</span>
        <ul className={a.reviewList}>{review.threads.map((x) => <li key={x}>{x}</li>)}</ul>
      </>}
      {review.noticed.length > 0 && <>
        <span className="eb" style={{ color: "var(--ink)", paddingTop: 6 }}>Noticed</span>
        <ul className={a.reviewList}>{review.noticed.map((x) => <li key={x}>{x}</li>)}</ul>
      </>}

      <p className="m muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
        {n.daysClosed} of {n.of} days closed · {n.entries} entr{n.entries === 1 ? "y" : "ies"}
        {n.weightChange != null && ` · weight ${n.weightChange > 0 ? "+" : ""}${n.weightChange} lb`}
        {n.avgKcal != null && ` · ${n.avgKcal.toLocaleString("en-US")} kcal a day`}
        {n.pushups ? ` · ${n.pushups.toLocaleString("en-US")} push-ups` : ""}
      </p>

      <div className={a.rowButtons}>
        <Button size="sm" variant={playing ? "secondary" : "journal"} onClick={() => void listen()}>{playing ? "Stop" : "Listen"}</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onSend}>Send to Telegram</Button>
      </div>
    </Card>
  );
}

/** Break the text into pieces for the voice, on sentence ends where possible. */
function split(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("\n"), window.lastIndexOf("! "), window.lastIndexOf("? "));
    const at = cut > max * 0.5 ? cut + 1 : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Play one piece and resolve when it ends, handing the element back so it can be stopped. */
function play(blob: Blob, hold: (el: HTMLAudioElement) => void): Promise<void> {
  return new Promise((done, fail) => {
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    hold(el);
    const finish = () => { URL.revokeObjectURL(url); done(); };
    el.onended = finish;
    el.onpause = () => { if (el.currentTime > 0 && !el.ended) finish(); };
    el.onerror = () => { URL.revokeObjectURL(url); fail(new Error("audio failed")); };
    void el.play().catch(fail);
  });
}
