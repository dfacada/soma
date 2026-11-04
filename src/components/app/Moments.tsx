"use client";

// Full-screen moments (Soma Night, 2026-11-02). RecordMoment covers the app while a journal entry records and while
// it is being kept safe, wherever recording started (Today, the Journal tab, the sidebar). FoodMoment is the Food
// card's dictation, step by step. DayClosed is the celebration when today closes.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Icon, Orb, type OrbBead } from "@/components/ui";
import { clock } from "@/lib/journal";
import type { Meter } from "@/lib/meter";
import type { Said } from "@/lib/food-say";
import { cap } from "@/lib/today";
import { useJournal } from "./Journal";
import m from "./moments.module.css";

const hue = (d: "journal" | "food" | "activity") => ({ "--hue": `var(--${d})` }) as CSSProperties;

// Fixed shapes for the bars, so they do not jump on every render.
const VBARS = Array.from({ length: 56 }, (_, i) => ({ "--r": `${((i * 360) / 56).toFixed(1)}deg`, "--s": (0.6 + 0.8 * Math.abs(Math.sin(i * 1.9))).toFixed(2), "--dl": `${(-((i * 0.07) % 0.85)).toFixed(2)}s` }) as CSSProperties);
const WAVE = Array.from({ length: 36 }, (_, i) => ({ "--h": `${14 + Math.round(42 * Math.abs(Math.sin(i * 1.3) * Math.cos(i * 0.5)))}px`, "--dl": `${(-((i * 0.09) % 0.7)).toFixed(2)}s` }) as CSSProperties);

/** Every animation frame while live, hand `draw` the microphone's meter, and mark the box `metered` so the CSS loops
 *  give way to it (David, 2026-11-03: "move according to the volume that I'm speaking"). Writes straight to the
 *  elements, not React state: sixty renders a second would cost more than the drawing. With no meter (no Web Audio)
 *  or Reduce Motion on, the decorative loops stay. */
function useMeter(box: RefObject<HTMLElement | null>, live: boolean, levels: (() => Meter | null) | undefined, draw: (el: HTMLElement, mtr: Meter) => void) {
  const paint = useRef(draw);
  useEffect(() => { paint.current = draw; }, [draw]);
  useEffect(() => {
    const el = box.current;
    if (!live || !levels || !el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const tick = () => {
      const mtr = levels();
      if (mtr) { el.classList.add(m.metered); paint.current(el, mtr); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); el.classList.remove(m.metered); };
  }, [box, live, levels]);
}

function Vox({ live, levels, children }: { live: boolean; levels?: () => Meter | null; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  // The ring is mirrored left to right: low voices at the top, high at the bottom, so it breathes evenly.
  useMeter(box, live, levels, (el, mtr) => {
    const bars = el.querySelectorAll<HTMLElement>("i");
    const half = Math.floor(bars.length / 2);
    const b = mtr.bands(half + 1);
    bars.forEach((bar, i) => bar.style.setProperty("--s", (0.25 + b[i <= half ? i : bars.length - i] * 1.9).toFixed(2)));
    el.style.setProperty("--lv", mtr.level().toFixed(3));
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
  useMeter(box, true, levels, (el, mtr) => {
    const bars = el.querySelectorAll<HTMLElement>("i");
    const mid = (bars.length - 1) / 2;
    const b = mtr.bands(Math.ceil(bars.length / 2));
    bars.forEach((bar, i) => { bar.style.transform = `scaleY(${(0.15 + b[Math.floor(Math.abs(i - mid))] * 1.1).toFixed(2)})`; });
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
  if (seen !== j.lastSaved.n) { setSeen(j.lastSaved.n); setSaved(true); }
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
    <div className={m.moment} style={hue("journal")} role="dialog" aria-modal="true" aria-label={phase === "rec" ? "Recording a journal entry" : "Saving your entry"}>
      <div className={m.glow} />
      <div className={m.inner}>
        <div className={m.bar}>
          <span style={{ width: 44 }} />
          <span className="eb">{phase === "rec" ? "Journal · recording" : phase === "seal" ? "Journal · sealing" : "Journal · saved"}</span>
          <span className={`m ${m.timer}`}>{clock(phase === "rec" ? j.seconds : j.lastSaved.seconds)}</span>
        </div>
        <Vox live={phase === "rec"} levels={j.levels}>
          {phase === "rec" ? <Icon name="mic" size={48} strokeWidth={1.8} />
            : phase === "seal" ? <Icon name="lock" size={48} strokeWidth={1.8} />
            : <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path className={m.check} d="M5 12l5 5 9-10" /></svg>}
        </Vox>
        <div className={m.text} key={phase} aria-live="polite">
          {phase === "rec" && <><span className={`d ${m.head}`}>Listening…</span><span className={m.sub}>Say how today went. Tap stop when you&apos;re done.</span></>}
          {phase === "seal" && <><span className={`d ${m.head}`}>Sealing it</span><span className={`m ${m.hex}`} aria-hidden>{hex}</span><span className={m.sub}>Kept on this phone, and encrypted with your vault key before it uploads.</span></>}
          {phase === "saved" && <><span className={`d ${m.head}`}>Saved · {clock(j.lastSaved.seconds)}</span><span className={m.sub}>Only your passphrase opens it.</span></>}
        </div>
        {phase === "rec" && (
          <div className={m.foot}>
            <button type="button" className={m.stop} onClick={() => j.toggleRecording(null)} aria-label="Stop and save"><i /></button>
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
            <div className={m.text}><span className={`d ${m.head}`}>Say what you ate</span><span className={m.sub}>The whole day in one go, and which meal each thing was. Tap the check when you&apos;re done.</span></div>
            <div className={m.foot}>
              <Wave levels={levels} />
              <button type="button" className={`${m.stop} ${m.go}`} onClick={onStop} aria-label="Done, log it"><Icon name="check" size={32} strokeWidth={2.4} /></button>
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
              <button type="button" className={m.lovely} style={{ background: "var(--ink)", color: "var(--bone)" }} onClick={onClose}>Done</button>
              <span className={m.sub}>Already logged. Change anything on Food.</span>
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

/** Shown once when today closes while Soma is open. `week` is the last seven days, oldest first, today last. */
export function DayClosed({ streak, beads, week, onClose }: { streak: number; beads: OrbBead[]; week: { label: string; full: boolean }[]; onClose: () => void }) {
  const lovely = useRef<HTMLButtonElement>(null);
  useEffect(() => { lovely.current?.focus(); }, []);
  return (
    <div className={`${m.moment} ${m.closed}`} role="dialog" aria-modal="true" aria-label={`Day closed. ${streak} full day${streak === 1 ? "" : "s"} in a row`}>
      <div className={m.burst} aria-hidden>
        <div className={m.rays} />
        {DOTS.map((s, i) => <i key={i} className={m.dot} style={s} />)}
        <Orb beads={beads} progress={1} closed label="">
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
