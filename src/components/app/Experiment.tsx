"use client";

// Insights that become experiments (David, 2026-11-11; the rules are in src/lib/experiment.ts). Insights says what a
// person's great days have in common; Try it turns one of those findings into three days of doing it. Today shows
// the experiment as one slim row on those days, and Insights shows each day and, afterwards, how it went.
//
// Everything is counted on this device from the days already here. Settings keep only the finding, its words and its
// dates; the figures it is compared against are counted again each time. An experiment on sleep, which the vault
// seals, is kept sealed with the vault key, so it can only be seen with the vault open.

import { useEffect, useState } from "react";
import { cleanPlain, daysBefore, didWords, isSealed, needsSeal, newExperiment, shortDay, SHOWN_AFTER_DAYS, spanDates, todayLine, trialOf, verdictWords, type Experiment } from "@/lib/experiment";
import { sidesFor, testFor } from "@/lib/great-days";
import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { mainOf } from "@/lib/moves";
import { dayKey } from "@/lib/today";
import { Button, Card, Icon } from "@/components/ui";
import { useDays } from "./Days";
import { useHealth } from "./Health";
import { useJournal } from "./Journal";
import { useRounds } from "./Rounds";
import { useSession } from "./Session";
import { useGoTab } from "./tabs";
import a from "./app.module.css";
import s from "./insights.module.css";
import t from "./today.module.css";

/** The experiment in settings and where it stands today, with how to start one, and how to stop or put one away. */
export function useExperiment() {
  const { settings, saveSettings } = useSession();
  const { map, today } = useDays();
  const journal = useJournal();
  const rounds = useRounds();
  const health = useHealth();
  const todayKey = dayKey(today);
  const stored = settings.experiment;

  // A sealed experiment is opened with the vault key and kept open here while the vault is.
  const [opened, setOpened] = useState<{ sealed: string; x: Experiment } | null>(null);
  const sealedText = isSealed(stored) ? stored.sealed : null;
  const vaultOpen = journal.vault === "open";
  const { unseal, seal } = journal;
  useEffect(() => {
    if (!sealedText || !vaultOpen) return;
    let alive = true;
    unseal<unknown>(sealedText).then(
      (v) => { const c = cleanPlain(v); if (alive && c) setOpened({ sealed: sealedText, x: c }); },
      (e) => report("insights", "experiment_unseal_failed", e, undefined, "warn"),
    );
    return () => { alive = false; };
  }, [sealedText, vaultOpen, unseal]);
  const x: Experiment | null = !stored ? null : isSealed(stored) ? (vaultOpen && opened?.sealed === stored.sealed ? opened.x : null) : stored;
  const locked = isSealed(stored) && !vaultOpen;

  // Cheap enough to count every render: three days of one test, and sixty for what came before.
  let stands: { trial: ReturnType<typeof trialOf>; before: ReturnType<typeof sidesFor>; ask: string; gone: boolean } | null = null;
  if (x && map) {
    // An entry recorded since the page loaded counts for today, as it does on Today.
    const days = { ...map, [todayKey]: { ...(map[todayKey] || { entries: 0 }), entries: Math.max(map[todayKey]?.entries || 0, journal.countOn(todayKey) || 0) } };
    const main = mainOf(settings);
    const mainGoal = main ? { move: main, goal: rounds.goalFor(main, todayKey).goal } : null;
    const found = testFor(x.key, days, settings, mainGoal, health.nights);
    const before = sidesFor(x.key, days, daysBefore(x), settings, mainGoal, health.nights);
    // What it asks, in today's words: a goal changed since it started reads as it is tested now.
    stands = { trial: trialOf(x, todayKey, found ? found.test : null, days, settings.moods, before), before, ask: found ? found.ask : x.ask, gone: !found };
  }

  const start = async (finding: { key: string; ask: string; label: string }) => {
    const next = newExperiment(finding, today);
    if (!needsSeal(finding.key)) return saveSettings({ experiment: next });
    const sealed = await seal(next);
    setOpened({ sealed, x: next });
    return saveSettings({ experiment: { sealed } });
  };
  const end = () => saveSettings({ experiment: null });
  return {
    /** Whether there is one at all, opened or not: one at a time, so while there is, nothing else can be tried. */
    has: Boolean(stored), x, locked, ask: stands?.ask ?? x?.ask ?? "",
    trial: stands?.trial ?? null, before: stands?.before ?? null, gone: stands?.gone ?? false,
    start, end, openVault: journal.openVault,
  };
}
export type ExperimentState = ReturnType<typeof useExperiment>;

