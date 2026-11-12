"use client";

// Dayhub's front page (David, 2026-11-11): what a stranger sees at the address before signing in. What Dayhub is in a
// sentence, three real screens, what stays private, and how to get in. Signed-out "/" shows it (SignIn in Session.tsx).
//
// Every line under "What stays yours" says what the code does today, as the privacy page does (src/app/privacy) and
// its in-app twin, Settings → What Dayhub can see (src/lib/privacy-view.ts). Change one, check the others.
// The screens are the screenshot rig's made-up member (scripts/front-shots.mjs makes them), never anyone's real data.

import Image from "next/image";
import Link from "next/link";
import { Button, Medallion, type IconName } from "@/components/ui";
import today from "./front/today.webp";
import sayDay from "./front/say-day.webp";
import insights from "./front/insights.webp";
import a from "./app.module.css";
import f from "./front.module.css";

const SHOTS = [
  { img: today, alt: "Today in Dayhub: a ring of the day's things, three of five done, with Say your day under it", title: "Close your day", text: "A check-in, a few words, your meals and a move, a tap each." },
  { img: sayDay, alt: "Say your day: a list to check, with dinner, a glass of wine and 100 push-ups picked out of one recording", title: "Or say it once", text: "One recording, and Dayhub picks out the rest for you to check." },
  { img: insights, alt: "Insights: what this person's great days have in common", title: "See your good days", text: "What they have in common, and a three-day try of it." },
];

const POINTS: { domain: "journal" | "food" | "activity"; icon: IconName; lead: string; text: string }[] = [
  { domain: "journal", icon: "lock", lead: "Your journal is yours alone.", text: "Entries are sealed on your phone with a passphrase only you know, before they're uploaded. Nobody else can open them, David included." },
  { domain: "food", icon: "leaf", lead: "The rest is readable, for rounds and repairs.", text: "Food, weight, moves and check-ins sit where Dayhub's server can read them, so rounds work and a broken day can be fixed. David sees whether each thing was done, not what, unless he first writes down why, and you can read that." },
  { domain: "activity", icon: "send", lead: "Nothing goes out unless you use it.", text: "Food you name that Dayhub doesn't know yet goes to Claude for its numbers (Groq writes down what you say). Transcription, Say your day, the week in review and journal reading stay off until you turn them on. Settings → What Dayhub can see shows each switch." },
  { domain: "journal", icon: "heart", lead: "No ads, no trackers, nothing sold.", text: "Dayhub is a small private beta run by one person, not a company." },
];

export function Front({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  return (
    <main className={f.front}>
      <header className={f.top}>
        <span className={`d ${a.wordmark} ${f.mark}`} aria-label="Dayhub">Dayhub</span>
        <Button size="sm" variant="secondary" onClick={onSignIn}>Sign in</Button>
      </header>

      <section className={f.hero} aria-labelledby="front-title">
        <span className={`${a.splashOrb} ${f.orb}`} aria-hidden><i /><i /><i /></span>
        <span className="eb">Journal · Food · Moves</span>
        <h1 id="front-title" className={`d ${f.title}`}>Close your day in a minute.</h1>
        <p className={f.lede}>A voice journal only you can read, beside your food, weight and moves, so you can see what your good days have in common.</p>
        <div className={f.ctas}>
          <Button onClick={onSignUp}>Sign up</Button>
          <Button variant="secondary" onClick={onSignIn}>I have an account</Button>
        </div>
      </section>

      <section className={f.shots} aria-label="What Dayhub looks like">
        {SHOTS.map((s) => (
          <figure key={s.title} className={f.shot}>
            <div className={f.phone}><Image src={s.img} alt={s.alt} sizes="(min-width: 720px) 200px, 62vw" /></div>
            <figcaption><b>{s.title}</b>{s.text}</figcaption>
          </figure>
        ))}
      </section>

      <section className={f.card} aria-labelledby="front-private">
        <span id="front-private" className="eb">What stays yours</span>
        <ul className={f.points}>
          {POINTS.map((p) => (
            <li key={p.lead}>
              <Medallion domain={p.domain} icon={p.icon} />
              <p><b>{p.lead}</b> {p.text}</p>
            </li>
          ))}
        </ul>
        <Link href="/privacy/" className={f.more}>Read the privacy policy</Link>
      </section>

      <section className={f.card} aria-labelledby="front-in">
        <span id="front-in" className="eb">Getting in</span>
        <p className={f.cardText}>
          Dayhub is in a small private beta. With an invite link you&apos;re in at once: open the link, then sign up. Without
          one, sign up and David lets you in by hand.
        </p>
        <div className={f.ctas}>
          <Button onClick={onSignUp}>Sign up</Button>
          <Button variant="secondary" onClick={onSignIn}>Sign in</Button>
        </div>
      </section>

      <p className={a.legal}><Link href="/privacy/">Privacy</Link><Link href="/terms/">Terms</Link></p>
    </main>
  );
}
