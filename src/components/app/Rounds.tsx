"use client";

// The push-up round the user is looking at, shared by Today (target, rest day) and Activity (chain, board).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { dayIndexOf, isRestDay, phaseOf, type Log, type Member, type Round } from "@/lib/round";
import { useDays } from "./Days";
import { useSession } from "./Session";

export type MyMembership = { userId: string; dailyTarget: number; startDay: number; joinSeq: number; status: "active" | "removed" };
export type RoundRow = Round & { me: MyMembership | null };
type Board = { round: Round; members: Member[]; logs: Record<string, Log> };

type Rounds = {
  loading: boolean;
  rounds: RoundRow[];
  /** The round in focus: the running one I am in, else the newest one I could join or am in. */
  current: RoundRow | null;
  board: Board | null;
  /** My push-up target today: the round's if I am in a running one, else my own setting. */
  target: number;
  /** True when today is a rest day in a round I am in. */
  restToday: boolean;
  dayNumber: number | null;
  reload: () => Promise<void>;
  join: (roundId: string, dailyTarget: number) => Promise<void>;
  setTarget: (roundId: string, dailyTarget: number) => Promise<void>;
  leave: (roundId: string) => Promise<void>;
  create: (r: { name: string; startDate: string; lengthDays: number; restDays: number[] }) => Promise<void>;
  update: (roundId: string, patch: Partial<Pick<Round, "name" | "startDate" | "lengthDays" | "restDays" | "joinOpen" | "archived">>) => Promise<void>;
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
    || live.find((r) => r.joinOpen && phase(r) !== "finished")
    || live.find((r) => mine(r))
    || null;
}

async function fetchRounds(today: string): Promise<{ rounds: RoundRow[]; board: Board | null }> {
  const { rounds } = await api<{ rounds: RoundRow[] }>("GET", "/rounds");
  const cur = pick(rounds, today);
  const board = cur?.me?.status === "active" ? await api<Board>("GET", `/rounds/${cur.id}/board`).catch(() => null) : null;
  return { rounds, board };
}

export function RoundsProvider({ children }: { children: ReactNode }) {
  const { settings } = useSession();
  const { todayKey } = useDays();
  const [state, setState] = useState<{ rounds: RoundRow[]; board: Board | null } | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchRounds(todayKey).then((s) => { if (alive) setState(s); }, () => { if (alive) setState({ rounds: [], board: null }); });
    return () => { alive = false; };
  }, [todayKey]);

  const reload = useCallback(async () => { setState(await fetchRounds(todayKey)); }, [todayKey]);
  const join = useCallback(async (id: string, dailyTarget: number) => { await api("POST", `/rounds/${id}/join`, { dailyTarget, today: todayKey }); await reload(); }, [todayKey, reload]);
  const setTarget = useCallback(async (id: string, dailyTarget: number) => { await api("PUT", `/rounds/${id}/me`, { dailyTarget }); await reload(); }, [reload]);
  const leave = useCallback(async (id: string) => { await api("DELETE", `/rounds/${id}/me`); await reload(); }, [reload]);
  const create = useCallback(async (r: { name: string; startDate: string; lengthDays: number; restDays: number[] }) => { await api("POST", "/rounds", r); await reload(); }, [reload]);
  const update = useCallback(async (id: string, patch: object) => { await api("PUT", `/rounds/${id}`, patch); await reload(); }, [reload]);

  const value = useMemo<Rounds>(() => {
    const rounds = state?.rounds || [];
    const current = pick(rounds, todayKey);
    const inRunning = current?.me?.status === "active" && phaseOf(current, todayKey) === "running";
    const dayNumber = current && inRunning ? dayIndexOf(current, todayKey) : null;
    return {
      loading: state === null, rounds, current, board: state?.board || null,
      target: inRunning ? current!.me!.dailyTarget : settings.pushupTarget,
      restToday: Boolean(current && dayNumber && isRestDay(current, dayNumber)),
      dayNumber, reload, join, setTarget, leave, create, update,
    };
  }, [state, todayKey, settings.pushupTarget, reload, join, setTarget, leave, create, update]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
