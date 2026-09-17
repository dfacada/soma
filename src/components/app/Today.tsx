"use client";

// Today is the actionable screen: every daily task completes with a tap here (docs/HANDOFF.md).
// Structure and copy follow the prototype's viewToday.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Chip, DayGlyph, DayRing, Input, Medallion, Mini, RowHead, Sheet, Toast, type IconName, type MedallionState } from "@/components/ui";
import { MEALS } from "@/lib/settings";
import { addDays, cap, dayKey, dayStatus, headline, noon, streak, WEEKDAYS } from "@/lib/today";
import { useSession } from "./Session";
import { useDays } from "./useDays";
import a from "./app.module.css";

const WINDOW_DAYS = 60;
const fmt = (n: number) => n.toLocaleString("en-US");
const ACT_ICONS: Record<string, IconName> = { walk: "walk", gym: "barbell", run: "run" };

export function Today() {
  const router = useRouter();
  const { settings, displayName, me, saveSettings } = useSession();

  // Re-evaluate "today" when the tab comes back, so a phone left open overnight rolls over.
  const [today, setToday] = useState(() => noon());
  useEffect(() => {
    const roll = () => { if (document.visibilityState === "visible") setToday((t) => (dayKey(t) === dayKey(new Date()) ? t : noon())); };
    document.addEventListener("visibilitychange", roll);
    return () => document.removeEventListener("visibilitychange", roll);
  }, []);
  const k = dayKey(today);

  const { map, error, reload, unsaved, retry, change } = useDays(today, WINDOW_DAYS);
  const [checkinOpen, setCheckinOpen] = useState<boolean | null>(null);
  const [pushSheet, setPushSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const say = useCallback((m: string) => { setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 1800); }, []);

  const closePush = useCallback(() => setPushSheet(false), []);

  const st = useMemo(() => dayStatus(map?.[k], settings), [map, k, settings]);
  const run = useMemo(() => (map ? streak(map, settings, today, WINDOW_DAYS) : { now: 0, best: settings.bestStreak }), [map, settings, today]);

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
  if (!map) return <div className={a.page}><span className="eb">Loading today</span></div>;

  const data = map[k];
  const checkin = data?.checkin;
  const eaten = data?.log?.meals || {};
  const types = data?.activity?.types || {};
  const head = headline(st, run.now, new Date().getHours());
  const target = settings.pushupTarget;
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

  // ── Food ──
  const foodSub = st.foodDone
    ? `${fmt(st.kcal)} of ${fmt(settings.goals.kcal)} kcal · all four eaten`
    : st.leftMeals.length === 1
      ? `${cap(st.leftMeals[0])} left: ${settings.plan[st.leftMeals[0]].name} · ${fmt(st.kcal)} kcal so far`
      : `${st.leftMeals.length} meals left · ${fmt(st.kcal)} kcal so far`;
  const foodState: MedallionState = st.foodDone ? "done" : st.meals ? "part" : "idle";

  // ── Activity ──
  const pushLine = st.pushups >= target ? `${st.pushups} push-ups, target hit` : st.pushups > 0 ? `${st.pushups} of ${target} push-ups` : `${target} push-ups to do`;
  const actSub = `${st.acts ? `${st.acts} of ${st.actTotal} logged` : "Nothing yet"} · ${pushLine}`;
  const actState: MedallionState = st.acts === st.actTotal ? "done" : st.acts ? "part" : "idle";

  const savePushups = (n: number) => {
    change("activity", k, (d) => { d.activity.pushups = n; });
    setPushSheet(false);
    say(n >= target ? `Target hit · ${n} push-ups` : n ? `${n} push-ups logged` : "Push-ups cleared");
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
            <DayRing progress={st.ring} closed={st.closed} />
            <div className={a.ringLabel}>
              <span className="d" style={{ fontSize: 30 }}>{st.closed ? "4/4" : `${Math.round(st.progress * 100)}%`}</span>
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
              const done = i === 0 ? st.doneCount : dayStatus(map[dayKey(d)], settings).doneCount;
              return (
                <div key={i} className={`${a.weekDay} ${i === 0 ? a.weekToday : ""}`}>
                  <DayGlyph done={done} today={i === 0} />
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

      {/* The Journal card is the record button. Recording arrives with the Journal screen (Glimpse modules). */}
      <Card onClick={() => (st.journalDone ? router.push("/journal/") : say("Recording arrives with the Journal screen"))} aria-label="Record a journal entry">
        <RowHead
          lead={<Medallion domain="journal" icon="mic" state={st.journalDone ? "done" : "idle"} />}
          title="Journal"
          sub={st.journalDone ? `${data!.entries} entr${data!.entries === 1 ? "y" : "ies"} today · tap to open` : "Voice entries arrive with the Journal screen."}
          trail={<span className={a.lnk} style={{ color: "var(--journal)" }}>{st.journalDone ? "Open" : "Soon"}</span>}
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
                  onClick={() => change("day-logs", k, (d) => { d.log.meals[m] = !d.log.meals[m]; })} />
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
              <Mini domain="activity" label={`Push-ups: ${st.pushups} of ${target}`} state={st.pushups > 0 ? "on" : "due"} onClick={() => setPushSheet(true)}>
                <span className="d" style={{ fontSize: (st.pushups || target) > 99 ? 12 : 15 }}>{st.pushups > 0 ? st.pushups : target}</span>
              </Mini>
              {settings.activityTypes.map((t) => (
                <Mini key={t.key} domain="activity" icon={ACT_ICONS[t.key] || "pulse"} label={t.name} state={types[t.key] ? "on" : "empty"}
                  onClick={() => change("activity", k, (d) => { d.activity.types[t.key] = !d.activity.types[t.key]; })} />
              ))}
            </div>
        </div>
      </Card>

      <PushSheet open={pushSheet} onClose={closePush} current={st.pushups} target={target} onSave={savePushups} />
      <Toast message={toast} />
    </div>
  );
}

function PushSheet({ open, onClose, ...form }: { open: boolean; onClose: () => void; current: number; target: number; onSave: (n: number) => void }) {
  // The form only mounts while the sheet is open, so its field is seeded fresh on every open.
  return (
    <Sheet open={open} title="Push-ups today" onClose={onClose}>
      <PushForm {...form} />
    </Sheet>
  );
}

function PushForm({ current, target, onSave }: { current: number; target: number; onSave: (n: number) => void }) {
  const [value, setValue] = useState(current > 0 ? String(current) : "");
  const n = parseInt(value, 10);
  const nudge = (by: number) => setValue(String(Math.max(0, (Number.isNaN(n) ? target : n) + by)));

  return (
    <>
      <p className="muted" style={{ fontSize: 13 }}>The target is <strong style={{ color: "var(--ink)" }}>{target}</strong> a day, in as many sets as you like. Enter what you actually did.</p>
      <form className={a.pushRow} onSubmit={(e) => { e.preventDefault(); if (!Number.isNaN(n) && n >= 0) onSave(Math.min(n, 100000)); }}>
        <Button variant="secondary" style={{ width: 52, padding: 0 }} onClick={() => nudge(-5)} aria-label="Minus 5">−5</Button>
        <Input className={a.pushInput} inputMode="numeric" pattern="[0-9]*" value={value} placeholder={String(target)} aria-label="Push-ups today" onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        <Button variant="secondary" style={{ width: 52, padding: 0 }} onClick={() => nudge(5)} aria-label="Plus 5">+5</Button>
      </form>
      <div className={a.rowButtons}>
        <Button variant="activity" style={{ flex: 1 }} onClick={() => onSave(target)}>Hit the target · {target}</Button>
        <Button style={{ flex: 1 }} disabled={Number.isNaN(n)} onClick={() => onSave(Math.min(n, 100000))}>Save</Button>
      </div>
      {current > 0 && <button type="button" className={a.lnk} style={{ alignSelf: "center", minHeight: 44 }} onClick={() => onSave(0)}>Clear today&apos;s push-ups</button>}
    </>
  );
}
