"use client";

// Choose your moves (the activities mock-up's first screen, 2026-11-08): pick what you actually do, give each a daily
// goal, and make one your main move. Any of them closes the day. Shown in a sheet from Today and Activity to someone
// choosing for the first time (kept here until Continue), and in Settings → Your moves, where, like every control
// there, a change saves itself (a moment after the last tap, so a run of stepper taps is one save).

import { useEffect, useRef, useState } from "react";
import { Button, Icon, Input, Segmented, type IconName } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { CATALOGUE, MOVES_MAX, MOVE_NAME_MAX, OWN_UNITS, clampGoal, movesOf, num, ownKey, unitWord, type Move, type MoveSetting, type OwnUnit } from "@/lib/moves";
import { useSession } from "./Session";
import m from "./moves.module.css";

const OWN_UNIT_LABEL: Record<OwnUnit, string> = { reps: "Reps", min: "Minutes", km: "Km", session: "Done or not" };
type Draft = { moves: MoveSetting[]; main: string; stepsGoal: number };

export function MovesChooser({ first = false, onSaved, say }: {
  /** Someone choosing for the first time: the heading asks, nothing saves until Continue. */
  first?: boolean;
  onSaved?: () => void;
  say: (message: string) => void;
}) {
  const { settings, saveSettings } = useSession();
  const [draft, setDraft] = useState<Draft>({ moves: settings.moves, main: settings.mainMove, stepsGoal: settings.goals.steps });
  const [adding, setAdding] = useState(false);
  const [ownName, setOwnName] = useState("");
  const [ownUnit, setOwnUnit] = useState<OwnUnit>("min");
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ timer: number; next: Draft } | null>(null);

  const { moves, stepsGoal } = draft;
  const resolved = movesOf({ moves, goals: { steps: stepsGoal } });
  const has = (key: string) => moves.some((x) => x.key === key);
  const mainKey = has(draft.main) ? draft.main : moves[0]?.key ?? "";
  const full = moves.length >= MOVES_MAX;

  const store = (next: Draft) => {
    const main = next.moves.some((x) => x.key === next.main) ? next.main : next.moves[0]?.key ?? "";
    return saveSettings({ moves: next.moves, mainMove: main, goals: { ...settings.goals, steps: next.stepsGoal } });
  };
  const flush = () => {
    const p = pending.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current = null;
    store(p.next).catch((e) => { report("settings", "moves_save_failed", e, undefined, "warn"); say("Couldn't save your moves. Try again."); });
  };
  // In Settings a change saves itself a moment after the last one; closing the section saves what is waiting.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flush(), []);
  const change = (next: Draft) => {
    if (!first && !next.moves.length) return say("Keep at least one move");
    setDraft(next);
    if (first) return;
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = { next, timer: window.setTimeout(flush, 500) };
  };

  const toggle = (key: string, goal: number) => {
    haptic();
    if (has(key)) return change({ ...draft, moves: moves.filter((x) => x.key !== key) });
    if (full) return say(`${MOVES_MAX} moves is the most`);
    change({ ...draft, moves: [...moves, { key, goal }] });
  };
  const bump = (mv: Move, dir: 1 | -1) => {
    haptic();
    const next = Math.max(mv.step, clampGoal(mv.goal + dir * mv.step, mv));
    if (mv.key === "steps") change({ ...draft, stepsGoal: next });
    else change({ ...draft, moves: moves.map((x) => (x.key === mv.key ? { ...x, goal: next } : x)) });
  };
  const addOwn = () => {
    const name = ownName.trim().slice(0, MOVE_NAME_MAX);
    if (!name) return;
    if (resolved.some((x) => x.name.toLowerCase() === name.toLowerCase())) return say("That one is already there");
    if (full) return say(`${MOVES_MAX} moves is the most`);
    haptic();
    const goal = ownUnit === "session" ? 1 : ownUnit === "km" ? 5 : 20;
    change({ ...draft, moves: [...moves, { key: ownKey(name, moves.map((x) => x.key)), name, unit: ownUnit, goal }] });
    setOwnName(""); setAdding(false);
  };
  const begin = () => {
    if (!moves.length || busy) return;
    haptic("done");
    setBusy(true);
    store(draft)
      .then(() => { say("You're set"); onSaved?.(); })
      .catch((e) => { report("settings", "moves_save_failed", e, undefined, "warn"); say("Couldn't save your moves. Try again."); })
      .finally(() => setBusy(false));
  };

  return (
    <>
      <div className={m.intro}>
        {first && <span className="d" style={{ fontSize: 24, lineHeight: 1.1 }}>How do you like to move?</span>}
        <p>Pick what you actually do. Any of them closes your day, and one is your main move: Today and Activity lead with it.</p>
      </div>

      <div className={m.grid} role="group" aria-label="Your moves">
        {CATALOGUE.map((d) => <Tile key={d.key} name={d.name} hint={d.hint} icon={d.icon as IconName} on={has(d.key)} onClick={() => toggle(d.key, d.goal)} />)}
        {resolved.filter((x) => x.own).map((x) => <Tile key={x.key} name={x.name} hint={x.unit === "session" ? "done or not" : unitWord(x.unit)} icon="pulse" on onClick={() => toggle(x.key, x.goal)} />)}
        <Tile name="Your own" hint="name + unit" icon="plus" on={adding} add onClick={() => { haptic(); setAdding(!adding); }} />
      </div>

      {adding && (
        <div className={m.own}>
          <Input compact value={ownName} maxLength={MOVE_NAME_MAX} placeholder="Climbing, rowing, pull-ups…" aria-label="Name of your move"
            onChange={(e) => setOwnName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOwn(); } }} />
          <Segmented block label="How it's counted" value={ownUnit} options={OWN_UNITS.map((u) => ({ value: u, label: OWN_UNIT_LABEL[u] }))} onChange={(v) => setOwnUnit(v)} />
          <Button variant="activity" disabled={!ownName.trim()} onClick={addOwn}>Add {ownName.trim() || "it"}</Button>
        </div>
      )}

      <div className={m.goalsHead}>
        <span className="eb">Daily goals</span>
        <span className="m muted" style={{ fontSize: 11 }}>{moves.length} picked</span>
      </div>
      {moves.length === 0 ? <p className={m.empty}>Pick at least one. A walk counts.</p> : (
        <div className={m.goals}>
          {resolved.map((mv) => {
            const isMain = mv.key === mainKey;
            const name = mv.name.toLowerCase();
            return (
              <div key={mv.key} className={`${m.goal} ${isMain ? m.goalMain : ""}`}>
                {isMain
                  ? <div className={m.goalWho}><span className={m.goalName}>{mv.name}</span><span className={m.mainTag}>Main</span></div>
                  : <button type="button" className={m.goalWho} aria-label={`Make ${name} your main move`} onClick={() => { haptic(); change({ ...draft, main: mv.key }); }}>
                    <span className={m.goalName}>{mv.name}</span><span className={m.makeMain}>Make main</span>
                  </button>}
                {mv.unit === "session" ? <span className={`m ${m.goalFlat}`}>done or not</span> : (
                  <div className={m.goalStepper}>
                    <button type="button" className={m.goalStep} aria-label={`Lower the ${name} goal`} disabled={mv.goal <= mv.step} onClick={() => bump(mv, -1)}><Icon name="minus" size={18} /></button>
                    <span className={`m ${m.goalValue}`} aria-live="polite"><span>{num(mv.goal, mv.unit)}</span><span>{mv.key === "pushups" ? "push-ups" : unitWord(mv.unit)}</span></span>
                    <button type="button" className={m.goalStep} aria-label={`Raise the ${name} goal`} disabled={mv.goal >= mv.max} onClick={() => bump(mv, 1)}><Icon name="plus" size={18} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {first && <>
        <Button variant="activity" block disabled={!moves.length || busy} onClick={begin}>{busy ? "Saving…" : "Continue"}</Button>
        <p className={m.foot}>Change this any time in Settings → Your moves.</p>
      </>}
    </>
  );
}

/** One move on the chooser's grid; `add` is the dashed "Your own" tile, which opens the form instead of picking. */
function Tile({ name, hint, icon, on, add = false, onClick }: { name: string; hint: string; icon: IconName; on: boolean; add?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={add ? undefined : on} aria-expanded={add ? on : undefined} className={`${m.tile} ${on ? m.tileOn : ""} ${add ? m.tileAdd : ""}`} onClick={onClick}>
      <Icon name={icon} size={20} />
      <span className={m.tileText}><span className={m.tileName}>{name}</span><span className={`m ${m.tileHint}`}>{hint}</span></span>
      {on && !add && <span className={m.tileCheck} aria-hidden><Icon name="check" size={11} strokeWidth={3.4} /></span>}
    </button>
  );
}
