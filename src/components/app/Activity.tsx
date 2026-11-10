"use client";

// Activity: your main move (a ring toward its goal, quick buttons, the last seven days), your other moves, and the
// round with its chain and board. Moves are each person's own (2026-11-08, src/lib/moves.ts): push-ups for some, a
// run or a walk for others, any of them closes the day. A round counts one kind of move. Steps come from Google
// Health (Fitbit) once connected in Settings; they inform, and close the day only for someone who chose Steps.

import { useCallback, useEffect, useState } from "react";
import { chain, dayIndexOf, defaultRestDays, isRestDay, leaderboard, phaseOf, setBreakdown, type Log, type Member } from "@/lib/round";
import { addDays, dayKey, dayStatus, streak, WEEKDAYS, type DayData } from "@/lib/today";
import {
  OTHER_MOVE, ROUND_KINDS, amountText, applyMove, closesDay, goalText, keptGoalFor, kindOf, loggedOf, mainOf, movesOf, num, progressOf, roundAmount,
  savedLine, stepTarget, targetKept, targetShown, targetText, unitWord, withMove, type KindDef, type Move, type MoveSave, type RoundKind,
} from "@/lib/moves";
import Link from "next/link";
import { Button, Card, Chip, Field, Icon, Input, Sheet, StatPill, Switch, Tag, Toast } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { inviteUrl } from "@/lib/invite";
import { report } from "@/lib/log";
import { DayBanner, longDay } from "./DayBanner";
import { useDays } from "./Days";
import { useHealth } from "./Health";
import { MoveSheet, moveIcon } from "./MoveSheet";
import { MovesChooser } from "./MovesChooser";
import { StepsSheet } from "./Steps";
import { useRounds, type Board, type RoundInvite, type RoundRow } from "./Rounds";
import { useSession } from "./Session";
import a from "./app.module.css";
import m from "./moves.module.css";
import sc from "./screens.module.css";

const BADGE: Record<string, string> = { crown: "leading", streak: "streak", hits: "hits" };
/** A target typed in the kind's own unit: digits, and for kilometres one decimal point. */
const typed = (k: KindDef, v: string) => (k.unit === "km" ? (v.replace(",", ".").match(/^\d{0,3}(\.\d?)?/)?.[0] ?? "") : v.replace(/\D/g, "").slice(0, 6));
const shownText = (k: KindDef, kept: number) => num(targetShown(k, kept), k.unit).replace(/,/g, "");

