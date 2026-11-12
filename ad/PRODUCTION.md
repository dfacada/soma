# Dayhub ad, the lifelike version: production pack

The animated ad is finished and made from the real app. This pack is for the version with real people in real places.
You can make it two ways: a small shoot with actors or friends, or an AI video tool you run on your own account. It
keeps the same story, the same words and the same rules.

**What it takes to shoot:** one evening and one morning, three people (actors or friends), one person filming on a
recent phone with a gimbal, and a day of editing in DaVinci Resolve. Or: an AI video plan on your own account, one
evening generating shots, and one evening laying the real screens onto the phones.

## The rules (for any version)

- **Only what the app does today.** Use the lines in `VOICEOVER.md` as they are. Don't add claims ("AI coach",
  "syncs with everything", "loved by thousands") and don't promise anything still to come.
- **No made-up proof.** No testimonials, ratings, user counts, "real users" or "real results". The people are actors,
  friends or AI, and the end card says the screens show a made-up member: "Real app screens, showing a made-up member."
- **Say what leaves the phone.** Wherever Say your day is shown, keep the small print the ad uses, which is the app's
  own wording: *Say your day is off until you turn it on. The recording goes to Groq to be written down, and the words go
  to Claude, which picks out your day. Your entry is stored sealed.* The end card's small print adds that transcription
  is off until turned on and that food estimates come from Claude, Anthropic's AI.
- **Label AI people.** If anyone on screen is AI-generated, switch on the platform's label when you post: TikTok's
  "AI-generated content" setting, Instagram and Facebook's "AI info" label, YouTube Studio's "altered or synthetic
  content" question. Add "People generated with AI" to the end card's small print even where it isn't required.
- **Nobody real by accident.** No look-alikes of real people, no faces of passers-by, no readable house numbers or
  number plates, no logos on clothes, cups or phones (tape them or turn them away). Don't show app store badges either:
  Dayhub runs in the browser and from the Home Screen.
- **Never let an AI tool draw the app.** It invents text and buttons. The screens are always the real ones, put on in
  the edit (below).
- **Signed releases** from everyone who appears, friends included: a one-page consent to use their image and voice in
  Dayhub's ads online, with no end date. Free templates are easy to find; keep the signed copies.

## Cast and wardrobe

- **The walker, the lead.** Late 20s to 40s, any gender, easy and natural on camera. They say their day into the phone
  on an evening walk, and appear again in bed (journal) and at the window (insights).
- **Two friends** for the push-up round. Different ages, skin tones and builds, fit the way people really are rather
  than influencer-perfect, comfortable laughing on camera.
- **A pair of hands** for the kitchen and close-ups. These can be anyone's, the lead's included.
- Between them, cover a range of ages, skin tones and body types. The drawn hands in the animated ad already use five
  skin tones.

**Wardrobe:** muted solids: navy, charcoal, olive, rust, oat. No logos, no fine stripes or small checks (they shimmer
on phone screens), no pure white or pure black tops. Each scene can echo one of Dayhub's colours:

- Evening walk: a navy or charcoal jacket.
- Journal: a lavender or grey knit (the journal is violet in the app).
- Kitchen: sage or olive (food is green).
- Push-ups: a burnt-orange or charcoal tee (moves are orange).

**Props:**
- One phone of any recent model. Use a plain dark case or no case, with the logo away from camera.
- Dinner as the screen shows it: salmon, rice and broccoli, and a glass of red wine. Viewers will compare the plate
  with the list.
- A rug or mat, a mug, a bedside lamp.

## Locations and light

- A quiet street with trees and street lamps, at blue hour. The light lasts about 30 minutes, starting 15 minutes
  after sunset, so rehearse before it starts.
- A kitchen table under warm light, filmed from above.
- A living room floor with a rug and lamps.
- A bedroom with a bedside lamp.
- A window with morning sun.

The app is dark (Dayhub Night), so the screen throws little light on a face. A small LED panel turned low and tinted
violet, just below the frame, fakes the glow. Lock exposure and focus. Film 4K at 30 fps with the action centred: one
horizontal take crops to both 16:9 and 9:16.

