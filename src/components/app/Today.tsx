"use client";

// Today is the actionable screen: every daily task completes with a tap here (docs/HANDOFF.md).
// Soma Night (2026-11-02): a greeting, the orb (one bead per task, the sphere lit by what is done), the week strip,
// and a bento of task cards in card order: weight, check-in, journal, food, activity.
//
// Backfill: tap one of the six earlier days in the week strip and every card edits that day instead, under a bar
// that says so. The streak and the round stay on today. On a past day the journal can also be written, not only
// recorded, and the entry is filed under that day marked "added later".

import { useGoTab } from "./tabs";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, Chip, DayGlyph, Icon, Medallion, Orb, Sheet, Toast, useTabVisible, type IconName, type MedallionState, type OrbBead } from "@/components/ui";
import { MEALS } from "@/lib/settings";
import { addDays, cap, dayKey, dayStatus, headline, streak, WEEKDAYS, type TaskKey } from "@/lib/today";
import { report } from "@/lib/log";
import { DayBanner, longDay } from "./DayBanner";
import { FitbitBanner } from "./FitbitBanner";
import { clock } from "@/lib/journal";
import { useJournal } from "./Journal";
import { describeError, mmss, useSayRecorder } from "./FoodSay";
import { applySaid, describeFood, knownFromDays, saidLine, type Said } from "@/lib/food-say";
import { DayClosed, FoodMoment } from "./Moments";
import { MoodFace } from "./MoodFace";
import { PushSheet } from "./PushSheet";
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

  // Each time Today comes back into view its blocks rise in again: the class flips between two copies of the same
  // animation, which restarts it. Adjusted during render, so no effect sets state.
  const visible = useTabVisible();
  const [shown, setShown] = useState({ visible, n: 0 });
  if (shown.visible !== visible) setShown({ visible, n: visible ? shown.n + 1 : shown.n });

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
    : st.progress === 0 ? `${st.taskCount === 5 ? "Five" : "Four"} things close the day. Start anywhere.`
    : head.todos.length === 1 ? `${head.todos[0].label} closes the day.`
    : `${head.todos.length} left to close the day.`;
  const beads: OrbBead[] = st.ring.map((r) => ({ key: r.key, value: r.value, ...BEADS[r.key] }));

  // ── Check-in ──
  const moods = settings.moods.filter((m) => m.on);
  const habitsOn = settings.habits.filter((h) => h.type === "daily" && checkin?.habits[h.id]).map((h) => h.label);
  const countsOn = settings.habits.filter((h) => h.type === "counter" && checkin?.counts[h.id]).map((h) => `${h.label} ×${checkin?.counts[h.id]}`);
  const pickMood = (label: string) => {
    const clearing = checkin?.mood === label;
    change("checkins", k, (d) => { d.checkin.mood = clearing ? null : label; });
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
    setPushSheet(false);
    say(lateForRound && n ? `${n} push-ups saved to your record · too late to count for the round` : n >= target && !rest ? `Target hit · ${n} push-ups` : n ? `${n} push-ups logged` : "Push-ups cleared");
  };

  const hue = (d: "journal" | "food" | "activity") => ({ "--hue": `var(--${d})` }) as CSSProperties;
  const tile = (done: boolean, wide = false, rec = false) =>
    `${t.tile} ${wide ? t.wide : ""} ${done ? t.tileDone : ""} ${rec ? t.tileRec : ""}`;

  return (
    <div className={`${a.page} ${t.enter} ${shown.n % 2 ? "" : t.enterB}`}>
      <FitbitBanner />
      <header className={t.top}>
        <div>
          <div className="eb">{eyebrow}</div>
          <h1 className={`d ${t.hello}`}>{hello}</h1>
        </div>
        <div className={t.topRight}>
          <span className={t.streak} aria-label={`${run.now} full day${run.now === 1 ? "" : "s"} in a row`}>
            <Icon name="flame" size={17} /><span key={run.now} className={`m ${t.roll}`}>{run.now}</span>
          </span>
          <button type="button" className={t.avatar} aria-label="Settings" onClick={() => goTab("settings")}>{initials}</button>
        </div>
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
        <p className={t.lede}>{lede}</p>
        {head.todos.length > 0 && (
          <div className={t.todos}>
            {head.todos.map((x, i) => <span key={x.label} className={t.todo} style={{ "--c": x.color, animationDelay: `${0.3 + i * 0.06}s` } as CSSProperties}><i />{x.label}</span>)}
          </div>
        )}
      </section>

      <div>
        <div className={t.week} role="group" aria-label="Pick a day to fill in">
          {[6, 5, 4, 3, 2, 1, 0].map((i) => {
            const d = addDays(today, -i);
            const dk = dayKey(d);
            const done = dk === k ? st.doneCount : dayStatus(days[dk], settings).doneCount;
            return (
              <button key={i} type="button" className={`${t.weekDay} ${i === 0 ? t.weekToday : ""} ${dk === k ? t.weekPicked : ""}`}
                aria-pressed={dk === k} aria-label={i === 0 ? "Today" : `Fill in ${longDay(d)}`} onClick={() => setView(i === 0 ? null : dk)}>
                <DayGlyph done={done} total={st.taskCount} today={i === 0} />
                <span>{i === 0 ? "Today" : WEEKDAYS[d.getDay()]}</span>
              </button>
            );
          })}
        </div>
        <div className={t.weekLine} style={{ paddingTop: 8 }}>
          <span><span className="m">{run.now}</span> full day{run.now === 1 ? "" : "s"} in a row</span>
          <span>Best <span className="m">{run.best}</span></span>
        </div>
      </div>

      {!isToday && <DayBanner view={view} onBack={() => setView(null)} />}

      {unsaved && (
        <div className={a.unsaved} role="alert">
          <span>Some changes are not saved yet.</span>
          <Button size="sm" variant="secondary" onClick={retry}>Retry</Button>
        </div>
      )}

      <div className={t.bento}>
        {/* Weight comes first: it is the one task with a right time of day, before anything is eaten. */}
        <button type="button" className={`${tile(st.weight !== null)} ${t.hit}`} style={hue("food")} onClick={() => setWeightSheet(true)}
          aria-label={isToday ? "Log today’s weight" : `Log weight for ${longDay(view)}`}>
          <span className={t.tint} /><span className={t.sweep} />
          <span className={t.th}><Medallion domain="food" icon="scale" state={st.weight !== null ? "done" : "idle"} /><span className="eb">Weight</span></span>
          <span className={`${t.big} ${st.weight === null ? t.ghost : ""}`}><span className="dc">{weightShown ?? "—"}</span>{weightShown !== null && <span className={t.unit}>lb</span>}</span>
          <span className={t.sub}>{weightSub}</span>
        </button>

        <button type="button" className={`${tile(st.checkinDone)} ${t.hit}`} style={hue("journal")} onClick={() => setCheckinSheet(true)}
          aria-label={st.checkinDone ? `Check-in: ${checkin!.mood}. Change it` : "Check in"}>
          <span className={t.tint} /><span className={t.sweep} />
          <span className={t.th}><Medallion domain="journal" icon="heart" state={st.checkinDone ? "done" : "idle"} /><span className="eb">Check-in</span></span>
          <span className={`d ${t.title}`}>{st.checkinDone ? checkin!.mood : "How's today?"}</span>
          <span className={t.sub}>{st.checkinDone ? ([...habitsOn, ...countsOn].join(" · ") || "No habits ticked") : "Mood and habits, ten seconds"}</span>
        </button>

        {/* The Journal card is the record button: no floating mic on Today. The mood picked above rides along. */}
        <div className={tile(st.journalDone, true, recording)} style={hue("journal")}>
          <span className={t.tint} /><span className={t.sweep} />
          <button type="button" className={t.hit} onClick={() => journal.toggleRecording(checkin?.mood ?? null, isToday ? undefined : k)}
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

        <div className={tile(st.foodDone, true, listening)} style={hue("food")}>
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
                onClick={() => change("day-logs", k, (d) => { d.log.meals[m] = d.log.meals[m] ? false : { ...settings.plan[m] }; })}>
                <Icon name={m} size={18} /><span>{cap(m)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={tile(st.activityDone, true)} style={hue("activity")}>
          <span className={t.tint} /><span className={t.sweep} />
          <button type="button" className={t.hit} onClick={() => setPushSheet(true)}
            aria-label={rest ? `Push-ups: rest day, ${st.pushups} logged` : `Push-ups: ${st.pushups} of ${target}. Count them`}>
            <span className={t.th}><Medallion domain="activity" icon="barbell" state={st.activityDone ? "done" : "idle"} /><span className="eb">Activity</span></span>
            <span className={t.big}><span key={st.pushups} className={`dc ${t.roll}`}>{st.pushups}</span><span className={t.unit}>{rest ? "push-ups · rest day" : `/ ${target} push-ups`}</span></span>
            <span className={t.sub}>{actSub}</span>
            {!rest && <span className={t.bar}><i style={{ width: `${Math.min(100, (st.pushups / Math.max(1, target)) * 100).toFixed(1)}%` }} /></span>}
          </button>
          <div className={t.toggles}>
            {settings.activityTypes.map((x) => (
              <button key={x.key} type="button" className={`${t.toggle} ${types[x.key] ? t.toggleOn : ""}`} aria-pressed={Boolean(types[x.key])} aria-label={x.name}
                onClick={() => change("activity", k, (d) => { d.activity.types[x.key] = !d.activity.types[x.key]; })}>
                <Icon name={ACT_ICONS[x.key] || "pulse"} size={18} /><span>{x.name}</span>
              </button>
            ))}
          </div>
        </div>
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
      <PushSheet open={pushSheet} onClose={closePush} current={st.pushups} target={target} rest={rest} dayNumber={forDay.dayNumber} onSave={savePushups}
        day={isToday ? undefined : longDay(view)} late={lateForRound} />
      <WriteSheet open={writing} day={longDay(view)} onClose={() => setWriting(false)}
        onSave={async (text) => {
          try { await journal.writeEntry(text, checkin?.mood ?? null, k); setWriting(false); return null; }
          catch (e) { report("journal", "backfill_write_failed", e); return "Couldn’t save that entry. Try again."; }
        }} />
      {(listening || voice.state === "transcribing" || reading || (said && said.items.length > 0)) && (
        <FoodMoment phase={listening ? "listening" : voice.state === "transcribing" ? "transcribing" : reading ? "reading" : "done"}
          seconds={voice.seconds} heard={said?.heard ?? null} items={said?.items ?? []} onStop={() => void tapFood()} onClose={() => setSaid(null)} />
      )}
      {celebrate && (
        <DayClosed streak={run.now} beads={st.ring.map((r) => ({ key: r.key, value: 1, ...BEADS[r.key] }))}
          week={[6, 5, 4, 3, 2, 1, 0].map((i) => { const d = addDays(today, -i); return { label: WEEKDAYS[d.getDay()].charAt(0), full: dayStatus(days[dayKey(d)], settings).closed }; })}
          onClose={() => { setCelebrate(false); say(`${run.now} full day${run.now === 1 ? "" : "s"} in a row`); }} />
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
