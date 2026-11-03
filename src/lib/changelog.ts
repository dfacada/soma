// What changed in Soma, newest first, in words for the person using it (David, 2026-09-21: "any updates to the app
// should be summarized and displayed to the end user once upon the next time they open the app", and all of them
// kept in Settings "so we can track all the great improvements").
//
// Every change a user can notice adds a line here in the same commit (CLAUDE.md). Group by the day it shipped:
// a day that already has a release gets another item, a new day gets a new release at the top. Ids never change once
// shipped: the app remembers the newest id each person has seen (settings.seenChanges) and shows what is newer.
// No React and no imports, so scripts/test-changelog.mjs runs this file as it is.

export type Release = { id: string; date: string; title: string; items: string[] };

export const CHANGES: Release[] = [
  {
    id: "2026-11-02",
    date: "2026-11-02",
    title: "Soma Night",
    items: [
      "Food has a new box at the top: tell it your whole day at once, like \"a bacon, egg and cheese on an everything bagel and a small fries for breakfast, a burger with a salad for lunch\". Tap Speak to say it out loud, or type it, then Fill it in. Soma splits it into items with the calories, protein, carbs and fat, and puts each one under the meal you said. Move anything to another meal or remove it, then Log all. Foods you've logged before come back with your own numbers. Meals you said replace what was logged for them; anything without a meal goes under Something else. The meal buttons and Ate something else work as before.",
      "Or skip Food altogether: tap the Food card on Today, say what you ate and which meal it was, and tap it again. It's logged straight away, with no list to check, the same way the Journal card records. The meal buttons on the card still just tick off your planned meals, and anything that came out wrong can be changed on Food.",
      "The Run button on the Activity card now shows someone running, instead of a stopwatch.",
      "Soma Night: the first step of Soma's new look. Soma now opens in Night, a warm near-black with the journal, food and activity colours lit up so they glow. If you picked Light or System before, you keep it. Switch any time in Settings → Appearance, where Dark is now called Night. More of the redesign follows screen by screen.",
      "A new Motion setting in Settings → Appearance: Lively, or Calm, which drops the bounce and stops anything that keeps moving on its own, like the drifting colours on the opening screen and the pulse while recording.",
      "The tabs at the bottom now float in a frosted bar. The tab you're on grows into a pill in its own colour with its name; the others are just icons.",
      "Sheets (weight, push-ups, unlocking your vault and the rest) float up from the bottom with a soft bounce over a blurred background, and confirmations like \"Checked in\" now drop in at the top of the screen.",
      "Cards, buttons, chips and switches are rounder and press in when you tap them. A task's icon fills with its colour and pops when it's done.",
      "Today is rebuilt around the orb: a glowing sphere that lights up purple, green and amber as you finish your check-in and journal, your meals and your activity, with a bead for each task around it and the count in the middle. When the day closes, the ring around it turns into a slow spinning glow.",
      "Today greets you by name with your streak beside it. Under the orb: what's left, then the week (tap a day to fill it in, as before), then a card for each task. Weight and check-in sit side by side; journal, food and activity are wide, with the record and speak buttons on the right and the meals and activities along the bottom.",
      "Check-in opens a sheet with a face for each mood and your habits underneath.",
      "Weight: drag the ruler sideways to set it, nudge by 0.2, or tap the big number to type. Push-ups: tap the big pad once per rep, or use −5, +5 and +10, with a ring filling toward your target. Both still have the one-tap Same as last and Hit the target.",
      "Recording a journal entry now fills the screen: a glowing orb ringed by moving bars, ripples going out, and the time. Tap stop and it shows the entry being sealed, then Saved, and steps aside. It works the same from Today, the Journal tab or the sidebar.",
      "Saying what you ate also fills the screen: listen, then your words appear as they are written down, a shimmer while Soma works out the food, and then each item slides in with the total. It's already logged; tap Done.",
      "Close the day while Soma is open and it celebrates: the orb blooms, light bursts out of it, your streak rolls over to the new number and the week's dots fill in. Once a day, and never for a past day you're filling in.",
      "The opening screen has a small orb with the three colours drifting inside it, and the Soma letters rise in.",
      "Every tab rises in, block by block, each time you open it, under a bigger title.",
      "Journal: a big Say how today went card at the top starts a recording (it replaces the floating microphone), and the lock is a pill that says Vault open.",
      "Food: today's calories in big numbers, a bar split by each meal you've eaten, and protein, carbs and fat side by side. Each meal card has its icon, which turns into a green check once it's eaten.",
      "Activity: push-ups in a big ring that fills toward your target. Tap the middle to count, or add −10, +10 or +25 straight away. Walk, Gym and Run are big buttons underneath; any one closes the day.",
      "Insights: the weight line draws itself in.",
      "A polish pass over every screen. Today: the date, your streak and Settings sit along the top and the greeting gets the full width; your streak and best now sit inside the week card; an empty weight card says Weigh in; and on an earlier day the streak gives way to a Back to today button. Food: each meal shows its calories once, with a Planned or Eaten tag, and its buttons line up two by two. Insights: the 7 days, 30 days, 60 days and 1 year switch runs across the full width under the title instead of off the edge of the screen. Settings: a wide switch drops under its label instead of squeezing the explanation into a narrow column. Card labels are the same quiet style everywhere.",
      "Fixed: a sheet opened from far down a page (What's new in Settings, for one) scrolled the page and sat behind the tab bar. Sheets, confirmations and the full-screen moments now always open over everything, where you are.",
      "Insights is rebuilt around four questions instead of a wall of numbers. What makes a great day: the habits that come with the days you check in as Great, Focused, Peaceful, Grateful or Excited, top three, each showing how often those days were great when you did it and when you didn't. What your journal says: which habits come with your brightest-sounding entries, and on your best days what you talk about. How you're doing: the share of days you closed, a square for every day, and which task most often keeps a day open. And your weight as a seven-day average with its change. Pick 30 days, 60 days or a year.",
      "Your journal stays private in Insights. By default it is read on your phone and nothing leaves it. In Settings → Journal & vault you can choose to have Claude read it for a much better sense of tone and themes: names, places, emails, phone numbers, addresses and links are taken out on your phone first, the days go out shuffled with no dates, nothing about your account is attached, nothing is kept on the server, and only a tone and a few general themes come back, stored encrypted on your phone.",
      "Day by day is back on Insights, under your weight: every day of the window, newest first, with whether it closed, your weight and mood, your meals against your calorie and protein goals (a green check when every eating goal was met, the calories in amber when over), your push-ups, activities and steps, and what kept the day open. A week shows; tap to see them all.",
      "The weight card now compares this week with last: the change in your weight, and next to it your calories a day, protein-goal days, days with all four meals, active days, steps and drinks for both weeks, in green where they moved the helpful way and amber where they didn't. Touch the line to read any day's weight.",
      "Tomorrow's brief: from 6 pm a Tomorrow card sits at the bottom of Today. Tap it to see the next day: weighing in, your check-in and journal, the four meals you have planned with their calories and protein, and your push-up target or a rest day. Once Insights knows what comes with your great days, the brief says so.",
      "Your calendar and tasks in the brief: connect Morgen and Todoist in Settings under Tomorrow's brief. The brief then lays out the day in order (all-day events on top, every event with its time, and the free time between, half an hour or more), and your Todoist tasks: what's carried over (overdue, or still open today) and what's due. The same meeting in two calendars shows once, meetings you declined don't show, and a task Morgen has put on your calendar shows once, on the calendar. The line from Insights now points at a real free block, like \"Great days come with moving · 7–8:30 am is free\". Both keys are sealed with your vault key; Todoist is read straight from your phone, and Morgen through Soma's server, which keeps nothing. Choose which Morgen calendars count in Settings, and tap the arrow at the top of the brief to read it again.",
      "Tomorrow's brief can tell you when it's ready: in Settings under Tomorrow's brief, switch on Tell me when it's ready and pick a time (9 pm unless you change it). Each evening a notification says what day it's for; tap it and the brief opens. On iPhone this works from the Home Screen app, like the evening nudge, and turning the nudge off no longer stops it.",
      "Tapping a Soma notification while Soma is already open now takes you to the right page (your week in review, tomorrow's brief) instead of just bringing Soma forward. The brief's notification no longer replaces an evening nudge you haven't read.",
      "Send tomorrow's brief to Telegram: with Telegram connected (Settings, under Week in review), the brief has a Send to Telegram button, and a switch under Tomorrow's brief sends it by itself once a day, the first time it's read after your brief time. It goes as words: the times and titles of your events, the free time, your tasks and Soma's side of the day, never an event's description, who's invited or a link. Telegram keeps what it is sent.",
    ],
  },
  {
    id: "2026-10-30",
    date: "2026-10-30",
    title: "A lighter unlock",
    items: [
      "The Unlock your vault sheet is smaller. With Face ID set up, it shows just the Face ID button, with Use your passphrase and Not now underneath; tap Use your passphrase for the box. Without Face ID, the passphrase box and Unlock sit on one line.",
      "Fixed: on iPhone, the tab bar rode up on top of the keyboard and covered what you were typing into (Ate something else on Food was the worst of it). The tab bar now steps aside while you type, and Ate something else brings its box into view above the keyboard.",
    ],
  },
  {
    id: "2026-10-21",
    date: "2026-10-21",
    title: "Recordings reach the cloud",
    items: [
      "Fixed: a recording that couldn't upload straight away (usually because the phone was locked or you switched apps while it was sending) waited until you next unlocked the vault. Now it tries again as soon as you're back in Soma, and every few minutes while it waits. It was always safe on your phone in the meantime.",
      "Admin: the Log reads properly on a phone. Each entry is a card; tap it for the full message, every detail and the stack, and Copy row to paste it anywhere.",
      "Search your journal: a search box at the top of the Journal finds entries by what you said or wrote, with the words highlighted. It searches on your phone, after your vault is open; nothing you type is sent anywhere.",
      "Recordings are now backed up to the cloud while you talk, a few seconds at a time and encrypted like everything else. If your phone dies, the app is closed mid-recording, or the upload never gets through, the recording is rebuilt the next time you unlock, on any device.",
      "When Google ends your Fitbit connection, Today now says so at the top with a Reconnect button, instead of steps quietly stopping. Dismiss it and it stays away for a day. Settings shows the state too.",
      "Week in review: on your review day and time, your phone now gets a notification that your week is ready. Open it and the review writes itself (and goes to Telegram if that is on). The numbers under each review now include food: days with all meals logged, and days you hit your protein goal, with your longest run.",
      "Insights has a new Patterns section: your weight with a seven-day average that smooths out the daily swings (with the days you were active marked underneath), and your weight by day of the week, so you can see which day usually reads heavy. It follows the 7-day to 1-year picker, and says plainly when there are too few weigh-ins to read much into it.",
      "Opening Soma now shows what it is doing instead of a plain Loading: starting, checking your account, loading your days, opening your vault and, when it opens by itself, decrypting your entries one by one. Then it fades into Today.",
      "The opening screen now has soft washes of Soma’s purple, green and amber drifting slowly behind the wordmark while it loads. With Reduce Motion on, it stays still.",
      "Patterns now opens with your mood on days you did a thing against days you did not: hitting your protein goal, 10,000 steps, being active, logging every meal, 7 hours of sleep (with your vault open) and staying under your drinks limit. A row needs 3 days on each side before it shows a share; until then it says not enough days yet.",
    ],
  },
  {
    id: "2026-10-20",
    date: "2026-10-20",
    title: "The journal opens again",
    items: [
      "Fixed: past about sixteen entries the Journal stopped loading altogether and sat on \"Decrypting entries\" forever. Storage would only hand out so many download links at once; Soma now asks for them a few at a time, so a journal of any length opens.",
      "If entries ever do fail to load, the screen now says so and offers Try again instead of waiting silently. Nothing was ever lost: the entries stay encrypted and stored either way.",
      "Fixed: on iPhone, playing a recording showed \"Decrypting…\" and then \"Couldn't play this recording\". The iPhone had started saving recordings in a format it can't play back itself. Those recordings now play (Soma converts them as it opens them), and new recordings are saved in a format every phone and browser plays.",
      "Playing a recording can no longer sit on \"Decrypting…\" forever: if a step stalls, Soma stops, says it couldn't play, and you can tap again.",
      "Opening a recording now shows its progress under the play button: downloading (with how much has arrived), decrypting, and converting when your phone needs it. If a step fails, the bar turns red and says which one.",
      "Fixed: some iPhone recordings came back from transcription with \"Transcription failed\" because the service wouldn't accept the file. Soma now converts those and tries once more, so Transcribe works on them.",
      "The tabs at the bottom answer the moment you touch them: the one you tapped lights up straight away, and buttons visibly press on iPhone.",
      "Switching tabs is instant now, with no wait and no blank moment, and each tab stays where you left it: same scroll position, same open section, a recording keeps playing.",
      "Tabs fade into each other with a short, quiet cross-fade (on iPhones with iOS 18 or newer; if Reduce Motion is on, they switch without it).",
    ],
  },
  {
    id: "2026-10-07",
    date: "2026-10-07",
    title: "Your week, read back to you",
    items: [
      "Week in review: once a week Soma reads your journal back to you — what happened, the things worth remembering (a promise made, a date, a decision), what came up more than once, and a few notes where your week and your numbers meet. Open it from Insights.",
      "It is written on your phone with your vault open, because that is the only place your journal can be read. Switch it on under Week in review in Settings: that switch is the one place journal text leaves your device, and nothing happens until you turn it on.",
      "Listen to it: a Listen button reads the review aloud, in Soma's voice where that is available and your phone's own voice otherwise.",
      "Send it to Telegram: connect once in Settings and each week's review arrives as a message, with the audio if you want it.",
      "The audio sent to Telegram is the synopsis read aloud, made in short pieces and stitched into one file, because the voice only takes a few hundred words at a time.",
    ],
  },
  {
    id: "2026-09-23",
    date: "2026-09-23",
    title: "Weight moved to Insights",
    items: [
      "The weight graph now lives on Insights instead of Food, and follows the window you pick there: 7 days, 30, 60 or a year. Logging your weight for the day is still one tap on Today.",
      "Touch or hover a point on that graph and it names the day and the weight: \"183 lb · Wed 16 Sep\". Arrow keys walk along it too.",
    ],
  },
  {
    id: "2026-09-22",
    date: "2026-09-22",
    title: "Sharing Soma, and who is using it",
    items: [
      "A page to send anyone joining: soma-onkasary.onslate.com/install/ shows how to add Soma to a Home Screen on an iPhone, an Android phone or a computer, and what to do once they are in.",
      "That page now draws each step on a phone: which button to tap, where it sits, and what Soma looks like once it is on the Home Screen.",
      "Opening Soma in a browser on a phone now shows those steps once, so nobody has to be told twice. It never appears if Soma is already on your Home Screen, and Settings keeps a link to the steps.",
      "For the admin: Settings \u2192 Admin \u2192 Users now shows when each person last used Soma, most recent first, and how many were around this week. Tap Activity on someone to see their last fortnight: which days they logged, how many journal entries, push-ups and steps.",
    ],
  },
  {
    id: "2026-09-21",
    date: "2026-09-21",
    title: "Fill in the last week",
    items: [
      "Tap any of the last seven days in the strip on Today to fill it in: weight, check-in, meals, activity and push-ups all go to that day, under a bar that says which day you are editing. Food and Activity follow the same day.",
      "On a past day the journal card can record or take a written entry. It is filed under that day and marked \"added later\".",
      "Push-ups logged up to two days late still count for the round. Older ones go to your own record and streak, but not the leaderboard, so nobody can pad a week at the end.",
      "What's new: this screen. It shows once after each update, and every change ever made is in Settings.",
      "The day picked in the week strip now sits in a soft pill that fits its label, so TODAY no longer spills over the edge.",
    ],
  },
  {
    id: "2026-09-20",
    date: "2026-09-20",
    title: "Type what you ate",
    items: [
      "Type a food in plain words and Soma fills the calories, protein, carbs and fat for you to check before logging. Anything you have eaten before comes back instantly; only something new is estimated.",
      "What you type can replace a meal: log it as breakfast, lunch, snack or dinner, or tap \"Ate something else\" on the meal. It counts towards closing the day and your plan stays as it was.",
      "A switch under Food in Settings turns the estimates off.",
    ],
  },
  {
    id: "2026-09-18",
    date: "2026-09-18",
    title: "Face ID for the vault",
    items: [
      "Unlock your journal with Face ID instead of typing your passphrase. Set it up once per device in Settings, under Journal & vault. It works with Keeper and with Apple Passwords, and your passphrase still works everywhere.",
    ],
  },
  {
    id: "2026-09-17",
    date: "2026-09-17",
    title: "The first full week of Soma",
    items: [
      "Today: weight, check-in, journal, four meals and activity close the day, each with one tap, and the streak counts full days in a row.",
      "Journal: encrypted voice entries that survive a crash or a lost connection, with optional transcription.",
      "Food: your Macros plans, recipes and quick snacks, with calories and macros for the day.",
      "Activity: push-up rounds with your own daily target, a chain of days and a leaderboard.",
      "Steps and sleep from Google Health (what Fitbit became), with sleep kept encrypted.",
      "Insights: what your best days have in common, mood by sleep, and a day-by-day record.",
      "An evening nudge naming what is still open, at a time you choose.",
      "Opening words once a day, dark theme, and seven colour palettes.",
    ],
  },
];

/** The releases someone has not seen yet, newest first. Never seen anything: the last week's, at most three. */
export function unseen(seenId: string, today: string, changes: Release[] = CHANGES): Release[] {
  if (!changes.length) return [];
  if (seenId) {
    const at = changes.findIndex((r) => r.id === seenId);
    // An id this build does not know (an older build, a typo) shows only the newest, never the whole history.
    return at === -1 ? changes.slice(0, 1) : changes.slice(0, at);
  }
  const weekAgo = shift(today, -7);
  const recent = changes.filter((r) => r.date >= weekAgo).slice(0, 3);
  return recent.length ? recent : changes.slice(0, 1);
}

function shift(day: string, days: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "21 September 2026". */
export const releaseDate = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
