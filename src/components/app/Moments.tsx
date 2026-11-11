"use client";

// Full-screen moments (Dayhub Night, 2026-11-02). RecordMoment covers the app while a journal entry records and while
// it is being kept safe, wherever recording started (Today, the Journal tab, the sidebar). FoodMoment is the Food
// card's dictation, step by step. DayMoment is Say your day after its recording: the words read, then the list to
// check. DayClosed is the celebration when today closes.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Icon, Orb, type OrbBead } from "@/components/ui";
import { clock } from "@/lib/journal";
import type { Meter } from "@/lib/meter";
import { haptic } from "@/lib/haptics";
import { promptFor } from "@/lib/prompts";
import type { Said } from "@/lib/food-say";
import { listed, type DayRow } from "@/lib/say-day";
import { MEALS } from "@/lib/settings";
import { cap } from "@/lib/today";
import { useJournal } from "./Journal";
import m from "./moments.module.css";

const hue = (d: "journal" | "food" | "activity") => ({ "--hue": `var(--${d})` }) as CSSProperties;

// Fixed shapes for the bars, so they do not jump on every render.
const VBARS = Array.from({ length: 56 }, (_, i) => ({ "--r": `${((i * 360) / 56).toFixed(1)}deg`, "--s": (0.6 + 0.8 * Math.abs(Math.sin(i * 1.9))).toFixed(2), "--dl": `${(-((i * 0.07) % 0.85)).toFixed(2)}s` }) as CSSProperties);
// The food wave's bars by their distance from the middle: tallest at the two centre bars, tapering to 12px at the
// ends, so the still wave mirrors around the check under it as the meter draws it. 48px at most, so the meter's
// loudest (1.25 times) still fits the 60px box.
const WAVE = Array.from({ length: 36 }, (_, i) => {
  const u = (Math.abs(i - 17.5) - 0.5) / 17;
  return { "--h": `${Math.round(12 + 36 * Math.exp(-((u / 0.45) ** 2)))}px`, "--dl": `${(-((i * 0.09) % 0.7)).toFixed(2)}s` } as CSSProperties;
});

/** Every animation frame while live, hand `draw` the microphone's meter, and mark the box `metered` so the CSS loops
 *  give way to it (David, 2026-11-03: "move according to the volume that I'm speaking"). Writes straight to the
 *  elements, not React state: sixty renders a second would cost more than the drawing. With no meter (no Web Audio)
 *  or Reduce Motion on, the decorative loops stay. */
function useMeter(box: RefObject<HTMLElement | null>, live: boolean, levels: (() => Meter | null) | undefined, draw: (el: HTMLElement, mtr: Meter, dt: number) => void) {
  const paint = useRef(draw);
  useEffect(() => { paint.current = draw; }, [draw]);
  useEffect(() => {
    const el = box.current;
    if (!live || !levels || !el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      // Seconds since the last frame, capped so a stalled tab does not jump on its return.
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const mtr = levels();
      if (mtr) { el.classList.add(m.metered); paint.current(el, mtr, dt); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); el.classList.remove(m.metered); };
  }, [box, live, levels]);
}

/** Smooth motion out of a jumpy signal (David: "smoother to truly mimic the sound as it's coming in"): each value
 *  rises fast (a syllable lands at once) and falls slowly (a voice tails off), the same at any frame rate, and each
 *  is blended with its neighbours so the shape flows rather than flickers. `ring` joins the two ends. */
