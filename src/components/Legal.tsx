// Shell for the two public documents, /privacy/ and /terms/. They sit outside the signed-in group: Google's OAuth
// consent screen links to them, so they must open for anyone, signed in or not.

import Link from "next/link";
import type { ReactNode } from "react";
import s from "./legal.module.css";

/** Shown on both pages when set. Until David picks a public address, Feedback in Settings is the contact. */
export const CONTACT_EMAIL = "";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className={s.page}>
      <Link href="/" className={s.back}><span className={`d ${s.wordmark}`}>Soma</span></Link>
      <h1 className={`d ${s.title}`}>{title}</h1>
      <p className="eb">Last updated {updated}</p>
      <div className={s.body}>{children}</div>
      <footer className={s.foot}>
        <Link href="/privacy/">Privacy</Link>
        <Link href="/terms/">Terms</Link>
        <Link href="/">Open Soma</Link>
      </footer>
    </main>
  );
}

export function Contact() {
  return CONTACT_EMAIL
    ? <>write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, or use Feedback at the bottom of Settings inside the app</>
    : <>use Feedback at the bottom of Settings inside the app; it goes straight to David</>;
}
