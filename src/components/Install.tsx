"use client";

// The page David emails to a new member: how to put Soma on a phone's Home Screen (David, 2026-09-22).
// Public, like /privacy/ and /terms/: it has to open for someone who has never signed in.
//
// It shows every platform's steps, so a printed or forwarded copy is complete, and opens on the one that matches
// the device it is read on. On an iPhone this is not decoration: the evening nudge only arrives for a Home Screen
// app, and only Safari can add one.

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { AndroidAdd, AndroidMenu, IosAdd, IosShare, OnHomeScreen } from "./InstallArt";
import s from "./install.module.css";

const URL = "soma-onkasary.onslate.com";
type Which = "ios" | "android" | "desktop";

/** The pictures beside each platform's steps: drawings of the button to look for, then the result. */
const ART: Record<Which, { art: ReactNode; caption: string }[]> = {
  ios: [
    { art: <IosShare />, caption: "1. Share, in the bottom bar" },
    { art: <IosAdd />, caption: "2. Add to Home Screen" },
    { art: <OnHomeScreen />, caption: "3. Soma, on your Home Screen" },
  ],
  android: [
    { art: <AndroidMenu />, caption: "1. The three dots, top right" },
    { art: <AndroidAdd />, caption: "2. Add to Home screen" },
    { art: <OnHomeScreen />, caption: "3. Soma, on your Home Screen" },
  ],
  desktop: [],
};

const STEPS: Record<Which, { title: string; note: string; steps: string[] }> = {
  ios: {
    title: "iPhone and iPad",
    note: "Use Safari. Other browsers on iPhone cannot add an app that receives Soma's evening reminder.",
    steps: [
      `Open Safari and go to ${URL}.`,
      "Tap the Share button: the square with an arrow pointing up, at the bottom of the screen (at the top on an iPad).",
      "Scroll down the list and tap Add to Home Screen.",
      "Tap Add, at the top right. Soma is now on your Home Screen like any other app.",
      "Open Soma from the Home Screen icon and sign in there.",
    ],
  },
  android: {
    title: "Android",
    note: "Chrome, Samsung Internet and most other Android browsers all work.",
    steps: [
      `Open Chrome and go to ${URL}.`,
      "Tap the three dots at the top right.",
      "Tap Add to Home screen (it may say Install app).",
      "Tap Install, or Add, to confirm.",
      "Open Soma from the Home Screen icon and sign in there.",
    ],
  },
  desktop: {
    title: "Mac and Windows",
    note: "Optional. Soma works in any browser tab; installing it just gives it its own window.",
    steps: [
      `Open Chrome or Edge and go to ${URL}.`,
      "Look for the install icon at the right of the address bar, a screen with a downward arrow.",
      "Click it, then click Install.",
      "On a Mac in Safari, use File, then Add to Dock.",
    ],
  },
};

// The device never changes while the page is open, so there is nothing to subscribe to and one cached answer.
const subscribe = () => () => undefined;
let cached: Which | null = null;
const device = () => (cached ||= guess());

function guess(): Which {
  if (typeof navigator === "undefined") return "ios";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export function Install() {
  // Everything renders for everyone; the device only decides which card is marked, once the page is live in a
  // browser. The exported HTML has no device, so it renders null and the browser fills it in on hydration.
  const which = useSyncExternalStore(subscribe, device, () => null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${URL}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  };

  return (
    <main className={s.page}>
      <Link href="/" className={s.back}><span className={`d ${s.wordmark}`}>Soma</span></Link>
      <h1 className={`d ${s.title}`}>Put Soma on your Home Screen</h1>
      <p className={s.lead}>Soma lives in your browser, so there is nothing to download. Adding it to your Home Screen gives it an icon, opens it full screen without the browser bars, and on an iPhone it is the only way the evening reminder can reach you.</p>

      <div className={s.linkBox}>
        <span className="eb">The link</span>
        <div className={s.linkRow}>
          <a className={`m ${s.link}`} href={`https://${URL}`}>{URL}</a>
          <button type="button" className={s.copy} onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button>
        </div>
      </div>

      {(["ios", "android", "desktop"] as Which[]).map((id) => {
        const open = which === null ? id === "ios" : which === id;
        const block = STEPS[id];
        return (
          <section key={id} className={`${s.card} ${open ? s.open : ""}`} aria-labelledby={`h-${id}`}>
            <h2 id={`h-${id}`} className={s.cardTitle}>
              {block.title}
              {open && <span className={s.you}>your device</span>}
            </h2>
            <p className={s.note}>{block.note}</p>
            <ol className={s.steps}>{block.steps.map((step) => <li key={step}>{step}</li>)}</ol>
            {ART[id].length > 0 && (
              <figure className={s.shots}>
                {ART[id].map((shot) => (
                  <span key={shot.caption} className={s.shot}>
                    {shot.art}
                    <span className={s.caption}>{shot.caption}</span>
                  </span>
                ))}
                <figcaption className={s.drawn}>Drawings, not photographs: your phone will look a little different, but the buttons are where they are shown.</figcaption>
              </figure>
            )}
          </section>
        );
      })}

      <section className={s.card}>
        <h2 className={s.cardTitle}>Once you are in</h2>
        <ol className={s.steps}>
          <li>Sign up with your email. David approves new accounts by hand, so you may wait a little before the app opens up.</li>
          <li>Make a vault passphrase when you first record a journal entry. It encrypts your journal on your own device and cannot be reset, so keep it somewhere safe.</li>
          <li>In Settings, turn on the evening reminder if you want a nudge when your day is still open.</li>
        </ol>
      </section>

      <footer className={s.foot}>
        <Link href="/privacy/">Privacy</Link>
        <Link href="/terms/">Terms</Link>
        <Link href="/">Open Soma</Link>
      </footer>
    </main>
  );
}
