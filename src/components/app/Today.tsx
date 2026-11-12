"use client";

// Today is the actionable screen: every daily task completes with a tap here (docs/HANDOFF.md).
// Dayhub Night (2026-11-02): a greeting, the orb (one bead per task, the sphere lit by what is done), the week strip,
// and a bento of task cards in card order: weight, check-in, journal, food, activity. The activity card leads with the
// person's main move (2026-11-08); their other moves sit under it, and any of them closes the day.
// Under the orb, Say your day (2026-11-11, SayDay.tsx): one recording that fills in whatever is still open.
//
// Backfill: tap one of the six earlier days in the week strip and every card edits that day instead, under a header
// that says so. The streak and the round stay on today. On a past day the journal can also be written, not only
// recorded, and the entry is filed under that day marked "added later".

import { useGoTab } from "./tabs";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button, Chip, DayGlyph, Icon, Medallion, Orb, Overlay, Sheet, StatPill, Toast, type MedallionState, type OrbBead } from "@/components/ui";
import { hasTarget, MEALS, type Meal, type PlannedMeal } from "@/lib/settings";
import { hm } from "@/lib/sleep";
import { addDays, cap, closesLine, dayKey, dayStatus, headline, mealsWord, streak, WEEKDAYS, type TaskKey } from "@/lib/today";
import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { longDay } from "./DayBanner";
import { FitbitBanner } from "./FitbitBanner";
import { MessageCard } from "./Messages";
import { useHealth } from "./Health";
import { SleepSheet } from "./Sleep";
import { StepsSheet } from "./Steps";
import { clock } from "@/lib/journal";
import { useJournal } from "./Journal";
import { describeError, mmss, useSayRecorder } from "./FoodSay";
import { applySaid, knownFromDays, saidLine, type Said } from "@/lib/food-say";
import { describeFood } from "@/lib/say-api";
import { ExperimentToday } from "./Experiment";
import { FirstDayCard, WeekOneCard } from "./FirstDay";
import { DayClosed, FoodMoment } from "./Moments";
import { MoodFace } from "./MoodFace";
import { MealSheet } from "./MealSheet";
import { MoveSheet, moveIcon } from "./MoveSheet";
import { MovesChooser } from "./MovesChooser";
import { OTHER_MOVE, amountText, applyMove, closesDay, goalText, loggedOf, mainOf, movesOf, num, progressOf, savedLine, unitWord, type Move, type MoveSave } from "@/lib/moves";
import { SayDay } from "./SayDay";
import { TomorrowCard } from "./Tomorrow";
import { WeightSheet } from "./WeightSheet";
import { useRounds } from "./Rounds";
import { useSession } from "./Session";
import { useDays } from "./Days";
import a from "./app.module.css";
import t from "./today.module.css";

const fmt = (n: number) => n.toLocaleString("en-US");
/** A sentence with its numbers in mono, as every number in Dayhub is (the week line's streak and best): "2 left to
 *  close the day", "↑ 0.9 lb since last", "3 meals left". The words keep the body face. */
const nums = (text: string): ReactNode => text.split(/(\d[\d,.]*\d|\d)/).map((part, i) => (i % 2 ? <span key={i} className="m">{part}</span> : part));
const BEADS: Record<TaskKey, Omit<OrbBead, "key" | "value">> = {
  weight: { domain: "food", icon: "scale", label: "Weight" },
  checkin: { domain: "journal", icon: "heart", label: "Check-in" },
  journal: { domain: "journal", icon: "mic", label: "Journal" },
  food: { domain: "food", icon: "leaf", label: "All four meals" },
  activity: { domain: "activity", icon: "run", label: "Any activity" },
};

