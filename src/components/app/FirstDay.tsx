"use client";

// Two cards on Today for someone new (David, 2026-11-11). Both are only for accounts that joined since `joined` was
// kept (src/lib/first-days.ts says when each shows), so nobody already on Dayhub sees them.
//
// The first-day card, on day one and day two: make Dayhub yours (what you do, how you log food, an evening reminder),
// each with the screen that already does it, and Say your day for someone short on time (its consent sheet, as ever).
// The week-one question, from the seventh day: "What almost made you stop?", answered as a message to David.

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { daysIn, setUpItems, showFirstDay, showWeekOne, weekOneMessage, WEEK_ONE_QUESTION, type SetUpKey } from "@/lib/first-days";
import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { dayKey } from "@/lib/today";
import { Button, Icon, Medallion, Sheet, type IconName } from "@/components/ui";
import { ClosingChooser } from "./Closing";
import { FoodSetUp } from "./FoodSetUp";
import { MovesChooser } from "./MovesChooser";
import { NudgeSettings } from "./Nudge";
import { useSession } from "./Session";
import a from "./app.module.css";
import t from "./today.module.css";

const ITEMS: Record<SetUpKey, { title: string; sub: string; icon: IconName; domain: "journal" | "food" | "activity" }> = {
  closes: { title: "What closes your day", sub: "Five things by default: keep the ones that fit you", icon: "today", domain: "journal" },
  moves: { title: "Your moves", sub: "What you actually do, each with a daily goal", icon: "run", domain: "activity" },
  food: { title: "Your food", sub: "Your own meals, and targets only if you want them", icon: "leaf", domain: "food" },
  nudge: { title: "An evening reminder", sub: "One nudge when the day is still open", icon: "moon", domain: "journal" },
};

export function FirstDayCard({ today, onSayDay, say }: { today: Date; onSayDay: () => void; say: (message: string, ms?: number) => void }) {
  const { settings, saveSettings } = useSession();
  const [open, setOpen] = useState<SetUpKey | null>(null);
  const close = () => setOpen(null);
  const k = dayKey(today);
  if (!showFirstDay(settings, k) && open === null) return null;

  const items = setUpItems(settings);
  const left = items.filter((x) => !x.done).length;
  const putAway = () => {
    haptic();
    void saveSettings({ firstDayAway: true }).catch((e) => { report("app", "first_day_save_failed", e, undefined, "warn"); say("Couldn't put it away. Try again."); });
  };
  const foodDone = () => {
    void saveSettings({ foodSetUp: true }).catch((e) => report("food", "food_setup_save_failed", e, undefined, "warn"));
    close();
  };

  return (
    <section className={t.firstDay} aria-labelledby="first-day">
      <span className="eb">{daysIn(settings.joined, k) === 0 ? "Day one" : "Day two"}</span>
      <h2 id="first-day" className={`d ${t.firstTitle}`}>Make Dayhub yours</h2>
      <p className={t.firstSub}>{left === 1 ? "One thing left, a minute at most." : `${["", "", "Two", "Three", "Four"][left] || left} things, a minute each.`} Change any of it later in Settings.</p>
      <div className={t.firstList}>
        {items.map((x) => (
          <button key={x.key} type="button" className={t.firstRow} onClick={() => { haptic(); setOpen(x.key); }}
            aria-label={`${ITEMS[x.key].title}${x.done ? ", done" : ""}`}>
            <Medallion domain={ITEMS[x.key].domain} icon={x.done ? "check" : ITEMS[x.key].icon} state={x.done ? "done" : "idle"} />
            <span className={t.firstText}><span className={t.firstName}>{ITEMS[x.key].title}</span><span className={t.firstHint}>{x.done ? "Done. Tap to change it." : ITEMS[x.key].sub}</span></span>
            <Icon name="chevron" size={14} />
          </button>
        ))}
      </div>
      <div className={t.firstFoot}>
        <p>Short on time? Say your day: one recording, and Dayhub fills in the rest for you to check.</p>
        <Button size="sm" variant="journal" onClick={onSayDay}>Try Say your day</Button>
      </div>
      <button type="button" className={a.lnk} style={{ alignSelf: "center", minHeight: 44 }} onClick={putAway}>Put this away</button>

      <Sheet open={open === "closes"} title="What closes your day" onClose={close}>
        {open === "closes" && <ClosingChooser say={say} onDone={close} />}
      </Sheet>
      <Sheet open={open === "moves"} title="Your moves" onClose={close}>
        {open === "moves" && <MovesChooser first={settings.moves.length === 0} say={say} onSaved={close} />}
      </Sheet>
      <Sheet open={open === "food"} title="Your food" onClose={close}>
        {open === "food" && <FoodSetUp say={say} onDone={foodDone} />}
      </Sheet>
      <Sheet open={open === "nudge"} title="An evening reminder" onClose={close}>
        {open === "nudge" && <div className={a.vaultForm}><NudgeSettings say={say} /><Button block onClick={() => { haptic(); close(); }}>Done</Button></div>}
      </Sheet>
    </section>
  );
}

const ANSWER_MAX = 1800;

export function WeekOneCard({ today, say }: { today: Date; say: (message: string, ms?: number) => void }) {
  const { settings, saveSettings, me } = useSession();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!showWeekOne(settings, dayKey(today), me.profile.role === "admin")) return null;

  const send = async () => {
    if (!text.trim() || busy) return;
    haptic("done");
    setBusy(true); setError(null);
    try {
      await api("POST", "/messages", { body: weekOneMessage(text) });
      say("Sent to David. Thank you.", 3500);
      await saveSettings({ weekOne: "sent" }).catch((e) => report("app", "week_one_save_failed", e, undefined, "warn"));
    } catch (e) {
      report("messages", "week_one_send_failed", e, undefined, e instanceof ApiError && e.status < 500 ? "warn" : "error");
      setError(e instanceof ApiError && e.status < 500 ? e.message : "Couldn't send it. Try again in a moment.");
    } finally { setBusy(false); }
  };
  const skip = () => {
    haptic();
    void saveSettings({ weekOne: "skipped" }).catch((e) => { report("app", "week_one_save_failed", e, undefined, "warn"); say("Couldn't put it away. Try again."); });
  };

  return (
    <section className={t.firstDay} aria-labelledby="week-one">
      <span className="eb">A week in</span>
      <h2 id="week-one" className={`d ${t.firstTitle}`}>{WEEK_ONE_QUESTION}</h2>
      <p className={t.firstSub}>
        One question from David, who makes Dayhub. A line is plenty. It goes to him as a message, not sealed like your
        journal, and anything he writes back comes to Settings → Messages.
      </p>
      <textarea className={a.writeBox} rows={3} maxLength={ANSWER_MAX} value={text} onChange={(e) => setText(e.target.value)}
        aria-label="Your answer" placeholder="Anything at all: a screen, a habit, a busy day." />
      {error && <p role="alert" className={a.noteBad}>{error}</p>}
      <div className={a.rowButtons}>
        <Button size="sm" variant="journal" disabled={!text.trim() || busy} onClick={() => void send()}>{busy ? "Sending…" : "Send to David"}</Button>
        <Button size="sm" variant="secondary" onClick={skip}>Not now</Button>
      </div>
    </section>
  );
}
