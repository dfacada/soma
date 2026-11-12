"use client";

// What closes your day (David, 2026-11-11: each person chooses). Five switches in card order, and under food the
// meals that count. Weight is settings.requireWeight, as it always was; the other four and the meals are
// settings.closes. At least one thing always counts. Each change saves at once, like every setting. Shown in
// Settings → What closes your day and from the first-day card.

import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { MEALS, type Meal, type Settings } from "@/lib/settings";
import { cap, closesLine, type TaskKey } from "@/lib/today";
import { Button, Chip, Field, Switch } from "@/components/ui";
import { useSession } from "./Session";
import a from "./app.module.css";

const ROWS: { key: TaskKey; name: string; help: string }[] = [
  { key: "weight", name: "Weight", help: "Logging your weight, once a day." },
  { key: "checkin", name: "Check-in", help: "A mood, and habits if you like." },
  { key: "journal", name: "Journal", help: "A recording, or a few written words." },
  { key: "food", name: "Food", help: "The meals you eat, each logged or ticked." },
  { key: "activity", name: "A move", help: "Any one of your moves." },
];

/** What closes the day, in a few words, for Settings' row: "All five", or the ones that count. */
export function closingSummary(s: Pick<Settings, "requireWeight" | "closes">): string {
  const on = ROWS.filter((r) => (r.key === "weight" ? s.requireWeight : s.closes[r.key]));
  const meals = s.closes.food && s.closes.meals.length < 4 ? ` (${s.closes.meals.length} meals)` : "";
  return on.length === 5 && !meals ? "All five things" : on.map((r) => (r.key === "food" ? `Food${meals}` : r.name)).join(", ");
}

export function ClosingChooser({ say, onDone }: { say: (message: string) => void; onDone?: () => void }) {
  const { settings, saveSettings } = useSession();
  const c = settings.closes;
  const on: Record<TaskKey, boolean> = { weight: settings.requireWeight, checkin: c.checkin, journal: c.journal, food: c.food, activity: c.activity };
  const count = Object.values(on).filter(Boolean).length;
  const save = (patch: Partial<Settings>) => saveSettings(patch).catch((e) => { report("settings", "closes_save_failed", e, undefined, "warn"); say("Couldn't save that. Try again."); });

  const flip = (key: TaskKey, v: boolean) => {
    if (!v && count <= 1) return say("Keep at least one thing");
    haptic();
    if (key === "weight") void save({ requireWeight: v, closes: { ...c, chosen: true } });
    else void save({ closes: { ...c, [key]: v, chosen: true } });
  };
  const meal = (m: Meal) => {
    const has = c.meals.includes(m);
    if (has && c.meals.length <= 1) return say("Keep at least one meal");
    haptic();
    void save({ closes: { ...c, meals: MEALS.filter((x) => (x === m ? !has : c.meals.includes(x))), chosen: true } });
  };

  return (
    <div className={a.vaultForm}>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        A day closes when everything you leave on is done, and closed days make your streak. What you switch off stays on
        Today and still works; it just doesn&apos;t hold the day open.
      </p>
      {ROWS.map((r) => (
        <div key={r.key} className={a.vaultForm} style={{ gap: 8 }}>
          <Field name={r.name} help={r.help}>
            <Switch checked={on[r.key]} label={`${r.name} closes the day`} onChange={(v) => flip(r.key, v)} />
          </Field>
          {r.key === "food" && c.food && (
            <div className={a.chips} role="group" aria-label="The meals that count">
              {MEALS.map((m) => <Chip key={m} kind="habit" label={cap(m)} on={c.meals.includes(m)} onClick={() => meal(m)} />)}
            </div>
          )}
        </div>
      ))}
      <p className="muted" style={{ fontSize: 13 }}>{closesLine(count)}</p>
      {onDone && <Button block onClick={() => { haptic("done"); if (!c.chosen) void save({ closes: { ...c, chosen: true } }); onDone(); }}>Done</Button>}
    </div>
  );
}
