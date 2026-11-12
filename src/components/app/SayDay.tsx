"use client";

// Say your day (David, 2026-11-11): one recording that fills in the day. The button sits under Today's orb while
// anything is still open. A tap records a journal entry like any other (the journal provider's recorder, so it is
// kept safe and encrypted the same way); when it stops, its words are written down and read for the five things
// that close a day, and the person gets a list to check. Nothing is logged before they tap Fill in my day, and what
// they untick is left out. The recording is the day's journal entry either way.
//
// It is off until the person turns it on, because that one recording goes to Groq to be written down and its words
// to Claude to be read: the first tap says so and asks. The server checks the same switch (routes/day.js, jobs.js).

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { ApiError } from "@/lib/api";
import { knownFromDays, type Said } from "@/lib/food-say";
import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { describeDay } from "@/lib/say-api";
import { cuesOf, fillDay, filledLine, replacedMeals, rowsFor, withMeal, type DayRow } from "@/lib/say-day";
import { cap, type DayStatus } from "@/lib/today";
import { Button, Icon, Overlay, Sheet } from "@/components/ui";
import { longDay } from "./DayBanner";
import { useDays } from "./Days";
import { useJournal } from "./Journal";
import { DayMoment } from "./Moments";
import { useSession } from "./Session";
import a from "./app.module.css";
import t from "./today.module.css";

/** Where a recording's words have got to. `text` is empty when they could never be written down. */
type Take = { day: string; seconds: number; text: string } & (
  | { phase: "reading" }
  | { phase: "review"; rows: DayRow[]; cut: boolean }
  | { phase: "failed"; message: string }
);

/** A sentence from the server reads as one: capital first, a full stop last. */
const sentence = (m: string) => { const s = cap(m.trim()); return /[.!?]$/.test(s) ? s : s + "."; };

