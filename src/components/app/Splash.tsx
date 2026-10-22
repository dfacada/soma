"use client";

// What opening Soma looks like until Today is ready: the wordmark, and under it a StageBar naming the step that is
// actually running. The session gate draws it while it signs in (Session.tsx); OpenProgress draws the same thing
// over the app while the days, the vault and the entries load, so the hand-over between them does not show.
// No provider imports here: Session renders this before any provider exists.

import { useLayoutEffect, useRef } from "react";
import { StageBar, type StepProgress } from "@/components/ui";
import a from "./app.module.css";

/** Every step opening can take, in order. "Loading entries" only runs when the vault opens by itself. */
export const OPEN_STEPS = ["Starting", "Checking your account", "Loading your days", "Opening your vault", "Loading entries"] as const;
export type OpenStep = (typeof OPEN_STEPS)[number];

export function Splash({ steps = OPEN_STEPS, at, progress, detail, ready = false, overlay = false }: {
  steps?: readonly OpenStep[]; at: OpenStep; progress: StepProgress; detail?: string; ready?: boolean; overlay?: boolean;
}) {
  // The aurora keeps the page's clock, so the sign-in splash and the overlay that replaces it drift as one: each sets
  // its animations back by the time since the page began loading. Done on the element, not in render, so the static
  // HTML (which animates from load) and the hydrated page agree.
  const aurora = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { aurora.current?.style.setProperty("--aurora-t", `-${Math.round(performance.now())}ms`); }, []);
  return (
    <main className={`${a.centered} ${overlay ? a.splashOverlay : a.splashPage} ${overlay && ready ? a.splashLeaving : ""}`} aria-busy={!ready}>
      <div ref={aurora} className={a.aurora} aria-hidden>
        <span className={a.auroraX} style={WASH[0]}><span className={a.auroraY} /></span>
        <span className={a.auroraX} style={WASH[1]}><span className={a.auroraY} /></span>
        <span className={a.auroraX} style={WASH[2]}><span className={a.auroraY} /></span>
      </div>
      <span className={`d ${a.wordmark}`}>Soma</span>
      <div className={a.splashBar}>
        <StageBar labelMotion domain="journal" steps={[...steps]} at={Math.max(0, steps.indexOf(at))} progress={ready ? 1 : progress} detail={ready ? undefined : detail} note={ready ? "Ready" : undefined} />
      </div>
    </main>
  );
}

/** The three washes, as chosen from the preview (David, 2026-10-21): Soma's journal, food and activity colours, each a
 *  soft radial gradient drifting on its own slow loop around a point near the centre. x/y place it, dx/dy are how far
 *  it drifts each way, p is one full loop. The drift is two eased back-and-forth slides, one per axis (app.module.css). */
const WASH = [
  { c: "var(--journal-pale)", x: -70, y: -50, r: 380, dx: 40, dy: 28, p: 7000, o: 0.6 },
  { c: "var(--food-bar)", x: 95, y: 20, r: 340, dx: -36, dy: 30, p: 8600, o: 0.28 },
  { c: "var(--activity-tint)", x: -10, y: 120, r: 330, dx: 38, dy: -26, p: 9800, o: 1 },
].map((w) => ({
  "--c": w.c, "--x": `${w.x}px`, "--y": `${w.y}px`, "--r": `${w.r}px`, "--dx": `${w.dx}px`, "--dy": `${w.dy}px`,
  "--px": `${w.p / 2}ms`, "--py": `${w.p / 1.6}ms`, "--o": w.o,
}) as React.CSSProperties);
