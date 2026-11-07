"use client";

// Activity: today's list, the round (chain grid, progress) and the leaderboard. Follows the prototype's
// viewActivity. Steps come from Google Health (Fitbit) once connected in Settings; they inform, they do not close the day.

import { useCallback, useState } from "react";
import { chain, dayIndexOf, defaultRestDays, isRestDay, leaderboard, phaseOf, setBreakdown, type Log, type Member } from "@/lib/round";
import { addDays, dayKey, dayStatus, streak, WEEKDAYS } from "@/lib/today";
import Link from "next/link";
import { Button, Card, Field, Icon, Input, Sheet, StatPill, Switch, Tag, Toast, type IconName } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { DayBanner, longDay } from "./DayBanner";
import { useDays } from "./Days";
import { useHealth } from "./Health";
import { PushSheet } from "./PushSheet";
import { StepsSheet } from "./Steps";
import { useRounds, type RoundRow } from "./Rounds";
import { useSession } from "./Session";
import a from "./app.module.css";
import sc from "./screens.module.css";

const ACT_ICONS: Record<string, IconName> = { walk: "walk", gym: "barbell", run: "run" };

const digits = (v: string, max = 5) => v.replace(/\D/g, "").slice(0, max);
const BADGE: Record<string, string> = { crown: "leading", streak: "streak", hits: "hits" };

