"use client";

// Log a move: one sheet for every move, shared by Today and Activity (the activities mock-up's "Logging fits the
// unit", 2026-11-08). Pick which move, then log it the way it is counted: push-ups tap per rep, a run is km or time
// instead, minutes step by five, a gym session is done or not, steps are typed when no tracker sends them. "Other" is
// minutes of anything that is not one of your moves. The form mounts per move while the sheet is open, so it is
// seeded fresh from the day each time. `day` names an earlier day when backfilling; `late` says a round won't count it.

import { useState } from "react";
import { Button, Chip, Icon, Input, Segmented, Sheet, type IconName } from "@/components/ui";
import type { ActivityDay } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { AMOUNT_MAX, OTHER_KEY, OTHER_LABEL_MAX, OTHER_MOVE, countsFor, goalText, loggedOf, num, unitWord, type KindDef, type Move, type MoveSave, type MoveUnit } from "@/lib/moves";
import type { MoveGoal } from "./Rounds";
import { fit } from "./WeightSheet";
import m from "./moves.module.css";
import w from "./sheets.module.css";


type Props = {
  open: boolean; onClose: () => void;
  moves: Move[];
  /** The move it opens on; the first of `moves` (the main move) when absent. */
  start?: string | null;
  activity: ActivityDay | undefined;
  goalFor: (move: Move) => MoveGoal;
  /** The round I am in on this day, while it runs. */
  round: { name: string; kind: KindDef } | null;
  /** An earlier day being filled in ("Friday 18 September"); absent for today. */
  day?: string;
  /** More than two days ago: it saves to the record, and a round does not count it. */
  late?: boolean;
  onSave: (s: MoveSave) => void;
};

export function MoveSheet({ open, onClose, ...form }: Props) {
  return (
    <Sheet open={open} title={form.day ? `Log a move · ${form.day}` : "Log a move"} onClose={onClose}>
      <Picker {...form} />
    </Sheet>
  );
}

function Picker({ moves, start, activity, goalFor, round, day, late = false, onSave }: Omit<Props, "open" | "onClose">) {
  const all = [...moves, OTHER_MOVE];
  const [pick, setPick] = useState(() => (start && all.some((x) => x.key === start) ? start : all[0].key));
  const move = all.find((x) => x.key === pick) || all[0];
  const options = all.map((x) => ({ value: x.key, label: x.name }));
  return (
    <>
      {all.length <= 4
        ? <Segmented block label="Which move" value={pick} options={options} onChange={(v) => { haptic(); setPick(v); }} />
        : (
          <div className={m.pick} role="group" aria-label="Which move">
            {all.map((x) => <Chip key={x.key} label={x.name} on={x.key === pick} onClick={() => { haptic(); setPick(x.key); }} />)}
          </div>
        )}
      <MoveForm key={move.key} move={move} activity={activity} goal={goalFor(move)} round={round} day={day} late={late} onSave={onSave} />
    </>
  );
}

const MIN_PRESETS = [10, 20, 30, 45];

