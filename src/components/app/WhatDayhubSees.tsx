"use client";

// Settings → What Dayhub can see (David, 2026-11-11: "privacy people can see"). In plain words: what is sealed so only
// you can open it, what Dayhub's server can read, what goes out and to whom with your own switches as they are now,
// what an admin sees in Dayhub Ops, and every time an admin opened your account, with the reason when one was asked
// for. The lists are in src/lib/privacy-view.ts, the in-app twin of the privacy page.
//
// Mounted only while the section is open, so the three reads below happen when someone looks, not on every visit to
// Settings.

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { report } from "@/lib/log";
import { groupVisits, OPS_SEES, readFrom, READABLE, SEALED, sentOut, whenOf, type Kept, type Visit } from "@/lib/privacy-view";
import { Field, Icon, type IconName } from "@/components/ui";
import { useHealth } from "./Health";
import { useSession } from "./Session";
import { useTomorrow } from "./Brief";
import a from "./app.module.css";

/** Open another Settings section (it opens and scrolls into view: Settings listens for the address). */
function openSection(id: string) {
  if (window.location.hash === "#" + id) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else window.location.hash = id;
}

function List({ items, icon, sealed }: { items: Kept[]; icon: IconName; sealed?: boolean }) {
  return (
    <ul className={a.seeList}>
      {items.map((k) => (
        <li key={k.id} className={`${a.seeRow} ${sealed ? a.seeSealed : ""}`}>
          <span className={a.seeIcon} aria-hidden><Icon name={icon} size={14} strokeWidth={2} /></span>
          <span className={a.seeText}><span className={a.seeName}>{k.name}</span><span className={a.seeNote}>{k.note}</span></span>
        </li>
      ))}
    </ul>
  );
}

function State({ on }: { on: boolean | null }) {
  return <span className={`m ${a.seeState} ${on ? a.seeStateOn : ""}`}>{on === null ? "…" : on ? "On" : "Off"}</span>;
}

export function PrivacySettings() {
  const { settings } = useSession();
  const health = useHealth();
  const { links } = useTomorrow();
  const [telegram, setTelegram] = useState<boolean | null>(null);
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ items: Visit[] }>("GET", "/account/audit").then(
      (r) => { if (alive) setVisits(r.items); },
      (e) => { report("privacy", "audit_load_failed", e); if (alive) setFailed(true); },
    );
    api<{ connected: boolean }>("GET", "/telegram").then(
      (r) => { if (alive) setTelegram(r.connected); },
      (e) => report("privacy", "telegram_status_failed", e, undefined, "warn"),
    );
    return () => { alive = false; };
  }, []);

  const out = sentOut(settings, telegram);
  const inbound = readFrom(health.status, links);
  const groups = visits ? groupVisits(visits) : null;

  return (
    <>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>What Dayhub keeps of you, who can read it, and what goes out, with your own switches as they are right now.</p>

      <span className="eb" style={{ paddingTop: 6 }}>Sealed: only you can open it</span>
      <List items={SEALED} icon="lock" sealed />
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Sealed on your device with a key made from your vault passphrase, before anything is uploaded. Nobody else can open it, David included.</p>

      <span className="eb" style={{ paddingTop: 6 }}>Readable by Dayhub&apos;s server</span>
      <List items={READABLE} icon="doc" />

      <span className="eb" style={{ paddingTop: 6 }}>Goes out only with your switch on</span>
      {out.map((o) => (
        <Field key={o.id} name={`${o.name} · to ${o.to}`} help={o.what}>
          <span className={a.seeSwitch}><State on={o.on} /><button type="button" className={a.lnk} style={{ minHeight: 44 }} onClick={() => openSection(o.section)}>Change</button></span>
        </Field>
      ))}
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Dayhub sends these under its own key, with nothing about your account attached, and keeps none of what comes back in the clear.</p>

      <span className="eb" style={{ paddingTop: 6 }}>Read from, only when you connect it</span>
      {inbound.map((l) => (
        <Field key={l.id} name={l.name} help={l.what}>
          <span className={a.seeSwitch}><State on={l.on} /><button type="button" className={a.lnk} style={{ minHeight: 44 }} onClick={() => openSection(l.section)}>Change</button></span>
        </Field>
      ))}

      <span className="eb" style={{ paddingTop: 6 }}>What an admin sees in Dayhub Ops</span>
      <p style={{ fontSize: 13.5, lineHeight: 1.5 }}>{OPS_SEES}</p>

      <span className="eb" style={{ paddingTop: 6 }}>Every time an admin opened your account</span>
      {failed ? <p role="alert" className={a.noteBad}>Couldn&apos;t load the record just now. Close this and open it again.</p>
        : !groups ? <p className="muted" style={{ fontSize: 13 }}>Loading the record…</p>
        : groups.length === 0 ? <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>None so far. If an admin ever opens your account in Dayhub Ops, it shows here, with the reason whenever one is asked for.</p>
        : (
          <ol className={a.seeVisits}>
            {groups.map((g, i) => (
              <li key={i} className={a.seeVisit}>
                <span className={`m ${a.seeWhen}`}>{whenOf(g.at)}{g.times > 1 ? ` · ${g.times} times that day` : ""}</span>
                <span className={a.seeName}>{g.words}</span>
                {g.reason && <span className={a.seeNote}>Reason: “{g.reason}”</span>}
              </li>
            ))}
          </ol>
        )}
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Each look is recorded when it happens, before any values are shown, and no one can change or delete the record.</p>
    </>
  );
}