export function Activity() {
  const { me, settings } = useSession();
  // The list follows the day picked on Today (backfill); the round, the chain and the board stay on today.
  const { map, error, reload, unsaved, retry, change, today, todayKey, viewKey: k, view, isToday, setView, windowDays } = useDays();
  const rounds = useRounds();
  const health = useHealth();
  const [pushSheet, setPushSheet] = useState(false);
  const [manage, setManage] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2000); }, []);
  const closePush = useCallback(() => setPushSheet(false), []);
  const closeManage = useCallback(() => setManage(false), []);
  const [stepsSheet, setStepsSheet] = useState(false);
  const closeSteps = useCallback(() => setStepsSheet(false), []);

  if (error) return <div className={a.page}><span className="d" style={{ fontSize: 28 }}>Couldn&apos;t load activity</span><p className="muted">{error}</p><div><Button onClick={reload}>Try again</Button></div></div>;
  if (!map) return <div className={a.page}><span className="eb">Loading</span></div>;

  const st = dayStatus(map[k], settings);
  const types = map[k]?.activity?.types || {};
  const steps = map[k]?.activity?.steps ?? null;
  const run = streak(map, settings, today, windowDays).now;
  const { current } = rounds;
  const { target, rest } = rounds.forDay(k);
  const lateForRound = k < dayKey(addDays(today, -2));
  const isAdmin = me.profile.role === "admin";

  const savePushups = (n: number) => {
    change("activity", k, (d) => { d.activity.pushups = n; });
    setPushSheet(false);
    say(lateForRound && n ? `${n} push-ups saved to your record · too late to count for the round` : n >= target && !rest ? `Target hit · ${n} push-ups` : n ? `${n} push-ups logged` : "Push-ups cleared");
  };
  const sr = setBreakdown(target);
  const quick = (by: number) => { haptic(); savePushups(Math.max(0, st.pushups + by)); };

  // The last seven days of push-ups against each day's own target (a round's, or yours). These are the days that
  // can still be filled in, so a tap on one opens it, as the week on Today does.
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i - 6);
    const key = dayKey(d);
    const f = rounds.forDay(key);
    const n = map[key]?.activity?.pushups ?? 0;
    return { key, d, n, target: f.target, rest: f.rest, hit: !f.rest && n >= f.target };
  });
  const weekHits = week.filter((w) => w.hit).length;
  // Today counts once its target is in, as the round's chain does, so this note and the round's foot keep one rule.
  const weekScored = week.filter((w) => !w.rest && (w.hit || w.key !== todayKey)).length;

  return (
    <div className={a.page}>
      <div className={a.pageHead}>
        <div>
          <div className="eb">{st.acts} of {st.actTotal} logged {isToday ? "today" : "that day"}{run ? ` · ${run} full day${run === 1 ? "" : "s"} in a row` : ""}</div>
          <div className={`d ${a.pageTitle}`}>Activity</div>
        </div>
      </div>

      {!isToday && <DayBanner view={view} onBack={() => setView(null)} />}
      {unsaved && <div className={a.unsaved} role="alert"><span>Some changes are not saved yet.</span><Button size="sm" variant="secondary" onClick={retry}>Retry</Button></div>}

      {/* Push-ups: the ring fills toward the target. Tap the middle to count, or add from the quick buttons. */}
      <Card>
        <span className="eb" style={{ textAlign: "center" }}>{rest ? "Rest day for push-ups" : `Push-ups · target ${target} · try ${sr.sets} × ${sr.reps}`}</span>
        <div className={sc.ring}>
          <svg viewBox="0 0 224 224" aria-hidden>
            <circle className={sc.ringTrack} cx="112" cy="112" r="96" />
            {!rest && st.pushups > 0 && <circle className={sc.ringFill} cx="112" cy="112" r="96" strokeDasharray={`${(Math.min(1, st.pushups / Math.max(1, target)) * 603.2).toFixed(1)} 603.2`} />}
          </svg>
          <button type="button" className={sc.ringCenter} onClick={() => setPushSheet(true)} aria-label={`Push-ups: ${st.pushups}${rest ? "" : ` of ${target}`}. Count them`}>
            <span key={st.pushups} className={`dc ${sc.roll}`}>{st.pushups}</span>
            <span className="eb">{rest ? "logged" : `of ${target}`}</span>
          </button>
        </div>
        <div className={sc.quick}>
          <button type="button" className={sc.q} onClick={() => quick(-10)} disabled={st.pushups === 0} aria-label="Ten fewer push-ups">−10</button>
          <button type="button" className={sc.q} onClick={() => quick(10)} aria-label="Ten more push-ups">+10</button>
          <button type="button" className={`${sc.q} ${sc.qHi}`} onClick={() => quick(25)} aria-label="Twenty-five more push-ups">+25</button>
        </div>
        <div className={sc.week}>
          <div className={a.entryHead}>
            <span className="eb">Last 7 days</span>
            <span className="m muted" style={{ fontSize: 12 }}>{weekHits} of {weekScored} hit</span>
          </div>
          <div className={sc.weekBars}>
            {week.map((w) => (
              <button key={w.key} type="button" aria-pressed={w.key === k}
                className={`${sc.weekDay} ${w.key === k ? sc.weekOn : ""} ${w.hit ? sc.weekHit : ""} ${w.rest ? sc.weekRest : ""}`}
                aria-label={`${w.key === todayKey ? "Today" : longDay(w.d)}: ${w.n} push-ups${w.rest ? ", a rest day" : w.hit ? ", target hit" : ` of ${w.target}`}`}
                onClick={() => { haptic(); setView(w.key === todayKey ? null : w.key); }}>
                <span className={sc.weekTrack}><i style={{ height: `${w.rest ? 0 : Math.min(100, (w.n / Math.max(1, w.target)) * 100).toFixed(0)}%` }} /></span>
                <span className={`m ${sc.weekN}`}>{w.rest ? "rest" : w.n}</span>
                <span className={sc.weekLabel}>{w.key === todayKey ? "Today" : WEEKDAYS[w.d.getDay()]}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Steps sit under the push-ups, above the moves' header: they inform, they never close the day. */}
      {steps !== null || health.status === "connected" ? (
        <StatPill domain="activity" icon="walk" label={<>Steps · goal <span className="m">{settings.goals.steps.toLocaleString("en-US")}</span></>}
          fill={steps === null ? null : steps / Math.max(1, settings.goals.steps)} value={steps === null ? "Not synced yet" : steps.toLocaleString("en-US")} dim={steps === null}
          ariaLabel={`Steps ${isToday ? "today" : "that day"}: ${steps === null ? "not synced yet" : steps.toLocaleString("en-US")}, goal ${settings.goals.steps.toLocaleString("en-US")}. Opens your steps`}
          onClick={() => { haptic(); setStepsSheet(true); }} />
      ) : health.status === "off" || health.status === "reconnect" ? (
        <Link href="/settings/#fitbit" className={a.lnk} style={{ alignSelf: "center", minHeight: 44, display: "inline-flex", alignItems: "center" }}>{health.status === "off" ? "Connect Fitbit in Settings to see steps" : "Reconnect Fitbit in Settings to keep steps coming"}</Link>
      ) : null}

      <div className={sc.sec}><span className="eb">{isToday ? "Today's moves" : "Moves that day"}</span><span className="muted" style={{ fontSize: 12 }}>Any one closes it</span></div>
      <div className={sc.moves}>
        {settings.activityTypes.map((t) => {
          const done = Boolean(types[t.key]);
          return (
            <button key={t.key} type="button" aria-pressed={done} className={`${sc.move} ${done ? sc.moveOn : ""}`}
              onClick={() => { haptic(); change("activity", k, (d) => { d.activity.types[t.key] = !d.activity.types[t.key]; }); }}>
              <span className={sc.moveIcon}><Icon name={ACT_ICONS[t.key] || "pulse"} size={18} /></span>
              <span className={sc.moveText}><span style={{ fontWeight: 600 }}>{t.name}</span><span className="muted" style={{ fontSize: 12 }}>{done ? "Logged" : "Tap to log"}</span></span>
            </button>
          );
        })}
      </div>

      {rounds.loading ? <span className="eb">Loading the round</span> : current ? (
        <RoundCards round={current} myLog={myLogFrom(map, current)} say={say} onManage={isAdmin ? () => setManage(true) : undefined} />
      ) : (
        <Card>
          <span className="d" style={{ fontSize: 22 }}>No round yet</span>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>A round is a stretch of days where everyone aims at their own daily push-up target and the board shows who is keeping to theirs. {isAdmin ? "Start one and the others can join." : "David starts them; you will see it here when one opens."}</p>
          {isAdmin && <div><Button variant="activity" onClick={() => setManage(true)}>Start a round</Button></div>}
        </Card>
      )}

      <PushSheet open={pushSheet} onClose={closePush} current={st.pushups} target={target} rest={rest} dayNumber={rounds.forDay(k).dayNumber} onSave={savePushups}
        day={isToday ? undefined : longDay(view)} late={lateForRound} />
      <StepsSheet open={stepsSheet} onClose={closeSteps} day={k} />
      <Sheet open={manage} title={current && !current.archived ? "Manage round" : "Start a round"} onClose={closeManage}>
        <ManageRound round={current} todayKey={todayKey} say={say} onDone={closeManage} />
      </Sheet>
      <Toast message={toast} />
    </div>
  );
}

/** My push-ups inside the round, read from the live day map so a tap shows up before the board reloads. */
function myLogFrom(map: Record<string, { activity?: { pushups: number | null } }>, round: RoundRow): Log {
  const log: Log = {};
  for (const [day, data] of Object.entries(map)) {
    const reps = data.activity?.pushups;
    const d = dayIndexOf(round, day);
    if (reps !== null && reps !== undefined && d >= 1 && d <= round.lengthDays) log[d] = reps;
  }
  return log;
}

function RoundCards({ round, myLog, say, onManage }: { round: RoundRow; myLog: Log; say: (m: string) => void; onManage?: () => void }) {
  const { me, settings } = useSession();
  const { todayKey } = useDays();
  const rounds = useRounds();
  const [joinTarget, setJoinTarget] = useState(String(settings.pushupTarget));
  const [busy, setBusy] = useState(false);
  const phase = phaseOf(round, todayKey);
  const day = Math.min(Math.max(dayIndexOf(round, todayKey), 0), round.lengthDays);
  const joined = round.me?.status === "active";

  // While the round runs, a member's ring says which day it is, so the head says it only to someone not in it yet.
  // The head is the round's name alone: a member's target is in the paragraph under it.
  const when = phase === "upcoming" ? `starts ${round.startDate}` : phase === "finished" ? "finished" : joined ? null : `Day ${day} of ${round.lengthDays}`;
  const head = (
    <div className={a.entryHead}>
      <span className="eb">{round.name}</span>
      {when && <span className="m muted" style={{ fontSize: 12 }}>{when}</span>}
    </div>
  );

  if (!joined) {
    const n = Number(joinTarget);
    return (
      <Card>
        {head}
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{round.lengthDays} days, your own daily target, in as many sets as you like. The board scores keeping to your target, so 30 a day kept beats 100 a day missed. {phase === "running" ? "You start counting from today." : ""}</p>
        {round.joinOpen || onManage ? (
          <form className={a.extraForm} onSubmit={(e) => { e.preventDefault(); if (!(n >= 1 && n <= 10000)) return; setBusy(true); void rounds.join(round.id, n).then(() => say(`You're in · ${n} a day`), () => say("Couldn't join")).finally(() => setBusy(false)); }}>
            <Input inputMode="numeric" pattern="[0-9]*" aria-label="Your daily target" value={joinTarget} onChange={(e) => setJoinTarget(digits(e.target.value))} />
            <Button type="submit" variant="activity" disabled={busy || !(n >= 1)}>{busy ? "Joining…" : "Join with this target"}</Button>
          </form>
        ) : <p className="muted" style={{ fontSize: 13 }}>This round is closed to new members.</p>}
        {onManage && <div><Button size="sm" variant="secondary" onClick={onManage}>Manage round</Button></div>}
      </Card>
    );
  }

  const mine: Member = { userId: me.id, displayName: "You", dailyTarget: round.me!.dailyTarget, startDay: round.me!.startDay, joinSeq: round.me!.joinSeq, status: "active" };
  const cells = chain(round, mine, myLog, todayKey);
  const hits = cells.filter((c) => c === "hit").length;
  const scored = hits + cells.filter((c) => c === "miss").length;
  const nextRest = round.restDays.find((d) => d > day);

  const board = rounds.board;
  // My row comes from the live log, so the board agrees with the grid the moment a count is saved.
  const rows = board ? leaderboard(round, board.members, { ...board.logs, [me.id]: myLog }, todayKey) : [];

  return (
    <>
      <Card>
        {head}
        <div className={a.roundIntro}>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>
            {round.me!.dailyTarget} push-ups a day for {round.lengthDays} days, in as many sets as you like. Your target; others set their own.
            {nextRest ? ` Next rest day: day ${nextRest}${nextRest === day + 1 ? ", tomorrow." : "."}` : ""}
          </p>
          {/* The day of the round, said the way the push-up ring says its count: the number over its eyebrow. */}
          <div className={a.roundRing}>
            <svg width="72" height="72" viewBox="0 0 72 72" role="img" aria-label={`Day ${day} of ${round.lengthDays}`}>
              <circle cx="36" cy="36" r="30" fill="none" stroke="var(--well)" strokeWidth="6" />
              {day > 0 && <circle cx="36" cy="36" r="30" fill="none" stroke="var(--activity)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(Math.min(1, day / round.lengthDays) * 188.5).toFixed(1)} 188.5`} transform="rotate(-90 36 36)" />}
            </svg>
            <div className={a.ringLabel} aria-hidden><span className="dc" style={{ fontSize: 22 }}>{day}</span><span className="eb">of {round.lengthDays}</span></div>
          </div>
        </div>
        <div className={a.grid} role="img" aria-label={`${hits} of ${scored} targets hit`}>
          {cells.map((c, i) => <i key={i} className={`${a.cell} ${a["cell_" + c]}`} title={`Day ${i + 1}${isRestDay(round, i + 1) ? " · rest" : ""}`} />)}
        </div>
        <div className={a.gridFoot}>
          {/* One mono run, worded like the week's "x of y hit" note; the grid's label above keeps "targets hit". */}
          <span className="m">{hits} of {scored} hit · {scored ? Math.round((hits / scored) * 100) : 0}%</span>
          <span className={a.legend}><span><i className={`${a.cell} ${a.cell_hit}`} />Hit</span><span><i className={`${a.cell} ${a.cell_miss}`} />Missed</span><span><i className={`${a.cell} ${a.cell_rest}`} />Rest</span></span>
        </div>
        <div className={a.rowButtons}>
          {onManage && <Button size="sm" variant="secondary" onClick={onManage}>Manage round</Button>}
          <TargetEditor round={round} say={say} />
        </div>
      </Card>

      <Card className={a.board}>
        <div className={a.entryHead} style={{ paddingBottom: 6 }}>
          <span className="eb">Leaderboard · {rows.length} member{rows.length === 1 ? "" : "s"}</span>
          <span className="muted" style={{ fontSize: 12 }}>Against your own target</span>
        </div>
        {!board && <p className="muted" style={{ fontSize: 13 }}>Loading the board…</p>}
        {rows.map((r) => (
          <div key={r.userId} className={`${a.lb} ${r.userId === me.id ? a.lbYou : ""}`}>
            <span className={`m ${a.lbRank}`}>{r.rank}</span>
            <span className={a.lbName}>{r.userId === me.id ? "You" : r.displayName}{r.badges.map((b) => <Tag key={b} tone="activity">{BADGE[b]}</Tag>)}</span>
            <span className={`m ${a.lbStats}`}><span>{r.hits} / {r.scored}</span><span>{r.dailyTarget}/d</span></span>
            <span className={`m ${a.lbPts}`}>{r.points}</span>
          </div>
        ))}
        {rows.length > 0 && <p className="muted" style={{ fontSize: 11, paddingTop: 8 }}>Points: {round.bonusHit} a hit plus {round.bonusStreak} for each day of your best streak. Rest days carry a streak.</p>}
      </Card>
    </>
  );
}

function TargetEditor({ round, say }: { round: RoundRow; say: (m: string) => void }) {
  const rounds = useRounds();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(round.me!.dailyTarget));
  if (!editing) return <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Change my target</Button>;
  const n = Number(v);
  return (
    <form className={a.extraForm} style={{ flex: 1 }} onSubmit={(e) => { e.preventDefault(); if (!(n >= 1 && n <= 10000)) return; void rounds.setTarget(round.id, n).then(() => { say(`Target is now ${n} a day`); setEditing(false); }, () => say("Couldn't change the target")); }}>
      <Input inputMode="numeric" pattern="[0-9]*" aria-label="My daily target" value={v} onChange={(e) => setV(digits(e.target.value))} autoFocus />
      <Button type="submit" disabled={!(n >= 1)}>Save</Button>
    </form>
  );
}

/** Admin: start a round, or edit the current one's name, join setting, rest days and archive state. */
function ManageRound({ round, todayKey, say, onDone }: { round: RoundRow | null; todayKey: string; say: (m: string) => void; onDone: () => void }) {
  const rounds = useRounds();
  const editing = round && !round.archived ? round : null;
  const [name, setName] = useState(editing?.name || "Round 1");
  const [startDate, setStartDate] = useState(editing?.startDate || todayKey);
  const [length, setLength] = useState(String(editing?.lengthDays || 90));
  const [rest, setRest] = useState<number[] | null>(editing ? editing.restDays : null);
  const [busy, setBusy] = useState(false);
  const len = Math.min(Math.max(Number(length) || 1, 1), 366);
  const restDays = (rest ?? defaultRestDays(len)).filter((d) => d <= len);
  const valid = name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && Number(length) >= 1 && Number(length) <= 366;

  const run = (work: Promise<void>, done: string) => { setBusy(true); void work.then(() => { say(done); onDone(); }, (e) => say(e instanceof Error ? e.message : "That didn't work")).finally(() => setBusy(false)); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const body = { name: name.trim(), startDate, lengthDays: len, restDays };
    run(editing ? rounds.update(editing.id, body) : rounds.create(body), editing ? "Round saved" : `${name.trim()} created`);
  };

  return (
    <form className={a.vaultForm} onSubmit={submit}>
      <Field name="Name"><Input compact value={name} maxLength={100} aria-label="Round name" onChange={(e) => setName(e.target.value)} /></Field>
      <Field name="Start date" help="Day 1."><Input compact type="date" value={startDate} aria-label="Start date" onChange={(e) => setStartDate(e.target.value)} /></Field>
      <Field name="Length" help="Days, 1 to 366."><Input compact inputMode="numeric" pattern="[0-9]*" value={length} aria-label="Length in days" onChange={(e) => setLength(digits(e.target.value, 3))} /></Field>
      <div className={a.entryHead}>
        <span className="eb">Rest days · tap to toggle</span>
        <button type="button" className={a.lnk} onClick={() => setRest(null)}>Default pattern</button>
      </div>
      <div className={a.restGrid}>
        {Array.from({ length: len }, (_, i) => i + 1).map((d) => {
          const on = restDays.includes(d);
          return <button key={d} type="button" aria-pressed={on} aria-label={`Day ${d}${on ? ", rest day" : ""}`} className={`${a.restCell} ${on ? a.restOn : ""}`} onClick={() => setRest(on ? restDays.filter((x) => x !== d) : [...restDays, d].sort((x, y) => x - y))}>{d}</button>;
        })}
      </div>
      {editing && <Field name="Open to join" help="Members can join themselves while this is on."><Switch checked={editing.joinOpen} label="Open to join" onChange={(v) => run(rounds.update(editing.id, { joinOpen: v }), v ? "Open to join" : "Closed to new members")} /></Field>}
      <Button type="submit" variant="activity" block disabled={busy || !valid}>{busy ? "Saving…" : editing ? "Save round" : "Create round"}</Button>
      {editing && <Button variant="secondary" block disabled={busy} onClick={() => run(rounds.update(editing.id, { archived: true }), "Round archived")}>Archive this round</Button>}
    </form>
  );
}
