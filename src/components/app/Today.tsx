"use client";

// Today is the actionable screen: every daily task completes with a tap here (docs/HANDOFF.md).
// Structure and copy follow the prototype's viewToday.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Chip, DayGlyph, DayRing, Medallion, Mini, RowHead, Toast, type IconName, type MedallionState } from "@/components/ui";
import { MEALS } from "@/lib/settings";
import { addDays, cap, dayKey, dayStatus, headline, streak, WEEKDAYS } from "@/lib/today";
import { clock } from "@/lib/journal";
import { useJournal } from "./Journal";
import { PushSheet } from "./PushSheet";
import { WeightSheet } from "./WeightSheet";
import { useRounds } from "./Rounds";
import { useSession } from "./Session";
import { useDays } from "./Days";
import a from "./app.module.css";

const fmt = (n: number) => n.toLocaleString("en-US");
const ACT_ICONS: Record<string, IconName> = { walk: "walk", gym: "barbell", run: "run" };

export function Today() {
  const router = useRouter();
  const { settings, displayName, me, saveSettings } = useSession();
  const journal = useJournal();
  const rounds = useRounds();

  const { map, error, reload, unsaved, retry, change, today, todayKey: k, windowDays: WINDOW_DAYS } = useDays();
  const [checkinOpen, setCheckinOpen] = useState<boolean | null>(null);
  const [pushSheet, setPushSheet] = useState(false);
  const [weightSheet, setWeightSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const say = useCallback((m: string) => { setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 1800); }, []);

  const closePush = useCallback(() => setPushSheet(false), []);
  const closeWeight = useCallback(() => setWeightSheet(false), []);

  // The server's count is from page load; the journal provider knows about entries recorded since, including
  // ones still waiting to upload. Whichever is higher is the truth for today.
  const entriesToday = Math.max(map?.[k]?.entries || 0, journal.countOn(k) || 0);
  // Cheap enough to recompute every render: one day's status and a 60-day walk.
  const days = map ? { ...map, [k]: { ...(map[k] || { entries: 0 }), entries: entriesToday } } : null;
  const st = dayStatus(days?.[k], settings);
  const run = days ? streak(days, settings, today, WINDOW_DAYS) : { now: 0, best: settings.bestStreak };

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
  const head = headline(st, run.now, new Date().getHours());
  // In a running round the target is the one I joined with; otherwise my own setting. Rest days have none.
  const target = rounds.target;
  const rest = rounds.restToday;
  const initials = (displayName || me.email).split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  // ── Check-in ──
  const moods = settings.moods.filter((m) => m.on);
  const open = checkinOpen === null ? !st.checkinDone : checkinOpen;
  const habitsOn = settings.habits.filter((h) => h.type === "daily" && checkin?.habits[h.id]).map((h) => h.label);
  const countsOn = settings.habits.filter((h) => h.type === "counter" && checkin?.counts[h.id]).map((h) => `${h.label} ×${checkin?.counts[h.id]}`);
  const checkinSub = st.checkinDone
    ? `Feeling ${checkin!.mood!.toLowerCase()}${habitsOn.length || countsOn.length ? " · " + [...habitsOn, ...countsOn].join(", ") : ""}`
    : "How's today?";

  const pickMood = (label: string) => {
    const clearing = checkin?.mood === label;
    change("checkins", k, (d) => { d.checkin.mood = clearing ? null : label; });
    setCheckinOpen(clearing);
    if (!clearing) say(`Checked in: ${label}`);
  };

  // ── Journal ──
  const journalSub = journal.recording
    ? "Listening. Tap again when you are done."
    : journal.vault === "none"
      ? "Tap to make your vault, then record."
      : journal.vault === "locked"
        ? (st.journalDone ? `${entriesToday} entr${entriesToday === 1 ? "y" : "ies"} today · unlock to add another` : "Tap to unlock your vault and record.")
        : st.journalDone
          ? `${entriesToday} entr${entriesToday === 1 ? "y" : "ies"} today · tap to add another`
          : "Tap here to record. Two minutes is plenty.";

  // ── Food ──
  const foodSub = st.foodDone
    ? `${fmt(st.kcal)} of ${fmt(settings.goals.kcal)} kcal · all four eaten`
    : st.leftMeals.length === 1
      ? `${cap(st.leftMeals[0])} left: ${settings.plan[st.leftMeals[0]].name} · ${fmt(st.kcal)} kcal so far`
      : `${st.leftMeals.length} meals left · ${fmt(st.kcal)} kcal so far`;
  const foodState: MedallionState = st.foodDone ? "done" : st.meals ? "part" : "idle";

  // ── Weight ──
  // The most recent weight before today, for the one-tap "same as last" and the change since.
  let lastWeight: number | null = null;
  for (let i = 1; i <= WINDOW_DAYS && lastWeight === null; i++) lastWeight = days[dayKey(addDays(today, -i))]?.weight ?? null;
  const weightSub = st.weight !== null
    ? `${st.weight} lb${lastWeight === null ? "" : st.weight === lastWeight ? " · same as last" : ` · ${st.weight < lastWeight ? "↓" : "↑"}${Math.abs(st.weight - lastWeight).toFixed(1)} since last`}`
    : lastWeight !== null ? `Last ${lastWeight} lb · tap to log today` : "Tap to log today’s weight.";
  const saveWeight = (v: number | null) => {
    change("weight", k, (d) => { d.weight.value = v; });
    setWeightSheet(false);
    say(v === null ? "Weight cleared" : `Weight logged · ${v} lb`);
  };

  // ── Activity ──
  const pushLine = rest ? (st.pushups > 0 ? `${st.pushups} push-ups on a rest day` : "rest day for push-ups") : st.pushups >= target ? `${st.pushups} push-ups, target hit` : st.pushups > 0 ? `${st.pushups} of ${target} push-ups` : `${target} push-ups to do`;
  const actSub = `${st.acts ? `${st.acts} of ${st.actTotal} logged` : "Nothing yet"} · ${pushLine}`;
  const actState: MedallionState = st.acts === st.actTotal ? "done" : st.acts ? "part" : "idle";

  const savePushups = (n: number) => {
    change("activity", k, (d) => { d.activity.pushups = n; });
    setPushSheet(false);
    say(n >= target && !rest ? `Target hit · ${n} push-ups` : n ? `${n} push-ups logged` : "Push-ups cleared");
  };

  return (
    <div className={a.page}>
      <section className={`${a.hero} ${st.closed ? a.heroClosed : ""}`} aria-label="Today's progress">
        <div className={a.heroTop}>
          <span className="d" style={{ fontSize: 17, letterSpacing: "0.02em" }}>Soma</span>
          <button type="button" className={a.avatar} aria-label="Settings" onClick={() => router.push("/settings/")}>{initials}</button>
        </div>
        <div className={a.heroMain}>
          <div className={a.ringWrap}>
            <DayRing segments={st.ring} closed={st.closed} />
            <div className={a.ringLabel}>
              <span className="d" style={{ fontSize: 30 }}>{st.closed ? `${st.taskCount}/${st.taskCount}` : `${Math.round(st.progress * 100)}%`}</span>
              <span className={`m ${a.heroMuted}`} style={{ fontSize: 10, marginTop: 4 }}>{st.closed ? "closed" : "of the day"}</span>
            </div>
          </div>
          <div className={a.heroText}>
            <span className="d" style={{ fontSize: 26 }}>{head.big}</span>
            <span className={a.heroMuted} style={{ fontSize: 13, lineHeight: 1.4 }}>{head.sub}</span>
            {head.todos.length > 0 && (
              <div className={a.todos}>
                {head.todos.map((t) => <span key={t.label} className={a.todo}><i style={{ background: t.color }} />{t.label}</span>)}
              </div>
            )}
          </div>
        </div>
        <div className={a.heroFoot}>
          <div className={a.streakRow}>
            <span style={{ fontSize: 14 }}><span className="d" style={{ fontSize: 22 }}>{run.now}</span> <span className={a.heroMuted}>full day{run.now === 1 ? "" : "s"} in a row</span></span>
            <span className={a.heroMuted} style={{ fontSize: 12 }}>Best <span className="m">{run.best}</span></span>
          </div>
          <div className={a.week}>
            {[6, 5, 4, 3, 2, 1, 0].map((i) => {
              const d = addDays(today, -i);
              const done = i === 0 ? st.doneCount : dayStatus(days[dayKey(d)], settings).doneCount;
              return (
                <div key={i} className={`${a.weekDay} ${i === 0 ? a.weekToday : ""}`}>
                  <DayGlyph done={done} total={st.taskCount} today={i === 0} />
                  <span>{i === 0 ? "Today" : WEEKDAYS[d.getDay()]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {unsaved && (
        <div className={a.unsaved} role="alert">
          <span>Some changes are not saved yet.</span>
          <Button size="sm" variant="secondary" onClick={retry}>Retry</Button>
        </div>
      )}

      {/* Weight comes first: it is the one task with a right time of day, before anything is eaten. */}
      <Card onClick={() => setWeightSheet(true)} aria-label="Log today’s weight">
        <RowHead
          lead={<Medallion domain="food" icon="scale" state={st.weight !== null ? "done" : "idle"} />}
          title="Weight"
          sub={weightSub}
          trail={<span className={a.lnk} style={st.weight === null ? { color: "var(--food)" } : undefined}>{st.weight !== null ? "Change" : "Log"}</span>}
        />
      </Card>

      <Card>
        <RowHead
          lead={<Medallion domain="journal" icon="heart" state={st.checkinDone ? "done" : "idle"} />}
          title="Check-in"
          sub={checkinSub}
          trail={st.checkinDone ? <button type="button" className={a.lnk} onClick={() => setCheckinOpen(!open)}>{open ? "Done" : "Change"}</button> : undefined}
        />
        {open && (
          <div className={a.checkin}>
            <div className={a.chips} role="group" aria-label="Mood">
              {moods.map((m) => <Chip key={m.id} label={m.label} on={checkin?.mood === m.label} onClick={() => pickMood(m.label)} />)}
            </div>
            <div className={a.chips} role="group" aria-label="Habits">
              {settings.habits.map((h) => h.type === "counter" ? (
                <Chip key={h.id} kind="habit" label={h.label} count={checkin?.counts[h.id] || 0} on={Boolean(checkin?.counts[h.id])}
                  onClick={() => change("checkins", k, (d) => { d.checkin.counts[h.id] = ((d.checkin.counts[h.id] || 0) + 1) % 10; })} />
              ) : (
                <Chip key={h.id} kind="habit" label={h.label} on={Boolean(checkin?.habits[h.id])}
                  onClick={() => change("checkins", k, (d) => { d.checkin.habits[h.id] = !d.checkin.habits[h.id]; })} />
              ))}
            </div>
            {!st.checkinDone && <p className="muted" style={{ fontSize: 12 }}>Pick a mood to check in. Habits are optional.</p>}
          </div>
        )}
      </Card>

      {/* The Journal card is the record button: no floating mic on Today. The mood picked above rides along. */}
      <Card recording={journal.recording} onClick={() => journal.toggleRecording(checkin?.mood ?? null)} aria-label={journal.recording ? "Stop recording" : "Record a journal entry"}>
        <RowHead
          lead={<Medallion domain="journal" icon="mic" state={journal.recording ? "rec" : st.journalDone ? "done" : "idle"} />}
          title="Journal"
          sub={journalSub}
          trail={journal.recording
            ? <span className={`m ${a.recTime}`}>{clock(journal.seconds)}</span>
            : st.journalDone
              ? <button type="button" className={a.lnk} onClick={(e) => { e.stopPropagation(); router.push("/journal/"); }}>Open</button>
              : <span className={a.lnk} style={{ color: "var(--journal)" }}>{journal.vault === "open" ? "Record" : journal.vault === "none" ? "Set up" : "Unlock"}</span>}
        />
      </Card>

      <Card>
        {/* Wraps: minis sit beside the title when there is room (desktop) and drop below it on a phone. */}
        <div className={a.task}>
        <RowHead
          lead={<Medallion domain="food" icon="leaf" state={foodState} />}
          title="Food"
          sub={foodSub}
        />
            <div className={a.minis}>
              {MEALS.map((m) => (
                <Mini key={m} domain="food" icon={m} label={`${cap(m)}: ${settings.plan[m].name}`} state={eaten[m] ? "on" : "empty"}
                  onClick={() => change("day-logs", k, (d) => { d.log.meals[m] = d.log.meals[m] ? false : { ...settings.plan[m] }; })} />
              ))}
            </div>
        </div>
      </Card>

      <Card>
        <div className={a.task}>
        <RowHead
          lead={<Medallion domain="activity" icon="barbell" state={actState} />}
          title="Activity"
          sub={actSub}
        />
            <div className={a.minis}>
              <Mini domain="activity" label={rest ? `Push-ups: rest day, ${st.pushups} logged` : `Push-ups: ${st.pushups} of ${target}`} state={st.pushups > 0 ? "on" : rest ? "empty" : "due"} onClick={() => setPushSheet(true)}>
                <span className="d" style={{ fontSize: (st.pushups || target) > 99 ? 12 : 15 }}>{st.pushups > 0 ? st.pushups : rest ? "—" : target}</span>
              </Mini>
              {settings.activityTypes.map((t) => (
                <Mini key={t.key} domain="activity" icon={ACT_ICONS[t.key] || "pulse"} label={t.name} state={types[t.key] ? "on" : "empty"}
                  onClick={() => change("activity", k, (d) => { d.activity.types[t.key] = !d.activity.types[t.key]; })} />
              ))}
            </div>
        </div>
      </Card>

      <WeightSheet open={weightSheet} onClose={closeWeight} current={st.weight} last={lastWeight} onSave={saveWeight} />
      <PushSheet open={pushSheet} onClose={closePush} current={st.pushups} target={target} rest={rest} dayNumber={rounds.dayNumber} onSave={savePushups} />
      <Toast message={toast} />
    </div>
  );
}