export function SayDay({ st, say, ref }: {
  /** The status of the day on screen: what is still open is the cue, and a closed day has no button. */
  st: DayStatus;
  say: (message: string, ms?: number) => void;
  /** `open()` is the button's own tap, for another card offering it (FirstDay.tsx): the same consent sheet first. */
  ref?: Ref<{ open: () => void }>;
}) {
  const { settings, saveSettings } = useSession();
  const journal = useJournal();
  const { map, viewKey: k, view, isToday, change } = useDays();
  const [intro, setIntro] = useState(false);
  const [turningOn, setTurningOn] = useState(false);
  const [introError, setIntroError] = useState<string | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  // The reading starts a minute or more after the tap: it uses the settings and the days as they are by then.
  const now = useRef({ settings, map });
  useEffect(() => { now.current = { settings, map }; }, [settings, map]);
  // Which saying of the day is on screen. Closing the screen while its words are still on their way moves this on,
  // and whatever comes back for the earlier one is dropped (the entry itself is saved either way).
  const run = useRef(0);
  const [left, setLeft] = useState(false);

  const read = useCallback(async (text: string, day: string, seconds: number, mine: number) => {
    setTake({ phase: "reading", day, seconds, text });
    try {
      const { heard, cut } = await describeDay(text, now.current.settings, knownFromDays(now.current.map, now.current.settings));
      if (mine !== run.current) return;
      setTake({ phase: "review", day, seconds, text, rows: rowsFor(heard, now.current.settings, now.current.map?.[day]), cut });
    } catch (e) {
      report("day", "describe_failed", e, undefined, e instanceof ApiError && e.status < 500 ? "warn" : "error");
      if (mine !== run.current) return;
      setTake({ phase: "failed", day, seconds, text, message: e instanceof ApiError ? sentence(e.message) : "Dayhub couldn't be reached. Try again in a moment." });
    }
  }, []);

  // The day is the one on screen when the recording starts, whatever is on screen when it ends.
  const begin = useCallback(async () => {
    const day = k;
    const mine = ++run.current;
    setLeft(false);
    const got = await journal.sayDay(now.current.map?.[day]?.checkin?.mood ?? null, isToday ? undefined : day, cuesOf(st));
    if (!got || mine !== run.current) return;
    if (got.error) return setTake({ phase: "failed", day, seconds: got.seconds, text: "", message: got.error });
    if (!got.text) return say("Didn't catch any words. Your recording is saved in your journal.", 4500);
    await read(got.text, day, got.seconds, mine);
  }, [k, isToday, st, journal, say, read]);

  // Closing at any point logs nothing. While the words are still being written down or read, it also lets go of them.
  const close = () => {
    if (!take || take.phase === "reading") { run.current++; setLeft(true); }
    setTake(null);
  };

  // A closed vault is unlocked first, and the recording follows straight on: one tap, not two.
  const start = () => { if (journal.vault !== "open") journal.openVaultThen(() => void begin()); else void begin(); };
  const tap = () => {
    haptic();
    if (settings.sayDay) return start();
    setIntroError(null);
    setIntro(true);
  };
  useImperativeHandle(ref, () => ({ open: tap }));
  const turnOn = async () => {
    haptic();
    setTurningOn(true);
    setIntroError(null);
    try {
      await saveSettings({ sayDay: true });
      setIntro(false);
      start();
    } catch (e) {
      report("settings", "say_day_on_failed", e);
      setIntroError("Couldn't turn it on. Check your connection and try again.");
    } finally { setTurningOn(false); }
  };

  const fill = () => {
    if (take?.phase !== "review") return;
    haptic("done");
    const n = fillDay(take.rows, change, take.day);
    setTake(null);
    if (n) say(filledLine(n), 3200);
  };
  const edit = (f: (r: DayRow) => DayRow) => setTake((cur) => (cur?.phase === "review" ? { ...cur, rows: cur.rows.map(f) } : cur));

  // Still true after the screen was closed on it, so the button waits until the journal has let the recording go.
  const writing = journal.dayWriting;
  const busy = journal.recording || journal.sealing || writing || take !== null;
  const rows = take?.phase === "review" ? take.rows : [];
  return (
    <>
      {!st.closed && (
        <button type="button" className={t.sayDay} onClick={tap} disabled={busy || journal.vault === "checking"}
          aria-label={isToday ? "Say your day: one recording fills in what is left" : `Say your day for ${longDay(view)}`}>
          <Icon name="mic" size={18} strokeWidth={2} /><span>{isToday ? "Say your day" : "Say that day"}</span>
        </button>
      )}
      <Sheet open={intro} title="Say your day" onClose={() => setIntro(false)}>
        <div className={a.vaultForm}>
          <p style={{ fontSize: 15, lineHeight: 1.5 }}>
            Talk through your day once and Dayhub fills it in: what you weighed, how you feel, what you ate and how you
            moved. The recording itself is your journal entry.
          </p>
          <span className="eb" style={{ paddingTop: 4 }}>What leaves this phone</span>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            That one recording goes to Groq to be written down, and the words go to Claude, which picks out those
            things. Dayhub sends both under its own key, with nothing about your account, and keeps neither. Your entry
            is stored encrypted, like every other.
          </p>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>You get a list to check first. Nothing is logged until you tap.</p>
          {introError && <p role="alert" className={a.noteBad}>{introError}</p>}
          <Button variant="journal" block disabled={turningOn} onClick={() => void turnOn()}>{turningOn ? "Turning on…" : "Turn on and start"}</Button>
          <button type="button" className={a.lnk} style={{ alignSelf: "center", minHeight: 44 }} onClick={() => setIntro(false)}>Not now</button>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>You can switch it off in Settings → Journal and vault.</p>
        </div>
      </Sheet>
      {((writing && !left) || take) && (
        <Overlay>
          <DayMoment
            phase={take ? take.phase : "writing"} seconds={take ? take.seconds : journal.lastSaved.seconds}
            heard={take && take.text ? take.text : null} rows={rows} cut={take?.phase === "review" && take.cut}
            replaces={take ? replacedMeals(rows, map?.[take.day]) : []} message={take?.phase === "failed" ? take.message : null}
            onToggle={(id) => edit((r) => (r.id === id ? { ...r, on: !r.on } : r))}
            onMeal={(id, meal: Said["meal"]) => edit((r) => (r.id === id ? withMeal(r, meal) : r))}
            onFill={fill}
            onRetry={take?.phase === "failed" && take.text ? () => void read(take.text, take.day, take.seconds, ++run.current) : undefined}
            onClose={close} />
        </Overlay>
      )}
    </>
  );
}
