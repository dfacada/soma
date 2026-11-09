"use client";

// Soma Ops · People: whoever is waiting for approval, everyone else newest first, a search, and the sign-up invite
// links (moved here from Settings → Admin). A person opens their page.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { inviteUrl } from "@/lib/invite";
import { report } from "@/lib/log";
import { ago, fmtDay, n, type PersonRow } from "@/lib/ops";
import { Button, Tag } from "@/components/ui";
import { useOps } from "./OpsShell";
import o from "./ops.module.css";

type List = { people: PersonRow[]; more: boolean; next?: number; scanned?: number; partial?: boolean };
type SignupInvite = { code: string; maxUses: number | null; uses: number; expiresMs: number | null; revoked: boolean; createdAt: string };

export function People() {
  return <Suspense fallback={<p className={o.empty}>Loading…</p>}><PeopleByQuery /></Suspense>;
}
function PeopleByQuery() {
  const q = (useSearchParams().get("q") || "").trim();
  return <PeopleInner key={q} q={q} />;
}

export function PersonLine({ p, now }: { p: PersonRow; now: number }) {
  return (
    <Link href={`/ops/person/?id=${p.userId}`} className={o.rowLink}>
      <span className={o.rowMain}>
        <span className={o.rowName}>{p.name || p.email}</span>
        <span className={o.rowSub}>{p.email}{p.joinedMs ? ` · joined ${fmtDay(p.joinedMs)}` : ""}{p.device ? ` · ${p.device}` : ""}</span>
      </span>
      {p.role === "admin" && <Tag tone="journal">admin</Tag>}
      {p.status === "pending" && <Tag tone="warning">waiting</Tag>}
      {p.status === "disabled" && <Tag tone="critical">disabled</Tag>}
      {p.status === "deleting" && <Tag tone="critical">being deleted</Tag>}
      <span className={o.rowWhen}>seen {ago(p.lastSeenMs, now)}</span>
    </Link>
  );
}

function PeopleInner({ q }: { q: string }) {
  const { say, refresh } = useOps();
  const [now] = useState(() => Date.now());
  const [list, setList] = useState<List | null>(null);
  const [pending, setPending] = useState<PersonRow[] | null>(null);
  const [invites, setInvites] = useState<SignupInvite[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    const work = q
      ? api<List>("GET", `/ops/people?q=${encodeURIComponent(q)}`).then((found) => { setList(found); })
      : Promise.all([
        api<List>("GET", "/ops/people"),
        api<List>("GET", "/ops/people?status=pending"),
        api<{ invites: SignupInvite[] }>("GET", "/admin/invites"),
      ]).then(([all, wait, inv]) => { setList(all); setPending(wait.people); setInvites(inv.invites); });
    return work.then(() => setFailed(false), (e) => { report("ops", "people_failed", e); setFailed(true); });
  }, [q]);
  useEffect(() => { void load(); }, [load]);

  const more = async () => {
    if (!list?.next) return;
    try { const page = await api<List>("GET", `/ops/people?offset=${list.next}`); setList({ ...page, people: [...list.people, ...page.people] }); }
    catch (e) { report("ops", "people_more_failed", e); say("Couldn't load more"); }
  };
  const act = async (key: string, work: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try { await work(); say(done); await load(); refresh(); }
    catch (e) { report("ops", "people_action_failed", e, { key }, "warn"); say(e instanceof Error ? e.message : "That didn't work"); }
    finally { setBusy(null); }
  };

  if (failed) return <p className={o.empty}>Couldn&apos;t load people. The log has the reason.</p>;
  if (!list) return <p className={o.empty}>{q ? "Searching…" : "Loading…"}</p>;

  if (q) {
    return (
      <>
        <div className={o.title}>
          <h1 className={o.h1}>People</h1>
          <span className={o.sub}>{list.people.length ? `${n(list.people.length)} matching “${q}”` : `nobody matches “${q}”`}{list.partial ? ` · looked through the newest ${n(list.scanned || 0)}` : ""}</span>
        </div>
        <div className={o.list}>{list.people.map((p) => <PersonLine key={p.userId} p={p} now={now} />)}</div>
        <Link href="/ops/people/" className={o.lnk}>Everyone</Link>
      </>
    );
  }

  const live = (invites || []).filter((v) => !v.revoked && (!v.expiresMs || v.expiresMs > now) && (v.maxUses === null || v.uses < v.maxUses));
  return (
    <>
      <div className={o.title}>
        <h1 className={o.h1}>People</h1>
        <span className={o.sub}>newest first · tap someone for their page</span>
      </div>

      {pending && pending.length > 0 && (
        <section aria-label="Waiting for approval" className={o.panel}>
          <div className={o.panelHead}><h2 className={o.h2}>Waiting for approval</h2><Tag tone="warning">{pending.length} waiting</Tag></div>
          {pending.map((p) => (
            <div key={p.userId} className={o.btnRow}>
              <div style={{ flex: "1 1 260px", minWidth: 0 }}><PersonLine p={p} now={now} /></div>
              <Button size="sm" variant="food" disabled={busy === p.userId} onClick={() => { haptic(); void act(p.userId, () => api("POST", `/admin/profiles/${p.userId}/status`, { status: "active" }), `Approved ${p.email}`); }}>Approve</Button>
            </div>
          ))}
        </section>
      )}

      <section aria-label="Everyone" className={o.panel}>
        <div className={o.panelHead}><h2 className={o.h2}>Everyone</h2><span className={o.sub}>{n(list.people.length)}{list.more ? "+" : ""}</span></div>
        <div className={o.list}>{list.people.filter((p) => p.status !== "pending").map((p) => <PersonLine key={p.userId} p={p} now={now} />)}</div>
        {list.more && <div><Button size="sm" variant="secondary" onClick={() => void more()}>Show more</Button></div>}
      </section>

      <section aria-label="Sign-up invites" className={o.panel}>
        <div className={o.panelHead}><h2 className={o.h2}>Sign-up invites</h2><span className={o.sub}>{live.length} working</span></div>
        <p className={o.note}>A link that lets new people in without waiting for you, for anyone not joining a round. Each lets in 10 people within 30 days. Round links are made in Activity by whoever starts the round.</p>
        {live.map((v) => (
          <div key={v.code} className={o.btnRow}>
            <span className={o.rowMain}><span className={`${o.rowName} m`}>{v.code}</span><span className={o.rowSub}>{v.uses} of {v.maxUses ?? "any"} used{v.expiresMs ? ` · until ${fmtDay(v.expiresMs)}` : ""}</span></span>
            <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(inviteUrl(v.code)).then(() => say("Link copied"), () => say("Couldn't copy")); }}>Copy link</Button>
            <Button size="sm" variant="secondary" disabled={busy === v.code} onClick={() => void act(v.code, () => api("DELETE", `/admin/invites/${v.code}`), "Invite turned off")}>Turn off</Button>
          </div>
        ))}
        <div><Button size="sm" variant="activity" disabled={busy === "new-invite"} onClick={() => { haptic(); void act("new-invite", () => api("POST", "/admin/invites", { maxUses: 10, days: 30 }), "Invite made: copy its link"); }}>Make an invite link</Button></div>
      </section>
    </>
  );
}