## 30 seconds, shot by shot

The voice and the text on screen follow `VOICEOVER.md`. The "Screen" column is what gets laid onto the phone: the
files in `shots/site/`, or the screen plates in `ad/out/plates/`.

| # | Time | Shot | What happens | Screen | Sound and text |
|---|---|---|---|---|---|
| 1 | 0:00–0:02 | Close-up, then pull back | A phone glows in the dark: Today's orb at 3 of 5. Pull back to the walker on the street at blue hour. | `today` | "Say your day in a minute." |
| 2 | 0:02–0:03 | Medium, walking | The thumb taps Say your day; the phone comes up a little nearer the mouth. | `today` → `moment-day` | Tap, record chime |
| 3 | 0:03–0:08 | Gimbal tracking, then an insert of the phone | The walker talks the way you leave a voice note, glancing at the screen. The words appear on screen as they speak. | `moment-day`, the clock counting | Member's line, the small print about Groq and Claude |
| 4 | 0:08–0:11 | Insert, then medium | They stop under a lamp, look at the list, and the thumb taps Fill in my day. | `moment-day-check` | "Check it. Nothing is logged until you tap." |
| 5 | 0:11–0:13 | Close-up of the face, lit by the screen | A small, private smile. Insert: the orb closes. | `moment-closed` | "That's the day.", the chime |
| 6 | 0:13–0:15 | Bedroom, slow push-in | Sitting up in bed under the lamp, speaking quietly into the phone. | `journal` | "A voice journal only you can open." |
| 7 | 0:15–0:17 | Kitchen, top-down | A hand over the plate taps the microphone and says what's on it. | `food` → `moment-food` | "Food, said out loud or tapped." |
| 8 | 0:17–0:20 | Living room, handheld | Two friends do push-ups side by side, laughing; a third holds up the phone with the round. | `activity` (the round, the leaderboard) | "Moves of your own. Rounds with friends." |
| 9 | 0:20–0:22 | Window, morning | Mug steaming, the lead scrolls Insights and taps Try it for 3 days. | `insights` → `insights-try-sleep` | "See what makes your good days." |
| 10 | 0:22–0:24 | Extreme close-up | A thumb scrolls What Dayhub can see. | `settings-privacy` (scrolling) | "Privacy you can see." |
| 11 | 0:24–0:30 | End card | Reuse the animated ad's last six seconds as they are. | — | "Dayhub. Say your day in a minute. Request an invite." |

## 60 seconds

The same evening, with room to breathe and two more things the app does. The member's longer line still only names
the three things the list shows; the rest of what they say simply goes into their journal entry, as it does in the app.

| # | Time | Shot | What happens | Screen | Voice |
|---|---|---|---|---|---|
| 1 | 0:00–0:05 | Wide, blue hour | The walker leaves a building, breath just visible, phone in hand. Close: Today at 3 of 5. | `today` | Narrator: "Say your day in a minute." |
| 2 | 0:05–0:17 | Tracking, with inserts | They tap Say your day and talk as they walk. | `moment-day` | Member: "Long one today. The demo went better than I expected. Dinner was salmon with rice and broccoli, with a glass of red wine. And I finished my push-ups, a hundred in the end." |
| 3 | 0:17–0:24 | Under a lamp | They read the list and tap Fill in my day. | `moment-day-check` | Narrator: "Dayhub picks out what you ate, how you moved and how you feel, and gives you a list to check. Nothing is logged until you tap." |
| 4 | 0:24–0:28 | Face, then insert | The orb closes and the streak ticks up. | `moment-closed` | "That's the day." |
| 5 | 0:28–0:33 | Sofa, later | A thumb flicks the switches in What closes your day. | `settings-closes` | "Five things close a day. You choose which." |
| 6 | 0:33–0:38 | Bed, lamp | A quiet journal entry. | `journal`, `moment-record` | "A voice journal only you can open. It's sealed on your phone before it's uploaded." |
| 7 | 0:38–0:43 | Kitchen, top-down | Food said out loud. | `food` → `moment-food` | "Food, said out loud or tapped." |
| 8 | 0:43–0:49 | Living room | The push-up round with friends. | `activity` (round) | "Moves of your own: push-ups, a run, a walk, yoga. Rounds with friends, each with their own target." |
| 9 | 0:49–0:53 | Window, morning | Insights, then Try it for 3 days. | `insights` → `insights-try-sleep` | "See what makes your good days, and try one for three days." |
| 10 | 0:53–0:55 | Extreme close-up | What Dayhub can see. | `settings-privacy` | "Privacy you can see." |
| 11 | 0:55–1:00 | End card | Reuse the animated ad's end card. | — | "Dayhub. Say your day in a minute. Request an invite." |