export function Today() {
  const goTab = useGoTab();
  const { settings, displayName, me, saveSettings } = useSession();
  const journal = useJournal();
  const rounds = useRounds();

  const { map, error, reload, unsaved, retry, change, setSteps, today, viewKey: k, view, isToday, setView, windowDays: WINDOW_DAYS } = useDays();
  const [writing, setWriting] = useState(false);
  const [checkinSheet, setCheckinSheet] = useState(false);
  // The log sheet: closed (false), or open on a move (its key; null opens on the main move).
  const [moveSheet, setMoveSheet] = useState<string | null | false>(false);
  const [chooser, setChooser] = useState(false);
  const [weightSheet, setWeightSheet] = useState(false);
  // A meal with no usual yet (their own meals): its tap asks what it was.
  const [mealSheet, setMealSheet] = useState<Meal | null>(null);
  const closeMealSheet = useCallback(() => setMealSheet(null), []);
  // Say your day's own tap, for the first-day card's offer of it.
  const sayDayRef = useRef<{ open: () => void } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const say = useCallback((m: string, ms = 1800) => { setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), ms); }, []);
  // The Food card records like the Journal card: tap, say the day's food, tap again, and it is logged.
  // What went wrong shows as a toast for a few seconds; the card stays on the day's meals.
  const foodFailed = useCallback((m: string) => say(m, 4500), [say]);
  const voice = useSayRecorder(foodFailed);
  const [reading, setReading] = useState(false);

  const closeMove = useCallback(() => setMoveSheet(false), []);
  const closeChooser = useCallback(() => setChooser(false), []);
  const closeWeight = useCallback(() => setWeightSheet(false), []);
  const closeCheckin = useCallback(() => setCheckinSheet(false), []);
  const health = useHealth();
  const [sleepSheet, setSleepSheet] = useState(false);
  const closeSleep = useCallback(() => setSleepSheet(false), []);
  const [stepsSheet, setStepsSheet] = useState(false);
  const closeSteps = useCallback(() => setStepsSheet(false), []);

  // The server's count is from page load; the journal provider knows about entries recorded since, including
  // ones still waiting to upload. Whichever is higher is the truth for today.
  const entriesToday = Math.max(map?.[k]?.entries || 0, journal.countOn(k) || 0);
  // Cheap enough to recompute every render: one day's status and a 60-day walk.
  const days = map ? { ...map, [k]: { ...(map[k] || { entries: 0 }), entries: entriesToday } } : null;
  const st = dayStatus(days?.[k], settings);
  const run = days ? streak(days, settings, today, WINDOW_DAYS) : { now: 0, best: settings.bestStreak };

  // The celebration: once, when today goes from open to closed while Dayhub is open on it. Never on opening the app
  // to a day already closed, and never for a past day being filled in. Adjusted during render.
  const todayKey = dayKey(today);
  const todayEntries = Math.max(map?.[todayKey]?.entries || 0, journal.countOn(todayKey) || 0);
  const todayClosed = map ? dayStatus({ ...(map[todayKey] || { entries: 0 }), entries: todayEntries }, settings).closed : null;
  const [wasClosed, setWasClosed] = useState<boolean | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  if (todayClosed !== null && todayClosed !== wasClosed) {
    setWasClosed(todayClosed);
    if (todayClosed && wasClosed === false && isToday) setCelebrate(true);
  }

  // Saying what you ate, shown full screen: what was heard once it is written down, then the items as they land.
  const [said, setSaid] = useState<{ heard: string | null; items: Said[] } | null>(null);

  // Best streak outlives the 60-day window by being remembered in settings.
  useEffect(() => {
    if (map && run.best > settings.bestStreak) void saveSettings({ bestStreak: run.best }).catch(() => { /* retried on the next improvement */ });
  }, [map, run.best, settings.bestStreak, saveSettings]);

  if (error) {
    return (
      <div className={a.page}>
        <span className="d" style={{ fontSize: 28 }}>Couldn&apos;t load today</span>
        <p className="muted">{error}</p>
        <div><Button onClick={reload}>Try again</Button></div>
      </div>
    );
  }
  if (!map || !days) return <div className={a.page}><span className="eb">Loading today</span></div>;

  const data = days[k];
  const checkin = data?.checkin;
  const eaten = data?.log?.meals || {};
  const hour = new Date().getHours();
  const head = headline(st, run.now, hour);
  // The round I am in on this day, while it runs: it sets the goal (and rest days) of the move it counts.
  const roundDay = rounds.forDay(k);
  // Moves count for a round only when logged within two days (the server decides; this is only for the words).
  const lateForRound = k < dayKey(addDays(today, -2));
  const when = isToday ? "today" : "that day";
  const initials = (displayName || me.email).split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const firstName = (displayName || "").trim().split(/\s+/)[0];

  // ── The greeting and the line under the orb ──
  const greet = hour < 5 || hour >= 17 ? "Good evening" : hour < 12 ? "Good morning" : "Good afternoon";
  const hello = !isToday ? longDay(view) : `${st.closed ? "That's the day" : greet}${firstName ? `,\n${firstName}` : ""}.`;
  const eyebrow = isToday ? new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" }) : "Filling in";
  // Today closed has no line: the week card right under the orb already says the streak, beside the best.
  const lede = !isToday
    ? (st.closed ? "Closed. Nothing left to fill in." : `${st.doneCount} of ${st.taskCount} done. Fill in what is missing.`)
    : st.closed ? null
    : st.progress === 0 ? closesLine(st.taskCount)
    : head.todos.length === 1 ? `${head.todos[0].label} closes the day.`
    : `${head.todos.length} left to close the day.`;
  // Said after the lede when there is an Up next (below).
  const NEXT_LABEL: Record<TaskKey, string> = { weight: "your weight", checkin: "check in", journal: "your journal", food: "food", activity: "move" };
  // The meals bead says which meals count: "All four meals", or "Breakfast, lunch and dinner".
  const bead = (key: TaskKey) => ({ ...BEADS[key], ...(key === "food" ? { label: cap(mealsWord(st.mealsNeeded)) } : {}) });
  const beads: OrbBead[] = st.ring.map((r) => ({ key: r.key, value: r.value, ...bead(r.key) }));
  // A card whose task does not close this person's day still works; its label says it is optional (settings.closes).
  const optional = (key: TaskKey) => (st.counts[key] ? "" : " · optional");

  // ── Check-in ──
  const moods = settings.moods.filter((m) => m.on);
  const habitsOn = settings.habits.filter((h) => h.type === "daily" && checkin?.habits[h.id]).map((h) => h.label);
  const countsOn = settings.habits.filter((h) => h.type === "counter" && checkin?.counts[h.id]).map((h) => `${h.label} ×${checkin?.counts[h.id]}`);
  const pickMood = (label: string) => {
    const clearing = checkin?.mood === label;
    change("checkins", k, (d) => { d.checkin.mood = clearing ? null : label; });
    haptic(clearing ? "tap" : "done");
    if (!clearing) say(`Checked in: ${label}`);
  };

  // ── Journal ──
  const recording = journal.recording;
  const journalTitle = recording ? clock(journal.seconds)
    : st.journalDone ? `${entriesToday} entr${entriesToday === 1 ? "y" : "ies"} ${when}`
    : journal.vault === "none" ? "Set up your vault" : journal.vault === "locked" ? "Unlock to record" : "Tap to talk";
  const journalSub = recording
    ? "Listening. Tap again when you are done."
    : journal.vault === "none"
      ? "Tap to make your vault, then record."
      : journal.vault === "locked"
        ? (st.journalDone ? "Unlock your vault to add another." : "Tap to unlock your vault and record.")
        : st.journalDone
          ? "Tap to add another. Sealed on this phone."
          : isToday ? "Two minutes is plenty. Sealed on this phone." : "Tap to record, or write, for that day. It is marked added later.";

  // ── Food ──
  const sayFood = settings.foodEstimate;
  const listening = voice.state === "listening";
  const foodBusy = voice.state === "transcribing" || reading;
  const foodState: MedallionState = listening ? "rec" : st.foodDone ? "done" : st.meals ? "part" : "idle";
  const kcalSet = hasTarget(settings.goals.kcal);
  const lastUsual = st.leftMeals.length === 1 ? settings.plan[st.leftMeals[0]] : null;
  const foodSub = st.foodDone
    ? `${st.mealsNeeded.length === 4 ? "All four" : cap(mealsWord(st.mealsNeeded))} eaten · ${kcalSet ? `${fmt(settings.goals.kcal)} kcal goal` : `${fmt(st.kcal)} kcal`}`
    : st.leftMeals.length === 1
      ? `${cap(st.leftMeals[0])} left${lastUsual ? `: ${lastUsual.name}` : ""}`
      : `${st.leftMeals.length} meals left${sayFood ? " · tap to say what you ate" : ""}`;
  // A meal tap: the usual meal in one tap, or, with no usual yet, the sheet that asks what it was.
  const tapMeal = (m: Meal) => {
    const usual = settings.plan[m];
    if (!eaten[m] && !usual) return setMealSheet(m);
    haptic(!eaten[m] && st.leftMeals.length === 1 ? "done" : "tap");
    change("day-logs", k, (d) => { d.log.meals[m] = d.log.meals[m] || !usual ? false : { ...usual }; });
  };
  const logMeal = (m: Meal, x: PlannedMeal, usual: boolean) => {
    change("day-logs", k, (d) => { d.log.meals[m] = { ...x }; });
    setMealSheet(null);
    say(x.name ? `${cap(m)} · ${fmt(x.kcal)} kcal` : `${cap(m)} ticked`);
    if (usual) void saveSettings({ plan: { ...settings.plan, [m]: { ...x } } }).catch((e) => { report("food", "usual_save_failed", e); say("Logged, but couldn't keep it as your usual", 3500); });
  };
  const foodLine = listening ? "Listening. Say what you ate, then tap again."
    : voice.state === "transcribing" ? "Writing it down…"
    : reading ? "Working out what you ate…"
    : foodSub;
  // Nothing to check before it lands: meals you name replace what they held, the rest go under Something else, and
  // Food shows it all to change. The day is the one picked when the recording stopped.
  const tapFood = async () => {
    if (foodBusy) return;
    haptic();
    if (voice.state !== "listening") { await voice.start(); return; }
    const day = k;
    const heard = await voice.stop();
    if (!heard) return;
    setSaid({ heard, items: [] });
    setReading(true);
    try {
      const items = await describeFood(heard, knownFromDays(map, settings));
      if (!items.length) { setSaid(null); voice.fail("Didn't hear any food in that. Tap and say what you ate."); }
      else { change("day-logs", day, (d) => applySaid(d.log, items)); setSaid({ heard, items }); say(saidLine(items), 3500); }
    } catch (e) {
      setSaid(null);
      voice.fail(describeError(e));
    } finally { setReading(false); }
  };

  // ── Weight ──
  // The most recent weight before today, for the one-tap "same as last" and the change since.
  let lastWeight: number | null = null;
  for (let i = 1; i <= WINDOW_DAYS && lastWeight === null; i++) lastWeight = days[dayKey(addDays(view, -i))]?.weight ?? null;
  const weightShown = st.weight ?? lastWeight;
  const weightSub = st.weight !== null
    ? (lastWeight === null ? `Logged ${when}` : st.weight === lastWeight ? "Same as last time" : `${st.weight < lastWeight ? "↓" : "↑"} ${Math.abs(st.weight - lastWeight).toFixed(1)} lb since last`)
    : lastWeight !== null ? `Last weigh-in. Tap to log ${when}.` : `Tap to log ${isToday ? "today’s" : "that day’s"} weight.`;
  const saveWeight = (v: number | null) => {
    change("weight", k, (d) => { d.weight.value = v; });
    haptic(v === null ? "tap" : "done");
    setWeightSheet(false);
    say(v === null ? "Weight cleared" : `Weight logged · ${v} lb`);
  };

  // ── Activity: the main move leads, the others sit under it ──
  const act = data?.activity;
  const moves = movesOf(settings);
  const main = mainOf(settings);
  const goalOf = (mv: Move) => rounds.goalFor(mv, k);
  const mainGoal = main ? goalOf(main) : null;
  const mainAt = main && mainGoal ? { ...main, goal: mainGoal.goal } : null;
  const mainLogged = mainAt ? loggedOf(act, mainAt) : null;
  const mainProgress = mainAt && mainLogged ? progressOf(mainAt, mainLogged) : null;
  const rest = Boolean(mainGoal?.rest);
  const others = moves.filter((x) => x.key !== main?.key);
  // What was logged, in the order the moves are listed, with "Other" (its name, if it has one) last.
  const otherLog = act?.types?.[OTHER_MOVE.key];
  const loggedNames = [
    ...moves.filter((x) => loggedOf(act, goalOf(x).fromRound ? { ...x, goal: goalOf(x).goal } : x).done).map((x) => x.key === "steps" ? "steps" : x.name.toLowerCase()),
    ...(otherLog ? [typeof otherLog === "object" && otherLog.label ? otherLog.label.toLowerCase() : "something else"] : []),
  ];
  const goalHit = mainProgress !== null && mainProgress >= 1 && !rest && main?.unit !== "session";
  const actSub = !main ? ""
    : st.activityDone ? `Done · ${cap(loggedNames.join(", ") || "a move")}${goalHit ? " · goal hit" : ""}`
    : rest ? `A rest day for ${main.name.toLowerCase()}. Any of your moves closes it.`
    : `Any of your moves closes it. Tap to log your ${main.key === "pushups" ? "push-ups" : main.unit === "session" ? `${main.name.toLowerCase()} session` : main.name.toLowerCase()}.`;
  const saveMove = (s: MoveSave) => {
    const mv = [...moves, OTHER_MOVE].find((x) => x.key === s.key) || OTHER_MOVE;
    const g = goalOf(mv);
    haptic(!st.activityDone && closesDay(s, settings.goals.steps) ? "done" : "tap");
    if (s.key === "steps") void setSteps(k, s.n === null ? null : Math.round(s.n)).catch(() => say("Couldn't save your steps. Try again.", 4500));
    else change("activity", k, (d) => applyMove(d, s));
    setMoveSheet(false);
    say(savedLine(mv, s, g, lateForRound && Boolean(roundDay.round)));
  };
  // A tap on one of the other moves: ten more push-ups, a session done or undone, minutes done at their goal (the
  // mock-up's "tap when done"). A distance, steps or reps of your own open the sheet, so no number is made up.
  const quickTap = (mv: Move) => {
    const l = loggedOf(act, mv);
    if (mv.key === "pushups") return saveMove({ key: "pushups", n: (st.pushups || 0) + 10, u: "reps" });
    if (mv.unit === "session") return saveMove({ key: mv.key, n: l.done ? null : 1, u: "session" });
    if (mv.unit === "min") return saveMove({ key: mv.key, n: l.done ? null : goalOf(mv).goal, u: "min" });
    setMoveSheet(mv.key);
  };

  // ── Up next ──
  // One open task, picked by the time of day, glows and is the only one whose button rings; the rest stay quiet
  // (David, 2026-11-03: "a unique experience that's efficient"). Weight first thing, food through the day, the
  // journal in the evening. Only on today, and not while something is recording.
  const open: Record<TaskKey, boolean> = { weight: st.counts.weight && !st.weightDone, checkin: st.counts.checkin && !st.checkinDone, journal: st.counts.journal && !st.journalDone, food: st.counts.food && !st.foodDone, activity: st.counts.activity && !st.activityDone };
  const order: TaskKey[] = hour < 11 ? ["weight", "checkin", "food", "activity", "journal"]
    : hour < 17 ? ["food", "activity", "checkin", "weight", "journal"]
    : ["journal", "food", "activity", "checkin", "weight"];
  const next = isToday && !recording && !listening ? order.find((key) => open[key]) ?? null : null;
  // The chips under the orb follow headline()'s order, which is card order with done tasks left out.
  const todoKeys = (["weight", "checkin", "journal", "food", "activity"] as TaskKey[]).filter((key) => open[key]);

  // Steps and sleep as pills that fill toward their goals, after Google Health's Today (David, 2026-11-03). They
  // inform and never close the day. Steps are in the day map; the night woken from on this day is vault ciphertext,
  // readable only while the vault is open. Shown once Fitbit is connected, or while there is anything to show.
  const stepsK = days?.[k]?.activity?.steps ?? null;
  const nightK = health.nights?.[k] ?? null;
  const linked = health.status === "connected" || health.status === "reconnect";
  const showSteps = linked || stepsK !== null;
  const showSleep = linked || nightK !== null;

  const hue = (d: "journal" | "food" | "activity") => ({ "--hue": `var(--${d})` }) as CSSProperties;
  const tile = (done: boolean, wide = false, rec = false, key?: TaskKey) =>
    `${t.tile} ${wide ? t.wide : ""} ${done ? t.tileDone : ""} ${rec ? t.tileRec : ""} ${key && key === next ? t.next : ""}`;

  return (
    <div className={a.page}>
      <FitbitBanner />
      <MessageCard />
      {/* The date, the streak and Settings along the top; the greeting gets the full width under them. On an earlier
          day the streak gives way to the way back. */}
      <header className={t.top}>
        <div className={t.topRow}>
          <span className="eb">{eyebrow}</span>
          <div className={t.topRight}>
            {/* No flame until there has been a full day to count: on day one a 0 is not a streak, it is a scold. */}
            {isToday
              ? run.best > 0 && <span className={t.streak} aria-label={`${run.now} full day${run.now === 1 ? "" : "s"} in a row`}>
                <Icon name="flame" size={17} /><span key={run.now} className={`m ${t.roll}`}>{run.now}</span>
              </span>
              : <button type="button" className={t.back} onClick={() => setView(null)}><Icon name="today" size={15} />Back to today</button>}
            <button type="button" className={t.avatar} aria-label="Settings" onClick={() => goTab("settings")}>{initials}</button>
          </div>
        </div>
        <h1 className={`d ${t.hello}`}>{hello}</h1>
      </header>

      {/* Someone new: make Dayhub yours on day one and two, and one question at the end of the first week. */}
      {isToday && <FirstDayCard today={today} say={say} onSayDay={() => sayDayRef.current?.open()} />}
      {isToday && <WeekOneCard today={today} say={say} />}

      <section className={`${t.hero} ${lede ? "" : t.heroBare}`} aria-label={isToday ? "Today's progress" : `Progress on ${longDay(view)}`}>
        <Orb beads={beads} closed={st.closed} label={`${st.doneCount} of ${st.taskCount} done`}>
          {st.closed
            ? <div className={t.closedMark}><Icon name="check" size={46} strokeWidth={2.2} /><span className={`eb ${t.orbWords}`}>Day closed</span></div>
            : <>
              <div className={`dc ${t.count}`}><span key={st.doneCount} className={t.roll}>{st.doneCount}</span><small>/{st.taskCount}</small></div>
              <span className={`eb ${t.orbWords}`}>{isToday ? "done today" : "done that day"}</span>
            </>}
        </Orb>
        {lede && <p className={t.lede}>{nums(lede)}{next && head.todos.length > 1 && <> <span className={t.ledeNext}>Up next: {NEXT_LABEL[next]}.</span></>}</p>}
        {head.todos.length > 0 && (
          <div className={t.todos}>
            {head.todos.map((x, i) => <span key={x.label} className={`${t.todo} ${todoKeys[i] === next ? t.todoNext : ""}`} style={{ "--c": x.color, animationDelay: `${0.3 + i * 0.06}s` } as CSSProperties}><i />{x.label}</span>)}
          </div>
        )}
        {/* One recording for everything still open: it fills the list above, and is the journal entry too. */}
        <SayDay ref={sayDayRef} st={st} say={say} />
      </section>

      <div className={t.week}>
        <div className={t.weekDays} role="group" aria-label="Pick a day to fill in">
          {[6, 5, 4, 3, 2, 1, 0].map((i) => {
            const d = addDays(today, -i);
            const dk = dayKey(d);
            const done = dk === k ? st.doneCount : dayStatus(days[dk], settings).doneCount;
            // A day before this person joined is not a missed day: it stays quiet and there is nothing to fill in.
            const before = i > 0 && settings.joined !== "" && dk < settings.joined;
            return (
              <button key={i} type="button" className={`${t.weekDay} ${i === 0 ? t.weekToday : ""} ${dk === k ? t.weekPicked : ""} ${before ? t.weekBefore : ""}`}
                disabled={before} aria-pressed={dk === k} aria-label={i === 0 ? "Today" : before ? `${longDay(d)}, before you joined` : `Fill in ${longDay(d)}`} onClick={() => { haptic(); setView(i === 0 ? null : dk); }}>
                <DayGlyph done={done} total={st.taskCount} today={i === 0} />
                <span>{i === 0 ? "Today" : WEEKDAYS[d.getDay()]}</span>
              </button>
            );
          })}
        </div>
        <div className={t.weekLine}>
          {run.best === 0 && run.now === 0
            ? <span>Close today for your first full day.</span>
            : <>
              <span><span className="m">{run.now}</span> full day{run.now === 1 ? "" : "s"} in a row</span>
              <span>Best <span className="m">{run.best}</span></span>
            </>}
        </div>
      </div>

      {(showSteps || showSleep) && (
        <div className={t.body}>
          {showSteps && (
            <StatPill compact domain="activity" icon="walk" label="Steps" fill={stepsK === null ? null : stepsK / Math.max(1, settings.goals.steps)}
              value={stepsK === null ? "Not synced yet" : fmt(stepsK)} dim={stepsK === null}
              ariaLabel={`Steps: ${stepsK === null ? "not synced yet" : fmt(stepsK)}, goal ${fmt(settings.goals.steps)}. Opens your steps`}
              onClick={() => { haptic(); setStepsSheet(true); }} />
          )}
          {showSleep && (journal.vault !== "open"
            ? <StatPill compact domain="journal" icon="moon" label={isToday ? "Last night" : "Sleep"} fill={null} dim value={journal.vault === "checking" ? "…" : "Unlock to see"}
                ariaLabel="Sleep: unlock your vault to see it" onClick={journal.openVault} />
            : <StatPill compact domain="journal" icon="moon" label={isToday ? "Last night" : "Sleep"} fill={nightK ? nightK.asleep / settings.sleepGoal : null}
                value={nightK ? hm(nightK.asleep) : health.nights === null ? "…" : "Not synced yet"} dim={!nightK}
                ariaLabel={nightK ? `Sleep: ${hm(nightK.asleep)}, goal ${hm(settings.sleepGoal)}. Opens sleep` : "Sleep: nothing synced yet. Opens sleep"}
                onClick={() => { haptic(); setSleepSheet(true); }} />)}
        </div>
      )}

      {/* A finding from Insights being tried for three days: one slim row, on today only. */}
      {isToday && <ExperimentToday />}

      {unsaved && (
        <div className={a.unsaved} role="alert">
          <span>Some changes are not saved yet.</span>
          <Button size="sm" variant="secondary" onClick={retry}>Retry</Button>
        </div>
      )}

      <div className={t.bento}>
        {/* Weight comes first: it is the one task with a right time of day, before anything is eaten. */}
        <button type="button" className={`${tile(st.weight !== null, false, false, "weight")} ${t.hit}`} style={hue("food")} onClick={() => setWeightSheet(true)}
          aria-label={isToday ? "Log today’s weight" : `Log weight for ${longDay(view)}`}>
          <span className={t.tint} /><span className={t.sweep} />
          <span className={t.th}><Medallion domain="food" icon="scale" state={st.weight !== null ? "done" : "idle"} /><span className="eb">Weight</span></span>
          {weightShown !== null
            ? <span className={`${t.big} ${st.weight === null ? t.ghost : ""}`}><span className="dc">{weightShown}</span><span className={t.unit}>lb</span></span>
            : <span className={`d ${t.title}`}>Weigh in</span>}
          <span className={t.sub}>{nums(weightSub)}</span>
        </button>

        <button type="button" className={`${tile(st.checkinDone, false, false, "checkin")} ${t.hit}`} style={hue("journal")} onClick={() => setCheckinSheet(true)}
          aria-label={st.checkinDone ? `Check-in: ${checkin!.mood}. Change it` : "Check in"}>
          <span className={t.tint} /><span className={t.sweep} />
          <span className={t.th}><Medallion domain="journal" icon="heart" state={st.checkinDone ? "done" : "idle"} /><span className="eb">Check-in{optional("checkin")}</span></span>
          <span className={`d ${t.title}`}>{st.checkinDone ? checkin!.mood : "How's today?"}</span>
          <span className={t.sub}>{st.checkinDone ? nums([...habitsOn, ...countsOn].join(" · ") || "No habits ticked") : "Mood and habits, ten seconds"}</span>
        </button>

        {/* The Journal card is the record button: no floating mic on Today. The mood picked above rides along. */}
        <div className={tile(st.journalDone, true, recording, "journal")} style={hue("journal")}>
          <span className={t.tint} /><span className={t.sweep} />
          <button type="button" className={t.hit} onClick={() => { haptic(); journal.toggleRecording(checkin?.mood ?? null, isToday ? undefined : k); }}
            aria-label={recording ? "Stop recording" : isToday ? "Record a journal entry" : `Record a journal entry for ${longDay(view)}`}>
            <span className={t.row}>
              <span className={t.grow}>
                <span className={t.th}><Medallion domain="journal" icon="mic" state={recording ? "rec" : st.journalDone ? "done" : "idle"} /><span className="eb">Journal{optional("journal")}</span></span>
                <span className={`d ${t.title} ${recording ? `m ${t.recTime}` : ""}`}>{journalTitle}</span>
                <span className={t.sub}>{journalSub}</span>
              </span>
              <span className={`${t.act} ${recording ? t.actRec : ""}`}><Icon name={recording ? "pause" : journal.vault === "open" ? "mic" : "lock"} size={24} strokeWidth={2} /></span>
            </span>
          </button>
          {!recording && ((!isToday && journal.vault === "open") || st.journalDone) && (
            <div className={t.links}>
              {!isToday && journal.vault === "open" && <button type="button" className={t.link} onClick={() => setWriting(true)}>Write instead</button>}
              {st.journalDone && isToday && <button type="button" className={t.link} onClick={() => goTab("journal")}>Open journal</button>}
            </div>
          )}
        </div>

        <div className={tile(st.foodDone, true, listening, "food")} style={hue("food")}>
          <span className={t.tint} /><span className={t.sweep} />
          {(() => {
            const inner = (
              <>
                <span className={t.row}>
                  <span className={t.grow}>
                    <span className={t.th}><Medallion domain="food" icon={listening ? "mic" : "leaf"} state={foodState} /><span className="eb">Food{optional("food")}</span></span>
                    {/* The day's kcal is a hero number like the weight and the push-ups; words and the timer stay titles. */}
                    {!listening && st.meals
                      ? <span className={t.big}><span className="dc">{fmt(st.kcal)}</span><span className={t.unit}>kcal</span></span>
                      : <span className={`d ${t.title} ${listening ? `m ${t.recTime}` : ""}`}>{listening ? mmss(voice.seconds) : sayFood ? "Say what you ate" : "Four meals"}</span>}
                    <span className={t.sub}>{nums(sayFood ? foodLine : foodSub)}</span>
                  </span>
                  {sayFood && <span className={`${t.act} ${listening ? t.actRec : ""}`}><Icon name={listening ? "pause" : "mic"} size={24} strokeWidth={2} /></span>}
                </span>
                {kcalSet && <span className={t.bar}><i style={{ width: `${Math.min(100, (st.kcal / Math.max(1, settings.goals.kcal)) * 100).toFixed(1)}%` }} /></span>}
              </>
            );
            return sayFood
              ? <button type="button" className={t.hit} onClick={() => void tapFood()}
                aria-label={listening ? "Stop and log what you ate" : isToday ? "Say what you ate today" : `Say what you ate on ${longDay(view)}`}>{inner}</button>
              : <div className={t.hit}>{inner}</div>;
          })()}
          {/* The meal taps are their own: they never start a recording. */}
          <div className={t.toggles}>
            {MEALS.map((m) => (
              <button key={m} type="button" className={`${t.toggle} ${eaten[m] ? t.toggleOn : ""}`} aria-pressed={Boolean(eaten[m])}
                aria-label={`${cap(m)}: ${settings.plan[m]?.name ?? (eaten[m] ? "eaten" : "say what it was")}`} onClick={() => tapMeal(m)}>
                <Icon name={m} size={18} /><span>{cap(m)}</span>
              </button>
            ))}
          </div>
        </div>

        {main && mainAt && mainLogged ? (
          <div className={tile(st.activityDone, true, false, "activity")} style={hue("activity")}>
            <span className={t.tint} /><span className={t.sweep} />
            <button type="button" className={t.hit} onClick={() => setMoveSheet(null)}
              aria-label={`${main.name}: ${amountText(main, mainLogged)}${main.unit === "session" || rest ? "" : `, goal ${goalText(mainAt)}`}. Log it`}>
              <span className={t.th}><Medallion domain="activity" icon={moveIcon(main)} state={st.activityDone ? "done" : "idle"} /><span className="eb">Activity · {main.name}{optional("activity")}</span></span>
              {/* The goal is mono, like Food's "/ 2,100 kcal"; a session is done or not, in words. */}
              {main.unit === "session"
                ? <span className={t.big}><span className={`d ${t.roll}`} style={{ fontSize: 30 }}>{mainLogged.done ? "Done" : "Not yet"}</span><span className={t.unit}>{mainLogged.done ? "today" : "a session"}</span></span>
                : <span className={t.big}>
                  <span key={mainLogged.n ?? 0} className={`dc ${t.roll}`}>{num(mainLogged.n ?? 0, mainLogged.u ?? main.unit)}</span>
                  <span className={`m ${t.unit}`}>{mainLogged.u && mainLogged.u !== main.unit ? unitWord(mainLogged.u) : rest ? `${main.key === "pushups" ? "push-ups" : unitWord(main.unit)} · rest day` : `/ ${goalText(mainAt)}`}</span>
                </span>}
              <span className={t.sub}>{nums(actSub)}</span>
              {main.unit !== "session" && !rest && mainProgress !== null && <span className={t.bar}><i style={{ width: `${(mainProgress * 100).toFixed(1)}%` }} /></span>}
            </button>
            <div className={t.toggles}>
              {others.slice(0, 3).map((x) => {
                const l = loggedOf(act, x);
                const label = x.key === "pushups" ? null : l.done && l.n !== null && x.unit !== "session" ? `${x.name} · ${num(l.n, l.u)}` : x.name;
                return x.key === "pushups"
                  ? <button key={x.key} type="button" className={`${t.toggle} ${l.done ? t.toggleOn : ""}`} aria-label={`Add ten push-ups${l.n ? `, ${l.n} so far` : ""}`} onClick={() => quickTap(x)}>
                    <span className="dc">+10</span><span>{l.n ? `Push-ups · ${l.n}` : "Push-ups"}</span>
                  </button>
                  : <button key={x.key} type="button" className={`${t.toggle} ${l.done ? t.toggleOn : ""}`} aria-pressed={x.unit === "session" || x.unit === "min" ? l.done : undefined}
                    aria-label={x.unit === "session" || x.unit === "min" ? `${x.name}${l.done ? `, ${amountText(x, l)}` : ""}` : `${x.name}: log it`} onClick={() => quickTap(x)}>
                    <Icon name={moveIcon(x)} size={18} /><span>{label}</span>
                  </button>;
              })}
              <button type="button" className={t.toggle} aria-label="Log another move" onClick={() => { haptic(); setMoveSheet(others[3]?.key ?? OTHER_MOVE.key); }}>
                <Icon name="plus" size={18} /><span>{others.length > 3 ? "More" : "Other"}</span>
              </button>
            </div>
          </div>
        ) : (
          // Someone new: no moves yet. The card asks how they move, and the chooser opens from it.
          <div className={tile(st.activityDone, true, false, "activity")} style={hue("activity")}>
            <span className={t.tint} /><span className={t.sweep} />
            <button type="button" className={t.hit} onClick={() => { haptic(); setChooser(true); }} aria-label="Choose how you move">
              <span className={t.th}><Medallion domain="activity" icon="run" state={st.activityDone ? "done" : "idle"} /><span className="eb">Activity{optional("activity")}</span></span>
              <span className="d" style={{ fontSize: 22, lineHeight: 1.15 }}>How do you like to move?</span>
              <span className={t.sub}>Pick what you actually do: a walk, a run, yoga, push-ups. Any of them closes your day.</span>
            </button>
          </div>
        )}

        {/* From 6 pm the evening turns to the next day: the brief is one tap away. */}
        {isToday && hour >= 18 && <TomorrowCard />}
      </div>

      <Sheet open={checkinSheet} title={isToday ? "How's today?" : `Check-in · ${longDay(view)}`} onClose={closeCheckin}>
        <div className={t.moods} role="group" aria-label="Mood">
          {moods.map((m) => (
            <button key={m.id} type="button" aria-pressed={checkin?.mood === m.label} className={`${t.mood} ${checkin?.mood === m.label ? t.moodOn : ""}`} onClick={() => pickMood(m.label)}>
              <MoodFace id={m.id} /><span>{m.label}</span>
            </button>
          ))}
        </div>
        <div className={t.habits}>
          <span className="eb">Habits</span>
          <div className={a.chips} role="group" aria-label="Habits">
            {settings.habits.map((h) => h.type === "counter" ? (
              <Chip key={h.id} kind="habit" label={h.label} count={checkin?.counts[h.id] || 0} on={Boolean(checkin?.counts[h.id])}
                onClick={() => change("checkins", k, (d) => { d.checkin.counts[h.id] = ((d.checkin.counts[h.id] || 0) + 1) % 10; })} />
            ) : (
              <Chip key={h.id} kind="habit" label={h.label} on={Boolean(checkin?.habits[h.id])}
                onClick={() => change("checkins", k, (d) => { d.checkin.habits[h.id] = !d.checkin.habits[h.id]; })} />
            ))}
          </div>
        </div>
        {!st.checkinDone && <p className="muted" style={{ fontSize: 12 }}>Pick a mood to check in. Habits are optional.</p>}
        <Button block onClick={closeCheckin}>Done</Button>
      </Sheet>
      <WeightSheet open={weightSheet} onClose={closeWeight} current={st.weight} last={lastWeight} onSave={saveWeight} />
      <MealSheet meal={mealSheet} onClose={closeMealSheet} known={mealSheet ? knownFromDays(map, settings) : []} estimateOn={settings.foodEstimate}
        closes={mealSheet !== null && st.leftMeals.length === 1 && st.leftMeals[0] === mealSheet} onLog={logMeal} />
      <SleepSheet open={sleepSheet} onClose={closeSleep} day={k} isToday={isToday} />
      <StepsSheet open={stepsSheet} onClose={closeSteps} day={k} />
      <MoveSheet open={moveSheet !== false} onClose={closeMove} moves={moves} start={moveSheet || null} activity={act} goalFor={goalOf}
        round={roundDay.round ? { name: roundDay.round.name, kind: roundDay.kind } : null} onSave={saveMove}
        day={isToday ? undefined : longDay(view)} late={lateForRound} />
      <Sheet open={chooser} title="Your moves" onClose={closeChooser}>
        {chooser && <MovesChooser first say={say} onSaved={closeChooser} />}
      </Sheet>
      <WriteSheet open={writing} day={longDay(view)} onClose={() => setWriting(false)}
        onSave={async (text) => {
          try { await journal.writeEntry(text, checkin?.mood ?? null, k); setWriting(false); return null; }
          catch (e) { report("journal", "backfill_write_failed", e); return "Couldn’t save that entry. Try again."; }
        }} />
      {(listening || voice.state === "transcribing" || reading || (said && said.items.length > 0)) && (
        <Overlay>
          <FoodMoment phase={listening ? "listening" : voice.state === "transcribing" ? "transcribing" : reading ? "reading" : "done"}
            seconds={voice.seconds} heard={said?.heard ?? null} items={said?.items ?? []} onStop={() => void tapFood()} onClose={() => setSaid(null)} levels={voice.levels} />
        </Overlay>
      )}
      {celebrate && (
        <Overlay>
          <DayClosed streak={run.now} beads={st.ring.map((r) => ({ key: r.key, value: 1, ...bead(r.key) }))}
            week={[6, 5, 4, 3, 2, 1, 0].map((i) => { const d = addDays(today, -i); return { label: WEEKDAYS[d.getDay()].charAt(0), full: dayStatus(days[dayKey(d)], settings).closed }; })}
            onClose={() => { setCelebrate(false); say(`${run.now} full day${run.now === 1 ? "" : "s"} in a row`); }} />
        </Overlay>
      )}
      <Toast message={toast} />
    </div>
  );
}

/** Writing a journal entry for a past day: plain text, filed under that day and marked added later. */
function WriteSheet({ open, day, onClose, onSave }: { open: boolean; day: string; onClose: () => void; onSave: (text: string) => Promise<string | null> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open={open} title={`Journal for ${day}`} onClose={onClose}>
      <div className={a.vaultForm}>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Encrypted like every entry. It is filed under that day and marked added later.</p>
        <textarea className={a.writeBox} aria-label="Journal entry" value={text} maxLength={5000} rows={7} onChange={(e) => setText(e.target.value)} placeholder="What happened that day?" />
        {error && <p role="alert" className={a.noteBad}>{error}</p>}
        <Button variant="journal" block disabled={!text.trim() || busy}
          onClick={async () => { setBusy(true); const err = await onSave(text); setBusy(false); setError(err); if (!err) setText(""); }}>{busy ? "Saving…" : "Save entry"}</Button>
      </div>
    </Sheet>
  );
}
