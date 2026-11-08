"use client";

// The push-up rounds the user can see, shared by Today (target, rest day) and Activity (chain, board).
// `current` is the round that sets Today's target and rest days. Someone in more than one round (an open round and
// a private one with friends, say) picks which board Activity shows with `select`; Today keeps following `current`.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { dayIndexOf, isRestDay, phaseOf, type Log, type Member, type Round } from "@/lib/round";
import { useDays } from "./Days";
import { useSession } from "./Session";

export type MyMembership = { userId: string; dailyTarget: number; startDay: number; joinSeq: number; status: "active" | "removed" };
export type RoundRow = Round & { me: MyMembership | null };
export type Board = { round: Round; members: Member[]; logs: Record<string, Log> };
export type RoundInvite = { code: string; uses: number; maxUses: number | null };
type NewRound = { name: string; startDate: string; lengthDays: number; restDays: number[]; inviteOnly?: boolean; dailyTarget?: number };

type Rounds = {
  loading: boolean;
  rounds: RoundRow[];
  /** The round in focus for Today: the running one I am in, else the newest one I could join or am in. */
  current: RoundRow | null;
  /** The round Activity shows: the one picked with `select`, else `current`. */
  shown: RoundRow | null;
  select: (roundId: string) => void;
  /** Boards fetched so far, by round id. */
  boards: Record<string, Board>;
  /** Target, rest day and round day for any day (backfill uses this for the day being filled in). */
  forDay: (key: string) => { target: number; rest: boolean; dayNumber: number | null };
  /** My push-up target today: the round's if I am in a running one, else my own setting. */
  target: number;
  /** True when today is a rest day in a round I am in. */
  restToday: boolean;
  dayNumber: number | null;
  reload: () => Promise<void>;
  join: (roundId: string, dailyTarget: number) => Promise<void>;
  setTarget: (roundId: string, dailyTarget: number) => Promise<void>;
  leave: (roundId: string) => Promise<void>;
  /** Make a round. A member's is private, with them in it; its invite link comes back to share. */
  create: (r: NewRound) => Promise<{ id: string; invite?: { code: string } }>;
  update: (roundId: string, patch: Partial<Pick<Round, "name" | "startDate" | "lengthDays" | "restDays" | "joinOpen" | "archived" | "inviteOnly">>) => Promise<void>;
  /** A private round's current invite link (any member may share it). */
  inviteFor: (roundId: string) => Promise<RoundInvite>;
  /** Its maker replaces the link; the old one stops working. */
  newInvite: (roundId: string) => Promise<RoundInvite>;
  /** Its maker (or an admin) takes someone out; only they can let them back. */
  removeMember: (roundId: string, userId: string) => Promise<void>;
};

const Ctx = createContext<Rounds | null>(null);
export function useRounds() {
  const r = useContext(Ctx);
  if (!r) throw new Error("useRounds outside <RoundsProvider>");
  return r;
}

function pick(rounds: RoundRow[], today: string): RoundRow | null {
  const live = rounds.filter((r) => !r.archived);
  const mine = (r: RoundRow) => r.me?.status === "active";
  const phase = (r: RoundRow) => phaseOf(r, today);
  return live.find((r) => mine(r) && phase(r) === "running")
    || live.find((r) => mine(r) && phase(r) === "upcoming")
    || live.find((r) => r.joinOpen && !r.inviteOnly && phase(r) !== "finished")
    || live.find((r) => mine(r))
    || null;
}

const fetchBoard = (id: string) => api<Board>("GET", `/rounds/${id}/board`).catch(() => null);

async function fetchRounds(today: string, also: string | null): Promise<{ rounds: RoundRow[]; boards: Record<string, Board> }> {
  const { rounds } = await api<{ rounds: RoundRow[] }>("GET", "/rounds");
  const ids = new Set<string>();
  const cur = pick(rounds, today);
  if (cur?.me?.status === "active") ids.add(cur.id);
  const other = also ? rounds.find((r) => r.id === also) : null;
  if (other?.me?.status === "active") ids.add(other.id);
  const boards: Record<string, Board> = {};
  await Promise.all([...ids].map(async (id) => { const b = await fetchBoard(id); if (b) boards[id] = b; }));
  return { rounds, boards };
}

export function RoundsProvider({ children }: { children: ReactNode }) {
  const { settings } = useSession();
  const { todayKey } = useDays();
  const [state, setState] = useState<{ rounds: RoundRow[]; boards: Record<string, Board> } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchRounds(todayKey, null).then((s) => { if (alive) setState(s); }, () => { if (alive) setState({ rounds: [], boards: {} }); });
    return () => { alive = false; };
  }, [todayKey]);

  const reload = useCallback(async () => { setState(await fetchRounds(todayKey, selected)); }, [todayKey, selected]);
  const select = useCallback((id: string) => {
    setSelected(id);
    void fetchBoard(id).then((b) => { if (b) setState((s) => (s ? { ...s, boards: { ...s.boards, [id]: b } } : s)); });
  }, []);
  const join = useCallback(async (id: string, dailyTarget: number) => { await api("POST", `/rounds/${id}/join`, { dailyTarget, today: todayKey }); await reload(); }, [todayKey, reload]);
  const setTarget = useCallback(async (id: string, dailyTarget: number) => { await api("PUT", `/rounds/${id}/me`, { dailyTarget }); await reload(); }, [reload]);
  const leave = useCallback(async (id: string) => { await api("DELETE", `/rounds/${id}/me`); await reload(); }, [reload]);
  const create = useCallback(async (r: NewRound) => {
    const made = await api<RoundRow & { invite?: { code: string } }>("POST", "/rounds", { ...r, today: todayKey });
    setSelected(made.id);
    setState(await fetchRounds(todayKey, made.id));
    return { id: made.id, invite: made.invite };
  }, [todayKey]);
  const update = useCallback(async (id: string, patch: object) => { await api("PUT", `/rounds/${id}`, patch); await reload(); }, [reload]);
  const inviteFor = useCallback((id: string) => api<RoundInvite>("GET", `/rounds/${id}/invite`), []);
  const newInvite = useCallback((id: string) => api<RoundInvite>("POST", `/rounds/${id}/invite`), []);
  const removeMember = useCallback(async (id: string, userId: string) => { await api("DELETE", `/rounds/${id}/members/${userId}`); await reload(); }, [reload]);

  const value = useMemo<Rounds>(() => {
    const rounds = state?.rounds || [];
    const current = pick(rounds, todayKey);
    const chosen = selected ? rounds.find((r) => r.id === selected && !r.archived) || null : null;
    const forDay = (key: string) => {
      const inRunning = current?.me?.status === "active" && phaseOf(current, key) === "running";
      const dayNumber = current && inRunning ? dayIndexOf(current, key) : null;
      return { target: inRunning ? current!.me!.dailyTarget : settings.pushupTarget, rest: Boolean(current && dayNumber && isRestDay(current, dayNumber)), dayNumber };
    };
    const now = forDay(todayKey);
    return {
      loading: state === null, rounds, current, shown: chosen || current, select, boards: state?.boards || {},
      target: now.target, restToday: now.rest, dayNumber: now.dayNumber, forDay,
      reload, join, setTarget, leave, create, update, inviteFor, newInvite, removeMember,
    };
  }, [state, selected, todayKey, settings.pushupTarget, select, reload, join, setTarget, leave, create, update, inviteFor, newInvite, removeMember]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