export function Activity() {
  const { me, settings } = useSession();
  // The moves follow the day picked on Today (backfill); the round, the chain and the board stay on today.
  const { map, error, reload, unsaved, retry, change, setSteps, today, todayKey, viewKey: k, view, isToday, setView, windowDays } = useDays();
  const rounds = useRounds();
  const health = useHealth();
  const [moveSheet, setMoveSheet] = useState<string | null | false>(false);
  const [chooser, setChooser] = useState(false);
  const [manage, setManage] = useState<"edit" | "new" | null>(null);
  // The round whose invite link is on screen, and the code if it was just made (a new round brings its own).
  const [sharing, setSharing] = useState<{ round: RoundRow; code?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 2200); }, []);
  const closeMove = useCallback(() => setMoveSheet(false), []);
  const closeChooser = useCallback(() => setChooser(false), []);
  const closeManage = useCallback(() => setManage(null), []);
  const closeShare = useCallback(() => setSharing(null), []);
  const [stepsSheet, setStepsSheet] = useState(false);
  const closeSteps = useCallback(() => setStepsSheet(false), []);

  if (error) return <div className={a.page}><span className="d" style={{ fontSize: 28 }}>Couldn&apos;t load activity</span><p className="muted">{error}</p><div><Button onClick={reload}>Try again</Button></div></div>;
  if (!map) return <div className={a.page}><span className="eb">Loading</span></div>;

  const st = dayStatus(map[k], settings);
  const act = map[k]?.activity;
  const steps = act?.steps ?? null;
  const run = streak(map, settings, today, windowDays).now;
  const { shown } = rounds;
  const moves = movesOf(settings);
  const main = mainOf(settings);
  const goalOf = (mv: Move, key = k) => rounds.goalFor(mv, key);
  const roundDay = rounds.forDay(k);
  // Someone in more than one live round picks which one this screen shows; Today follows the one it always did.
  const mineLive = rounds.rounds.filter((r) => !r.archived && r.me?.status === "active");
  const owns = (r: RoundRow | null) => Boolean(r && (me.profile.role === "admin" || (r.inviteOnly && r.ownerId === me.id)));
  const lateForRound = k < dayKey(addDays(today, -2));

  const saveMove = (s: MoveSave) => {
    const mv = [...moves, OTHER_MOVE].find((x) => x.key === s.key) || OTHER_MOVE;
    haptic(!st.activityDone && closesDay(s, settings.goals.steps) ? "done" : "tap");
    if (s.key === "steps") void setSteps(k, s.n === null ? null : Math.round(s.n)).catch(() => say("Couldn't save your steps. Try again."));
    else change("activity", k, (d) => applyMove(d, s));
    setMoveSheet(false);
    say(savedLine(mv, s, goalOf(mv), lateForRound && Boolean(roundDay.round)));
  };

  const others = moves.filter((x) => x.key !== main?.key);
  const otherLog = act?.types?.[OTHER_MOVE.key];

  return (
    <div className={a.page}>
      <div className={a.pageHead}>
        <div>
          <div className="eb">{moves.length ? `${st.acts} of ${st.actTotal} moves ${isToday ? "today" : "that day"}` : "Your moves"}{run ? ` · ${run} full day${run === 1 ? "" : "s"} in a row` : ""}</div>
          <div className={`d ${a.pageTitle}`}>Activity</div>
        </div>
      </div>

      {!isToday && <DayBanner view={view} onBack={() => setView(null)} />}
      {unsaved && <div className={a.unsaved} role="alert"><span>Some changes are not saved yet.</span><Button size="sm" variant="secondary" onClick={retry}>Retry</Button></div>}

      {main ? (
        <MainCard main={main} map={map} viewKey={k} todayKey={todayKey} today={today} joined={settings.joined} goalOf={goalOf}
          onLog={() => setMoveSheet(null)} onQuick={saveMove} onPick={(key) => setView(key === todayKey ? null : key)} />
      ) : (
        <Card>
          <span className="d" style={{ fontSize: 24, lineHeight: 1.1 }}>How do you like to move?</span>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Pick what you actually do: a walk, a run, yoga, push-ups, a gym session, or something of your own. Any of them closes your day, and one is your main move.</p>
          <div><Button variant="activity" onClick={() => { haptic(); setChooser(true); }}>Choose your moves</Button></div>
        </Card>
      )}

      {/* Steps sit under the main move unless they are it: they inform, and close the day only for someone who chose them. */}
      {main?.key !== "steps" && (steps !== null || health.status === "connected" ? (
        <StatPill domain="activity" icon="walk" label={<>Steps · goal <span className="m">{settings.goals.steps.toLocaleString("en-US")}</span></>}
          fill={steps === null ? null : steps / Math.max(1, settings.goals.steps)} value={steps === null ? "Not synced yet" : steps.toLocaleString("en-US")} dim={steps === null}
          ariaLabel={`Steps ${isToday ? "today" : "that day"}: ${steps === null ? "not synced yet" : steps.toLocaleString("en-US")}, goal ${settings.goals.steps.toLocaleString("en-US")}. Opens your steps`}
          onClick={() => { haptic(); setStepsSheet(true); }} />
      ) : health.status === "off" || health.status === "reconnect" ? (
        <Link href="/settings/#fitbit" className={a.lnk} style={{ alignSelf: "center", minHeight: 44, display: "inline-flex", alignItems: "center" }}>{health.status === "off" ? "Connect Fitbit in Settings to see steps" : "Reconnect Fitbit in Settings to keep steps coming"}</Link>
      ) : null)}

      {moves.length > 0 && <>
        <div className={sc.sec}><span className="eb">{isToday ? "Your other moves" : "Other moves that day"}</span><span className="muted" style={{ fontSize: 12 }}>Any one closes the day</span></div>
        <div className={sc.moves}>
          {[...others.filter((x) => x.key !== "steps"), OTHER_MOVE].map((x) => {
            const l = x.key === OTHER_MOVE.key
              ? (otherLog ? { done: true, n: typeof otherLog === "object" ? otherLog.n : null, u: typeof otherLog === "object" ? otherLog.u : null, label: typeof otherLog === "object" ? otherLog.label : undefined } : { done: false, n: null, u: null })
              : loggedOf(act, x);
            const title = x.key === OTHER_MOVE.key ? (l.label || "Something else") : x.name;
            return (
              <button key={x.key} type="button" aria-pressed={l.done} className={`${sc.move} ${l.done ? sc.moveOn : ""}`} onClick={() => { haptic(); setMoveSheet(x.key); }}>
                <span className={sc.moveIcon}><Icon name={moveIcon(x)} size={18} /></span>
                <span className={sc.moveText}><span style={{ fontWeight: 600 }}>{title}</span><span className="muted" style={{ fontSize: 12 }}>{l.done ? amountText(x, l) : "Tap to log"}</span></span>
              </button>
            );
          })}
        </div>
        <button type="button" className={a.lnk} style={{ alignSelf: "center", minHeight: 44 }} onClick={() => { haptic(); setChooser(true); }}>Change your moves</button>
      </>}

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
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>A round is a stretch of days where everyone aims at their own daily target for one move (push-ups, a run, minutes of anything) and the board shows who is keeping to theirs. Start one and invite your friends with a link: only the people you invite see it.</p>
          <div><Button variant="activity" onClick={() => setManage("new")}>Start a round</Button></div>
        </Card>
      )}
      {shown && !rounds.loading && (
        <button type="button" className={a.lnk} style={{ alignSelf: "center", minHeight: 44 }} onClick={() => { haptic(); setManage("new"); }}>Start a round with friends</button>
      )}

      <MoveSheet open={moveSheet !== false} onClose={closeMove} moves={moves} start={moveSheet || null} activity={act} goalFor={(mv) => goalOf(mv)}
        round={roundDay.round ? { name: roundDay.round.name, kind: roundDay.kind } : null} onSave={saveMove}
        day={isToday ? undefined : longDay(view)} late={lateForRound} />
      <Sheet open={chooser} title="Your moves" onClose={closeChooser}>
        {chooser && <MovesChooser first={moves.length === 0} say={say} onSaved={closeChooser} />}
      </Sheet>
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

