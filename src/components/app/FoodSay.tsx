"use client";

// Say the whole day's food in one go (David, 2026-11-02: "dictate what I ate and have all that stuff entered").
// Typed, spoken through the keyboard's own mic, or recorded here and transcribed by the journal's pipeline. The words
// go to POST /food/describe, which splits them into items with the meal each was for; the person checks the list,
// moves or drops anything, and Log all writes it in one save. Nothing is logged before that tap.

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { describeFood, type Said } from "@/lib/food-say";
import type { Known } from "@/lib/food-match";
import { report } from "@/lib/log";
import { meter, type Meter } from "@/lib/meter";
import { pickMime } from "@/lib/recorder";
import { MEALS } from "@/lib/settings";
import { cap } from "@/lib/today";
import { transcribeAudio } from "@/lib/transcribe";
import { Button, Card, Icon, Select } from "@/components/ui";
import a from "./app.module.css";

export type { Said };

const TEXT_MAX = 1500;
const PLACEHOLDER = "Bacon, egg and cheese on an everything bagel and a small fries for breakfast. A burger with a salad for lunch.";

/** Records what you say and hands back the words: start, then stop resolves to the transcript ("" when nothing was
 *  heard). Errors are reported here and come back as a sentence: to `onError` when given (Today's toast), otherwise in
 *  `error`. Used by the box below and Today's card. */
export function useSayRecorder(onError?: (message: string) => void) {
  const [state, setState] = useState<"idle" | "listening" | "transcribing">("idle");
  const [seconds, setSeconds] = useState(0);
  const [shown, setError] = useState<string | null>(null);
  const tell = useRef(onError);
  useEffect(() => { tell.current = onError; }, [onError]);
  const fail = useCallback((m: string) => { if (tell.current) tell.current(m); else setError(m); }, []);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; timer: number; meter: Meter | null } | null>(null);

  // A recording left running when the screen goes away still has the microphone; let it go.
  useEffect(() => () => { const r = rec.current; if (r) { window.clearInterval(r.timer); r.meter?.close(); r.stream.getTracks().forEach((t) => t.stop()); } }, []);

  const start = useCallback(async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined") { fail("This browser can't record. Type it on Food instead."); return false; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
    catch (e) { report("food", "mic_denied", e, undefined, "warn"); fail("Soma can't use the microphone. Allow it in Settings, or type it on Food."); return false; }
    const mime = pickMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    rec.current = { mr, stream, chunks, timer, meter: meter(stream) };
    setSeconds(0);
    mr.start(1000);
    setState("listening");
    return true;
  }, [fail]);

  const stop = useCallback(async (): Promise<string> => {
    const r = rec.current;
    if (!r) return "";
    rec.current = null;
    window.clearInterval(r.timer);
    r.meter?.close();
    await new Promise<void>((resolve) => { r.mr.addEventListener("stop", () => resolve(), { once: true }); try { r.mr.stop(); } catch { resolve(); } });
    r.stream.getTracks().forEach((t) => t.stop());
    if (!r.chunks.length) { setState("idle"); return ""; }
    setState("transcribing");
    try {
      const heard = await transcribeAudio("food_" + Date.now(), new Blob(r.chunks, { type: r.chunks[0].type || r.mr.mimeType }));
      if (!heard) fail("Didn't catch any words. Try again.");
      return heard || "";
    } catch (e) {
      report("food", "say_transcribe_failed", e);
      fail((e as Error)?.message || "Couldn't turn that into words. Try again.");
      return "";
    } finally { setState("idle"); }
  }, [fail]);

  /** Live loudness while listening, for the screen; null otherwise. */
  const levels = useCallback(() => rec.current?.meter ?? null, []);
  return { state, seconds, error: shown, setError, fail, start, stop, levels };
}

/** "1:05". */
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** The describe call's failure as a sentence, reported once. */
export function describeError(e: unknown) {
  report("food", "describe_failed", e, undefined, e instanceof ApiError && e.status < 500 ? "warn" : "error");
  return e instanceof ApiError ? cap(e.message) + "." : "Couldn't read that. Try again in a moment.";
}

export function FoodSay({ known, eaten, onLog }: {
  known: Known[];
  /** Which meals already hold something today, so the list can say what Log all will replace. */
  eaten: Record<string, unknown>;
  onLog: (items: Said[]) => void;
}) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<Said[] | null>(null);
  const [reading, setReading] = useState(false);
  const voice = useSayRecorder();
  const error = voice.error, setError = voice.setError;
  const busy = voice.state !== "idle" ? voice.state : reading ? "reading" : null;

  async function stopListening() {
    const heard = await voice.stop();
    if (heard) { setText((t) => (t.trim() ? t.trim() + " " : "") + heard); setItems(null); }
  }

  async function read() {
    const said = text.trim();
    if (!said || busy) return;
    setError(null);
    setReading(true);
    try {
      const got = await describeFood(said, known);
      if (!got.length) setError("Didn't find any food in that. Say what you ate and which meal it was.");
      setItems(got.length ? got : null);
    } catch (e) {
      setError(describeError(e));
    } finally { setReading(false); }
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
        <span className="eb">Tell me what you ate</span>
        <span className="muted" style={{ fontSize: 12 }}>the whole day at once</span>
      </div>
      <textarea className={a.note} rows={3} maxLength={TEXT_MAX} placeholder={PLACEHOLDER} aria-label="What you ate today"
        value={text} onChange={(e) => { setText(e.target.value); if (items) setItems(null); }} disabled={busy === "listening" || busy === "transcribing"} />
      <div className={a.rowButtons}>
        {busy === "listening"
          ? <Button variant="danger" onClick={() => void stopListening()}><Icon name="mic" />Stop · {mmss(voice.seconds)}</Button>
          : <Button variant="secondary" disabled={busy !== null} onClick={() => void voice.start()}><Icon name="mic" />{busy === "transcribing" ? "Writing it down…" : "Speak"}</Button>}
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
