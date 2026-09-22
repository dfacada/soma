"use client";

// Admin section of Settings: approvals, users, the log (LogView.tsx), feedback. Only rendered for admins, and every
// route behind it checks the admin role again on the server. Status colours are allowed here and only here.

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { report } from "@/lib/log";
import { since } from "@/lib/today";
import { Button, Card, Row, Tag } from "@/components/ui";
import { LogView } from "./LogView";
import { useSession } from "./Session";
import a from "./app.module.css";

type AdminProfile = { userId: string; email: string; displayName: string; role: "admin" | "member"; status: "pending" | "active" | "disabled"; createdAt: string; lastSeenMs: number | null };
/** One member's last fortnight, loaded only when an admin asks for it. */
type UserActivity = {
  userId: string; days: number; lastSeenMs: number | null; lastLoggedDay: string | null;
  activeDays: number; entries: number; steps: number; pushups: number;
  recent: { day: string; weight: boolean; checkin: boolean; meals: number; activity: boolean; entries: number }[];
};
type FeedbackItem = { id: string; userId: string; body: string; createdAt: string };
type Data = { profiles: AdminProfile[]; feedback: FeedbackItem[]; at: number };

async function fetchAll(): Promise<Data> {
  const [p, f] = await Promise.all([
    api<{ profiles: AdminProfile[] }>("GET", "/admin/profiles"),
    api<{ items: FeedbackItem[] }>("GET", "/admin/feedback"),
  ]);
  // The clock reading that goes with this data, so "last seen" and "this week" are steady across renders.
  return { profiles: p.profiles, feedback: f.items, at: Date.now() };
}

// Data Store timestamps are project-local with no offset; show the date part as written rather than guess a zone.
const when = (t: string) => (t || "").slice(0, 16);