## AI video prompts

These work with any of the current tools (Google Veo, OpenAI Sora, Runway, Kling, Luma). Set the aspect ratio in the
tool, 9:16 or 16:9, rather than in the prompt.

- **Generate a reference first.** Make one portrait of your lead, then use the tool's image-to-video or
  character-reference feature in every shot, so the same person appears throughout.
- **One action per shot**, 4 to 8 seconds.
- **Keep the phone screen dark** in every prompt: the real screens go on afterwards.
- **Hands holding phones are where these tools fail most.** Expect to re-roll; keep takes where the phone stays rigid
  and the fingers look right.
- **Read the plan's terms.** Some free plans add a visible watermark or don't allow commercial use; generate on a plan
  that allows ads. Tools that make sound too: ask for "ambient sound only, no music, no speech", and replace the sound
  in the edit.
- **Label the result** as the rules above say.

Each prompt below ends with the same line to avoid trouble; keep it.

1. **The walk (hook and shot 3)**
   ```
   Blue hour on a quiet tree-lined residential street, warm street lamps just switched on, a little mist. A person in their thirties in a navy jacket walks toward camera holding a smartphone at chest height, screen toward them, talking casually and half smiling, as if leaving a voice note. Smooth gimbal tracking shot, 35mm lens, shallow depth of field, soft bokeh from the lamps, natural skin texture, documentary realism, calm mood. The phone screen is dark. No text, no logos, no watermark, no distorted hands.
   ```
2. **Phone in hand, for the screen (inserts in shots 1 to 4)**
   ```
   Over-the-shoulder close-up of a hand holding a modern smartphone upright at chest height on an evening street, the screen facing camera and evenly lit plain dark grey, thumb resting on the edge, gentle walking motion, warm street-lamp bokeh behind. 50mm lens, shallow depth of field, realistic hands with five fingers. No text, no logos, no reflections, no watermark.
   ```
3. **Under the lamp (shot 4)**
   ```
   Medium close-up: the same person stops under a warm street lamp, looks down at their phone, taps the screen once with their thumb, then relaxes. Night, warm light from above, cool blue ambient light, static camera, 50mm lens. The phone screen is dark grey. No text, no logos, no watermark, no distorted hands.
   ```
4. **The face (shot 5)**
   ```
   Close-up of the same person's face softly lit from below by a phone screen with a faint violet glow, a small private smile, evening street bokeh behind. 85mm lens, shallow depth of field, natural skin texture, documentary realism. No text, no logos, no watermark.
   ```
5. **Journal in bed (shot 6)**
   ```
   A bedroom at night lit by one warm bedside lamp. A person in a soft lavender knit sits up in bed and speaks quietly into a phone held near their face, like a private voice memo. Calm and intimate, slow push-in, 35mm lens. The phone screen faces camera and is dark. No text, no logos, no watermark, no distorted hands.
   ```
6. **Kitchen, from above (shot 7)**
   ```
   Top-down shot of a wooden kitchen table under warm light: a plate of salmon fillet with white rice and broccoli, a glass of red wine, a folded sage napkin and cutlery. A hand comes into frame holding a smartphone flat above the plate, the screen facing up toward camera and dark grey. Food photography realism, soft shadows. No text, no logos, no watermark, no distorted hands.
   ```