/** The main move: a ring filling toward the day's goal (the round's target when the round counts this move), quick
 *  buttons in its unit, and its last seven days, each a tap away from being filled in. */
function MainCard({ main, map, viewKey: k, todayKey, today, joined, goalOf, onLog, onQuick, onPick }: {
  main: Move; map: Record<string, DayData>; viewKey: string; todayKey: string; today: Date; joined: string;
  goalOf: (mv: Move, key?: string) => { goal: number; rest: boolean; dayNumber: number | null; fromRound: boolean };
  onLog: () => void; onQuick: (s: MoveSave) => void; onPick: (key: string) => void;
}) {
  const g = goalOf(main);
  const at = { ...main, goal: g.goal };
  const logged = loggedOf(map[k]?.activity, at);
  const progress = progressOf(at, logged);
  const session = main.unit === "session";
  // Quick buttons work in the move's own unit; a run logged as time starts again from nothing in km.
  const base = logged.u === main.unit && logged.n !== null ? logged.n : 0;
  const quick = main.unit === "reps" ? [-10, 10, 25] : main.unit === "km" ? [-0.5, 0.5, 1] : main.unit === "min" ? [-5, 5, 10] : [];
  const sr = main.key === "pushups" && !g.rest ? setBreakdown(g.goal) : null;
  const add = (by: number) => { const n = Math.max(0, Math.round((base + by) * 100) / 100); onQuick({ key: main.key, n: n || null, u: main.unit }); };

  // The last seven days of the main move against each day's own goal. These are the days that can still be filled
  // in, so a tap on one opens it, as the week on Today does.
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i - 6);
    const key = dayKey(d);
    const dg = goalOf(main, key);
    const l = loggedOf(map[key]?.activity, { ...main, goal: dg.goal });
    const p = progressOf({ ...main, goal: dg.goal }, l);
    // A day before this person joined Dayhub is not a miss: it is left out of the count and cannot be opened.
    const before = key !== todayKey && joined !== "" && key < joined;
    const hit = !dg.rest && (p === null ? l.done : p >= 1);
    return { key, d, l, p: p ?? (l.done ? 1 : 0), rest: dg.rest, before, hit };
  });
  const weekHits = week.filter((w) => w.hit).length;
  // Today counts once its goal is in, as the round's chain does, so this note and the round's foot keep one rule.
  const weekScored = week.filter((w) => !w.before && !w.rest && (w.hit || w.key !== todayKey)).length;
  const eyebrow = g.rest ? `Rest day for ${main.name.toLowerCase()}`
    : `${main.name} · ${g.fromRound ? "round target" : "goal"} ${goalText(at)}${sr ? ` · try ${sr.sets} × ${sr.reps}` : ""}`;

  return (
    <Card>
      <span className="eb" style={{ textAlign: "center" }}>{eyebrow}</span>
      <div className={sc.ring}>
        <svg viewBox="0 0 224 224" aria-hidden>
          <circle className={sc.ringTrack} cx="112" cy="112" r="96" />
          {!g.rest && progress !== null && progress > 0 && <circle className={sc.ringFill} cx="112" cy="112" r="96" strokeDasharray={`${(progress * 603.2).toFixed(1)} 603.2`} />}
        </svg>
        <button type="button" className={sc.ringCenter} onClick={() => { haptic(); onLog(); }}
          aria-label={`${main.name}: ${amountText(main, logged)}${session || g.rest ? "" : `, goal ${goalText(at)}`}. Log it`}>
          {session
            ? <span className="d" style={{ fontSize: 40 }}>{logged.done ? "Done" : "Not yet"}</span>
            : <span key={logged.n ?? 0} className={`dc ${sc.roll}`}>{num(logged.n ?? 0, logged.u ?? main.unit)}</span>}
          <span className="eb">{session ? (logged.done ? "today" : "tap to log") : logged.u && logged.u !== main.unit ? unitWord(logged.u) : g.rest ? "logged" : `of ${num(g.goal, main.unit)} ${main.key === "pushups" ? "" : unitWord(main.unit)}`.trim()}</span>
        </button>
      </div>
      {session ? (
        <Button variant={logged.done ? "secondary" : "activity"} block onClick={() => onQuick({ key: main.key, n: logged.done ? null : 1, u: "session" })}>{logged.done ? "Not done after all" : `${main.name} done`}</Button>
      ) : quick.length > 0 && (
        <div className={sc.quick}>
          {quick.map((by, i) => (
            <button key={by} type="button" className={`${sc.q} ${i === quick.length - 1 ? sc.qHi : ""}`} disabled={by < 0 && base === 0} onClick={() => { haptic(); add(by); }}
              aria-label={`${by < 0 ? "Minus" : "Plus"} ${Math.abs(by)} ${main.key === "pushups" ? "push-ups" : unitWord(main.unit)}`}>{by < 0 ? `−${-by}` : `+${by}`}</button>
          ))}
        </div>
      )}
      <div className={sc.week}>
        <div className={a.entryHead}>
          <span className="eb">Last 7 days</span>
          <span className="m muted" style={{ fontSize: 12 }}>{weekScored ? `${weekHits} of ${weekScored} ${session ? "done" : "hit"}` : "Your first day"}</span>
        </div>
        <div className={sc.weekBars}>
          {week.map((w) => (
            <button key={w.key} type="button" aria-pressed={w.key === k} disabled={w.before}
              className={`${sc.weekDay} ${w.key === k ? sc.weekOn : ""} ${w.hit ? sc.weekHit : ""} ${w.rest ? sc.weekRest : ""} ${w.before ? sc.weekBefore : ""}`}
              aria-label={w.before ? `${longDay(w.d)}, before you joined` : `${w.key === todayKey ? "Today" : longDay(w.d)}: ${amountText(main, w.l)}${w.rest ? ", a rest day" : w.hit ? ", goal reached" : ""}`}
              onClick={() => { haptic(); onPick(w.key); }}>
              <span className={sc.weekTrack}><i style={{ height: `${w.rest ? 0 : Math.min(100, w.p * 100).toFixed(0)}%` }} /></span>
              <span className={`m ${sc.weekN}`}>{w.before ? "–" : w.rest ? "rest" : session ? (w.l.done ? "✓" : "–") : w.l.n !== null && w.l.u === main.unit ? num(w.l.n, main.unit) : w.l.done ? "✓" : "0"}</span>
              <span className={sc.weekLabel}>{w.key === todayKey ? "Today" : WEEKDAYS[w.d.getDay()]}</span>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** My own numbers inside the round, read from the live day map so a tap shows up before the board reloads. */
function myLogFrom(map: Record<string, DayData>, round: RoundRow): Log {
  const log: Log = {};
  const kind = kindOf(round.kind).kind;
  for (const [day, data] of Object.entries(map)) {
    const n = roundAmount(kind, data.activity);
    const d = dayIndexOf(round, day);
    if (n !== null && d >= 1 && d <= round.lengthDays) log[d] = n;
  }
  return log;
}

function RoundCards({ round, board, myLog, say, onManage, onShare }: { round: RoundRow; board: Board | null; myLog: Log; say: (m: string) => void; onManage?: () => void; onShare?: () => void }) {
  const { me, settings, saveSettings } = useSession();
  const { todayKey } = useDays();
  const rounds = useRounds();
  const kind = kindOf(round.kind);
  const [joinTarget, setJoinTarget] = useState(() => shownText(kind, keptGoalFor(kind, settings)));
  const [busy, setBusy] = useState(false);
  const phase = phaseOf(round, todayKey);
  const day = Math.min(Math.max(dayIndexOf(round, todayKey), 0), round.lengthDays);
  const joined = round.me?.status === "active";

  // While the round runs, a member's ring says which day it is, so the head says it only to someone not in it yet.
  // The head is the round's name alone: a member's target is in the paragraph under it.
  const when = phase === "upcoming" ? `starts ${round.startDate}` : phase === "finished" ? "finished" : joined ? null : `Day ${day} of ${round.lengthDays}`;
  const head = (
    <div className={a.entryHead}>
      <span className="eb">{round.name} · {kind.name.toLowerCase()}</span>
      {when && <span className="m muted" style={{ fontSize: 12 }}>{when}</span>}
    </div>
  );

  if (!joined) {
    const kept = targetKept(kind, Number(joinTarget));
    const ok = Number.isFinite(kept) && kept >= kind.min && kept <= kind.max;
    const join = (e: React.FormEvent) => {
      e.preventDefault();
      if (!ok) return;
      haptic();
      setBusy(true);
      void rounds.join(round.id, kept).then(() => {
        say(`You're in · ${targetText(kind, kept)} a day`);
        // Joining a round adds the move it counts to your moves, if it is not there yet.
        const more = withMove(settings, kind.kind);
        if (more) void saveSettings(more).catch((x) => report("rounds", "join_add_move_failed", x, undefined, "warn"));
      }, (x) => { report("rounds", "join_failed", x, undefined, "warn"); say("Couldn't join"); }).finally(() => setBusy(false));
    };
    return (
      <Card>
        {head}
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{round.lengthDays} days of {kind.kind === "minutes" ? "minutes of any move" : kind.name.toLowerCase()}, your own daily target ({kind.line}). The board scores keeping to your target, so a small target kept beats a big one missed. {phase === "running" ? "You start counting from today." : ""}</p>
        {round.joinOpen || onManage ? (
          <form className={a.extraForm} onSubmit={join}>
            <Input inputMode={kind.unit === "km" ? "decimal" : "numeric"} aria-label={`Your daily target in ${unitWord(kind.unit)}`} value={joinTarget} onChange={(e) => setJoinTarget(typed(kind, e.target.value))} />
            <Button type="submit" variant="activity" disabled={busy || !ok}>{busy ? "Joining…" : `Join with ${ok ? targetText(kind, kept) : "this target"}`}</Button>
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
            {targetText(kind, round.me!.dailyTarget)} a day{kind.kind === "minutes" ? " of any move" : ""} for {round.lengthDays} days{kind.kind === "pushups" ? ", in as many sets as you like" : ""}. Your target; others set their own.
            {nextRest ? ` Next rest day: day ${nextRest}${nextRest === day + 1 ? ", tomorrow." : "."}` : ""}
          </p>
          {/* The day of the round, said the way the main ring says its count: the number over its eyebrow. */}
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
          <TargetEditor round={round} kind={kind} say={say} />
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
            <span className={`m ${a.lbStats}`}><span>{r.hits} / {r.scored}</span><span>{targetText(kind, r.dailyTarget, true)}/d</span></span>
            <span className={`m ${a.lbPts}`}>{r.points}</span>
          </div>
        ))}
        {rows.length > 0 && <p className="muted" style={{ fontSize: 11, paddingTop: 8 }}>Points: {round.bonusHit} a hit plus {round.bonusStreak} for each day of your best streak. Rest days carry a streak. A day counts when it&apos;s logged within two days.</p>}
      </Card>
    </>
  );
}

function TargetEditor({ round, kind, say }: { round: RoundRow; kind: KindDef; say: (m: string) => void }) {
  const rounds = useRounds();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(shownText(kind, round.me!.dailyTarget));
  if (!editing) return <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Change my target</Button>;
  const kept = targetKept(kind, Number(v));
  const ok = Number.isFinite(kept) && kept >= kind.min && kept <= kind.max;
  return (
    <form className={a.extraForm} style={{ flex: 1 }} onSubmit={(e) => {
      e.preventDefault();
      if (!ok) return;
      void rounds.setTarget(round.id, kept).then(() => { say(`Target is now ${targetText(kind, kept)} a day`); setEditing(false); }, (x) => { report("rounds", "target_change_failed", x, undefined, "warn"); say("Couldn't change the target"); });
    }}>
      <Input inputMode={kind.unit === "km" ? "decimal" : "numeric"} aria-label={`My daily target in ${unitWord(kind.unit)}`} value={v} onChange={(e) => setV(typed(kind, e.target.value))} autoFocus />
      <Button type="submit" disabled={!ok}>Save</Button>
    </form>
  );
}

/** Start a round, or change one you run: what it counts (only when starting), name, dates, rest days, archive. A
 *  member's round is private, with them in it and its invite link to share; an admin's is open to everyone unless
 *  made private. The maker of a private round can also take people out of it here. */
function ManageRound({ round, board, todayKey, say, onDone, onCreated, onShare }: {
  round: RoundRow | null; board: Board | null; todayKey: string; say: (m: string) => void; onDone: () => void;
  onCreated: (round: RoundRow, code?: string) => void; onShare: (round: RoundRow) => void;
}) {
  const { me, settings, saveSettings } = useSession();
  const rounds = useRounds();
  const isAdmin = me.profile.role === "admin";
  const editing = round && !round.archived ? round : null;
  // A new round counts your main move when a round can, else minutes of any move.
  const [kindKey, setKindKey] = useState<RoundKind>(() => (ROUND_KINDS.find((x) => x.kind === settings.mainMove)?.kind ?? "minutes"));
  const kind = editing ? kindOf(editing.kind) : kindOf(kindKey);
  const [name, setName] = useState(editing?.name || (isAdmin ? "Round 1" : ""));
  const [startDate, setStartDate] = useState(editing?.startDate || todayKey);
  const [length, setLength] = useState(String(editing?.lengthDays || (isAdmin ? 90 : 30)));
  const [rest, setRest] = useState<number[] | null>(editing ? editing.restDays : null);
  const [mine, setMine] = useState(() => keptGoalFor(kindOf(kindKey), settings));
  const [isPrivate, setPrivate] = useState(!isAdmin);
  const [busy, setBusy] = useState(false);
  const len = Math.min(Math.max(Number(length) || 1, 1), 366);
  const restDays = (rest ?? defaultRestDays(len)).filter((d) => d <= len);
  const valid = name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && Number(length) >= 1 && Number(length) <= 366;
  const pickKind = (next: RoundKind) => { haptic(); setKindKey(next); setMine(keptGoalFor(kindOf(next), settings)); };

  const fail = (e: unknown, event: string) => { report("rounds", event, e, undefined, "warn"); say(e instanceof Error ? e.message : "That didn't work"); };
  const run = (work: Promise<void>, done: string) => { setBusy(true); void work.then(() => { say(done); onDone(); }, (e) => fail(e, "round_save_failed")).finally(() => setBusy(false)); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    haptic();
    const body = { name: name.trim(), startDate, lengthDays: len, restDays };
    if (editing) return run(rounds.update(editing.id, body), "Round saved");
    setBusy(true);
    const made = isAdmin && !isPrivate ? rounds.create({ ...body, kind: kind.kind }) : rounds.create({ ...body, kind: kind.kind, inviteOnly: true, dailyTarget: mine });
    void made.then((r) => {
      say(`${name.trim()} is ready`);
      // Making a round you are in adds the move it counts to your moves, if it is not there yet.
      const more = isAdmin && !isPrivate ? null : withMove(settings, kind.kind);
      if (more) void saveSettings(more).catch((x) => report("rounds", "create_add_move_failed", x, undefined, "warn"));
      onCreated({ ...body, id: r.id, kind: kind.kind, inviteOnly: Boolean(r.invite), ownerId: me.id, joinOpen: true, archived: false, bonusHit: 30, bonusStreak: 10, badgeStreak: 7, badgeHits: 30, me: null }, r.invite?.code);
    }, (x) => fail(x, "round_create_failed")).finally(() => setBusy(false));
  };
  const others = editing?.inviteOnly && board ? board.members.filter((x) => x.status === "active" && x.userId !== me.id) : [];
  // The dates people joined for are the dates they agreed to share: the server fixes them once anyone else is in.
  const fixedDates = Boolean(editing && !isAdmin && others.length > 0);

  return (
    <form className={a.vaultForm} onSubmit={submit}>
      {!editing && !isAdmin && <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Your round is private: only the people you invite with its link see it. Everyone sets their own daily target.</p>}
      {!editing && <>
        <span className="eb">What it counts</span>
        <div className={m.kinds} role="radiogroup" aria-label="What the round counts">
          {ROUND_KINDS.map((x) => (
            <button key={x.kind} type="button" role="radio" aria-checked={x.kind === kind.kind} className={`${m.tile} ${x.kind === kind.kind ? m.tileOn : ""}`} onClick={() => pickKind(x.kind)}>
              <span className={m.tileText}><span className={m.tileName}>{x.name}</span><span className={`m ${m.tileHint}`}>{x.line}</span></span>
            </button>
          ))}
        </div>
      </>}
      {editing && <p className="muted" style={{ fontSize: 13 }}>What it counts is fixed: {kind.kind === "minutes" ? "minutes of any move" : `${kind.name.toLowerCase()}, ${kind.line}`}.</p>}
      <Field name="Name"><Input compact value={name} maxLength={100} aria-label="Round name" placeholder="Morning crew" onChange={(e) => setName(e.target.value)} /></Field>
      <Field name="Start date" help={fixedDates ? "Fixed once someone else has joined." : "Day 1."}><Input compact type="date" value={startDate} aria-label="Start date" disabled={fixedDates} onChange={(e) => setStartDate(e.target.value)} /></Field>
      <Field name="Length" help={fixedDates ? "Fixed once someone else has joined." : "Days, 1 to 366."}><Input compact inputMode="numeric" pattern="[0-9]*" value={length} aria-label="Length in days" disabled={fixedDates} onChange={(e) => setLength(e.target.value.replace(/\D/g, "").slice(0, 3))} /></Field>
      {!editing && (isPrivate || !isAdmin) && (
        <Field name="Your daily target" help={`Yours alone, in ${kind.unit === "km" ? "kilometres" : kind.unit === "min" ? "minutes" : kind.unit === "steps" ? "steps" : "push-ups"}. Everyone picks their own.`}>
          <div className={m.goalStepper}>
            <button type="button" className={m.goalStep} aria-label="Lower your target" disabled={mine <= kind.min} onClick={() => { haptic(); setMine(stepTarget(kind, mine, -1)); }}><Icon name="minus" size={18} /></button>
            <span className={`m ${m.goalValue}`} aria-live="polite"><span>{num(targetShown(kind, mine), kind.unit)}</span><span>{kind.unit === "reps" ? "push-ups" : unitWord(kind.unit)}</span></span>
            <button type="button" className={m.goalStep} aria-label="Raise your target" disabled={mine >= kind.max} onClick={() => { haptic(); setMine(stepTarget(kind, mine, 1)); }}><Icon name="plus" size={18} /></button>
          </div>
        </Field>
      )}
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
        {others.map((x) => (
          <div key={x.userId} className={a.entryHead}>
            <span>{x.displayName}</span>
            <button type="button" className={a.lnk} style={{ minHeight: 44 }} disabled={busy}
              onClick={() => { if (window.confirm(`Take ${x.displayName} out of ${editing!.name}? Only you can let them back.`)) run(rounds.removeMember(editing!.id, x.userId), `${x.displayName} is out`); }}>Take out</button>
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
  const text = `Join ${kindOf(round.kind).round} on Dayhub: ${round.name}`;
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
        Anyone with this link can join {round.name}. Someone new to Dayhub signs up through it and is in straight away, without waiting for approval.
      </p>
      {failed && <p role="status" className={a.noteBad}>The link couldn&apos;t be loaded. Close this and try again.</p>}
      {invite && <p className={`m ${a.inviteLink}`} aria-label="Invite link">{url}</p>}
      <div className={a.rowButtons}>
        <Button variant="activity" disabled={!invite} onClick={() => void share()}>{typeof navigator !== "undefined" && "share" in navigator ? "Share the link" : "Copy the link"}</Button>
        {owner && <Button variant="secondary" disabled={!invite || busy} onClick={replace}>New link</Button>}
      </div>
      {invite && invite.maxUses !== null && <p className="muted" style={{ fontSize: 12 }}>It has let in {invite.uses} new {invite.uses === 1 ? "person" : "people"} of {invite.maxUses}. People already on Dayhub join with it any number of times.</p>}
    </div>
  );
}