export function Admin({ say }: { say: (m: string) => void }) {
  const { me } = useSession();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchAll().then((d) => { if (alive) setData(d); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const act = useCallback(async (key: string, work: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try { await work(); setData(await fetchAll()); say(done); }
    catch (e) { say(e instanceof Error ? e.message : "That didn't work"); }
    finally { setBusy(null); }
  }, [say]);

  if (failed) return <Card><span className="eb">Admin</span><p className="muted">Couldn&apos;t load the admin lists.</p></Card>;
  if (!data) return <Card><span className="eb">Admin</span><p className="muted">Loading…</p></Card>;

  const pending = data.profiles.filter((p) => p.status === "pending");
  // Most recently seen first: an activity monitor should open on whoever is around.
  const users = data.profiles.filter((p) => p.status !== "pending").sort((x, y) => (y.lastSeenMs || 0) - (x.lastSeenMs || 0));
  const activeWeek = users.filter((p) => p.lastSeenMs && p.lastSeenMs > data.at - 7 * 86400000).length;
  const who = (id: string) => data.profiles.find((p) => p.userId === id)?.email || id;
  const setStatus = (p: AdminProfile, status: "active" | "disabled", done: string) => act(p.userId, () => api("POST", `/admin/profiles/${p.userId}/status`, { status }), done);

  return (
    <>
      <Card>
        <div className={a.entryHead}><span className="eb" style={{ color: "var(--ink)" }}>Approvals</span>{pending.length > 0 && <Tag tone="warning">{pending.length} waiting</Tag>}</div>
        {pending.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nobody is waiting. New sign-ups show up here after their first sign-in.</p>}
        {pending.map((p) => (
          <Row key={p.userId} name={p.displayName || p.email} sub={`${p.email} · since ${when(p.createdAt)}`}
            trail={<Button size="sm" variant="food" disabled={busy === p.userId} onClick={() => setStatus(p, "active", `Approved ${p.email}`)}>Approve</Button>} />
        ))}
      </Card>

      <Card>
        <div className={a.entryHead}>
          <span className="eb" style={{ color: "var(--ink)" }}>Users</span>
          <span className="m muted" style={{ fontSize: 12 }}>{activeWeek} of {users.length} seen this week</span>
        </div>
        {users.map((p) => {
          const self = p.userId === me.id;
          return (
            <div key={p.userId} className={a.adminUser}>
              <Row name={p.displayName || p.email} sub={`${p.email} · last seen ${since(p.lastSeenMs, data.at)}`}
                trail={<span className={a.entryTags}>{p.role === "admin" && <Tag tone="journal">admin</Tag>}{p.status === "disabled" && <Tag tone="critical">disabled</Tag>}{self && <Tag>you</Tag>}</span>} />
              <UserActivityView userId={p.userId} />
              {!self && (
                <div className={a.rowButtons}>

                  <Button size="sm" variant="secondary" disabled={busy === p.userId} onClick={() => setStatus(p, p.status === "active" ? "disabled" : "active", p.status === "active" ? `Disabled ${p.email}` : `Re-enabled ${p.email}`)}>{p.status === "active" ? "Disable" : "Re-enable"}</Button>
                  <Button size="sm" variant="secondary" disabled={busy === p.userId} onClick={() => act(p.userId, () => api("POST", `/admin/profiles/${p.userId}/role`, { role: p.role === "admin" ? "member" : "admin" }), p.role === "admin" ? `${p.email} is now a member` : `${p.email} is now an admin`)}>{p.role === "admin" ? "Make member" : "Make admin"}</Button>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <LogView />

      <Card>
        <span className="eb" style={{ color: "var(--ink)" }}>Feedback</span>
        {data.feedback.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nothing new.</p>}
        {data.feedback.map((f) => (
          <div key={f.id} className={a.adminUser}>
            <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{f.body}</p>
            <div className={a.entryHead}>
              <span className="muted" style={{ fontSize: 12 }}>{who(f.userId)} · {when(f.createdAt)}</span>
              <Button size="sm" variant="secondary" disabled={busy === f.id} onClick={() => act(f.id, () => api("POST", `/admin/feedback/${f.id}/acknowledge`), "Acknowledged")}>Acknowledge</Button>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}

/** What a member has been doing: loaded when the admin asks, never with the list (five reads a user). */
function UserActivityView({ userId }: { userId: string }) {
  const [state, setState] = useState<UserActivity | "loading" | "failed" | null>(null);

  const load = async () => {
    setState("loading");
    try { setState(await api<UserActivity>("GET", `/admin/profiles/${userId}/activity`)); }
    catch (e) { report("admin", "activity_load_failed", e); setState("failed"); }
  };

  if (state === null) return <button type="button" className={a.lnk} onClick={() => void load()}>Activity</button>;
  if (state === "loading") return <span className="muted" style={{ fontSize: 12 }}>Loading…</span>;
  if (state === "failed") return <button type="button" className={a.lnk} onClick={() => void load()}>Couldn&apos;t load · try again</button>;

  return (
    <div className={a.userActivity}>
      <span className="m muted" style={{ fontSize: 12 }}>
        {state.activeDays} active day{state.activeDays === 1 ? "" : "s"} of {state.days} · {state.entries} journal entr{state.entries === 1 ? "y" : "ies"}
        {state.pushups > 0 && ` · ${state.pushups.toLocaleString("en-US")} push-ups`}
        {state.steps > 0 && ` · ${state.steps.toLocaleString("en-US")} steps`}
      </span>
      {state.recent.length === 0
        ? <span className="muted" style={{ fontSize: 12 }}>Nothing logged in the last fortnight.</span>
        : state.recent.map((d) => (
          <div key={d.day} className={a.userDay}>
            <span className="m" style={{ fontSize: 12 }}>{d.day.slice(5)}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {[d.weight && "weight", d.checkin && "check-in", d.meals ? `${d.meals} meal${d.meals === 1 ? "" : "s"}` : null, d.activity && "activity", d.entries ? `${d.entries} entr${d.entries === 1 ? "y" : "ies"}` : null].filter(Boolean).join(" · ")}
            </span>
          </div>
        ))}
      <button type="button" className={a.lnk} onClick={() => setState(null)}>Hide</button>
    </div>
  );
}
