"use client";

// Activity: today's list, the round (chain grid, progress) and the leaderboard. Follows the prototype's
// viewActivity. Steps come from Google Health (Fitbit) once connected in Settings; they inform, they do not close the day.

import { useCallback, useState } from "react";
import { chain, dayIndexOf, defaultRestDays, isRestDay, leaderboard, phaseOf, setBreakdown, type Log, type Member } from "@/lib/round";
import { dayStatus, streak } from "@/lib/today";
import Link from "next/link";
import { Bar, Button, Card, Field, Input, Sheet, Switch, Tag, Toast } from "@/components/ui";
import { useDays } from "./Days";
import { useHealth } from "./Health";
import { PushSheet } from "./PushSheet";
import { useRounds, type RoundRow } from "./Rounds";
import { useSession } from "./Session";
import a from "./app.module.css";

const digits = (v: string, max = 5) => v.replace(/\D/g, "").slice(0, max);
const BADGE: Record<string, string> = { crown: "leading", streak: "streak", hits: "hits" };

export function Activity() {
  const { me, settings } = useSession();
  const { map, error, reload, unsaved, retry, change, today, todayKey: k, windowDays } = useDays();
  const rounds = useRounds();
  const health = useHealth();
  const [pushSheet, setPushSheet] = useState(false);
  const [manage, setManage] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2000); }, []);
  const closePush = useCallback(() => setPushSheet(false), []);
  const closeManage = useCallback(() => setManage(false), []);

  if (error) return <div className={a.page}><span className="d" style={{ fontSize: 28 }}>Couldn&apos;t load activity</span><p className="muted">{error}</p><div><Button onClick={reload}>Try again</Button></div></div>;
  if (!map) return <div className={a.page}><span className="eb">Loading</span></div>;

  const st = dayStatus(map[k], settings);
  const types = map[k]?.activity?.types || {};
  const steps = map[k]?.activity?.steps ?? null;
  const run = streak(map, settings, today, windowDays).now;
  const { target, restToday: rest, current } = rounds;
  const isAdmin = me.profile.role === "admin";

  const savePushups = (n: number) => {
    change("activity", k, (d) => { d.activity.pushups = n; });
    setPushSheet(false);
    say(n >= target && !rest ? `Target hit · ${n} push-ups` : n ? `${n} push-ups logged` : "Push-ups cleared");
  };
  const sr = setBreakdown(target);

  return (
    <div className={a.page}>
      <div className={a.pageHead}>
        <div>
          <div className="eb">{st.acts} of {st.actTotal} logged today · {run ? `${run} full day${run === 1 ? "" : "s"} in a row` : "a full day starts the run"}</div>
          <div className={`d ${a.pageTitle}`}>Activity</div>
        </div>
      </div>

      {unsaved && <div className={a.unsaved} role="alert"><span>Some changes are not saved yet.</span><Button size="sm" variant="secondary" onClick={retry}>Retry</Button></div>}

      <Card className={a.actList}>
        <ActRow name="Push-ups" done={st.pushups > 0}
          sub={`${st.pushups > 0 ? `${st.pushups} logged · ` : ""}${rest ? "rest day, no target" : `target ${target} a day · try ${sr.sets} × ${sr.reps}`}`}
          action={<Button size="sm" variant={st.pushups > 0 || rest ? "secondary" : "activity"} onClick={() => setPushSheet(true)}>{st.pushups > 0 ? "Change" : "Log count"}</Button>} />
        {settings.activityTypes.map((t) => {
          const done = Boolean(types[t.key]);
          const toggle = () => change("activity", k, (d) => { d.activity.types[t.key] = !d.activity.types[t.key]; });
          return <ActRow key={t.key} name={t.name} done={done} sub={done ? "Logged" : "Any amount counts"}
            action={done ? <button type="button" className={a.lnk} onClick={toggle}>Undo</button> : <Button size="sm" variant="secondary" onClick={toggle}>Log</Button>} />;
        })}
        {steps !== null || health.status === "connected" ? (
          <div className={a.stepsRow}>
            <Bar label="Steps" value={steps ?? 0} max={settings.goals.steps} color="var(--activity)" text={`${(steps ?? 0).toLocaleString("en-US")} / ${settings.goals.steps.toLocaleString("en-US")}`} />
          </div>
        ) : health.status === "off" || health.status === "reconnect" ? (
          <div className={a.stepsRow}><Link href="/settings/" className={a.lnk}>{health.status === "off" ? "Connect Fitbit in Settings to see steps" : "Reconnect Fitbit in Settings to keep steps coming"}</Link></div>
        ) : null}
      </Card>

      {rounds.loading ? <span className="eb">Loading the round</span> : current ? (
        <RoundCards round={current} myLog={myLogFrom(map, current)} say={say} onManage={isAdmin ? () => setManage(true) : undefined} />
      ) : (
        <Card>
          <span className="d" style={{ fontSize: 22 }}>No round yet</span>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>A round is a stretch of days where everyone aims at their own daily push-up target and the board shows who is keeping to theirs. {isAdmin ? "Start one and the others can join." : "David starts them; you will see it here when one opens."}</p>
          {isAdmin && <div><Button variant="activity" onClick={() => setManage(true)}>Start a round</Button></div>}
        </Card>
      )}

      <PushSheet open={pushSheet} onClose={closePush} current={st.pushups} target={target} rest={rest} dayNumber={rounds.dayNumber} onSave={savePushups} />
      <Sheet open={manage} title={current && !current.archived ? "Manage round" : "Start a round"} onClose={closeManage}>
        <ManageRound round={current} todayKey={k} say={say} onDone={closeManage} />
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

function ActRow({ name, sub, done, action }: { name: string; sub: string; done: boolean; action: React.ReactNode }) {
  return (
    <div className={a.actRow}>
      <i className={a.actDot} style={{ background: done ? "var(--activity)" : "var(--hairline)" }} />
      <div className={a.pickName}><span style={{ fontWeight: 500, fontSize: 15 }}>{name}</span><span className="muted" style={{ fontSize: 12 }}>{sub}</span></div>
      {action}
    </div>
  );
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

  const head = (
    <div className={a.entryHead}>
      <span className="eb" style={{ color: "var(--ink)" }}>{joined ? `${round.me!.dailyTarget} push-ups · ` : ""}{round.name}</span>
      <span className="m muted" style={{ fontSize: 12 }}>{phase === "upcoming" ? `starts ${round.startDate}` : phase === "finished" ? "finished" : `Day ${day} of ${round.lengthDays}`}</span>
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
  const pct = Math.round((day / round.lengthDays) * 100);

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
          <div className={a.roundRing}>
            <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${pct}% of the round`}>
              <circle cx="32" cy="32" r="26" fill="none" stroke="var(--surface-2)" strokeWidth="6" />
              {pct > 0 && <circle cx="32" cy="32" r="26" fill="none" stroke="var(--activity)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(Math.min(1, day / round.lengthDays) * 163.4).toFixed(1)} 163.4`} transform="rotate(-90 32 32)" />}
            </svg>
            <div className={`m ${a.ringLabel}`} style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.1 }}><span>{pct}%</span><span className="muted" style={{ fontSize: 8 }}>of round</span></div>
          </div>
        </div>
        <div className={a.grid} role="img" aria-label={`${hits} of ${scored} targets hit`}>
          {cells.map((c, i) => <i key={i} className={`${a.cell} ${a["cell_" + c]}`} title={`Day ${i + 1}${isRestDay(round, i + 1) ? " · rest" : ""}`} />)}
        </div>
        <div className={a.gridFoot}>
          <span>{hits} of {scored} targets hit · <span className="m">{scored ? Math.round((hits / scored) * 100) : 0}%</span></span>
          <span className={a.legend}><span><i className={`${a.cell} ${a.cell_hit}`} />Hit</span><span><i className={`${a.cell} ${a.cell_miss}`} />Missed</span><span><i className={`${a.cell} ${a.cell_rest}`} />Rest</span></span>
        </div>
        <div className={a.rowButtons}>
          {onManage && <Button size="sm" variant="secondary" onClick={onManage}>Manage round</Button>}
          <TargetEditor round={round} say={say} />
        </div>
      </Card>

      <Card className={a.board}>
        <div className={a.entryHead} style={{ paddingBottom: 6 }}>
          <span className="eb" style={{ color: "var(--ink)" }}>Leaderboard · {rows.length} member{rows.length === 1 ? "" : "s"}</span>
          <span className="muted" style={{ fontSize: 12 }}>Against your own target</span>
        </div>
        {!board && <p className="muted" style={{ fontSize: 13 }}>Loading the board…</p>}
        {rows.map((r) => (
          <div key={r.userId} className={`${a.lb} ${r.userId === me.id ? a.lbYou : ""}`}>
            <span className={`m ${a.lbRank}`}>{r.rank}</span>
            <span className={a.lbName}>{r.userId === me.id ? "You" : r.displayName}{r.badges.map((b) => <Tag key={b} tone="activity">{BADGE[b]}</Tag>)}</span>
            <span className={`m ${a.lbStat}`}>{r.hits} / {r.scored}</span>
            <span className={`m ${a.lbStat}`}>{r.dailyTarget}/d</span>
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
