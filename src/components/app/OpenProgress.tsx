"use client";

// The rest of opening, after sign-in: the splash stays over the app while the day map loads, the vault is checked
// and, when its key is still cached for this tab, the entries are downloaded and decrypted. Each step reads the
// provider doing the work, never a timer. Then "Ready", a short fade, and Today underneath. Once per page load.

import { useEffect, useState } from "react";
import { useDays } from "./Days";
import { useJournal } from "./Journal";
import { OPEN_STEPS, Splash, type OpenStep } from "./Splash";

// A safety net, not a pace: a slow step (a large upload waiting ahead of the entries) must not keep Today away.
const CAP_MS = 15000;
const FADE_MS = 360;

export function OpenProgress() {
  const { map, error } = useDays();
  const j = useJournal();
  const [capped, setCapped] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => { const t = window.setTimeout(() => setCapped(true), CAP_MS); return () => window.clearTimeout(t); }, []);

  const daysDone = map !== null || error !== null;
  const vaultDone = j.vault !== "checking";
  const entriesRun = j.vault === "open";
  const entriesDone = !entriesRun || j.items !== null || j.loadFailed;
  const ready = (daysDone && vaultDone && entriesDone) || capped;

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => setGone(true), FADE_MS);
    return () => window.clearTimeout(t);
  }, [ready]);

  if (gone) return null;
  // The entries step is shown while it may still run, and dropped once the vault turns out locked or absent.
  const steps: readonly OpenStep[] = vaultDone && !entriesRun ? OPEN_STEPS.slice(0, 4) : OPEN_STEPS;
  const p = j.entriesProgress;
  if (!daysDone) return <Splash overlay steps={steps} at="Loading your days" progress="unknown" ready={ready} />;
  if (!vaultDone) return <Splash overlay steps={steps} at="Opening your vault" progress="unknown" ready={ready} />;
  if (!entriesDone) {
    return <Splash overlay steps={steps} at="Loading entries" progress={p && p.total ? p.done / p.total : "unknown"}
      detail={p && p.total ? `${p.done} of ${p.total}` : undefined} ready={ready} />;
  }
  return <Splash overlay steps={steps} at={steps[steps.length - 1]} progress={1} ready />;
}
