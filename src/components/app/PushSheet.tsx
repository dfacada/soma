"use client";

// The push-up sheet, shared by Today and Activity. The form only mounts while the sheet is open, so its field
// is seeded fresh on every open. `day` names an earlier day when backfilling; `late` says the round will not count it.

import { useState } from "react";
import { Button, Input, Sheet } from "@/components/ui";
import a from "./app.module.css";

export function PushSheet({ open, onClose, ...form }: { open: boolean; onClose: () => void } & FormProps) {
  // The form only mounts while the sheet is open, so its field is seeded fresh on every open.
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

function PushForm({ current, target, rest = false, dayNumber, onSave, day, late = false }: FormProps) {
  const [value, setValue] = useState(current > 0 ? String(current) : "");
  const n = parseInt(value, 10);
  const nudge = (by: number) => setValue(String(Math.max(0, (Number.isNaN(n) ? target : n) + by)));
  const which = day ? "that day's" : "today's";

  return (
    <>
      <p className="muted" style={{ fontSize: 13 }}>
        {rest
          ? `${dayNumber ? `Day ${dayNumber} is` : day ? "That day is" : "Today is"} a rest day. Anything you do still counts as activity.`
          : <>The target is <strong style={{ color: "var(--ink)" }}>{target}</strong> a day, in as many sets as you like. Enter what you actually did.</>}
      </p>
      {late && <p className={a.noteBad} style={{ fontSize: 13 }}>More than two days ago: this saves to your record and streak, but the round does not count it.</p>}
      <form className={a.pushRow} onSubmit={(e) => { e.preventDefault(); if (!Number.isNaN(n) && n >= 0) onSave(Math.min(n, 100000)); }}>
        <Button variant="secondary" style={{ width: 52, padding: 0 }} onClick={() => nudge(-5)} aria-label="Minus 5">−5</Button>
        <Input className={a.pushInput} inputMode="numeric" pattern="[0-9]*" value={value} placeholder={rest ? "0" : String(target)} aria-label={day ? `Push-ups on ${day}` : "Push-ups today"} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        <Button variant="secondary" style={{ width: 52, padding: 0 }} onClick={() => nudge(5)} aria-label="Plus 5">+5</Button>
      </form>
      <div className={a.rowButtons}>
        {!rest && <Button variant="activity" style={{ flex: 1 }} onClick={() => onSave(target)}>Hit the target · {target}</Button>}
        <Button style={{ flex: 1 }} disabled={Number.isNaN(n)} onClick={() => onSave(Math.min(n, 100000))}>Save</Button>
      </div>
      {current > 0 && <button type="button" className={a.lnk} style={{ alignSelf: "center", minHeight: 44 }} onClick={() => onSave(0)}>Clear {which} push-ups</button>}
    </>
  );
}
