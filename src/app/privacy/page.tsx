// Public. Linked from Google's OAuth consent screen, the sign-in screen and Settings.
// Every statement here describes what the code does today; change the code, change this page (and its date).

import type { Metadata } from "next";
import { Contact, LegalPage } from "@/components/Legal";

export const metadata: Metadata = { title: "Privacy · Soma", description: "What Soma stores, what it cannot read, and who else touches your data." };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="17 September 2026">
      <p>Soma is a small, invitation-only app for keeping a voice journal and tracking food, weight and activity. It is a personal project run by David, not a company. There are no ads, no analytics trackers, and nothing here is sold or used to build a profile of you for anyone else.</p>

      <h2>What Soma stores</h2>
      <ul>
        <li><strong>Your account:</strong> name, email address and sign-in, handled by Zoho Catalyst, the platform Soma runs on. Soma never sees your password.</li>
        <li><strong>What you log:</strong> daily check-ins (mood and habits), meals and recipes, weight, push-ups and other activity, your settings, and your membership and daily target in a push-up round.</li>
        <li><strong>Your journal:</strong> recordings, transcripts, notes and photos.</li>
        <li><strong>From Google Health, only if you connect it:</strong> your daily step totals and, for each night, time asleep, awake and in bed, minutes in each sleep stage, and the times you fell asleep and woke.</li>
        <li><strong>Feedback you send, and error reports</strong> the app files when something breaks (the error message, its technical detail and which screen it happened on).</li>
      </ul>

      <h2>What Soma cannot read</h2>
      <p>Your journal, your sleep data and your Google Health connection are encrypted in your browser with a key made from your vault passphrase, before they are uploaded. The passphrase and the key never leave your device. The server holds only ciphertext, so nobody can read these, David included. The cost of that is real: a forgotten passphrase cannot be reset, and what it protected is gone.</p>
      <p>Everything else in the list above (check-ins, food, weight, activity, steps, rounds, settings) is stored readable by the server, so that leaderboards work and David, as the administrator, can fix a broken record. He does not look at it otherwise.</p>

      <h2>What other members see</h2>
      <p>If you join a push-up round, the other members of that round see your display name, your daily target and how many days you hit it. Nothing else you log is visible to other members.</p>

      <h2>Google Health and Fitbit</h2>
      <p>Connecting is optional and read-only. Soma asks Google for permission to read two things: activity (used for steps) and sleep. It never writes to your Google account.</p>
      <ul>
        <li>Steps are stored with your other activity. Sleep is stored encrypted, as described above.</li>
        <li>Google requires Soma&rsquo;s server to make the requests. The server uses your connection for the moment of each sync and does not keep it; what is stored is a copy encrypted with your vault key, which the server cannot open. This is why a sync only happens while you have Soma open and your vault unlocked.</li>
        <li>Data from Google is shown to you and used to compare your own days in Insights. It is not shared with anyone, not used for advertising, and not used to train AI models.</li>
        <li>Disconnect at any time in Settings. Soma then revokes its access at Google where it can; you can also remove Soma yourself at <a href="https://myaccount.google.com/connections" rel="noreferrer">myaccount.google.com/connections</a>. Steps and sleep already synced stay in your account until you ask for them to be deleted.</li>
      </ul>
      <p>Soma&rsquo;s use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>

      <h2>Transcription</h2>
      <p>Transcription is off unless you switch it on in Settings. While it is on, each new recording is decrypted on your device and sent to Groq, a speech-to-text provider, to be transcribed. The audio is blanked and deleted from Soma&rsquo;s server as soon as Groq has answered, and the transcript is encrypted into your journal on your device. This is the one case in which journal content leaves your device unencrypted, and it only happens with that switch on.</p>

      <h2>Who else handles your data</h2>
      <ul>
        <li><strong>Zoho Catalyst</strong> hosts the app, the database and file storage, in Zoho&rsquo;s United States data centre.</li>
        <li><strong>Google</strong>, only if you connect Google Health.</li>
        <li><strong>Groq</strong>, only if you switch transcription on.</li>
      </ul>
      <p>That is the complete list.</p>

      <h2>On your device</h2>
      <p>Soma keeps a few things in your browser so it works properly: your sign-in session, your vault key for as long as the tab stays open, recordings that have not finished uploading (so a crash or a dead connection does not lose them), and a cache of the app&rsquo;s own files. It sets no advertising or tracking cookies.</p>

      <h2>Keeping and deleting</h2>
      <p>Your data is kept for as long as you have an account. You can delete journal entries and recipes yourself, and clear or change anything you have logged. To have your whole account and everything in it deleted, ask David: <Contact />. It will be done within 30 days. You can ask the same way for a copy of what Soma holds about you. The encrypted parts can only ever be read by you, inside the app, because only you can decrypt them.</p>

      <h2>Children</h2>
      <p>Soma is for adults. Accounts are approved by hand and are not given to anyone under 18.</p>

      <h2>Changes and contact</h2>
      <p>If this policy changes in a way that matters, members are told, and the date at the top changes. For any question about your data, <Contact />.</p>
    </LegalPage>
  );
}
