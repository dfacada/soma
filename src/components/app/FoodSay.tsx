"use client";

// Say the whole day's food in one go (David, 2026-11-02: "dictate what I ate and have all that stuff entered").
// Typed, spoken through the keyboard's own mic, or recorded here and transcribed by the journal's pipeline. The words
// go to POST /food/describe, which splits them into items with the meal each was for; the person checks the list,
// moves or drops anything, and Log all writes it in one save. Nothing is logged before that tap.

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Known } from "@/lib/food-match";
import { report } from "@/lib/log";
import { pickMime } from "@/lib/recorder";
import { MEALS, type Meal } from "@/lib/settings";
import { cap } from "@/lib/today";
import { transcribeAudio } from "@/lib/transcribe";
import { Button, Card, Icon, Select } from "@/components/ui";
import a from "./app.module.css";

export type Said = { meal: Meal | "extra"; name: string; kcal: number; protein: number; carbs: number; fat: number; note: string };

const TEXT_MAX = 1500;
const KNOWN_MAX = 60;
const PLACEHOLDER = "Bacon, egg and cheese on an everything bagel and a small fries for breakfast. A burger with a salad for lunch.";

export function FoodSay({ known, eaten, onLog }: {
  known: Known[];
  /** Which meals already hold something today, so the list can say what Log all will replace. */
  eaten: Record<string, unknown>;
  onLog: (items: Said[]) => void;
}) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<Said[] | null>(null);
  const [busy, setBusy] = useState<"listening" | "transcribing" | "reading" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; timer: number } | null>(null);

  // A recording left running when the screen goes away still has the microphone; let it go.
  useEffect(() => () => { const r = rec.current; if (r) { window.clearInterval(r.timer); r.stream.getTracks().forEach((t) => t.stop()); } }, []);

  async function listen() {
    setError(null);
    if (typeof MediaRecorder === "undefined") return setError("This browser can't record. Use the keyboard's mic instead.");
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
    catch (e) { report("food", "mic_denied", e, undefined, "warn"); return setError("Soma can't use the microphone. Allow it in Settings, or use the keyboard's mic."); }
    const mime = pickMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    rec.current = { mr, stream, chunks, timer };
    setSeconds(0);
    mr.start(1000);
    setBusy("listening");
  }

  async function stopListening() {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    window.clearInterval(r.timer);
    await new Promise<void>((resolve) => { r.mr.addEventListener("stop", () => resolve(), { once: true }); try { r.mr.stop(); } catch { resolve(); } });
    r.stream.getTracks().forEach((t) => t.stop());
    if (!r.chunks.length) { setBusy(null); return; }
    setBusy("transcribing");
    try {
      const heard = await transcribeAudio("food_" + Date.now(), new Blob(r.chunks, { type: r.chunks[0].type || r.mr.mimeType }));
      if (!heard) setError("Didn't catch any words. Try again, or type it.");
      else setText((t) => (t.trim() ? t.trim() + " " : "") + heard);
      setItems(null);
    } catch (e) {
      report("food", "say_transcribe_failed", e);
      setError((e as Error)?.message || "Couldn't turn that into words. Type it instead.");
    } finally { setBusy(null); }
  }

  async function read() {
    const said = text.trim();
    if (!said || busy) return;
    setError(null);
    setBusy("reading");
    try {
      // Your own foods, newest logged first, so "my shake" comes back with your numbers. The recipe book stays home.
      const mine = known.filter((k) => k.source !== "recipe").reverse().slice(0, KNOWN_MAX)
        .map(({ name, kcal, protein, carbs, fat }) => ({ name, kcal, protein, carbs, fat }));
      const got = await api<{ items: Said[] }>("POST", "/food/describe", { text: said, known: mine });
      if (!got.items.length) setError("Didn't find any food in that. Say what you ate and which meal it was.");
      setItems(got.items.length ? got.items : null);
    } catch (e) {
      report("food", "describe_failed", e, undefined, e instanceof ApiError && e.status < 500 ? "warn" : "error");
      setError(e instanceof ApiError ? cap(e.message) + "." : "Couldn't read that. Try again in a moment.");
    } finally { setBusy(null); }
  }

  function logAll() {
    if (!items?.length) return;
    onLog(items);
    setItems(null); setText(""); setError(null);
  }

  const total = (items || []).reduce((n, x) => n + x.kcal, 0);
  const replaces = MEALS.filter((m) => eaten[m] && items?.some((x) => x.meal === m));

  return (
    <Card>
      <div className={a.entryHead}>
        <span className="eb" style={{ color: "var(--ink)" }}>Tell me what you ate</span>
        <span className="muted" style={{ fontSize: 12 }}>the whole day at once</span>
      </div>
      <textarea className={a.note} rows={3} maxLength={TEXT_MAX} placeholder={PLACEHOLDER} aria-label="What you ate today"
        value={text} onChange={(e) => { setText(e.target.value); if (items) setItems(null); }} disabled={busy === "listening" || busy === "transcribing"} />
      <div className={a.rowButtons}>
        {busy === "listening"
          ? <Button variant="danger" onClick={() => void stopListening()}><Icon name="mic" />Stop · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</Button>
          : <Button variant="secondary" disabled={busy !== null} onClick={() => void listen()}><Icon name="mic" />{busy === "transcribing" ? "Writing it down…" : "Speak"}</Button>}
        <Button variant="food" disabled={!text.trim() || busy !== null} onClick={() => void read()}>{busy === "reading" ? "Reading…" : items ? "Read it again" : "Fill it in"}</Button>
      </div>
      {error && <p role="alert" className={a.noteBad}>{error}</p>}
      {items && (
        <div className={a.draft}>
          {items.map((x, i) => (
            <div key={i} className={a.saidRow}>
              <div className={a.pickName}>
                <span style={{ fontWeight: 500 }}>{x.name}</span>
                <span className="m muted" style={{ fontSize: 12 }}>{x.kcal} kcal · {x.protein} P · {x.carbs} C · {x.fat} F{x.note ? <span style={{ fontFamily: "var(--font-body)" }}> · {x.note}</span> : null}</span>
              </div>
              <div className={a.saidActions}>
                <Select compact aria-label={`Meal for ${x.name}`} value={x.meal} onChange={(e) => setItems((l) => l && l.map((y, j) => (j === i ? { ...y, meal: e.target.value as Said["meal"] } : y)))}>
                  {MEALS.map((m) => <option key={m} value={m}>{cap(m)}</option>)}
                  <option value="extra">Something else</option>
                </Select>
                <button type="button" className={a.lnk} onClick={() => setItems((l) => { const next = l ? l.filter((_, j) => j !== i) : []; return next.length ? next : null; })}>Remove</button>
              </div>
            </div>
          ))}
          {replaces.length > 0 && <p className="muted" style={{ fontSize: 12 }}>Replaces what&apos;s logged for {replaces.join(" and ")}.</p>}
          <div className={a.extraForm}>
            <Button variant="food" block onClick={logAll}>Log all · {total.toLocaleString("en-US")} kcal</Button>
            <Button variant="secondary" onClick={() => { setItems(null); setError(null); }}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
