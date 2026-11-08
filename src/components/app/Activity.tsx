"use client";

// Activity: today's list, the round (chain grid, progress) and the leaderboard. Follows the prototype's
// viewActivity. Steps come from Google Health (Fitbit) once connected in Settings; they inform, they do not close the day.

import { useCallback, useEffect, useState } from "react";
import { chain, dayIndexOf, defaultRestDays, isRestDay, leaderboard, phaseOf, setBreakdown, type Log, type Member } from "@/lib/round";
import { addDays, dayKey, dayStatus, streak, WEEKDAYS } from "@/lib/today";
import Link from "next/link";
import { Button, Card, Chip, Field, Icon, Input, Sheet, StatPill, Switch, Tag, Toast, type IconName } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { inviteUrl } from "@/lib/invite";
import { report } from "@/lib/log";
import { DayBanner, longDay } from "./DayBanner";
import { useDays } from "./Days";
import { useHealth } from "./Health";
import { PushSheet } from "./PushSheet";
import { StepsSheet } from "./Steps";
import { useRounds, type Board, type RoundInvite, type RoundRow } from "./Rounds";
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
  const [manage, setManage] = useState<"edit" | "new" | null>(null);
  // The round whose invite link is on screen, and the code if it was just made (a new round brings its own).
  const [sharing, setSharing] = useState<{ round: RoundRow; code?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2000); }, []);
  const closePush = useCallback(() => setPushSheet(false), []);
  const closeManage = useCallback(() => setManage(null), []);
  const closeShare = useCallback(() => setSharing(null), []);
  const [stepsSheet, setStepsSheet] = useState(false);
  const closeSteps = useCallback(() => setStepsSheet(false), []);

  if (error) return <div className={a.page}><span className="d" style={{ fontSize: 28 }}>Couldn&apos;t load activity</span><p className="muted">{error}</p><div><Button onClick={reload}>Try again</Button></div></div>;
  if (!map) return <div className={a.page}><span className="eb">Loading</span></div>;

  const st = dayStatus(map[k], settings);
  const types = map[k]?.activity?.types || {};
  const steps = map[k]?.activity?.steps ?? null;
  const run = streak(map, settings, today, windowDays).now;
  const { shown } = rounds;
  const { target, rest } = rounds.forDay(k);
  // Someone in more than one live round picks which one this screen shows; Today follows the one it always did.
  const mineLive = rounds.rounds.filter((r) => !r.archived && r.me?.status === "active");
  const owns = (r: RoundRow | null) => Boolean(r && (me.profile.role === "admin" || (r.inviteOnly && r.ownerId === me.id)));
  const lateForRound = k < dayKey(addDays(today, -2));

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
    // A day before this person joined Soma is not a miss: it is left out of the count and cannot be opened.
    const before = key !== todayKey && settings.joined !== "" && key < settings.joined;
    return { key, d, n, target: f.target, rest: f.rest, before, hit: !f.rest && n >= f.target };
  });
  const weekHits = week.filter((w) => w.hit).length;
  // Today counts once its target is in, as the round's chain does, so this note and the round's foot keep one rule.
  const weekScored = week.filter((w) => !w.before && !w.rest && (w.hit || w.key !== todayKey)).length;

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
            <span className="m muted" style={{ fontSize: 12 }}>{weekScored ? `${weekHits} of ${weekScored} hit` : "Your first day"}</span>
          </div>
          <div className={sc.weekBars}>
            {week.map((w) => (
              <button key={w.key} type="button" aria-pressed={w.key === k} disabled={w.before}
                className={`${sc.weekDay} ${w.key === k ? sc.weekOn : ""} ${w.hit ? sc.weekHit : ""} ${w.rest ? sc.weekRest : ""} ${w.before ? sc.weekBefore : ""}`}
                aria-label={w.before ? `${longDay(w.d)}, before you joined` : `${w.key === todayKey ? "Today" : longDay(w.d)}: ${w.n} push-ups${w.rest ? ", a rest day" : w.hit ? ", target hit" : ` of ${w.target}`}`}
                onClick={() => { haptic(); setView(w.key === todayKey ? null : w.key); }}>
                <span className={sc.weekTrack}><i style={{ height: `${w.rest ? 0 : Math.min(100, (w.n / Math.max(1, w.target)) * 100).toFixed(0)}%` }} /></span>
                <span className={`m ${sc.weekN}`}>{w.before ? "–" : w.rest ? "rest" : w.n}</span>
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

      {mineLive.length > 1 && (
        <div className={a.roundPicker} role="group" aria-label="Your rounds">
          {mineLive.map((r) => <Chip key={r.id} label={r.name} on={shown?.id === r.id} onClick={() => { haptic(); rounds.select(r.id); }} />)}
        </div>
      )}
      {rounds.loading ? <span className="eb">Loading the round</span> : shown ? (
        <RoundCards round={shown} board={rounds.boards[shown.id] || null} myLog={myLogFrom(map, shown)} say={say}
          onManage={owns(shown) ? () => setManage("edit") : undefined} onShare={shown.inviteOnly ? () => setSharing({ round: shown }) : undefined} />
      ) : (
        <Card>
          <span className="d" style={{ fontSize: 22 }}>No round yet</span>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>A round is a stretch of days where everyone aims at their own daily push-up target and the board shows who is keeping to theirs. Start one and invite your friends with a link: only the people you invite see it.</p>
          <div><Button variant="activity" onClick={() => setManage("new")}>Start a round</Button></div>
        </Card>
      )}
      {shown && !rounds.loading && (
        <button type="button" className={a.lnk} style={{ alignSelf: "center", minHeight: 44 }} onClick={() => { haptic(); setManage("new"); }}>Start a round with friends</button>
      )}

      <PushSheet open={pushSheet} onClose={closePush} current={st.pushups} target={target} rest={rest} dayNumber={rounds.forDay(k).dayNumber} onSave={savePushups}
        day={isToday ? undefined : longDay(view)} late={lateForRound} />
      <StepsSheet open={stepsSheet} onClose={closeSteps} day={k} />
      <Sheet open={manage !== null} title={manage === "edit" ? "Manage round" : "Start a round"} onClose={closeManage}>
        {manage && <ManageRound round={manage === "edit" ? shown : null} board={manage === "edit" && shown ? rounds.boards[shown.id] || null : null} todayKey={todayKey} say={say}
          onDone={closeManage} onCreated={(round, code) => { setManage(null); if (code) setSharing({ round, code }); }} onShare={(round) => { setManage(null); setSharing({ round }); }} />}
      </Sheet>
      <Sheet open={sharing !== null} title="Invite friends" onClose={closeShare}>
        {sharing && <InviteSheet round={sharing.round} code={sharing.code} owner={owns(sharing.round)} say={say} />}
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

function RoundCards({ round, board, myLog, say, onManage, onShare }: { round: RoundRow; board: Board | null; myLog: Log; say: (m: string) => void; onManage?: () => void; onShare?: () => void }) {
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
          {onShare && <Button size="sm" variant="activity" onClick={() => { haptic(); onShare(); }}>Invite friends</Button>}
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

/** Start a round, or change one you run: name, dates, rest days, archive. A member's round is private, with them in
 *  it and its invite link to share; an admin's is open to everyone unless made private. The maker of a private round
 *  can also take people out of it here. */
function ManageRound({ round, board, todayKey, say, onDone, onCreated, onShare }: {
  round: RoundRow | null; board: Board | null; todayKey: string; say: (m: string) => void; onDone: () => void;
  onCreated: (round: RoundRow, code?: string) => void; onShare: (round: RoundRow) => void;
}) {
  const { me, settings } = useSession();
  const rounds = useRounds();
  const isAdmin = me.profile.role === "admin";
  const editing = round && !round.archived ? round : null;
  const [name, setName] = useState(editing?.name || (isAdmin ? "Round 1" : ""));
  const [startDate, setStartDate] = useState(editing?.startDate || todayKey);
  const [length, setLength] = useState(String(editing?.lengthDays || (isAdmin ? 90 : 30)));
  const [rest, setRest] = useState<number[] | null>(editing ? editing.restDays : null);
  const [mine, setMine] = useState(String(settings.pushupTarget));
  const [isPrivate, setPrivate] = useState(!isAdmin);
  const [busy, setBusy] = useState(false);
  const len = Math.min(Math.max(Number(length) || 1, 1), 366);
  const restDays = (rest ?? defaultRestDays(len)).filter((d) => d <= len);
  const target = Number(mine);
  const valid = name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && Number(length) >= 1 && Number(length) <= 366 && (editing || isAdmin || (target >= 1 && target <= 10000));

  const fail = (e: unknown, event: string) => { report("rounds", event, e, undefined, "warn"); say(e instanceof Error ? e.message : "That didn't work"); };
  const run = (work: Promise<void>, done: string) => { setBusy(true); void work.then(() => { say(done); onDone(); }, (e) => fail(e, "round_save_failed")).finally(() => setBusy(false)); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    haptic();
    const body = { name: name.trim(), startDate, lengthDays: len, restDays };
    if (editing) return run(rounds.update(editing.id, body), "Round saved");
    setBusy(true);
    const made = isAdmin && !isPrivate ? rounds.create(body) : rounds.create({ ...body, inviteOnly: true, dailyTarget: isAdmin && !(target >= 1) ? undefined : target });
    void made.then((r) => {
      say(`${name.trim()} is ready`);
      onCreated({ ...body, id: r.id, inviteOnly: Boolean(r.invite), ownerId: me.id, joinOpen: true, archived: false, bonusHit: 30, bonusStreak: 10, badgeStreak: 7, badgeHits: 30, me: null }, r.invite?.code);
    }, (x) => fail(x, "round_create_failed")).finally(() => setBusy(false));
  };
  const others = editing?.inviteOnly && board ? board.members.filter((m) => m.status === "active" && m.userId !== me.id) : [];
  // The dates people joined for are the dates they agreed to share: the server fixes them once anyone else is in.
  const fixedDates = Boolean(editing && !isAdmin && others.length > 0);

  return (
    <form className={a.vaultForm} onSubmit={submit}>
      {!editing && !isAdmin && <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Your round is private: only the people you invite with its link see it. Everyone sets their own daily target.</p>}
      <Field name="Name"><Input compact value={name} maxLength={100} aria-label="Round name" placeholder="Morning crew" onChange={(e) => setName(e.target.value)} /></Field>
      <Field name="Start date" help={fixedDates ? "Fixed once someone else has joined." : "Day 1."}><Input compact type="date" value={startDate} aria-label="Start date" disabled={fixedDates} onChange={(e) => setStartDate(e.target.value)} /></Field>
      <Field name="Length" help={fixedDates ? "Fixed once someone else has joined." : "Days, 1 to 366."}><Input compact inputMode="numeric" pattern="[0-9]*" value={length} aria-label="Length in days" disabled={fixedDates} onChange={(e) => setLength(digits(e.target.value, 3))} /></Field>
      {!editing && (isPrivate || !isAdmin) && <Field name="Your daily target" help="Push-ups a day for you. Everyone picks their own."><Input compact inputMode="numeric" pattern="[0-9]*" value={mine} aria-label="Your daily target" onChange={(e) => setMine(digits(e.target.value))} /></Field>}
      {!editing && isAdmin && <Field name="Private" help="Only people with its invite link see it. Off: every member sees it and can join."><Switch checked={isPrivate} label="Private round" onChange={setPrivate} /></Field>}
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
      {editing && isAdmin && <Field name="Private" help="On: only the people in it see it, and new people join with its invite link. Off: every member sees it."><Switch checked={Boolean(editing.inviteOnly)} label="Private round" onChange={(v) => run(rounds.update(editing.id, { inviteOnly: v }), v ? "The round is private now" : "Every member sees the round now")} /></Field>}
      {editing && !editing.inviteOnly && <Field name="Open to join" help="Members can join themselves while this is on."><Switch checked={editing.joinOpen} label="Open to join" onChange={(v) => run(rounds.update(editing.id, { joinOpen: v }), v ? "Open to join" : "Closed to new members")} /></Field>}
      <Button type="submit" variant="activity" block disabled={busy || !valid}>{busy ? "Saving…" : editing ? "Save round" : "Create round"}</Button>
      {editing?.inviteOnly && <Button variant="secondary" block disabled={busy} onClick={() => onShare(editing)}>Invite link</Button>}
      {others.length > 0 && <>
        <span className="eb" style={{ paddingTop: 8 }}>People in it</span>
        {others.map((m) => (
          <div key={m.userId} className={a.entryHead}>
            <span>{m.displayName}</span>
            <button type="button" className={a.lnk} style={{ minHeight: 44 }} disabled={busy}
              onClick={() => { if (window.confirm(`Take ${m.displayName} out of ${editing!.name}? Only you can let them back.`)) run(rounds.removeMember(editing!.id, m.userId), `${m.displayName} is out`); }}>Take out</button>
          </div>
        ))}
      </>}
      {editing && <Button variant="secondary" block disabled={busy} onClick={() => run(rounds.update(editing.id, { archived: true }), "Round archived")}>Archive this round</Button>}
    </form>
  );
}

/** A private round's invite link: share it, or copy it. Its maker can replace it, which turns the old one off. */
function InviteSheet({ round, code: given, owner, say }: { round: RoundRow; code?: string; owner: boolean; say: (m: string) => void }) {
  const rounds = useRounds();
  const [invite, setInvite] = useState<RoundInvite | null>(given ? { code: given, uses: 0, maxUses: 25 } : null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (given) return;
    let alive = true;
    rounds.inviteFor(round.id).then((v) => { if (alive) setInvite(v); }, (e) => { report("rounds", "invite_load_failed", e, undefined, "warn"); if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [round.id, given, rounds]);

  const url = invite ? inviteUrl(invite.code) : "";
  const text = `Join my push-up round on Soma: ${round.name}`;
  const share = async () => {
    haptic();
    if (navigator.share) {
      try { await navigator.share({ title: round.name, text, url }); return; }
      catch (e) { if ((e as { name?: string })?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); say("Link copied"); } catch { say("Couldn't copy the link"); }
  };
  const replace = () => {
    if (!window.confirm("Make a new link? The old one stops working, for anyone who hasn't used it yet.")) return;
    haptic(); setBusy(true);
    rounds.newInvite(round.id).then((v) => { setInvite(v); say("New link made"); }, (e) => { report("rounds", "invite_replace_failed", e, undefined, "warn"); say("Couldn't make a new link"); }).finally(() => setBusy(false));
  };

  return (
    <div className={a.vaultForm}>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        Anyone with this link can join {round.name}. Someone new to Soma signs up through it and is in straight away, without waiting for approval.
      </p>
      {failed && <p role="status" className={a.noteBad}>The link couldn&apos;t be loaded. Close this and try again.</p>}
      {invite && <p className={`m ${a.inviteLink}`} aria-label="Invite link">{url}</p>}
      <div className={a.rowButtons}>
        <Button variant="activity" disabled={!invite} onClick={() => void share()}>{typeof navigator !== "undefined" && "share" in navigator ? "Share the link" : "Copy the link"}</Button>
        {owner && <Button variant="secondary" disabled={!invite || busy} onClick={replace}>New link</Button>}
      </div>
      {invite && invite.maxUses !== null && <p className="muted" style={{ fontSize: 12 }}>It has let in {invite.uses} new {invite.uses === 1 ? "person" : "people"} of {invite.maxUses}. People already on Soma join with it any number of times.</p>}
    </div>
  );
}
