"use client";

// Today’s weight. One tap when nothing changed ("Same as last"); otherwise drag the ruler, nudge by 0.2, or type
// into the big number. The form only mounts while the sheet is open, so it is seeded fresh each time.

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button, Icon, Sheet } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import w from "./sheets.module.css";

type FormProps = { current: number | null; last: number | null; onSave: (v: number | null) => void };

export function WeightSheet({ open, onClose, ...form }: { open: boolean; onClose: () => void } & FormProps) {
  return (
    <Sheet open={open} title="Weight today" onClose={onClose}>
      <WeightForm {...form} />
    </Sheet>
  );
}

const PX = 40; // per pound on the ruler
const round = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number) => Math.min(2000, Math.max(1, v));
/** The big number is as wide as what is in it (condensed digits are about half an em), so the unit sits beside it. */
export const fit = (text: string) => `${(Math.max(1, text.length) * 0.5 + 0.2).toFixed(2)}em`;

function WeightForm({ current, last, onSave }: FormProps) {
  const [value, setValue] = useState(current !== null ? String(current) : last !== null ? String(last) : "");
  const n = parseFloat(value);
  const valid = Number.isFinite(n) && n >= 1 && n <= 2000;
  const v = valid ? n : last ?? 180;
  // The ruler spans 20 lb around an anchor; a value typed outside it moves the anchor (adjusted during render).
  const [anchor, setAnchor] = useState(Math.round(v));
  if (Math.abs(v - anchor) > 9.5) setAnchor(Math.round(v));
  const lo = anchor - 10;
  const set = (x: number) => setValue(String(round(clamp(x))));

  const drag = useRef<{ x: number; v: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const down = (e: PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, v }; setDragging(true); };
  // Moving the ruler left brings bigger numbers under the needle; snapped to 0.2.
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const nv = Math.round((drag.current.v - (e.clientX - drag.current.x) / PX) * 5) / 5;
    if (Math.floor(nv) !== Math.floor(v)) haptic();
    set(nv);
  };
  const up = () => { drag.current = null; setDragging(false); };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const by = e.shiftKey ? 1 : 0.2;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); set(v + by); }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); set(v - by); }
  };
  const diff = valid && last !== null ? round(n - last) : null;

  return (
    <form style={{ display: "contents" }} onSubmit={(e) => { e.preventDefault(); if (valid) onSave(round(n)); }}>
      <div className={w.num}>
        <input className={`dc ${w.numInput}`} inputMode="decimal" value={value} placeholder={v.toFixed(1)} aria-label="Weight in pounds" style={{ width: fit(value || v.toFixed(1)) }}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} />
        <span className={w.unit}>lb</span>
      </div>
      {diff !== null && <span className={`m ${w.delta}`}>{diff === 0 ? "Same as last time" : `${diff < 0 ? "↓" : "↑"} ${Math.abs(diff).toFixed(1)} lb since last`}</span>}
      <div className={`${w.ruler} ${dragging ? w.dragging : ""}`} role="slider" tabIndex={0} aria-label="Weight in pounds, drag to change" aria-valuemin={1} aria-valuemax={2000} aria-valuenow={round(v)}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
        <div className={w.strip} style={{ transform: `translateX(${(-(v - lo) * PX).toFixed(1)}px)` }}>
          <i className={w.minor} /><i className={w.major} />
          {Array.from({ length: 21 }, (_, i) => <span key={i} className={`m ${w.lab}`} style={{ left: i * PX }}>{lo + i}</span>)}
        </div>
        <span className={w.needle} />
      </div>
      <div className={w.steps}>
        <button type="button" className={w.step} onClick={() => { haptic(); set(v - 0.2); }} aria-label="Minus 0.2"><Icon name="minus" size={20} /></button>
        <Button type="submit" className={w.grow} disabled={!valid}>Save weight</Button>
        <button type="button" className={w.step} onClick={() => { haptic(); set(v + 0.2); }} aria-label="Plus 0.2"><Icon name="plus" size={20} /></button>
      </div>
      {last !== null && current === null && <Button variant="food" block onClick={() => onSave(last)}>Same as last · {last} lb</Button>}
      <p className={w.note}>Same time of day gives the cleanest line.</p>
      {current !== null && <button type="button" className={w.clear} onClick={() => onSave(null)}>Clear today&apos;s weight</button>}
    </form>
  );
}
