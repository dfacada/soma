"use client";

// Dayhub Ops · one person: who they are, fourteen days done or not (never the values), their issues and errors, the
// thread with them, and their AI use today. Their food, weight and activity values open only with a reason, which is
// written to the audit before anything is shown. Their journal is sealed with their passphrase: Ops counts entries.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { ago, fmtDay, fmtTime, initial, n, SEV_WORDS, zone, type PersonView, type Revealed } from "@/lib/ops";
import { Button, Icon, Input, Tag } from "@/components/ui";
import { IssueDetail, sevClass } from "./Issues";
import { useOps } from "./OpsShell";
import o from "./ops.module.css";

/** A cell for something that doesn't close this person's day (they chose it, settings.closes): dimmed, and says so. */
const notAsked = (counts: boolean, what: string) => (counts ? { title: undefined, style: undefined } : { title: `${what} doesn't close their day`, style: { opacity: 0.4 } });

export function Person() {
  return <Suspense fallback={<p className={o.empty}>Loading…</p>}><PersonById /></Suspense>;
}
function PersonById() {
  const id = useSearchParams().get("id") || "";
  return <PersonInner key={id} id={id} />;
}

const SAVED = [
  { label: "Reopen the home-screen app", text: "could you close Dayhub completely and open it again from your home screen? That usually brings missing entries back." },
  { label: "Reconnect Fitbit", text: "your Fitbit stopped syncing. Open Settings → Fitbit · Google Health and tap Connect, and your steps will catch up." },
  { label: "Turn reminders back on", text: "your evening reminders stopped reaching your phone. Turn Evening nudge off and on again in Settings and they'll come back." },
  { label: "Thanks for writing", text: "thanks for telling me. I've added it to the list." },
];