const ATTACK = 0.04, RELEASE = 0.22;
function follow(state: Float32Array, target: number[], dt: number, ring: boolean) {
  const n = target.length;
  for (let i = 0; i < n; i++) {
    const prev = target[ring ? (i - 1 + n) % n : Math.max(0, i - 1)], next = target[ring ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const want = prev * 0.25 + target[i] * 0.5 + next * 0.25;
    state[i] += (want - state[i]) * (1 - Math.exp(-dt / (want > state[i] ? ATTACK : RELEASE)));
  }
  return state;
}

function Vox({ live, levels, children }: { live: boolean; levels?: () => Meter | null; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const bars = useRef(new Float32Array(VBARS.length));
  const glow = useRef(0);
  // The ring is mirrored left to right: low voices at the top, high at the bottom, so it breathes evenly.
  useMeter(box, live, levels, (el, mtr, dt) => {
    const els = el.querySelectorAll<HTMLElement>("i");
    const half = Math.floor(els.length / 2);
    const b = mtr.bands(half + 1);
    const s = follow(bars.current, Array.from({ length: els.length }, (_, i) => b[i <= half ? i : els.length - i]), dt, true);
    els.forEach((bar, i) => bar.style.setProperty("--s", (0.25 + s[i] * 1.9).toFixed(3)));
    const lv = mtr.level();
    glow.current += (lv - glow.current) * (1 - Math.exp(-dt / (lv > glow.current ? 0.05 : 0.3)));
    el.style.setProperty("--lv", glow.current.toFixed(3));
  });
  return (
    <div ref={box} className={`${m.vox} ${live ? m.live : m.still}`} aria-hidden>
      <span className={m.ring} /><span className={m.ring} /><span className={m.ring} />
      {VBARS.map((s, i) => <i key={i} className={m.vbar} style={s} />)}
      <div className={m.core}>{children}</div>
    </div>
  );
}

/** The food screen's wave, loudest in the middle when there is a voice to follow. */
function Wave({ levels }: { levels?: () => Meter | null }) {
  const box = useRef<HTMLDivElement>(null);
  const bars = useRef(new Float32Array(WAVE.length));
  useMeter(box, true, levels, (el, mtr, dt) => {
    const els = el.querySelectorAll<HTMLElement>("i");
    const mid = (els.length - 1) / 2;
    const b = mtr.bands(Math.ceil(els.length / 2));
    const s = follow(bars.current, Array.from({ length: els.length }, (_, i) => b[Math.floor(Math.abs(i - mid))]), dt, false);
    els.forEach((bar, i) => { bar.style.transform = `scaleY(${(0.15 + s[i] * 1.1).toFixed(3)})`; });
  });
  return <div ref={box} className={m.wave} aria-hidden>{WAVE.map((s, i) => <i key={i} style={s} />)}</div>;
}

/** Characters that look like ciphertext while the recording is put away. Decoration: the real encryption is the vault's. */
const scramble = () => Array.from({ length: 48 }, (_, i) => "0123456789abcdef"[Math.floor(Math.random() * 16)] + (i % 4 === 3 && i < 47 ? " " : "")).join("");

export function RecordMoment() {
  const j = useJournal();
  // After a recording lands, "Saved" shows for a moment. Adjusted during render when a new one is counted.
  const [seen, setSeen] = useState(j.lastSaved.n);
  const [saved, setSaved] = useState(false);
  // A Say your day recording goes on to its own screen (DayMoment) instead of "Saved".
  if (seen !== j.lastSaved.n) { setSeen(j.lastSaved.n); setSaved(!j.lastSaved.day); }
  // Say your day: the same recording, with what is still open that day as a cue.
  const cues = j.dayCues;
  const what = cues ? "Your day" : "Journal";
  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 1800);
    return () => window.clearTimeout(t);
  }, [saved]);
  const [hex, setHex] = useState("");
  useEffect(() => {
    if (!j.sealing) return;
    const t = window.setInterval(() => setHex(scramble()), 90);
    return () => window.clearInterval(t);
  }, [j.sealing]);

  const phase = j.recording ? "rec" : j.sealing ? "seal" : saved ? "saved" : null;
  if (!phase) return null;
  return (
    <div className={m.moment} style={hue("journal")} role="dialog" aria-modal="true" aria-label={phase === "rec" ? (cues ? "Saying your day" : "Recording a journal entry") : "Saving your entry"}>
      <div className={m.glow} />
      <div className={m.inner}>
        <div className={m.bar}>
          <span style={{ width: 44 }} />
          <span className="eb">{phase === "rec" ? `${what} · recording` : phase === "seal" ? `${what} · sealing` : `${what} · saved`}</span>
          <span className={`m ${m.timer}`}>{clock(phase === "rec" ? j.seconds : j.lastSaved.seconds)}</span>
        </div>
        <Vox live={phase === "rec"} levels={j.levels}>
          {phase === "rec" ? <Icon name="mic" size={48} strokeWidth={1.8} />
            : phase === "seal" ? <Icon name="lock" size={48} strokeWidth={1.8} />
            : <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path className={m.check} d="M5 12l5 5 9-10" /></svg>}
        </Vox>
        <div className={m.text} key={phase} aria-live="polite">
          {phase === "rec" && !cues && <><span className={`d ${m.head}`}>Say how today went</span><span className={m.sub}>Not sure where to start? <span className={m.ask}>{promptFor(new Date())}</span></span></>}
          {phase === "rec" && cues && <>
            <span className={`d ${m.head}`}>Say your day</span>
            <span className={m.sub}>{cues.length ? "Whatever is on your mind, and what's still open:" : "Whatever is on your mind. It all goes in your journal."}</span>
            {cues.length > 0 && <span className={m.dayCues}>{cues.map((c) => <span key={c} className={m.dayCue}>{c}</span>)}</span>}
          </>}
          {phase === "seal" && <><span className={`d ${m.head}`}>Sealing it</span><span className={`m ${m.hex}`} aria-hidden>{hex}</span><span className={m.sub}>Kept on this phone, and encrypted with your vault key before it uploads.</span></>}
          {phase === "saved" && <><span className={`d ${m.head}`}>Saved · {clock(j.lastSaved.seconds)}</span><span className={m.sub}>Only your passphrase opens it.</span></>}
        </div>
        {phase === "rec" && (
          <div className={m.foot}>
            <button type="button" className={m.stop} onClick={() => { haptic("done"); j.toggleRecording(null); }} aria-label="Stop and save"><i /></button>
            <span className="eb">Tap to stop</span>
          </div>
        )}
      </div>
    </div>
  );
}

