// What changed in Soma, newest first, in words for the person using it (David, 2026-09-21: "any updates to the app
// should be summarized and displayed to the end user once upon the next time they open the app", and all of them
// kept in Settings "so we can track all the great improvements").
//
// Every change a user can notice adds a line here in the same commit (CLAUDE.md). Group by the day it shipped:
// a day that already has a release gets another item at the top of its list, a new day gets a new release at the
// top. Ids never change once shipped: the app remembers the newest id each person has seen and how many lines it had
// then (settings.seenChanges, "2026-11-03#12"), and shows what is newer, including lines added to that release since.
// No React and no imports, so scripts/test-changelog.mjs runs this file as it is.

export type Release = { id: string; date: string; title: string; items: string[] };

export const CHANGES: Release[] = [
  {
    id: "2026-11-07",
    date: "2026-11-07",
    title: "Every screen, polished",
    items: [
      "Journal: Every entry loads, however many you write. Soma read only your newest 100 before; nobody had got that far yet, and now it reads them all.",
      "Fixed: entries you could already read stay readable when you leave mid-load. Jumping out of Soma while it loads your journal (to reconnect Fitbit, say) cut the downloads short, and those entries showed as unreadable until the next load.",
      "Fixed: Face ID unlock no longer waits forever if your phone has lost what it saved for Face ID. Soma asks for your passphrase instead, and you can set Face ID up again in Settings.",
      "Fixed: one unreadable recording on your phone no longer holds up the rest. If Safari can't read back something Soma saved on your phone, the other recordings still upload, and Soma no longer says a recording wasn't saved when it was.",
      "A first day that starts clean. Someone opening Soma for the first time no longer gets What's new about screens they have never seen, and the days before they joined stay quiet in the week instead of counting as missed.",
      "Today: No flame until there is a streak. On a first day the corner stays clear and the week says “Close today for your first full day.”",
      "Food: A newcomer can make the plan theirs. A card says everyone starts on the same targets, with a button to set your own calories and protein, or keep these.",
      "Making your vault comes with advice. A short sentence of four or five words works best, and your phone can save it for you.",
      "Insights asks you to make your vault, not unlock it, when you haven't made one yet.",
      "Admin: A new sign-up reaches you on Telegram. Someone waiting for approval no longer waits unseen, and the waiting screen now shows Soma itself.",
      "Privacy: Tighter locks on where your data lives. Soma's database and file storage now answer only to Soma's own server, and a voice transcription you walk away from mid-way no longer leaves its words on the server: whatever it left is shredded within the hour.",
      "Telegram connects only to your own chat with the bot. A code sent in a group is refused, so nothing Soma sends can land in a group.",
      "Admin: Someone you take out of a round stays out. Before, they could join it again on their own; now only you can put them back.",
      "Coloured buttons are easier to read in Light. Hit the target, Log all, Look up, Unlock, Activity's +25 and the other buttons filled with a colour are a shade deeper, so their white words stand out clearly.",
      "The steps chart is easier to read in Light. The 8k on the goal line and today's day under the bars are a deeper orange. The bars and the goal line keep their colour.",
      "Today: The week row matches the others. The day names under the checks are in Soma's number font, like Activity's week and the steps and sleep sheets.",
      "Today: Numbers are in the number font. The count in the line under the orb, your weight change, a counted habit and the push-up target beside your count now match every other number in Soma.",
      "Food: The date reads the way Today writes it. The top of Food says Friday 6 Nov instead of Friday · November 6.",
      "Activity: The line above the title says which streak it counts. It reads 12 full days in a row, the same full days as Today's week card, so it no longer looks like a push-up streak.",
      "Today: The ring around the orb matches its beads. Each task lights its own stretch of the ring in its own colour: a done task sits on a lit arc, food fills in meal by meal, and a task still to do leaves its stretch empty.",
      "Today: Only what's up next asks for a tap. The Journal and Food record buttons stay soft until their card is Up next, so one thing at a time stands out. The words inside the orb (Done today, Day closed and the /5) are brighter, with a soft shadow, so they read clearly against its colours.",
      "Today: The cards line up. Your mood sits level with your weight and the lines under them start at the same height, and Food's calories are a big number like your weight and your push-ups.",
      "Today: A closed day says your streak once. The line under the orb is gone on a closed day, because the week card just below shows your streak beside your best, and the week card keeps its own colour instead of picking up the orb's glow. On an open day, the line under the orb sits closer to it.",
      "The Today tab's ring is orange, like today in the week row. It used to fill in green, the food colour. Its empty part is a pale tint of the same orange, so 3 of 5 looks the same in both places, and closing the day still lights the whole ring.",
      "Sheets open whole. A sheet can now rise to 90% of the screen, so Last night no longer opens with its bottom line cut off by the rounded corner. A sheet that's still taller than the screen, on a small phone or for a long recipe, fades out at the bottom instead of cutting a line in half.",
      "Sleep: Each night reads as a length, like 7h28m. It used to say 7:28, which looked like a time of day. The bar under last night lights up and glows only when you reach your goal, like the steps bar, and awake time is grey instead of orange, the colour Soma keeps for activity.",
      "Steps and sleep: The charts line up. The number and the weekday under each bar sit right under its middle, and on the steps sheet's 30-day view the dates sit under the right days.",
      "Weight and push-ups put the number in the middle. On both sheets the big number is centred over the ruler's needle or the +1 pad, with lb or / 100 just beside it, and your weight change sits right under your weight. Clear today's weight and Clear today's push-ups are underlined, so they read as links.",
      "The push-up pad sits evenly between your count and the quick buttons. It used to crowd the −5, +5 and +10 row. In Light its +1 and Tap per rep are darker, and in both themes its glow fades out evenly.",
      "Habits on the check-in sheet sit with their own label. The Habits label is closer to its chips than to the moods above it, and the two rows of chips have more room between them, so a tap lands on the habit you meant.",
      "Journal: A locked journal puts Unlock in the middle of the screen. The card sits in the middle with its words centred and Unlock as one wide button. Create vault looks the same before you've made a vault.",
      "Journal: Each recording's length shows once, in its player. The top of an entry shows just the time you recorded it; the player keeps the length and counts along as it plays.",
      "Journal: The links under each entry are quieter. Edit, Transcribe again and Delete are the same soft grey, with more room between them and the same space above and below as the rest of the card. Transcribe keeps the journal colour only on an entry with no words yet, when it's the next thing to do. Edit and the Lock button beside the title are easier to tap.",
      "Food: Long meal names show in full. A name that doesn't fit, like Vanilla-Almond Protein Yogurt Bowl, wraps onto a second line instead of being cut off, with room above and below it. Tomorrow's brief does the same.",
      "Food: The calorie bar is one green. Each meal is still its own piece, so the bar reads as the day built from meals, not as a key to protein, carbs and fat. The target beside the big number, / 2,100 kcal, is in the number font like the macros below it.",
      "Food: Tell me what you ate matches the other text fields. It has the same height and corners as the field further down, with its mic resized to match. That field now says Name one item, since it takes one food at a time while the box above takes the whole day.",
      "Activity: The round's ring shows the day of the round. It reads 20 of 30 in big numbers instead of a percentage, and the card's heading is just the round's name, like November Round, with your daily target in the line under it.",
      "Activity: Missed days in the round are easier to spot. A missed day is a hollow box, a day still to come is a blank slot, and a rest day is hatched like the rest day in the last seven days. The key matches, and the tally under the grid reads like the week's, for example 13 of 17 hit · 76%.",
      "Activity: The leaderboard is tidier. Every row is the same height, your badges fit on one line beside your name, and each person's hits sit over their daily target in one column. Your row is a rounded highlight.",
      "Activity: Steps sit right under the push-ups card. They're above Today's moves now, since steps don't close the day. The note beside Today's moves is plain small text like the other notes.",
      "Activity: The last seven days don't count today as a miss before it's over. The note leaves today out until you hit your target, as the round's tally and the leaderboard already do. The weekday labels under the bars are bigger and easier to read, and the glow around the push-up ring fades out softly.",
      "Insights: The weight chart has a scale. Two whole-pound lines run across it, numbered on the left like the steps chart, so you can see how far your weight really moved. When it barely moves, the chart spans at least two pounds, so a small drift looks small.",
      "Insights: The weight line is green, like Weight everywhere else in Soma. Violet is left for check-ins. The weight change pills, like ↓ 2.1 lb over 30 days, are in the number font, and the first one sits at the right end of the weight line.",
      "Insights: Day by day reads as one row of tags. Push-ups, moves and steps are in the number font like the food chip beside them, and Show all 30 days is a proper button.",
      "Insights: Easier to read in Light. The Closed tags, calories over goal, protein on goal, the weight change pills and this week's green and amber numbers are a deeper shade of their colour, and the note at the bottom is a little darker.",
      "Tomorrow's brief: The numbers at the top line up with the cards below. Open Settings is a proper button with a full-size tap area, and the brief no longer opens with a ring around its close button.",
      "Settings: The palettes are tidier. Each tile shows its three colours on top with the name and a short description under them, and every tile is the same size. In Night the dots use the brighter colours Night really paints with, so the dark ones no longer disappear.",
      "Settings: Theme and Motion look the same. Both switches sit full width under their description, and the help under a setting is set in even lines, so a line never ends with a word or two on its own.",
      "Settings: What's new says how many updates there have been. It used to repeat the latest update's title and date. How to install is a button like See all changes, and the Feedback row fits on one line.",
      "For the admin: Admin sits inside the Soma group. It's the last row of the Soma card, and the Privacy policy and Terms of service links are the last thing on the page.",
      "The day-closing moment looks the same in Light as in Night: the dark glowing sphere, a clear check mark and bright colours. The streak number now runs through all three of the day's colours, violet to green to orange, and today's dot in the week wears the same three instead of activity orange.",
      "Reduce Motion sees the right ending when a day closes. The celebration used to stop on yesterday's streak with an empty week. Now it shows today's number and the filled-in week straight away.",
      "Recording a journal entry leads with what to do. The big line says Say how today went, with today's question under it. In Night, the microphone on the recording and food screens is dark on the bright circle, like the check button.",
      "Saying what you ate labels its check button. Tap when you're done sits under it, like the stop button when you record, and the wave no longer leans on the button. In Light, the line under the heading is darker, so it reads on the coloured glow.",
      "Light is easier to read. The quietest grey is a shade darker on chart axes, weekday letters, footnotes and small arrows, and the hint in an empty box uses the stronger grey. Coloured words on a coloured pill (the tab you're on, Food's calories left, Vault open · Lock, the New and Fixed tags, the Steps and Last night pills) use their colour's deep shade.",
      "In Night, the option you picked in a switcher stands out. It's a lighter pill, like the tab bar's, in Insights (30 days, 60 days, 1 year), the steps sheet and Settings → Appearance.",
      "Numbers use Soma's number font everywhere. Food's quick snacks (Beef Stick 100), the steps goal on Activity's steps pill and the push-up target after your count now match every other figure.",
      "A button you can't use yet looks the same in both themes. It's a plain grey pill with a readable label, like Look up when the box is empty, instead of a faded colour.",
      "Chips and small links are easier to tap. Rows of chips on Food and in Settings have more room between them, and small links like Open on Insights' Week in review answer a tap close to them.",
      "Lines between rows match across the app. Meals, recipes, the leaderboard and the habit rows in Settings use the same soft line, running straight across and sitting midway between the rows.",
    ],
  },
  {
    id: "2026-11-04",
    date: "2026-11-04",
    title: "Your steps, day by day",
    items: [
      "Transcribe shows it's working. Tap Transcribe on a journal entry and it answers at once: a turning ring with each step (opening the recording, transcribing, saving), lines shimmering where the words will go, and the words rising into place when they arrive.",
      "Your steps, a tap away. Tap the steps pill on Today or Activity to see the day against your goal and how many are left, then your last 7 or 30 days as bars under a line at your goal. Days that reached it glow.",
      "Read any day. Tap a bar, or slide a finger along them, and the top shows that day. Under the bars: how many days reached your goal and your best day, with your average beside them (today joins it once the day is over).",
      "Sync now. The steps sheet says when your steps last came in from Google Health, with a button to fetch them now.",
    ],
  },
  {
    id: "2026-11-03",
    date: "2026-11-03",
    title: "Feel and flow",
    items: [
      "Steps and sleep on Today. Two pills under the week fill toward your goals: today's steps, and how long you slept last night. Tap steps for Activity, or last night for your sleep.",
      "Your sleep, a tap away. Last night against your goal with bed and wake times, the stages (deep, light, REM and awake), and the week's nights drawn from bedtime to waking, with your usual times. Google doesn't share Fitbit's sleep score, so Soma doesn't show one.",
      "A sleep goal. Settings → Fitbit has one next to the steps goal, 8 hours to start, as Fitbit sets it.",
      "Steps on Activity are a pill that fills toward your goal, the same as on Today.",
      "What's new catches up. Lines added to an update after you've read it now come up the next time you open Soma, on their own.",
      "Every tab at the bottom says its name to VoiceOver, not just the one you're on.",
      "Settings fits on two screens. Its sections sit in groups (You, Your day, Reminders, Connections and privacy, Soma), each row shows what it's set to now, and a tap opens it right there.",
      "Links into Settings open the right section: Connect Fitbit on Activity, Open Settings on Tomorrow's brief, Change on Insights' journal card, and coming back from Google after connecting Fitbit.",
      "Your last seven days of push-ups. On Activity, a bar for each day fills toward that day's target and glows when you hit it, with how many days you hit. Tap a day to fill it in.",
      "Meals in one list. On Food, tap the round button beside a meal to mark it eaten, or tap again to undo; tap the meal itself for its macros, Swap meal, Ate something else and the recipe.",
      "Calories left. Food shows how many are left for the day beside the total, or how far over you are.",
      "Quick snacks show their calories, so you can see what a tap adds.",
      "Tell me what you ate stays one line until you use it. The microphone sits beside it and turns into Stop while it listens; Fill it in appears once there's something to read.",
      "A question a day. Not sure where to start? The Journal's record card and the recording screen offer one, like “What gave you energy today?”, and it changes every day.",
      "Two weeks of dots on the record card. A dot lights for each day you journaled, with how many days in a row you've kept it up.",
      "Look back. The Journal brings back what you said about a month or a week ago; tap it to find that entry and read or play it again. It's worked out on your phone and nothing is sent.",
      "The player shows where you are. A line fills as an entry plays, with the time so far and the length; while it plays, tap the line to jump ahead or back.",
      "Long entries fold to six lines. Tap Read all for the rest; a search always shows the whole entry.",
      "Each day in the Journal shows how many entries it holds and how long they run.",
      "Up next on Today. One task glows and gently pulses: the one that suits the time of day, so your weight in the morning, food through the day and your journal in the evening. The line under the orb names it too.",
      "+10 push-ups straight from Today. The Activity card has a +10 button: each tap adds ten without opening the counter.",
      "The Today tab shows how your day is going. A ring around its icon fills as you finish each task, and glows once the day closes.",
      "Taps you can feel. On iPhone (iOS 18 or later) and Android, Soma gives a small tap as you check things off, count push-ups, step your weight and switch tabs.",
      "Swipe a sheet down to close it. Pull down on the handle or the title of any sheet: weight, push-ups, check-in and the rest.",
      "Tap the tab you're on to jump back to the top.",
      "What's new is easier to scan. Each change has a short headline; tap it to read the rest.",
      "Recording moves with your voice. While you record a journal entry, the bars around the microphone and the glowing circle rise when you speak up and go still when you pause. Saying what you ate on Today moves the same way. Nothing extra is recorded or sent; the sound is only measured on your phone to draw it.",
      "Smoother voice motion. Each bar rises the moment you speak and settles gently as your voice tails off, and the bars blend into each other so the ring flows like a wave instead of flickering.",
      "The privacy page now names everyone who handles your data. New on it: Claude, which reads the food you describe to estimate calories, your week's journal for the week in review if you've switched that on, and your journal for Insights if you chose With Claude (with names and details taken out first). Groq turns food you say aloud into words and reads your week in review aloud when you ask, as well as transcribing if you've switched that on. Morgen, Todoist and Telegram are on it too. Settings → Privacy policy, or soma-onkasary.onslate.com/privacy/.",
      "Tomorrow's brief now shows only the Todoist tasks due that day. Overdue tasks and ones still open from today stay in Todoist.",
      "The brief in Telegram is easier to read. Each part has a bold heading, your events sit one to a line with the times lined up, each free block gets its own line, your tasks have a coloured dot for their priority, and your meals and push-ups come underneath.",
    ],
  },
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
/** What to remember as seen: the newest release and how many lines it had ("2026-11-03#12"). Lines are only ever
 *  added to the newest release, at the top, so the count says which of its lines someone has not seen yet. */
export const seenMark = (changes: Release[] = CHANGES) => (changes.length ? `${changes[0].id}#${changes[0].items.length}` : "");

export function unseen(seen: string, today: string, changes: Release[] = CHANGES): Release[] {
  if (!changes.length) return [];
  if (seen) {
    const [seenId, lines] = seen.split("#");
    const at = changes.findIndex((r) => r.id === seenId);
    // An id this build does not know (an older build, a typo) shows only the newest, never the whole history.
    if (at === -1) return changes.slice(0, 1);
    if (at > 0) return changes.slice(0, at);
    // The newest was seen: show only lines added to it since (a second update the same day). A bare id, saved before
    // lines were counted, cannot say how many there were, so the release shows again in full.
    const newest = changes[0];
    const count = lines === undefined ? -1 : Number(lines);
    if (!(count >= 0)) return [newest];
    return count >= newest.items.length ? [] : [{ ...newest, items: newest.items.slice(0, newest.items.length - count) }];
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

/** One change, split so What's new can be scanned (David, 2026-11-03): a short tag when the line opens with one
 *  ("Fixed:", "Food:", "Admin:"), its first sentence as the headline, and the rest as detail to open. A line with
 *  one sentence has no detail. */
export function splitChange(text: string): { tag: string | null; lead: string; rest: string } {
  let body = text.trim();
  let tag: string | null = null;
  const t = body.match(/^([A-Z][A-Za-z' ]{1,22}):\s+/);
  if (t && !/\s{2}/.test(t[1]) && t[1].split(" ").length <= 3) { tag = t[1] === "For the admin" ? "Admin" : t[1]; body = body.slice(t[0].length); body = body.charAt(0).toUpperCase() + body.slice(1); }
  // The first sentence: up to a full stop, question or exclamation mark followed by a space and a capital or a quote.
  const s = body.match(/^(.{12,220}?[.!?])\s+(?=[A-Z"“(])/);
  return s ? { tag, lead: s[1], rest: body.slice(s[0].length).trim() } : { tag, lead: body, rest: "" };
}
