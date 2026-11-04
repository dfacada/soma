"use client";

// Today is the actionable screen: every daily task completes with a tap here (docs/HANDOFF.md).
// Soma Night (2026-11-02): a greeting, the orb (one bead per task, the sphere lit by what is done), the week strip,
// and a bento of task cards in card order: weight, check-in, journal, food, activity.
//
// Backfill: tap one of the six earlier days in the week strip and every card edits that day instead, under a header
// that says so. The streak and the round stay on today. On a past day the journal can also be written, not only
// recorded, and the entry is filed under that day marked "added later".

import { useGoTab } from "./tabs";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, Chip, DayGlyph, Icon, Medallion, Orb, Overlay, Sheet, StatPill, Toast, type IconName, type MedallionState, type OrbBead } from "@/components/ui";
import { MEALS } from "@/lib/settings";
import { hm } from "@/lib/sleep";
import { addDays, cap, dayKey, dayStatus, headline, streak, WEEKDAYS, type TaskKey } from "@/lib/today";
import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { longDay } from "./DayBanner";
import { FitbitBanner } from "./FitbitBanner";
import { useHealth } from "./Health";
import { SleepSheet } from "./Sleep";
import { clock } from "@/lib/journal";
import { useJournal } from "./Journal";
import { describeError, mmss, useSayRecorder } from "./FoodSay";
import { applySaid, describeFood, knownFromDays, saidLine, type Said } from "@/lib/food-say";
import { DayClosed, FoodMoment } from "./Moments";
import { MoodFace } from "./MoodFace";
import { PushSheet } from "./PushSheet";
import { TomorrowCard } from "./Tomorrow";
import { WeightSheet } from "./WeightSheet";
import { useRounds } from "./Rounds";
import { useSession } from "./Session";
import { useDays } from "./Days";
import a from "./app.module.css";
import t from "./today.module.css";

