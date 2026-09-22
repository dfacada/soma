"use client";

// The page David emails to a new member: how to put Soma on a phone's Home Screen (David, 2026-09-22).
// Public, like /privacy/ and /terms/: it has to open for someone who has never signed in. The same words and
// pictures appear inside the app the first time someone opens Soma in a browser (app/InstallSplash.tsx).
//
// It shows every platform's steps, so a printed or forwarded copy is complete, and marks the one that matches the
// device it is read on. On an iPhone this is not decoration: the evening nudge only arrives for a Home Screen app,
// and only Safari can add one.

import Link from "next/link";
import { useState } from "react";
import { ART, SOMA_URL, STEPS, useDevice, type Which } from "./InstallSteps";
import s from "./install.module.css";

export function Install() {
  // Everything renders for everyone; the device only decides which card is marked, once the page is live in a
  // browser. The exported HTML has no device, so it renders null and the browser fills it in on hydration.
  const which = useDevice();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${SOMA_URL}`);
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
          <a className={`m ${s.link}`} href={`https://${SOMA_URL}`}>{SOMA_URL}</a>
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
