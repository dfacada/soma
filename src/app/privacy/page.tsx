// Public. Linked from Google's OAuth consent screen, the sign-in screen and Settings.
// Every statement here describes what the code does today; change the code, change this page (and its date).

import type { Metadata } from "next";
import { Contact, LegalPage } from "@/components/Legal";

export const metadata: Metadata = { title: "Privacy · Dayhub", description: "What Dayhub stores, what it cannot read, and who else touches your data." };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="11 November 2026">
      <p>Dayhub is a small, invitation-only app for keeping a voice journal and tracking food, weight and activity. It is a personal project run by David, not a company. There are no ads, no analytics trackers, and nothing here is sold or used to build a profile of you for anyone else.</p>
      <p>Dayhub was called Soma until 10 November 2026. Only the name changed: what it stores and who can read it are the same.</p>

      <h2>What Dayhub stores</h2>
      <ul>
        <li><strong>Your account:</strong> name, email address and sign-in, handled by Zoho Catalyst, the platform Dayhub runs on. Dayhub never sees your password.</li>
        <li><strong>What you log:</strong> daily check-ins (mood and habits), meals and recipes, weight, push-ups and other activity, your settings, and your membership and daily target in a push-up round.</li>
        <li><strong>Your journal:</strong> recordings, transcripts, notes and photos.</li>
        <li><strong>From Google Health, only if you connect it:</strong> your daily step totals and, for each night, time asleep, awake and in bed, minutes in each sleep stage, and the times you fell asleep and woke.</li>
        <li><strong>Messages you send to David, his replies, and error reports</strong> the app files when something breaks (the error message, its technical detail and which screen it happened on).</li>
      </ul>

      <h2>What Dayhub cannot read</h2>
      <p>Your journal, your sleep data, and your Google Health, Morgen and Todoist connections are encrypted in your browser with a key made from your vault passphrase, before they are uploaded. The passphrase and the key never leave your device. The server holds only ciphertext, so nobody can read these, David included. The cost of that is real: nobody can reset a forgotten passphrase for you. Dayhub gives you a recovery code for that: it is made on your device, shown to you once and never stored, and the server keeps only a copy of your key locked with it, which the code alone can open. With the code you can choose a new passphrase; without the passphrase or the code, what it protected is gone.</p>
      <p>Everything else in the list above (check-ins, food, weight, activity, steps, rounds, settings) is stored readable by the server, so that leaderboards work and David, as the administrator, can fix a broken record. He does not look at it otherwise.</p>

      <h2>What other members see</h2>
      <p>If you join a push-up round, the other members of that round see your display name, your daily target and how many days you hit it. A private round, started by a member, is seen only by the people in it. Nothing else you log is visible to other members.</p>
      <p>If you join Dayhub or a round through someone&rsquo;s invite link, Dayhub notes whose link it was, and the administrator can see that. The person who invited you sees only what any member of the round sees.</p>

      <h2>Google Health and Fitbit</h2>
      <p>Connecting is optional and read-only. Dayhub asks Google for permission to read two things: activity (used for steps) and sleep. It never writes to your Google account.</p>
      <ul>
        <li>Steps are stored with your other activity. Sleep is stored encrypted, as described above.</li>
        <li>Google requires Dayhub&rsquo;s server to make the requests. The server uses your connection for the moment of each sync and does not keep it; what is stored is a copy encrypted with your vault key, which the server cannot open. This is why a sync only happens while you have Dayhub open and your vault unlocked.</li>
        <li>Data from Google is shown to you and used to compare your own days in Insights. It is not shared with anyone, not used for advertising, and not used to train AI models.</li>
        <li>Disconnect at any time in Settings. Dayhub then revokes its access at Google where it can; you can also remove Dayhub yourself at <a href="https://myaccount.google.com/connections" rel="noreferrer">myaccount.google.com/connections</a>. Steps and sleep already synced stay in your account until you ask for them to be deleted.</li>
      </ul>
      <p>Dayhub&rsquo;s use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>

      <h2>Tomorrow&rsquo;s brief: Morgen and Todoist</h2>
      <p>Both are optional and only ever read. You connect them in Settings with a key you make in your own Morgen or Todoist account, and the key is encrypted with your vault key before it is stored, so the server holds only ciphertext it cannot open.</p>
      <ul>
        <li><strong>Morgen</strong> (your calendars): Morgen does not accept requests from Dayhub&rsquo;s web page, so Dayhub&rsquo;s server makes them. Your device opens the key and sends it with each request; the server uses it to read the day&rsquo;s events from Morgen, passes back only times, titles, calendar names and places, and keeps neither the key nor the events. Nothing about an event is written to a log.</li>
        <li><strong>Todoist</strong> (your tasks): read by your device straight from Todoist. The token and the tasks never pass through Dayhub&rsquo;s server.</li>
        <li>The brief is kept on your device for the evening, encrypted with your vault key. Nothing from either service is stored on the server.</li>
        <li>If you send the brief to Telegram (a button, or a switch in Settings), its times, titles, tasks and Dayhub&rsquo;s side of the day go to your chat with Dayhub&rsquo;s Telegram bot as a message. Never a description, an attendee or a link. Telegram keeps what it is sent.</li>
      </ul>

      <h2>Transcription</h2>
      <p>Transcription is off unless you switch it on in Settings. While it is on, each new recording is decrypted on your device and sent to Groq, a speech-to-text provider, to be transcribed. The audio is blanked and deleted from Dayhub&rsquo;s server as soon as Groq has answered, and the transcript is encrypted into your journal on your device. Journal content leaves your device unencrypted only here and in the three Claude features below that read your journal, and each only happens with its own switch on.</p>
      <p>Say your day has a switch of its own, off until you turn it on. While it is on, a recording you make with the Say your day button is sent to Groq in the same way, whatever transcription is set to for your other entries.</p>
      <p>Groq also turns food you say aloud (on Food, or the Food card on Today) into words, and reads the week in review aloud when you tap Listen or send its audio to Telegram.</p>

      <h2>Claude</h2>
      <p>Four features send text to Claude, Anthropic&rsquo;s AI model. Dayhub sends it under its own key, with nothing about your account attached.</p>
      <ul>
        <li><strong>Food estimates</strong> (on unless you switch them off in Settings): what you type or say you ate, along with foods you&rsquo;ve logged before so your own numbers come back. Claude returns calories, protein, carbs and fat.</li>
        <li><strong>Say your day</strong> (off until you switch it on): the words of that one recording, along with your own mood words, habit names, move names and foods you&rsquo;ve logged before. Claude returns what it heard about your weight, mood, habits, food and activity, and you check that list before anything is logged. Dayhub&rsquo;s server keeps neither the words nor the list; the recording and its words are stored only in your journal, encrypted.</li>
        <li><strong>Week in review</strong> (off until you switch it on and agree): that week&rsquo;s journal entries, decrypted on your device, with their dates and moods. The review that comes back is encrypted with your vault key before it is stored; Dayhub&rsquo;s server keeps neither the entries nor the review in the clear.</li>
        <li><strong>Reading your journal for Insights</strong> (only if you choose With Claude): names, places, emails, phone numbers, addresses and links are taken out on your device first, and the days are sent shuffled with no dates. Only a tone and a few general themes come back.</li>
      </ul>

      <h2>Who else handles your data</h2>
      <ul>
        <li><strong>Zoho Catalyst</strong> hosts the app, the database and file storage, in Zoho&rsquo;s United States data centre.</li>
        <li><strong>Google</strong>, only if you connect Google Health.</li>
        <li><strong>Morgen</strong> and <strong>Todoist</strong>, only if you connect them for tomorrow&rsquo;s brief.</li>
        <li><strong>Telegram</strong>, only if you connect it: the week in review, and tomorrow&rsquo;s brief when you send it, arrive there as messages.</li>
        <li><strong>Groq</strong>, for speech: transcription if you switch it on, Say your day if you switch it on, food you say aloud, and the week in review read aloud when you ask for it.</li>
        <li><strong>Anthropic</strong> (Claude), for food estimates, Say your day and the week in review if you switch them on, and reading your journal for Insights if you choose it.</li>
      </ul>
      <p>That is the complete list.</p>

      <h2>On your device</h2>
      <p>Dayhub keeps a few things in your browser so it works properly: your sign-in session, your vault key for as long as the tab stays open, recordings that have not finished uploading (so a crash or a dead connection does not lose them), tomorrow&rsquo;s brief for the evening (encrypted with your vault key), and a cache of the app&rsquo;s own files. It sets no advertising or tracking cookies.</p>

      <h2>Keeping and deleting</h2>
      <p>Your data is kept for as long as you have an account. You can delete journal entries and recipes yourself, and clear or change anything you have logged.</p>
      <p>To delete your whole account and everything in it, use Settings → Your data → Delete my account. Your sign-in is removed at once and everything else within minutes: your journal and recordings, every day you logged, your weekly reviews, sleep and steps, and your place in any rounds. What Dayhub kept on that device goes too. It can&rsquo;t be undone. In the same place you can download a copy of everything Dayhub holds about you; with your vault unlocked, the copy includes your journal, weekly reviews and sleep, opened on your device.</p>
      <p>If you can&rsquo;t get into Dayhub, ask David: <Contact />. It will be done within 30 days. The encrypted parts can only ever be read by you, because only you can decrypt them.</p>

      <h2>Children</h2>
      <p>Dayhub is for adults. It is not for anyone under 18, and an account that turns out to belong to someone under 18 is closed.</p>

      <h2>Changes and contact</h2>
      <p>If this policy changes in a way that matters, members are told, and the date at the top changes. For any question about your data, <Contact />.</p>
    </LegalPage>
  );
}
