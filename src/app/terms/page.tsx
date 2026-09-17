// Public. Linked from Google's OAuth consent screen, the sign-in screen and Settings.

import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalPage } from "@/components/Legal";

export const metadata: Metadata = { title: "Terms · Soma", description: "The terms for using Soma." };

export default function Terms() {
  return (
    <LegalPage title="Terms of service" updated="17 September 2026">
      <p>Soma is a small, invitation-only app run by David as a personal project. It is free. Using it means you agree to what is on this page and to the <Link href="/privacy/">privacy policy</Link>.</p>

      <h2>Your account</h2>
      <ul>
        <li>Accounts are approved by hand, are for adults, and are for one person each. Keep your sign-in to yourself.</li>
        <li>David can decline, suspend or close an account, for example one that is abusing the app or other members.</li>
        <li>You can stop at any time and ask for your account and data to be deleted; the privacy policy says how.</li>
      </ul>

      <h2>Your vault passphrase</h2>
      <p>Your journal, sleep data and Google Health connection are encrypted with a passphrase only you know. <strong>It cannot be reset or recovered by anyone.</strong> If you lose it, what it protected is permanently unreadable. Keeping it safe is your responsibility.</p>

      <h2>Your content</h2>
      <p>What you put into Soma is yours. You give Soma permission to store and process it only so the app can work for you: keeping it, showing it back to you, working out your streaks and insights, and showing your round results to the other members of that round.</p>

      <h2>Using it fairly</h2>
      <ul>
        <li>Do not try to reach other people&rsquo;s data, get around the security, overload the app, or use it to do anything unlawful.</li>
        <li>In rounds, log honestly and pick a display name that is fine for the other members to see.</li>
      </ul>

      <h2>Not medical advice</h2>
      <p>Soma records what you tell it and what your tracker reports, and shows patterns in your own record. Those patterns are not proof of cause, and nothing in Soma is medical, nutritional or mental-health advice, a diagnosis or a treatment. Talk to a professional before changing your diet, training or medication. If you are in crisis, contact your local emergency services.</p>

      <h2>Other services</h2>
      <p>Soma runs on Zoho Catalyst. If you connect Google Health, or switch on transcription (which uses Groq), your use of those services is also subject to their own terms. Soma depends on them: if one changes or stops, the feature that relies on it may stop too.</p>

      <h2>No guarantees</h2>
      <p>Soma is provided as it is, by one person, with no warranty of any kind. It may have bugs, be unavailable, change, or be shut down. If it is ever shut down on purpose, members get reasonable notice first. Keep your own copy of anything you cannot afford to lose.</p>
      <p>To the extent the law allows, David is not liable for any loss or damage that comes from using Soma or from not being able to use it, including lost data. Nothing here takes away rights you have by law that cannot be waived.</p>

      <h2>Changes and contact</h2>
      <p>These terms may change. If they change in a way that matters, members are told, and the date at the top changes. Carrying on using Soma after that means you accept the new terms. For anything about these terms, <Contact />.</p>
    </LegalPage>
  );
}