export type FoodPhase = "listening" | "transcribing" | "reading" | "done";

export function FoodMoment({ phase, seconds, heard, items, onStop, onClose, levels }: {
  phase: FoodPhase; seconds: number; heard: string | null; items: Said[]; onStop: () => void; onClose: () => void;
  /** The microphone's live loudness while listening. */
  levels?: () => Meter | null;
}) {
  const total = items.reduce((n, x) => n + x.kcal, 0);
  const words = heard ? heard.split(/\s+/).filter(Boolean) : [];
  return (
    <div className={m.moment} style={hue("food")} role="dialog" aria-modal="true" aria-label="Say what you ate">
      <div className={m.glow} />
      <div className={m.inner}>
        <div className={m.bar}>
          {phase === "done" ? <button type="button" className={m.x} onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button> : <span style={{ width: 44 }} />}
          <span className="eb">{phase === "listening" ? "Food · listening" : phase === "transcribing" ? "Food · writing it down" : phase === "reading" ? "Food · working it out" : "Food · logged"}</span>
          <span className={`m ${m.timer}`}>{Math.floor(seconds / 60)}:{String(Math.floor(seconds % 60)).padStart(2, "0")}</span>
        </div>
        {phase === "listening" && (
          <>
            <Vox live levels={levels}><Icon name="mic" size={48} strokeWidth={1.8} /></Vox>
            <div className={`${m.text} ${m.steady}`}><span className={`d ${m.head}`}>Say what you ate</span><span className={m.sub}>The whole day in one go, and which meal each thing was.</span></div>
            <div className={m.foot}>
              <Wave levels={levels} />
              <button type="button" className={`${m.stop} ${m.go}`} onClick={() => { haptic("done"); onStop(); }} aria-label="Done, log it"><Icon name="check" size={32} strokeWidth={2.4} /></button>
              <span className="eb">Tap when you&apos;re done</span>
            </div>
          </>
        )}
        {(phase === "transcribing" || phase === "reading") && (
          <>
            {words.length > 0
              ? <div className={`d ${m.said} ${phase === "reading" ? m.dim : ""}`}>{words.map((w, i) => <span key={i} style={{ animationDelay: `${Math.min(i * 0.05, 1.5)}s` }}>{w}</span>)}</div>
              : <div className={m.text} style={{ marginTop: 40 }}><span className={`d ${m.head}`}>Writing it down…</span></div>}
            <div className={m.skel} aria-label="Working out what you ate"><i /><i style={{ animationDelay: "0.15s" }} /><i style={{ animationDelay: "0.3s" }} /></div>
          </>
        )}
        {phase === "done" && (
          <>
            <div className={m.total}><span className="dc">{total.toLocaleString("en-US")}</span><span className="muted">kcal · {items.length} item{items.length === 1 ? "" : "s"} logged</span></div>
            <div className={m.items}>
              {items.map((x, i) => (
                <div key={i} className={m.item} style={{ animationDelay: `${0.05 + i * 0.12}s` }}>
                  <span className={m.itemTick}><Icon name="check" size={14} strokeWidth={2.6} /></span>
                  <span className={m.itemText}><span className="eb">{x.meal === "extra" ? "Something else" : cap(x.meal)}</span><span className={m.itemName}>{x.name}</span></span>
                  <span className="m">{Math.round(x.kcal)}</span>
                </div>
              ))}
            </div>
            <div className={m.foot}>
              <button type="button" className={m.lovely} onClick={onClose}>Done</button>
              <span className={m.sub}>Already logged. Change anything on Food.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export type DayPhase = "writing" | "reading" | "review" | "failed";
/** The first words of what was said, for the reading screen: a day's talk is too long to show whole. */
const SAID_WORDS = 30;

/**
 * Say your day, after the recording (SayDay.tsx drives it): the words being written down, then read, then the list
 * to check. Each row is a tick over one thing heard; nothing is logged until Fill in my day. The entry itself is
 * already saved, and closing this screen at any point leaves it in the journal.
 */
export function DayMoment({ phase, seconds, heard, rows, cut, replaces, message, onToggle, onMeal, onFill, onRetry, onClose }: {
  phase: DayPhase; seconds: number;
  /** What was said, once it is written down. */
  heard: string | null;
  rows: DayRow[];
  /** The recording ran past what one reading takes, so only its first part was read. */
  cut: boolean;
  /** Meals the ticked food rows would replace. */
  replaces: string[];
  /** What went wrong, for the failed phase. */
  message: string | null;
  onToggle: (id: string) => void;
  onMeal: (id: string, meal: Said["meal"]) => void;
  onFill: () => void;
  /** Read the same words again. Absent when there are no words to read (they could not be written down). */
  onRetry?: () => void;
  onClose: () => void;
}) {
  const words = heard ? heard.split(/\s+/).filter(Boolean) : [];
  const ticked = rows.filter((r) => r.on).length;
  const label = phase === "writing" ? "Your day · writing it down" : phase === "reading" ? "Your day · picking it out" : phase === "review" ? "Your day · check it" : "Your day";
  return (
    <div className={m.moment} style={hue("journal")} role="dialog" aria-modal="true" aria-label="Say your day">
      <div className={m.glow} />
      <div className={m.inner}>
        <div className={m.bar}>
          {/* Always a way out: closing logs nothing, and the entry is already saved. */}
          <button type="button" className={m.x} onClick={onClose} aria-label="Close without logging anything"><Icon name="close" size={18} /></button>
          <span className="eb">{label}</span>
          <span className={`m ${m.timer}`}>{clock(seconds)}</span>
        </div>
        {(phase === "writing" || phase === "reading") && (
          <>
            {phase === "reading" && words.length > 0
              ? <div className={`d ${m.said} ${m.dim}`}>{words.slice(0, SAID_WORDS).map((w, i) => <span key={i} style={{ animationDelay: `${Math.min(i * 0.05, 1.5)}s` }}>{w}</span>)}{words.length > SAID_WORDS && <span>…</span>}</div>
              : <div className={m.text} style={{ marginTop: 40 }}><span className={`d ${m.head}`}>Writing it down…</span><span className={m.sub}>Your recording is safe, and on its way to your journal.</span></div>}
            <div className={m.skel} role="status" aria-label={phase === "reading" ? "Picking out your day" : "Writing it down"}><i /><i style={{ animationDelay: "0.15s" }} /><i style={{ animationDelay: "0.3s" }} /></div>
          </>
        )}
        {phase === "review" && (
          <>
            <div className={`${m.text} ${m.steady} ${m.dayHead}`}>
              <span className={`d ${m.head}`}>{rows.length ? "Check your day" : "Nothing to fill in"}</span>
              <span className={m.sub}>{rows.length ? "Untick anything that isn't right. Nothing is logged until you tap." : "No weight, mood, food or move in that one. It's saved in your journal all the same."}</span>
            </div>
            <div className={m.items}>
              <div className={`${m.item} ${m.dayKept}`}>
                <span className={m.itemTick}><Icon name="lock" size={14} strokeWidth={2.2} /></span>
                <span className={m.itemText}><span className="eb">Journal</span><span className={m.itemName}>Entry saved</span></span>
                <span className="m">{clock(seconds)}</span>
              </div>
              {rows.map((r, i) => (
                <div key={r.id} className={`${m.item} ${m.dayRow} ${r.on ? "" : m.dayOff}`} style={{ ...hue(r.domain), animationDelay: `${0.08 + i * 0.07}s` }}>
                  <button type="button" className={m.dayHit} role="checkbox" aria-checked={r.on} onClick={() => { haptic(); onToggle(r.id); }}>
                    <span className={m.dayTick}>{r.on && <Icon name="check" size={14} strokeWidth={2.6} />}</span>
                    <span className={m.itemText}>
                      <span className="eb">{r.eyebrow}</span>
                      <span className={m.itemName}>{r.title}</span>
                      {(r.amount || r.note) && <span className={m.dayMeta}>{r.amount && <span className="m">{r.amount}</span>}{r.amount && r.note ? " · " : ""}{r.note}</span>}
                    </span>
                  </button>
                  {/* The meal it is filed under: a small pill, with the phone's own picker laid over it. */}
                  {r.kind === "food" && (
                    <label className={m.dayMeal}>
                      <span>{r.said.meal === "extra" ? "Something else" : cap(r.said.meal)}</span><Icon name="chevron" size={12} strokeWidth={2.4} />
                      <select aria-label={`Meal for ${r.title}`} value={r.said.meal} onChange={(e) => { haptic(); onMeal(r.id, e.target.value as Said["meal"]); }}>
                        {MEALS.map((meal) => <option key={meal} value={meal}>{cap(meal)}</option>)}
                        <option value="extra">Something else</option>
                      </select>
                    </label>
                  )}
                </div>
              ))}
            </div>
            {replaces.length > 0 && <p className={`${m.sub} ${m.dayAside}`}>Replaces what&apos;s logged for {listed(replaces)}.</p>}
            {cut && <p className={`${m.sub} ${m.dayAside}`}>That was a long one: only the first twenty minutes or so were read.</p>}
            <div className={`${m.foot} ${m.dayFoot}`}>
              {rows.length > 0
                ? <>
                  <button type="button" className={m.lovely} disabled={!ticked} onClick={onFill}>{ticked ? `Fill in my day · ${ticked}` : "Nothing ticked"}</button>
                  <button type="button" className={m.dayLater} onClick={onClose}>Not now</button>
                </>
                : <button type="button" className={m.lovely} onClick={onClose}>Done</button>}
            </div>
          </>
        )}
        {phase === "failed" && (
          <>
            <div className={m.text} style={{ marginTop: 40 }}>
              <span className={`d ${m.head}`}>{onRetry ? "Couldn't read that" : "Couldn't write that down"}</span>
              <span className={m.sub} role="alert">{message}</span>
              <span className={m.sub}>Your recording is saved in your journal either way.</span>
            </div>
            <div className={m.foot}>
              {onRetry && <button type="button" className={m.lovely} onClick={onRetry}>Try again</button>}
              <button type="button" className={onRetry ? m.dayLater : m.lovely} onClick={onClose}>{onRetry ? "Not now" : "Close"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const DOTS = Array.from({ length: 30 }, (_, i) => {
  const a = (i / 30) * Math.PI * 2 + (i % 2) * 0.1, d = 128 + (i % 4) * 24;
  return { "--tx": `${Math.round(Math.cos(a) * d)}px`, "--ty": `${Math.round(Math.sin(a) * d)}px`, "--c": ["var(--journal)", "var(--food)", "var(--activity)"][i % 3], "--dl": `${(0.25 + (i % 5) * 0.04).toFixed(2)}s` } as CSSProperties;
});

/** Shown once when today closes while Dayhub is open. `week` is the last seven days, oldest first, today last. */
export function DayClosed({ streak, beads, week, onClose }: { streak: number; beads: OrbBead[]; week: { label: string; full: boolean }[]; onClose: () => void }) {
  const lovely = useRef<HTMLButtonElement>(null);
  useEffect(() => { lovely.current?.focus(); }, []);
  return (
    <div className={`${m.moment} ${m.closed} night`} role="dialog" aria-modal="true" aria-label={`Day closed. ${streak} full day${streak === 1 ? "" : "s"} in a row`}>
      <div className={m.burst} aria-hidden>
        <div className={m.rays} />
        {DOTS.map((s, i) => <i key={i} className={m.dot} style={s} />)}
        <Orb beads={beads} closed label="">
          <Icon name="check" size={52} strokeWidth={2.2} />
        </Orb>
      </div>
      <span className="eb">Day closed</span>
      <div className={`dc ${m.streak}`} aria-hidden><span className={m.old}>{Math.max(0, streak - 1)}</span><span className={m.new}>{streak}</span></div>
      <span className={m.sub} style={{ fontSize: 15 }}>full day{streak === 1 ? "" : "s"} in a row</span>
      <div className={m.week} aria-hidden>
        {week.map((d, i) => (
          <span key={i} className={`${m.wd} ${i === week.length - 1 ? m.wdToday : d.full ? m.wdOn : ""}`} style={{ "--dl": `${(1.3 + i * 0.09).toFixed(2)}s` } as CSSProperties}><i />{d.label}</span>
        ))}
      </div>
      <button ref={lovely} type="button" className={m.lovely} onClick={onClose}>Lovely</button>
    </div>
  );
}
