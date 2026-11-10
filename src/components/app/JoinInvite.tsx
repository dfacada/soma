"use client";

// /join/?c=CODE: where an invite link lands (src/lib/invite.ts). Public, outside the signed-in group: it says what
// the link is for, keeps the code on this device, and sends the person on into Dayhub, where signing up or in picks the
// code up. Someone already signed in is joined to the round the moment Dayhub opens.

import { kindOf } from "@/lib/moves";
import { cap } from "@/lib/today";
import { useEffect, useState } from "react";
import Link from "next/link";
import { cleanCode, forgetInvite, keepInvite, previewInvite, type InvitePreview } from "@/lib/invite";
import { report } from "@/lib/log";
import { ButtonLink } from "@/components/ui";
import a from "./app.module.css";

const when = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

export function JoinInvite() {
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const c = cleanCode(new URLSearchParams(window.location.search).get("c"));
    // Read once from the address on arrival; the state below only ever describes this one link.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(c);
    if (!c) return;
    keepInvite(c);
    // A link that cannot work is not kept: the next sign-in should not try it again.
    previewInvite(c).then((p) => { if (!p.ok) forgetInvite(); setPreview(p); }, (e) => { report("invite", "preview_failed", e, undefined, "warn"); setFailed(true); });
  }, []);

  const round = preview?.round;
  return (
    <main className={a.centered}>
      <span className={a.splashOrb} aria-hidden><i /><i /><i /></span>
      <span className={`d ${a.wordmark}`} style={{ fontSize: 40 }} aria-label="Dayhub">Dayhub</span>
      {code === null && <>
        <span className="d" style={{ fontSize: 26 }}>This link is missing its code</span>
        <p className="muted" style={{ maxWidth: 320 }}>Ask whoever sent it for the whole link.</p>
        <ButtonLink variant="secondary" href="/">Open Dayhub</ButtonLink>
      </>}
      {code && !preview && !failed && <p className="muted">Checking the invite…</p>}
      {code && failed && <>
        <span className="d" style={{ fontSize: 26 }}>You&apos;re invited to Dayhub</span>
        <p className="muted" style={{ maxWidth: 320, textWrap: "balance" }}>Dayhub couldn&apos;t check the invite just now. It&apos;s saved on this device: open Dayhub and it will be used when you sign in.</p>
        <ButtonLink href="/">Open Dayhub</ButtonLink>
      </>}
      {preview && !preview.ok && <>
        <span className="d" style={{ fontSize: 26 }}>This invite doesn&apos;t work</span>
        <p className="muted" style={{ maxWidth: 320, textWrap: "balance" }}>{preview.reason}</p>
        <ButtonLink variant="secondary" href="/">Open Dayhub</ButtonLink>
      </>}
      {preview?.ok && <>
        <span className="eb">{preview.from ? `${preview.from} invited you` : "You're invited"}</span>
        <span className="d" style={{ fontSize: 30, textWrap: "balance", maxWidth: 340 }}>{round ? round.name : "Join Dayhub"}</span>
        <p className="muted" style={{ maxWidth: 340, textWrap: "balance", lineHeight: 1.5 }}>
          {round
            ? `${cap(kindOf(round.kind).round)}: ${round.lengthDays} days from ${when(round.startDate)}, everyone aiming at their own daily target. Dayhub also keeps your journal, food and weight, and closes your day in a few taps.`
            : "Dayhub closes your day in a few taps: a voice journal only you can read, your meals, your weight and your push-ups."}
        </p>
        <ButtonLink href="/">{round ? "Join the round" : "Join Dayhub"}</ButtonLink>
        <p className="muted" style={{ fontSize: 12, maxWidth: 320 }}>New to Dayhub? Sign up on the next screen; this invite lets you straight in.</p>
      </>}
      <p className={a.legal}><Link href="/privacy/">Privacy</Link><Link href="/terms/">Terms</Link></p>
    </main>
  );
}