function PersonInner({ id }: { id: string }) {
  const { say, refresh } = useOps();
  const router = useRouter();
  const [data, setData] = useState<PersonView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(() => {
    if (!/^\d{1,19}$/.test(id)) return Promise.resolve().then(() => setFailed("No person was named."));
    return api<PersonView>("GET", `/ops/people/${id}?tz=${encodeURIComponent(zone())}`)
      .then((d) => { setData(d); setFailed(null); }, (e) => { report("ops", "person_failed", e); setFailed(e instanceof Error ? e.message : "Couldn't load this person."); });
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, work: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try { await work(); say(done); await load(); refresh(); return true; }
    catch (e) { report("ops", "person_action_failed", e, { key }, "warn"); say(e instanceof Error ? e.message : "That didn't work"); return false; }
    finally { setBusy(null); }
  };

  if (failed) return <p className={o.empty}>{failed}</p>;
  if (!data) return <p className={o.empty}>Loading…</p>;
  const p = data.person;
  const open3 = data.issues.filter((it) => it.sev !== "handled");
  const today = data.days[0];
  const send = () => { haptic(); void act("send", () => api("POST", `/ops/people/${p.userId}/messages`, { body: draft.trim() }), "Message sent").then((ok) => { if (ok) setDraft(""); }); };

  return (
    <>
      <section aria-label={p.shortName} className={o.personHead}>
        <span className={o.avatar} aria-hidden="true">{initial(p.name, p.email)}</span>
        <div className={o.who}>
          <div className={o.whoTop}>
            <h1 className={o.whoName}>{p.shortName}</h1>
            <span className={`${o.sev} ${p.status === "active" ? o.sevOk : p.status === "pending" ? o.sevWatching : o.sevNeeds}`}>{p.status === "pending" ? "Waiting" : p.status === "deleting" ? "Being deleted" : p.status}</span>
            {p.role === "admin" && <Tag tone="journal">admin</Tag>}
            {open3.length > 0 && <span className={`${o.sev} ${o.sevNeeds}`}>{open3.length} issue{open3.length === 1 ? "" : "s"}</span>}
            {data.self && <Tag>you</Tag>}
          </div>
          <span className={o.whoLine}>{p.email} · id {p.userId}</span>
          <span className={o.whoMore}>
            {p.joinedMs ? `Joined ${fmtDay(p.joinedMs)}` : "Joined before Ops"}
            {p.invitedByName ? <>, invited by <Link href={`/ops/person/?id=${p.invitedBy}`} className={o.lnk}>{p.invitedByName}</Link></> : ""}
            {` · last seen ${ago(p.lastSeenMs)}`}{p.device ? ` · ${p.device}` : ""}
            {` · moves: ${p.moves.moves.join(", ") || "not chosen yet"}${p.moves.legacy ? " (from before moves)" : ""}`}
          </span>
        </div>
        {!data.self && (
          <div className={o.btnRow}>
            <Button size="sm" variant="activity" onClick={() => composer.current?.focus()}>Message</Button>
            {p.status === "pending" && <Button size="sm" variant="food" disabled={busy !== null} onClick={() => { haptic(); void act("approve", () => api("POST", `/admin/profiles/${p.userId}/status`, { status: "active" }), `${p.first} is in`); }}>Approve</Button>}
            {(p.status === "active" || p.status === "disabled") && <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void act("status", () => api("POST", `/admin/profiles/${p.userId}/status`, { status: p.status === "active" ? "disabled" : "active" }), p.status === "active" ? "Disabled" : "Re-enabled")}>{p.status === "active" ? "Disable" : "Re-enable"}</Button>}
            {p.status !== "deleting" && <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void act("role", () => api("POST", `/admin/profiles/${p.userId}/role`, { role: p.role === "admin" ? "member" : "admin" }), p.role === "admin" ? "Now a member" : "Now an admin")}>{p.role === "admin" ? "Make member" : "Make admin"}</Button>}
            {p.status !== "deleting" && p.role !== "admin" && <Button size="sm" variant="secondary" onClick={() => setDeleting(!deleting)}>Delete account…</Button>}
          </div>
        )}
      </section>

      {deleting && <DeleteAccount email={p.email} first={p.first} onDone={() => { say(`${p.first}'s account is being deleted`); refresh(); router.push("/ops/people/"); }} userId={p.userId} />}

      <div className={o.pair} style={{ alignItems: "flex-start" }}>
        <div className={`${o.stack} ${o.wide}`}>
          <section aria-label="Last 14 days" className={o.panel}>
            <div className={o.panelHead}>
              <h2 className={o.h2}>Last 14 days</h2>
              <span className={o.note}>Done or not. No values: what they ate, weighed or did stays theirs.</span>
            </div>
            <div className={o.scroll}>
              <div className={o.grid} role="img" aria-label={`Fourteen days of done or not. ${data.closed} closed.`}>
                <div className={o.gridLabels}><span>Weight</span><span>Check-in</span><span>Journal</span><span>Food</span><span>Move</span><span /></div>
                {[...data.days].reverse().map((d) => (
                  <div key={d.day} className={o.gridCol}>
                    <span className={`${o.cell} ${d.weight ? o.cellWeight : ""}`} {...notAsked(p.counts.weight, "weight")} />
                    <span className={`${o.cell} ${d.checkin ? o.cellJournal : ""}`} {...notAsked(p.counts.checkin, "the check-in")} />
                    <span className={`${o.cell} ${d.journal ? o.cellJournal : ""}`} {...notAsked(p.counts.journal, "the journal")} />
                    <span className={`${o.cell} ${d.food ? o.cellFood : d.meals ? o.cellPart : ""}`} {...notAsked(p.counts.food, "food")} title={p.counts.food && p.counts.meals < 4 ? `${p.counts.meals} meals count for them` : notAsked(p.counts.food, "food").title} />
                    <span className={`${o.cell} ${d.move ? o.cellMove : ""}`} {...notAsked(p.counts.activity, "a move")} />
                    <span className={`${o.gridDay} ${d.closed ? o.gridDayClosed : ""}`}>{d.day.slice(8).replace(/^0/, "")}</span>
                  </div>
                ))}
              </div>
            </div>
            <span className={o.sub}>{data.closed} of 14 days closed · streak {data.streak} · today {today?.closed ? "closed" : "open"} · their days, by {p.zone}</span>
          </section>

          {data.issues.length > 0 && (
            <section aria-label="Issues" className={o.panel}>
              <h2 className={o.h2}>Issues</h2>
              {data.issues.map((it) => (
                <div key={it.key} className={o.stack} style={{ gap: 8 }}>
                  <button type="button" className={`${o.item} ${open === it.key ? o.itemOn : ""}`} aria-expanded={open === it.key} onClick={() => setOpen(open === it.key ? null : it.key)}>
                    <span className={o.itemTop}><span className={`${o.sev} ${sevClass(it.sev)}`}>{SEV_WORDS[it.sev]}</span><span className={o.itemTitle}>{it.title}</span><span className={o.itemKind}>{it.kind}</span></span>
                    <span className={o.itemMeta}>{it.meta}</span>
                  </button>
                  {open === it.key && <IssueDetail it={it} compact say={say} onChanged={() => { void load(); refresh(); }} />}
                </div>
              ))}
            </section>
          )}

          <section aria-label="Errors" className={o.panel}>
            <div className={o.panelHead}><h2 className={o.h2}>Their errors, last 7 days</h2><Link href="/ops/errors/" className={o.lnk}>All errors</Link></div>
            {data.errors.length === 0 ? <p className={o.note}>None.</p> : (
              <div className={o.scroll}>
                <table className={o.table} style={{ minWidth: 520 }}>
                  <thead><tr><th scope="col">When</th><th scope="col">What</th><th scope="col">Where</th></tr></thead>
                  <tbody>
                    {data.errors.map((e, i) => (
                      <tr key={i}>
                        <td className={`${o.mono} ${o.dim}`} style={{ whiteSpace: "nowrap" }}>{fmtTime(e.at)}</td>
                        <td className={o.mono}>{e.area} · {e.event}{e.status ? ` · ${e.status}` : ""}{e.level === "warn" ? <span className={o.dim}> (warning)</span> : null}</td>
                        <td className={o.dim}>{[e.device, e.screen, e.source !== "client" ? e.source : null].filter(Boolean).join(" · ") || "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="Support" className={o.panel}>
            <h2 className={o.h2}>Messages</h2>
            {data.thread.length === 0 ? <p className={o.note}>Nothing between you yet.</p> : (
              <div className={o.thread}>
                {data.thread.map((m, i) => (
                  <div key={i} className={`${o.bubble} ${m.sender === "admin" ? o.bubbleMine : ""}`}>
                    <span className={o.bubbleWho}>{m.sender === "admin" ? (m.who || "Dayhub") : p.first} · {fmtTime(m.at)}{m.feedback ? " · from the feedback form" : ""}{m.sender === "admin" ? (m.read ? " · read" : " · not read yet") : ""}</span>
                    <span className={o.bubbleBody}>{m.body}</span>
                  </div>
                ))}
              </div>
            )}
            {!data.self && (
              <>
                <div className={o.filters} role="group" aria-label="Saved replies">
                  {SAVED.map((r) => <button key={r.label} type="button" className={o.filter} onClick={() => setDraft(`Hi ${p.first}, ${r.text}`)}>{r.label}</button>)}
                </div>
                <label className={o.label}>
                  <span className="eb">Reply</span>
                  <textarea ref={composer} className={o.ta} rows={3} maxLength={2000} value={draft} placeholder={`Write to ${p.first}. It shows in Dayhub as a message from you.`} onChange={(e) => setDraft(e.target.value)} />
                </label>
                <div><Button size="sm" variant="activity" disabled={busy !== null || !draft.trim()} onClick={send}>{busy === "send" ? "Sending…" : "Send"}</Button></div>
              </>
            )}
          </section>
        </div>

        <div className={`${o.stack} ${o.narrow}`}>
          <Values userId={p.userId} first={p.first} self={data.self} />
          <section aria-label="Journal" className={o.panel}>
            <div className={o.lock}>
              <span className={`${o.lockIcon} ${o.lockJournal}`}><Icon name="lock" size={18} /></span>
              <h2 className={o.h2} style={{ fontSize: 17 }}>Journal: never visible</h2>
            </div>
            <p className={o.note}>{n(data.journal.entries)} entr{data.journal.entries === 1 ? "y" : "ies"}{data.journal.lastMs ? `, the last ${ago(data.journal.lastMs)}` : ""}, sealed with their passphrase on their devices. Ops sees how many and when, nothing else, and has no way to open them.</p>
          </section>
          <section aria-label="AI use today" className={o.panel}>
            <h2 className={o.h2} style={{ fontSize: 18 }}>AI use today</h2>
            {data.ai.map((a) => (
              <div key={a.kind} className={o.meter}>
                <div className={o.meterHead}><span>{a.what.charAt(0).toUpperCase() + a.what.slice(1)}</span><span className="muted">{n(a.used)} of {n(a.max)}</span></div>
                <div className={`${o.track} ${o.trackThin}`}><div className={`${o.fill} ${o.fillJournal}`} style={{ width: `${Math.min(100, (a.used / a.max) * 100)}%` }} /></div>
              </div>
            ))}
            <p className={o.note}>Daily limits, counted in UTC days. Admins are counted but never stopped.</p>
          </section>
        </div>
      </div>
    </>
  );
}

/** Their food, weight and activity values: locked; open with a reason, which goes in the audit first; gone again
 *  when you leave the page. */
function Values({ userId, first, self }: { userId: string; first: string; self: boolean }) {
  const [view, setView] = useState<"locked" | "asking" | "shown">("locked");
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Revealed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = async () => {
    setBusy(true); setError(null);
    try { setValues(await api<Revealed>("POST", `/ops/people/${userId}/reveal?tz=${encodeURIComponent(zone())}`, { reason: reason.trim() })); setView("shown"); }
    catch (e) { report("ops", "reveal_failed", e, undefined, "warn"); setError(e instanceof Error ? e.message : "That didn't work"); }
    finally { setBusy(false); }
  };
  const hide = () => { setView("locked"); setValues(null); setReason(""); };
  const moveText = (types: Record<string, unknown>) => Object.entries(types).map(([k, v]) => (v === true ? k : v && typeof v === "object" ? `${(v as { label?: string }).label || k} ${(v as { n?: number }).n ?? ""} ${(v as { u?: string }).u ?? ""}`.trim() : null)).filter(Boolean).join(", ");

  return (
    <section aria-label="Health values" className={o.panel} style={{ borderColor: "var(--hairline-strong)" }}>
      <div className={o.lock}>
        <span className={o.lockIcon}><Icon name="lock" size={18} /></span>
        <h2 className={o.h2} style={{ fontSize: 17 }}>Food, weight and activity values are hidden</h2>
      </div>
      {view === "locked" && (
        <>
          <p className={o.note}>The server can read them so boards and fixes work, but nobody here looks without a reason. Opening them is written to Audit with your name and the reason, and {self ? "you" : first} can read that record in Settings → What Dayhub can see.{self ? " These are your own." : ""}</p>
          <div><Button size="sm" variant="secondary" onClick={() => setView("asking")}>Show for support…</Button></div>
        </>
      )}
      {view === "asking" && (
        <>
          <label className={o.label}>
            <span style={{ fontSize: 13 }}>Why do you need to see them?</span>
            <textarea className={o.ta} rows={2} maxLength={200} value={reason} placeholder={`${first} asked me to fix a wrong weight on Nov 6`} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 64 }} />
          </label>
          {error && <span className={o.bad}>{error}</span>}
          <div className={o.btnRow}>
            <Button size="sm" variant="activity" disabled={busy || reason.trim().length < 4} onClick={() => void reveal()}>{busy ? "Recording…" : "Show and record it"}</Button>
            <Button size="sm" variant="secondary" onClick={hide}>Cancel</Button>
          </div>
        </>
      )}
      {view === "shown" && values && (
        <>
          <span className={o.recorded}>Recorded in Audit · “{values.reason}” · hidden again when you leave</span>
          <div className={o.values}>
            {values.weight.map((w) => <span key={"w" + w.day} className={o.value}><span>Weight, {w.day.slice(5)}</span><span>{w.value} {values.unit}</span></span>)}
            {values.activity.map((x) => { const t = [x.pushups ? `${x.pushups} push-ups` : "", x.steps ? `${n(x.steps)} steps` : "", moveText(x.types)].filter(Boolean).join(", "); return t ? <span key={"a" + x.day} className={o.value}><span>Moves, {x.day.slice(5)}</span><span>{t}</span></span> : null; })}
            {values.food.map((f) => { const t = Object.entries(f.meals).filter(([, m]) => m).map(([k, m]) => `${k}: ${m!.name || "ticked, no numbers"}${m!.kcal ? ` ${m!.kcal} kcal` : ""}`).join("; "); return t ? <span key={"f" + f.day} className={o.value}><span>Food, {f.day.slice(5)}</span><span>{t}</span></span> : null; })}
            {!values.weight.length && !values.activity.length && !values.food.length && <span className={o.note}>Nothing logged in the last 14 days.</span>}
          </div>
          <div><Button size="sm" variant="secondary" onClick={hide}>Hide again</Button></div>
        </>
      )}
    </section>
  );
}

/** Deleting someone's account, only on their request: their email typed to confirm, and whose request it was. The
 *  audit row is written first; without it nothing is deleted. */
function DeleteAccount({ userId, email, first, onDone }: { userId: string; email: string; first: string; onDone: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = confirm.trim().toLowerCase() === email.toLowerCase() && reason.trim().length >= 4;
  const go = async () => {
    setBusy(true); setError(null);
    try { await api("POST", `/ops/people/${userId}/delete`, { confirm: confirm.trim(), reason: reason.trim() }); onDone(); }
    catch (e) { report("ops", "delete_failed", e, undefined, "warn"); setError(e instanceof Error ? e.message : "That didn't work"); }
    finally { setBusy(false); }
  };
  return (
    <section aria-label="Delete account" className={o.panel} style={{ borderColor: "var(--critical)" }}>
      <h2 className={o.h2}>Delete {first}&apos;s account</h2>
      <p className={o.note}>Only when they ask. Everything goes: their days, journal, recordings, rounds and sign-in. It cannot be undone, and it is recorded in Audit with your name and the reason.</p>
      <label className={o.label}><span style={{ fontSize: 13 }}>Type their email to confirm</span><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={email} autoComplete="off" /></label>
      <label className={o.label}><span style={{ fontSize: 13 }}>Whose request is it?</span><Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Their email to me of Nov 8" /></label>
      {error && <span className={o.bad}>{error}</span>}
      <div><Button size="sm" variant="danger" disabled={!ok || busy} onClick={() => void go()}>{busy ? "Deleting…" : "Delete the account"}</Button></div>
    </section>
  );
}
