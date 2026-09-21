"use client";

// The bar that says you are filling in an earlier day, on every screen that follows the day picked on Today.
// Loud on purpose: editing Tuesday while thinking it is today is the mistake backfill must not allow.

import { Button } from "@/components/ui";
import a from "./app.module.css";

/** "Tuesday 16 September". */
export const longDay = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

export function DayBanner({ view, onBack }: { view: Date; onBack: () => void }) {
  return (
    <div className={a.dayBanner} role="status">
      <span><span className="eb">Filling in</span><br /><span style={{ fontWeight: 600 }}>{longDay(view)}</span></span>
      <Button size="sm" variant="secondary" onClick={onBack}>Back to today</Button>
    </div>
  );
}
