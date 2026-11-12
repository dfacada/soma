"use client";

// A meal with no usual yet (David, 2026-11-11: newcomers log their own meals, never his plan). Tapping it asks what it
// was: say it or type it (known food answers at once, something new goes to the estimator, as Food's own field does),
// pick something already had, or just tick it with no numbers. What is logged can become the usual for that meal, so
// the next time it is one tap, as a plan's meals are. Shown from Today's meal taps and from Food's meal list.

import { useState } from "react";
import type { Known } from "@/lib/food-match";
import { draftOf, FROM, lookUp, mealOf, type FoodDraft } from "@/lib/food-lookup";
import { haptic } from "@/lib/haptics";
import type { Meal, PlannedMeal } from "@/lib/settings";
import { cap } from "@/lib/today";
import { Button, Chip, Field, Icon, Input, Sheet, Switch } from "@/components/ui";
import { mmss, useSayRecorder } from "./FoodSay";
import a from "./app.module.css";

const digits = (v: string, max = 4) => v.replace(/\D/g, "").slice(0, max);
/** How many of the foods already had are offered as one-tap choices. */
const RECENT = 8;

export function MealSheet({ meal, onClose, known, estimateOn, closes, onLog }: {
  /** The meal being asked about; null keeps the sheet closed. */
  meal: Meal | null;
  onClose: () => void;
  known: Known[];
  estimateOn: boolean;
  /** Whether logging this meal finishes the day's food, for the haptic. */
  closes: boolean;
  /** Log it on the day on screen, and keep it as the usual meal when asked. A tick with no numbers is never kept. */
  onLog: (meal: Meal, eaten: PlannedMeal, usual: boolean) => void;
}) {
  return (
    <Sheet open={meal !== null} title={meal ? cap(meal) : ""} onClose={onClose}>
      {meal && <MealForm key={meal} meal={meal} known={known} estimateOn={estimateOn} closes={closes} onLog={onLog} />}
    </Sheet>
  );
}

function MealForm({ meal, known, estimateOn, closes, onLog }: { meal: Meal; known: Known[]; estimateOn: boolean; closes: boolean; onLog: (meal: Meal, eaten: PlannedMeal, usual: boolean) => void }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<FoodDraft | null>(null);
  const [usual, setUsual] = useState(true);
  const [busy, setBusy] = useState(false);
  const voice = useSayRecorder();
  const error = voice.error, setError = voice.setError;
  const listening = voice.state === "listening", hearing = voice.state === "transcribing";

  // Only what this person has had or chosen: never the recipe book or the presets that came with Dayhub.
  const seen = new Set<string>();
  const recent = [...known].reverse().filter((k) => (k.source === "logged" || k.source === "plan") && k.name && !seen.has(k.name.toLowerCase()) && seen.add(k.name.toLowerCase())).slice(0, RECENT);

  async function look(said: string) {
    if (!said.trim() || busy) return;
    setError(null);
    setBusy(true);
    try {
      const got = await lookUp(said.trim(), known, estimateOn);
      setDraft(got.draft);
      setError(got.error);
    } finally { setBusy(false); }
  }

  async function stopListening() {
    const heard = await voice.stop();
    if (!heard) return;
    setText(heard);
    await look(heard);
  }

  const log = () => {
    if (!draft || draft.kcal === "") return;
    haptic(closes ? "done" : "tap");
    onLog(meal, mealOf(draft, text), usual);
  };
  const tick = () => {
    haptic(closes ? "done" : "tap");
    onLog(meal, { name: "", kcal: 0, protein: 0 }, false);
  };
  const field = (key: "kcal" | "protein" | "carbs" | "fat", label: string) => (
    <label key={key} className={a.macroField}>
      <span className="eb">{label}</span>
      <Input aria-label={label} inputMode="numeric" pattern="[0-9]*" value={draft![key]} onChange={(e) => setDraft((d) => d && { ...d, [key]: digits(e.target.value) })} />
    </label>
  );

  return (
    <div className={a.vaultForm}>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
        {estimateOn ? "What did you have? Say it or type it, and Dayhub fills in the numbers for you to check." : "What did you have? Type it and its numbers."}
      </p>
      <form className={a.extraForm} onSubmit={(e) => { e.preventDefault(); void look(text); }}>
        <Input placeholder="Oats with berries, a coffee" aria-label={`What you had for ${meal}`} value={text} maxLength={200} enterKeyHint="search"
          disabled={listening || hearing} onChange={(e) => { setText(e.target.value); if (draft) setDraft(null); }} />
        {listening
          ? <button type="button" className={`${a.sayMic} ${a.sayStop}`} onClick={() => { haptic(); void stopListening(); }} aria-label={`Stop listening, ${mmss(voice.seconds)}`}><i aria-hidden /><span className="m">{mmss(voice.seconds)}</span></button>
          : <button type="button" className={a.sayMic} disabled={busy || hearing} onClick={() => { haptic(); void voice.start(); }} aria-label={`Say what you had for ${meal}`}><Icon name="mic" size={20} /></button>}
      </form>
      {!draft && (text.trim() || busy || hearing) && (
        <Button variant="food" block disabled={!text.trim() || busy || hearing} onClick={() => void look(text)}>{hearing ? "Writing it down…" : busy ? "Looking it up…" : "Look it up"}</Button>
      )}
      {error && <p role="alert" className={a.noteBad} style={{ fontSize: 13 }}>{error}</p>}

      {draft && (
        <div className={a.draft}>
          <div className={a.draftHead}>
            <Input aria-label="Name" value={draft.name} maxLength={80} onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })} />
            <span className="muted" style={{ fontSize: 12 }}>{draft.from}</span>
          </div>
          <div className={a.macroFields}>{field("kcal", "kcal")}{field("protein", "protein")}{field("carbs", "carbs")}{field("fat", "fat")}</div>
          <Field name={`Keep as my usual ${meal}`} help="Next time one tap logs it. Change it any day.">
            <Switch checked={usual} label={`Keep as my usual ${meal}`} onChange={setUsual} />
          </Field>
          <Button variant="food" block disabled={draft.kcal === ""} onClick={log}>Log {meal}</Button>
        </div>
      )}

      {!draft && recent.length > 0 && <>
        <span className="eb" style={{ paddingTop: 4 }}>You&apos;ve had</span>
        <div className={a.chips}>
          {recent.map((k) => <Chip key={k.name} kind="habit" label={k.name} value={k.kcal} onClick={() => { haptic(); setError(null); setText(k.name); setDraft(draftOf(k, FROM[k.source])); }} />)}
        </div>
      </>}

      <button type="button" className={a.lnk} style={{ alignSelf: "center", minHeight: 44 }} onClick={tick}>Just tick it, no numbers</button>
    </div>
  );
}