const fmt = (n: number) => n.toLocaleString("en-US");
const ACT_ICONS: Record<string, IconName> = { walk: "walk", gym: "barbell", run: "run" };
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

  const { map, error, reload, unsaved, retry, change, today, viewKey: k, view, isToday, setView, windowDays: WINDOW_DAYS } = useDays();
  const [writing, setWriting] = useState(false);
  const [checkinSheet, setCheckinSheet] = useState(false);
  const [pushSheet, setPushSheet] = useState(false);
  const [weightSheet, setWeightSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const say = useCallback((m: string, ms = 1800) => { setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), ms); }, []);
  // The Food card records like the Journal card: tap, say the day's food, tap again, and it is logged.
  // What went wrong shows as a toast for a few seconds; the card stays on the day's meals.
  const foodFailed = useCallback((m: string) => say(m, 4500), [say]);
  const voice = useSayRecorder(foodFailed);
  const [reading, setReading] = useState(false);

  const closePush = useCallback(() => setPushSheet(false), []);
  const closeWeight = useCallback(() => setWeightSheet(false), []);
  const closeCheckin = useCallback(() => setCheckinSheet(false), []);
  const health = useHealth();
  const [sleepSheet, setSleepSheet] = useState(false);
  const closeSleep = useCallback(() => setSleepSheet(false), []);

  // The server's count is from page load; the journal provider knows about entries recorded since, including
  // ones still waiting to upload. Whichever is higher is the truth for today.
  const entriesToday = Math.max(map?.[k]?.entries || 0, journal.countOn(k) || 0);
  // Cheap enough to recompute every render: one day's status and a 60-day walk.
  const days = map ? { ...map, [k]: { ...(map[k] || { entries: 0 }), entries: entriesToday } } : null;
  const st = dayStatus(days?.[k], settings);
  const run = days ? streak(days, settings, today, WINDOW_DAYS) : { now: 0, best: settings.bestStreak };

  // The celebration: once, when today goes from open to closed while Soma is open on it. Never on opening the app
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
  const types = data?.activity?.types || {};
  const hour = new Date().getHours();
  const head = headline(st, run.now, hour);
  // In a running round the target is the one I joined with; otherwise my own setting. Rest days have none.
  const forDay = rounds.forDay(k);
  const target = forDay.target;
  const rest = forDay.rest;
  // Push-ups count for the round only when logged within two days (the server decides; this is only for the words).
  const lateForRound = k < dayKey(addDays(today, -2));
  const when = isToday ? "today" : "that day";
  const initials = (displayName || me.email).split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const firstName = (displayName || "").trim().split(/\s+/)[0];

  // ── The greeting and the line under the orb ──
  const greet = hour < 5 || hour >= 17 ? "Good evening" : hour < 12 ? "Good morning" : "Good afternoon";
  const hello = !isToday ? longDay(view) : `${st.closed ? "That's the day" : greet}${firstName ? `,\n${firstName}` : ""}.`;
  const eyebrow = isToday ? new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" }) : "Filling in";
  const lede = !isToday
    ? (st.closed ? "Closed. Nothing left to fill in." : `${st.doneCount} of ${st.taskCount} done. Fill in what is missing.`)
    : st.closed ? head.sub
    : st.progress === 0 ? `${st.taskCount === 5 ? "Five" : "Four"} things close the day.`
    : head.todos.length === 1 ? `${head.todos[0].label} closes the day.`
    : `${head.todos.length} left to close the day.`;
  // Said after the lede when there is an Up next (below).
  const NEXT_LABEL: Record<TaskKey, string> = { weight: "your weight", checkin: "check in", journal: "your journal", food: "food", activity: "move" };
  const beads: OrbBead[] = st.ring.map((r) => ({ key: r.key, value: r.value, ...BEADS[r.key] }));

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
  const foodSub = st.foodDone
    ? `All four eaten · ${fmt(settings.goals.kcal)} kcal goal`
    : st.leftMeals.length === 1
      ? `${cap(st.leftMeals[0])} left: ${settings.plan[st.leftMeals[0]].name}`
      : `${st.leftMeals.length} meals left${sayFood ? " · tap to say what you ate" : ""}`;
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

  // ── Activity ──
  const actNames = [...(st.pushups > 0 ? ["push-ups"] : []), ...settings.activityTypes.filter((x) => types[x.key]).map((x) => x.name.toLowerCase())];
  const actSub = st.acts
    ? `Done · ${cap(actNames.join(", "))}${!rest && st.pushups >= target ? " · target hit" : ""}`
    : rest ? "Rest day for push-ups. Any activity closes it." : "Any activity closes it. Tap to count push-ups.";
  const savePushups = (n: number) => {
    change("activity", k, (d) => { d.activity.pushups = n; });
    haptic(n > 0 && !rest && n >= target && st.pushups < target ? "done" : "tap");
    setPushSheet(false);
    say(lateForRound && n ? `${n} push-ups saved to your record · too late to count for the round` : n >= target && !rest ? `Target hit · ${n} push-ups` : n ? `${n} push-ups logged` : "Push-ups cleared");
  };

  // ── Up next ──
  // One open task, picked by the time of day, glows and is the only one whose button rings; the rest stay quiet
  // (David, 2026-11-03: "a unique experience that's efficient"). Weight first thing, food through the day, the
  // journal in the evening. Only on today, and not while something is recording.
  const open: Record<TaskKey, boolean> = { weight: st.weightRequired && !st.weightDone, checkin: !st.checkinDone, journal: !st.journalDone, food: !st.foodDone, activity: !st.activityDone };
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
      {/* The date, the streak and Settings along the top; the greeting gets the full width under them. On an earlier
          day the streak gives way to the way back. */}
      <header className={t.top}>
        <div className={t.topRow}>
          <span className="eb">{eyebrow}</span>
          <div className={t.topRight}>
            {isToday
              ? <span className={t.streak} aria-label={`${run.now} full day${run.now === 1 ? "" : "s"} in a row`}>
                <Icon name="flame" size={17} /><span key={run.now} className={`m ${t.roll}`}>{run.now}</span>
              </span>
              : <button type="button" className={t.back} onClick={() => setView(null)}><Icon name="today" size={15} />Back to today</button>}
            <button type="button" className={t.avatar} aria-label="Settings" onClick={() => goTab("settings")}>{initials}</button>
          </div>
        </div>
        <h1 className={`d ${t.hello}`}>{hello}</h1>
      </header>

      <section className={t.hero} aria-label={isToday ? "Today's progress" : `Progress on ${longDay(view)}`}>
        <Orb beads={beads} progress={st.progress} closed={st.closed} label={`${st.doneCount} of ${st.taskCount} done`}>
          {st.closed
            ? <div className={t.closedMark}><Icon name="check" size={46} strokeWidth={2.2} /><span className="eb" style={{ color: "var(--ink)" }}>Day closed</span></div>
            : <>
              <div className={`dc ${t.count}`}><span key={st.doneCount} className={t.roll}>{st.doneCount}</span><small>/{st.taskCount}</small></div>
              <span className="eb">{isToday ? "done today" : "done that day"}</span>
            </>}
        </Orb>
        <p className={t.lede}>{lede}{next && head.todos.length > 1 && <> <span className={t.ledeNext}>Up next: {NEXT_LABEL[next]}.</span></>}</p>
        {head.todos.length > 0 && (
          <div className={t.todos}>
            {head.todos.map((x, i) => <span key={x.label} className={`${t.todo} ${todoKeys[i] === next ? t.todoNext : ""}`} style={{ "--c": x.color, animationDelay: `${0.3 + i * 0.06}s` } as CSSProperties}><i />{x.label}</span>)}
          </div>
        )}
      </section>

      <div className={t.week}>
        <div className={t.weekDays} role="group" aria-label="Pick a day to fill in">
          {[6, 5, 4, 3, 2, 1, 0].map((i) => {
            const d = addDays(today, -i);
            const dk = dayKey(d);
            const done = dk === k ? st.doneCount : dayStatus(days[dk], settings).doneCount;
            return (
              <button key={i} type="button" className={`${t.weekDay} ${i === 0 ? t.weekToday : ""} ${dk === k ? t.weekPicked : ""}`}
                aria-pressed={dk === k} aria-label={i === 0 ? "Today" : `Fill in ${longDay(d)}`} onClick={() => { haptic(); setView(i === 0 ? null : dk); }}>
                <DayGlyph done={done} total={st.taskCount} today={i === 0} />
                <span>{i === 0 ? "Today" : WEEKDAYS[d.getDay()]}</span>
              </button>
            );
          })}
        </div>
        <div className={t.weekLine}>
          <span><span className="m">{run.now}</span> full day{run.now === 1 ? "" : "s"} in a row</span>
          <span>Best <span className="m">{run.best}</span></span>
        </div>
      </div>

      {(showSteps || showSleep) && (
        <div className={t.body}>
          {showSteps && (
            <StatPill compact domain="activity" icon="walk" label="Steps" fill={stepsK === null ? null : stepsK / Math.max(1, settings.goals.steps)}
              value={stepsK === null ? "Not synced yet" : fmt(stepsK)} dim={stepsK === null}
              ariaLabel={`Steps: ${stepsK === null ? "not synced yet" : fmt(stepsK)}, goal ${fmt(settings.goals.steps)}. Opens Activity`}
              onClick={() => goTab("activity")} />
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
          <span className={t.sub}>{weightSub}</span>
        </button>

        <button type="button" className={`${tile(st.checkinDone, false, false, "checkin")} ${t.hit}`} style={hue("journal")} onClick={() => setCheckinSheet(true)}
          aria-label={st.checkinDone ? `Check-in: ${checkin!.mood}. Change it` : "Check in"}>
          <span className={t.tint} /><span className={t.sweep} />
          <span className={t.th}><Medallion domain="journal" icon="heart" state={st.checkinDone ? "done" : "idle"} /><span className="eb">Check-in</span></span>
          <span className={`d ${t.title}`}>{st.checkinDone ? checkin!.mood : "How's today?"}</span>
          <span className={t.sub}>{st.checkinDone ? ([...habitsOn, ...countsOn].join(" · ") || "No habits ticked") : "Mood and habits, ten seconds"}</span>
        </button>

        {/* The Journal card is the record button: no floating mic on Today. The mood picked above rides along. */}
        <div className={tile(st.journalDone, true, recording, "journal")} style={hue("journal")}>
          <span className={t.tint} /><span className={t.sweep} />
          <button type="button" className={t.hit} onClick={() => { haptic(); journal.toggleRecording(checkin?.mood ?? null, isToday ? undefined : k); }}
            aria-label={recording ? "Stop recording" : isToday ? "Record a journal entry" : `Record a journal entry for ${longDay(view)}`}>
            <span className={t.row}>
              <span className={t.grow}>
                <span className={t.th}><Medallion domain="journal" icon="mic" state={recording ? "rec" : st.journalDone ? "done" : "idle"} /><span className="eb">Journal</span></span>
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
                    <span className={t.th}><Medallion domain="food" icon={listening ? "mic" : "leaf"} state={foodState} /><span className="eb">Food</span></span>
                    <span className={`d ${t.title} ${listening ? `m ${t.recTime}` : ""}`}>{listening ? mmss(voice.seconds) : st.meals ? `${fmt(st.kcal)} kcal` : sayFood ? "Say what you ate" : "Four meals"}</span>
                    <span className={t.sub}>{sayFood ? foodLine : foodSub}</span>
                  </span>
                  {sayFood && <span className={`${t.act} ${listening ? t.actRec : ""}`}><Icon name={listening ? "pause" : "mic"} size={24} strokeWidth={2} /></span>}
                </span>
                <span className={t.bar}><i style={{ width: `${Math.min(100, (st.kcal / Math.max(1, settings.goals.kcal)) * 100).toFixed(1)}%` }} /></span>
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
              <button key={m} type="button" className={`${t.toggle} ${eaten[m] ? t.toggleOn : ""}`} aria-pressed={Boolean(eaten[m])} aria-label={`${cap(m)}: ${settings.plan[m].name}`}
                onClick={() => { haptic(!eaten[m] && st.leftMeals.length === 1 ? "done" : "tap"); change("day-logs", k, (d) => { d.log.meals[m] = d.log.meals[m] ? false : { ...settings.plan[m] }; }); }}>
                <Icon name={m} size={18} /><span>{cap(m)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={tile(st.activityDone, true, false, "activity")} style={hue("activity")}>
          <span className={t.tint} /><span className={t.sweep} />
          <button type="button" className={t.hit} onClick={() => setPushSheet(true)}
            aria-label={rest ? `Push-ups: rest day, ${st.pushups} logged` : `Push-ups: ${st.pushups} of ${target}. Count them`}>
            <span className={t.th}><Medallion domain="activity" icon="barbell" state={st.activityDone ? "done" : "idle"} /><span className="eb">Activity</span></span>
            <span className={t.big}><span key={st.pushups} className={`dc ${t.roll}`}>{st.pushups}</span><span className={t.unit}>{rest ? "push-ups · rest day" : `/ ${target} push-ups`}</span></span>
            <span className={t.sub}>{actSub}</span>
            {!rest && <span className={t.bar}><i style={{ width: `${Math.min(100, (st.pushups / Math.max(1, target)) * 100).toFixed(1)}%` }} /></span>}
          </button>
          <div className={t.toggles}>
            {/* Ten push-ups in one tap, without opening the counter: a set done between other things. */}
            <button type="button" className={t.toggle} aria-label="Add ten push-ups" onClick={() => savePushups(st.pushups + 10)}>
              <span className="dc">+10</span><span>Push-ups</span>
            </button>
            {settings.activityTypes.map((x) => (
              <button key={x.key} type="button" className={`${t.toggle} ${types[x.key] ? t.toggleOn : ""}`} aria-pressed={Boolean(types[x.key])} aria-label={x.name}
                onClick={() => { haptic(!types[x.key] && !st.activityDone ? "done" : "tap"); change("activity", k, (d) => { d.activity.types[x.key] = !d.activity.types[x.key]; }); }}>
                <Icon name={ACT_ICONS[x.key] || "pulse"} size={18} /><span>{x.name}</span>
              </button>
            ))}
          </div>
        </div>

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
        <span className="eb">Habits</span>
        <div className={t.chips} role="group" aria-label="Habits">
          {settings.habits.map((h) => h.type === "counter" ? (
            <Chip key={h.id} kind="habit" label={h.label} count={checkin?.counts[h.id] || 0} on={Boolean(checkin?.counts[h.id])}
              onClick={() => change("checkins", k, (d) => { d.checkin.counts[h.id] = ((d.checkin.counts[h.id] || 0) + 1) % 10; })} />
          ) : (
            <Chip key={h.id} kind="habit" label={h.label} on={Boolean(checkin?.habits[h.id])}
              onClick={() => change("checkins", k, (d) => { d.checkin.habits[h.id] = !d.checkin.habits[h.id]; })} />
          ))}
        </div>
        {!st.checkinDone && <p className="muted" style={{ fontSize: 12 }}>Pick a mood to check in. Habits are optional.</p>}
        <Button block onClick={closeCheckin}>Done</Button>
      </Sheet>
      <WeightSheet open={weightSheet} onClose={closeWeight} current={st.weight} last={lastWeight} onSave={saveWeight} />
      <SleepSheet open={sleepSheet} onClose={closeSleep} day={k} isToday={isToday} />
      <PushSheet open={pushSheet} onClose={closePush} current={st.pushups} target={target} rest={rest} dayNumber={forDay.dayNumber} onSave={savePushups}
        day={isToday ? undefined : longDay(view)} late={lateForRound} />
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
          <DayClosed streak={run.now} beads={st.ring.map((r) => ({ key: r.key, value: 1, ...BEADS[r.key] }))}
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
