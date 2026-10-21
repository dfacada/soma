"use client";

// What opening Soma looks like until Today is ready: the wordmark, and under it a StageBar naming the step that is
// actually running. The session gate draws it while it signs in (Session.tsx); OpenProgress draws the same thing
// over the app while the days, the vault and the entries load, so the hand-over between them does not show.
// No provider imports here: Session renders this before any provider exists.

import { StageBar, type StepProgress } from "@/components/ui";
import a from "./app.module.css";

/** Every step opening can take, in order. "Loading entries" only runs when the vault opens by itself. */
export const OPEN_STEPS = ["Starting", "Checking your account", "Loading your days", "Opening your vault", "Loading entries"] as const;
export type OpenStep = (typeof OPEN_STEPS)[number];

export function Splash({ steps = OPEN_STEPS, at, progress, detail, ready = false, overlay = false }: {
  steps?: readonly OpenStep[]; at: OpenStep; progress: StepProgress; detail?: string; ready?: boolean; overlay?: boolean;
}) {
  return (
    <main className={`${a.centered} ${overlay ? a.splashOverlay : ""} ${overlay && ready ? a.splashLeaving : ""}`} aria-busy={!ready}>
      <span className={`d ${a.wordmark}`}>Soma</span>
      <div className={a.splashBar}>
        <StageBar steps={[...steps]} at={Math.max(0, steps.indexOf(at))} progress={ready ? 1 : progress} detail={ready ? undefined : detail} note={ready ? "Ready" : undefined} />
      </div>
    </main>
  );
}
