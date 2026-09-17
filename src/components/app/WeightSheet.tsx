"use client";

// Today’s weight. One tap when nothing changed ("Same as last"), otherwise type it. The form only mounts
// while the sheet is open, so the field is seeded fresh each time.

import { useState } from "react";
import { Button, Input, Sheet } from "@/components/ui";
import a from "./app.module.css";

type FormProps = { current: number | null; last: number | null; onSave: (v: number | null) => void };

export function WeightSheet({ open, onClose, ...form }: { open: boolean; onClose: () => void } & FormProps) {
  return (
    <Sheet open={open} title="Weight today" onClose={onClose}>
      <WeightForm {...form} />
    </Sheet>
  );
}

function WeightForm({ current, last, onSave }: FormProps) {
  const [value, setValue] = useState(current !== null ? String(current) : "");
  const n = parseFloat(value);
  const valid = Number.isFinite(n) && n >= 1 && n <= 2000;
  const round = (v: number) => Math.round(v * 10) / 10;
  const nudge = (by: number) => setValue(String(round((Number.isFinite(n) ? n : last ?? 180) + by)));

  return (
    <>
      <p className="muted" style={{ fontSize: 13 }}>In pounds, to one decimal. Same time of day gives the cleanest line.</p>
      <form className={a.pushRow} onSubmit={(e) => { e.preventDefault(); if (valid) onSave(round(n)); }}>
        <Button variant="secondary" style={{ width: 56, padding: 0 }} onClick={() => nudge(-0.2)} aria-label="Minus 0.2">−0.2</Button>
        <Input className={a.pushInput} inputMode="decimal" value={value} placeholder={last !== null ? String(last) : "182.0"} aria-label="Weight in pounds" onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} />
        <Button variant="secondary" style={{ width: 56, padding: 0 }} onClick={() => nudge(0.2)} aria-label="Plus 0.2">+0.2</Button>
      </form>
      <div className={a.rowButtons}>
        {last !== null && current === null && <Button variant="food" style={{ flex: 1 }} onClick={() => onSave(last)}>Same as last · {last}</Button>}
        <Button style={{ flex: 1 }} disabled={!valid} onClick={() => onSave(round(n))}>Save</Button>
      </div>
      {current !== null && <button type="button" className={a.lnk} style={{ alignSelf: "center", minHeight: 44 }} onClick={() => onSave(null)}>Clear today&apos;s weight</button>}
    </>
  );
}
