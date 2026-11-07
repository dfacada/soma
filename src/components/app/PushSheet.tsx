"use client";

// The push-up sheet, shared by Today and Activity. The form only mounts while the sheet is open, so its count
// is seeded fresh on every open. Tap the pad once per rep, use the quick buttons, or type into the big number.
// `day` names an earlier day when backfilling; `late` says the round will not count it.

import { useState } from "react";
import { Button, Sheet } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { fit } from "./WeightSheet";
import a from "./app.module.css";
import w from "./sheets.module.css";

export function PushSheet({ open, onClose, ...form }: { open: boolean; onClose: () => void } & FormProps) {
  return (
    <Sheet open={open} title={form.day ? `Push-ups · ${form.day}` : "Push-ups today"} onClose={onClose}>
      <PushForm {...form} />
    </Sheet>
  );
}

type FormProps = {
  current: number; target: number; rest?: boolean; dayNumber?: number | null; onSave: (n: number) => void;
  /** An earlier day being filled in ("Friday 18 September"); absent for today. */
  day?: string;
  /** Logged more than two days late: kept in your record, not counted by the round. */
  late?: boolean;
};

const RING = 2 * Math.PI * 94;

function PushForm({ current, target, rest = false, dayNumber, onSave, day, late = false }: FormProps) {
  const [value, setValue] = useState(current > 0 ? String(current) : "");
  const [taps, setTaps] = useState(0);
  const n = parseInt(value, 10);
  const count = Number.isNaN(n) ? 0 : n;
  const set = (x: number) => setValue(String(Math.min(100000, Math.max(0, x))));
  const which = day ? "that day's" : "today's";
  const f = rest || target <= 0 ? 0 : Math.min(1, count / target);

  return (
    <form style={{ display: "contents" }} onSubmit={(e) => { e.preventDefault(); onSave(count); }}>
      <p className={`${w.note} ${w.lead}`}>
        {rest
          ? `${dayNumber ? `Day ${dayNumber} is` : day ? "That day is" : "Today is"} a rest day. Anything you do still counts as activity.`
          : <>The target is <strong style={{ color: "var(--ink)" }}>{target}</strong> a day, in as many sets as you like.</>}
      </p>
      {late && <p className={a.noteBad} style={{ fontSize: 13 }}>More than two days ago: this saves to your record and streak, but the round does not count it.</p>}
      <div className={w.num}>
        <input className={`dc ${w.numInput}`} inputMode="numeric" pattern="[0-9]*" value={value} placeholder="0" style={{ width: fit(value || "0") }} aria-label={day ? `Push-ups on ${day}` : "Push-ups today"}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        {!rest && <span className={`m ${w.unit} ${w.target}`}>/ {target}</span>}
      </div>
      <div className={w.pad}>
        <svg viewBox="0 0 200 200" aria-hidden>
          <circle className={w.padTrack} cx="100" cy="100" r="94" />
          {f > 0 && <circle className={w.padRing} cx="100" cy="100" r="94" strokeDasharray={`${(f * RING).toFixed(1)} ${RING.toFixed(1)}`} />}
        </svg>
        {taps > 0 && <span key={taps} className={w.ripple} />}
        <button type="button" className={w.padButton} aria-label="Add one push-up" onClick={() => { haptic(); set(count + 1); setTaps(taps + 1); }}>
          <span className="d">+1</span><span className="eb">Tap per rep</span>
        </button>
      </div>
      <div className={w.quick}>
        <button type="button" className={w.q} onClick={() => { haptic(); set(count - 5); }} aria-label="Minus 5">−5</button>
        <button type="button" className={w.q} onClick={() => { haptic(); set(count + 5); }} aria-label="Plus 5">+5</button>
        <button type="button" className={w.q} onClick={() => { haptic(); set(count + 10); }} aria-label="Plus 10">+10</button>
      </div>
      <div className={w.buttons}>
        {!rest && <Button variant="activity" onClick={() => onSave(target)}>Hit the target · {target}</Button>}
        <Button type="submit" disabled={value === ""}>Save</Button>
      </div>
      {current > 0 && <button type="button" className={w.clear} onClick={() => onSave(0)}>Clear {which} push-ups</button>}
    </form>
  );
}