/** Today's row: which day of the experiment it is and whether today has it yet. A tap opens Insights. It stops
 *  pointing at a finished experiment after a few days; Insights keeps the result until it is put away. A sealed one
 *  shows nothing here while the vault is locked. */
export function ExperimentToday() {
  const goTab = useGoTab();
  const { x, ask, trial } = useExperiment();
  if (!x || !trial || (trial.phase === "finished" && trial.since > SHOWN_AFTER_DAYS)) return null;
  const line = todayLine(trial);
  return (
    <button type="button" className={t.trial} onClick={() => goTab("insights")} aria-label={`${line.eyebrow}: ${ask}. ${line.status} Opens Insights`}>
      <span className={t.trialIcon}><Icon name={line.done ? "check" : "spark"} size={18} strokeWidth={line.done ? 2.4 : 1.75} /></span>
      <span className={t.trialText}>
        <span className="eb">{line.eyebrow}</span>
        <span className={t.trialAsk}>{ask}</span>
        <span className={t.sub}>{line.status}</span>
      </span>
      <span className={t.trialDots} aria-hidden>
        {trial.days.map((d) => <i key={d.day} className={d.did === true ? t.trialOn : d.when === "today" ? t.trialNow : undefined} />)}
      </span>
    </button>
  );
}

/** Insights' card for the experiment: a row a day while it runs, then how it went, in words that admit three days
 *  is a small test. */
export function ExperimentPanel({ e, say }: { e: ExperimentState; say: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const { x, trial, before, gone, locked } = e;
  if (!e.has || (!locked && (!x || !trial))) return null;

  const save = async (work: () => Promise<void>, done: string, event: string) => {
    haptic();
    setBusy(true);
    try { await work(); say(done); }
    catch (err) { report("insights", event, err); say("Couldn't save that. Try again."); }
    finally { setBusy(false); }
  };
  const stop = <button type="button" className={a.lnk} style={{ minHeight: 44 }} disabled={busy} onClick={() => void save(e.end, "Experiment stopped", "experiment_end_failed")}>Stop this experiment</button>;

  if (locked || !x || !trial) {
    return (
      <Card className={s.trial}>
        <span className="eb">Your experiment</span>
        <p className={s.note}>It&apos;s about your sleep, which is sealed with your vault, so the experiment is sealed too. Unlock to see how it&apos;s going.</p>
        <div className={s.trialActions}><Button size="sm" variant="journal" onClick={e.openVault}><Icon name="lock" size={15} />Unlock</Button>{stop}</div>
      </Card>
    );
  }

  const words = verdictWords(trial, before);
  const finished = trial.phase === "finished";
  const last = trial.days[trial.days.length - 1];
  return (
    <Card className={s.trial}>
      <div className={s.head}><span className="eb">Your experiment</span><span className={s.meta}>{spanDates(x)}</span></div>
      <div className={`d ${s.trialAsk}`}>{e.ask}</div>
      {gone ? (
        <p className={s.note}>This is no longer one of your habits, so Dayhub can&apos;t tell which days had it.</p>
      ) : (
        <>
          {trial.phase === "ahead" && <p className={s.note}>Starts tomorrow. Do it each day and check in as you usually do. After {shortDay(last.day)}, this shows how those days went.</p>}
          {trial.phase === "running" && <p className={s.note}>Day {trial.dayNo} of {trial.length}. Check in as you usually do: your mood is how Dayhub knows a great day.</p>}
          <ol className={s.trialDays}>
            {trial.days.map((d) => (
              <li key={d.day} className={d.when === "ahead" ? s.trialAhead : undefined}>
                <span className="m">{shortDay(d.day)}</span>
                <span className={`${s.trialDid} ${d.did === true ? s.trialYes : ""}`}>{d.did === true && <Icon name="check" size={14} strokeWidth={2.6} />}{didWords(d)}</span>
                <span className={`${s.trialMood} ${d.great ? s.trialGreat : ""}`}>{d.mood || (d.when === "past" ? "No mood" : "")}</span>
              </li>
            ))}
          </ol>
          {words && (
            <div className={s.trialResult}>
              <p className={s.lead}>{words.head}</p>
              <p className={s.note}>{words.body}</p>
              <p className={s.note} style={{ fontSize: 12 }}>Three days is a small test. It shows how it went this time, not what causes what.</p>
            </div>
          )}
        </>
      )}
      <div className={s.trialActions}>
        {finished && !gone && <Button size="sm" variant="journal" disabled={busy} onClick={() => void save(() => e.start(x), "Starts again tomorrow", "experiment_start_failed")}>Try it again</Button>}
        {finished || gone ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => void save(e.end, "Put away", "experiment_end_failed")}>Done</Button> : stop}
      </div>
    </Card>
  );
}