7. **The push-up round (shot 8)**
   ```
   A living room in the evening with warm lamps. Two friends of different ages and builds do push-ups side by side on a rug, laughing between reps; a third friend kneels beside them holding up a phone toward them as if showing a scoreboard. Casual sportswear in charcoal and burnt orange, natural bodies, handheld camera, 28mm lens, playful energy. The phone screen is dark. No text, no logos, no watermark, no distorted hands.
   ```
8. **Morning at the window (shot 9)**
   ```
   Early morning sun through a window, steam rising from a mug on the sill. The same person in a cosy knit holds their phone in one hand, scrolls with their thumb and smiles at something on it. Soft warm light, dust in the light, 50mm lens, static camera, shallow depth of field. The phone screen faces camera and is dark. No text, no logos, no watermark, no distorted hands.
   ```
9. **Scrolling, close (shot 10)**
   ```
   Extreme close-up of a thumb slowly scrolling on a phone held in one hand, the screen evenly lit plain dark grey, soft violet ambient light, night. Macro lens, very shallow depth of field. No text, no logos, no watermark.
   ```

## Putting the real screens on the phones

The screens are the real app on the screenshot rig's made-up member:

- **Stills:** `shots/site/*.night.png`, 780 × 1688.
- **Long pages:** `shots/ad/*.long.png`, for scrolling.
- **Screen plates:** `ad/out/plates/*.mp4`, each screen moment as video at 1080 × 2330: the taps, the counting clock,
  the list, the scrolling. They are cut from the same timeline as the animated ad, so they match it.

Pick the easiest of three ways:

1. **Play it on the phone and film it for real.** This is the most real look: true reflections, and nothing to track.
   - Copy the plate onto the actor's phone and play it full screen at about 60% brightness, in airplane mode with Do
     Not Disturb on.
   - The actor's thumb mimes the taps in time with the plate; rehearse it twice.
   - Film slightly off-axis, a touch soft, to avoid moiré.
2. **Track it in the edit.** For the shoot, and for AI shots.
   - Put `ad/out/plates/tracking-screen.png` on the phone: dark grey with four white dots. Don't use green; it spills
     onto hands and faces at night.
   - In DaVinci Resolve (free), open Fusion and add a Planar Tracker on the screen. Track, then switch it to Corner Pin
     and feed it the plate.
   - Where the thumb crosses the screen, cut it out (a Magic Mask, or a quick roto) and put it back on top.
   - In After Effects the same thing is Mocha AE with a corner pin. CapCut can't corner-pin, so use Resolve.
3. **Make the matched shots in the animated style.** For a hybrid, keep the animated ad's own phone shots and cut them
   between the live-action ones.

**Make it sit in the shot:**
- Blur the screen by 0.5 to 1 px and add the shot's grain.
- Lower its saturation 5 to 10% and match its blacks to the phone's glass.
- Lay a faint diagonal reflection over it.
- Keep it a little brighter than the scene's mid-tones, because screens glow.
- At night, add a soft violet or green glow onto the thumb and face, matching the screen's colour.

## Music, sizes, posting

- **Music:**
  - The animated ad's soundtrack was made in code for this ad, so you can use it anywhere.
  - Or pick a track from TikTok's or Meta's **commercial** music library, which is cleared for business posts. Trending
    sounds are not cleared for ads.
  - For YouTube, use the YouTube Audio Library.
- **Sizes:** 1080 × 1920 (9:16) for Reels, TikTok and Shorts; 1920 × 1080 (16:9) for YouTube and the website.
  H.264, 30 fps, AAC at 48 kHz, about −14 LUFS.
- **Safe zones in 9:16:** keep words and faces out of the bottom fifth, the top eighth and the right-hand eighth, where
  the apps put their buttons and captions.
- **The link:** the ads carry no web address, because the domain isn't live yet. Use the platform's link button or
  your profile link. Once the domain is live, the end card can show it.