function MoveForm({ move, activity, goal, round, day, late, onSave }: {
  move: Move; activity: ActivityDay | undefined; goal: MoveGoal; round: Props["round"]; day?: string; late: boolean; onSave: (s: MoveSave) => void;
}) {
  const logged = loggedOf(activity, { key: move.key, goal: goal.goal });
  const had = logged.done || logged.n !== null;
  const startUnit: MoveUnit = logged.u && logged.u !== "session" && (logged.u === move.unit || logged.u === move.alt) ? logged.u : move.unit;
  const [unit, setUnit] = useState<MoveUnit>(startUnit);
  const [value, setValue] = useState(logged.n !== null ? num(logged.n, logged.u).replace(/,/g, "") : "");
  const [label, setLabel] = useState(logged.label || "");
  const [done, setDone] = useState(logged.done);
  const [taps, setTaps] = useState(0);

  const decimal = unit === "km";
  const n = decimal ? parseFloat(value) : parseInt(value, 10);
  const count = Number.isFinite(n) ? n : 0;
  const max = unit === "steps" ? 1000000 : unit === "session" ? 1 : AMOUNT_MAX[unit];
  const shown = (x: number) => { const v = Math.min(max, Math.max(0, x)); return decimal ? String(Math.round(v * 100) / 100) : String(Math.round(v)); };
  const set = (x: number) => setValue(shown(x));
  // From the latest value, not this render's: taps on the pad can come faster than the screen redraws.
  const bump = (by: number) => setValue((prev) => { const p = decimal ? parseFloat(prev) : parseInt(prev, 10); return shown((Number.isFinite(p) ? p : 0) + by); });
  const type = (raw: string) => {
    const t = raw.replace(",", ".");
    setValue(decimal ? (t.match(/^\d{0,3}(\.\d{0,2})?/)?.[0] ?? "") : t.replace(/\D/g, "").slice(0, unit === "steps" ? 7 : 6));
  };
  const which = day ? "that day's" : "today's";
  const name = move.key === OTHER_KEY ? (label.trim() || "something else") : move.name.toLowerCase();
  const goalNum = goal.goal;
  const comparable = unit === move.unit && move.unit !== "session" && move.key !== OTHER_KEY;
  const ringF = comparable && !goal.rest ? Math.min(1, count / Math.max(0.0001, goalNum)) : 0;

  // The line under the form: whether a round counts this, or what closes the day.
  const counts = round ? countsFor(round.kind, move.key, unit) : false;
  const note = late
    ? "More than two days ago: this saves to your record, but a round won't count it."
    : move.key === "steps" ? `Steps close the day once they reach ${num(goalNum, "steps")}.${counts && round ? ` They count for ${round.name} too.` : ""}`
    : counts && round ? (goal.rest ? `A rest day in ${round.name}. Anything you log still counts for your day.` : `Counts for your round, ${round.name}, when it's logged within two days.`)
    : round && move.key !== OTHER_KEY ? `${move.name} isn't what ${round.name} counts. It still closes your day.`
    : "Any of your moves closes the day.";

  const save = () => {
    if (move.unit === "session") return onSave({ key: move.key, n: done ? 1 : null, u: "session" });
    onSave({ key: move.key, n: count > 0 ? count : null, u: unit, ...(move.key === OTHER_KEY && label.trim() ? { label: label.trim().slice(0, OTHER_LABEL_MAX) } : {}) });
  };
  const amount = `${num(count, unit)} ${unit === "reps" ? (move.key === "pushups" ? "" : "reps") : unitWord(unit)}`.trim();
  const saveLabel = move.unit === "session" ? (done ? `Save ${name} · done` : had ? `Save ${name} · not done` : "Save")
    : value === "" || count === 0 ? (had ? `Clear ${which} ${name}` : "Save") : `Save ${name} · ${amount}`;

  // ── A session: done or not ──
  if (move.unit === "session") {
    return (
      <form style={{ display: "contents" }} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <button type="button" aria-pressed={done} className={`${m.session} ${done ? m.sessionOn : ""}`} onClick={() => { haptic(done ? "tap" : "done"); setDone(!done); }}>
          <span className={m.sessionDot}><Icon name="check" size={24} strokeWidth={3} /></span>
          <span className="d" style={{ fontSize: 22 }}>{done ? `${move.name} done ${day ? "that day" : "today"}` : "Done today"}</span>
        </button>
        <p className={w.note}>A session is done or not. No number to count.</p>
        <p className={m.roundNote}>{note}</p>
        <Button type="submit" variant="activity" block disabled={!done && !had}>{saveLabel}</Button>
      </form>
    );
  }

  const goalLine = move.key === OTHER_KEY ? null
    : goal.rest ? `${goal.dayNumber ? `Day ${goal.dayNumber}` : "Today"} is a rest day in ${round?.name || "your round"}.`
    : unit === move.unit ? `${goal.fromRound ? "Your round's target" : "Your goal"}: ${goalText({ key: move.key, unit: move.unit, goal: goalNum })}`
    : `Your goal is in ${unitWord(move.unit)}: ${goalText({ key: move.key, unit: move.unit, goal: goalNum })}. Time still counts for the day.`;

  const bigNumber = (
    <div className={w.num}>
      <input className={`dc ${w.numInput}`} inputMode={decimal ? "decimal" : "numeric"} pattern={decimal ? "[0-9]*[.,]?[0-9]*" : "[0-9]*"} value={value} placeholder="0"
        style={{ width: fit(value || "0") }} aria-label={`${move.key === OTHER_KEY ? "Minutes" : move.name}${unit === "reps" ? "" : ` in ${unitWord(unit)}`}${day ? ` on ${day}` : " today"}`}
        onChange={(e) => type(e.target.value)} />
      <span className={`m ${w.unit} ${w.target}`}>{unit === "reps" ? (comparable && !goal.rest ? `/ ${num(goalNum, "reps")}` : move.key === "pushups" ? "" : "reps") : unitWord(unit)}</span>
    </div>
  );

  return (
    <form style={{ display: "contents" }} onSubmit={(e) => { e.preventDefault(); save(); }}>
      {move.alt && (
        <div className={m.unitRow} role="radiogroup" aria-label="Count it in">
          <Chip label="Distance" on={unit === move.unit} onClick={() => { haptic(); setUnit(move.unit); setValue(""); }} />
          <Chip label="Time instead" on={unit === move.alt} onClick={() => { haptic(); setUnit(move.alt!); setValue(""); }} />
        </div>
      )}
      {move.key === OTHER_KEY && (
        <label className={m.label}>
          <span className="eb">What was it</span>
          <Input compact value={label} maxLength={OTHER_LABEL_MAX} placeholder="A hike, a dance class…" aria-label="What it was" onChange={(e) => setLabel(e.target.value)} />
        </label>
      )}

      {unit === "reps" ? (
        <>
          {bigNumber}
          <div className={w.pad}>
            <svg viewBox="0 0 200 200" aria-hidden>
              <circle className={w.padTrack} cx="100" cy="100" r="94" />
              {ringF > 0 && <circle className={w.padRing} cx="100" cy="100" r="94" strokeDasharray={`${(ringF * 590.6).toFixed(1)} 590.6`} />}
            </svg>
            {taps > 0 && <span key={taps} className={w.ripple} />}
            <button type="button" className={w.padButton} aria-label={`Add one ${move.key === "pushups" ? "push-up" : "rep"}`} onClick={() => { haptic(); bump(1); setTaps((n) => n + 1); }}>
              <span className="d">+1</span><span className="eb">Tap per rep</span>
            </button>
          </div>
          <div className={w.quick}>
            {[-10, 10, 25].map((by) => (
              <button key={by} type="button" className={w.q} disabled={by < 0 && count === 0} onClick={() => { haptic(); bump(by); }} aria-label={`${by < 0 ? "Minus" : "Plus"} ${Math.abs(by)}`}>{by < 0 ? `−${-by}` : `+${by}`}</button>
            ))}
          </div>
        </>
      ) : unit === "min" ? (
        <>
          <div className={w.steps}>
            <button type="button" className={w.step} aria-label="Five minutes less" disabled={count === 0} onClick={() => { haptic(); bump(-5); }}><Icon name="minus" size={22} /></button>
            <div className={w.grow}>{bigNumber}</div>
            <button type="button" className={w.step} aria-label="Five minutes more" onClick={() => { haptic(); bump(5); }}><Icon name="plus" size={22} /></button>
          </div>
          <div className={m.presets}>
            {MIN_PRESETS.map((p) => (
              <button key={p} type="button" aria-pressed={count === p} className={`${w.q} ${count === p ? m.presetOn : ""}`} onClick={() => { haptic(); set(p); }}>{p}m</button>
            ))}
          </div>
        </>
      ) : (
        <>
          {bigNumber}
          <div className={m.presets}>
            {(unit === "km" ? [-0.5, 0.5, 1, 5] : [-500, 500, 1000, 2500]).map((by) => (
              <button key={by} type="button" className={w.q} disabled={by < 0 && count === 0} onClick={() => { haptic(); bump(by); }}
                aria-label={`${by < 0 ? "Minus" : "Plus"} ${Math.abs(by)} ${unitWord(unit)}`}>{by < 0 ? `−${-by}` : `+${by >= 1000 ? `${by / 1000}k` : by}`}</button>
            ))}
          </div>
        </>
      )}

      {goalLine && <p className={`m ${m.goalLine}`}>{goalLine}</p>}
      <p className={m.roundNote}>{note}</p>
      <div className={w.buttons}>
        {comparable && !goal.rest && count < goalNum && <Button variant="secondary" onClick={() => { haptic("done"); onSave({ key: move.key, n: goalNum, u: unit }); }}>Hit your goal · {goalText({ key: move.key, unit: move.unit, goal: goalNum })}</Button>}
        <Button type="submit" variant="activity" disabled={value === "" && !had}>{saveLabel}</Button>
      </div>
      {had && value !== "" && <button type="button" className={w.clear} onClick={() => onSave({ key: move.key, n: null, u: unit })}>Clear {which} {name}</button>}
    </form>
  );
}

/** Icon for a move (moves.ts keeps icon names as strings, so it needs no React). */
export const moveIcon = (move: Pick<Move, "icon">) => move.icon as IconName;
