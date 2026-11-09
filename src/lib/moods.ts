// Moods: the words a check-in offers (David, 2026-11-08: "for the moods, that should be something that someone can set
// as well, to be able to edit, add, or remove"). Each is good, okay or hard, so Insights can still tell a good day
// from a hard one after someone renames Soma's moods or adds their own. Pure; scripts/test-moods.mjs.

export type MoodTone = "good" | "okay" | "hard";
export const MOOD_TONES: MoodTone[] = ["good", "okay", "hard"];
export type Mood = { id: string; label: string; on: boolean; tone?: MoodTone };

/** A check-in keeps its mood as words, and the API holds at most 20 characters (routes/days.js `mood`). */
export const MOOD_LABEL_MAX = 20;
export const MOODS_MAX = 16;

/** Soma's own words for good and hard days. A day logged with a word that is no longer on someone's list (renamed or
 *  taken out since) is read by these. */
export const GOOD_MOODS = ["Focused", "Peaceful", "Great", "Grateful", "Excited"];
export const HARD_MOODS = ["Down", "Overwhelmed", "Anxious"];
// Soma's own moods keep what they are by id, so renaming "Great" to "Brilliant" leaves it a good day.
const GOOD_IDS = ["focused", "peaceful", "great", "grateful", "excited"];
const HARD_IDS = ["down", "overwhelmed", "anxious"];

/** What a mood on the list is: what the person chose, else Soma's own for its id, else okay. */
export function moodTone(m: Pick<Mood, "id" | "tone">): MoodTone {
  if (m.tone && MOOD_TONES.includes(m.tone)) return m.tone;
  return GOOD_IDS.includes(m.id) ? "good" : HARD_IDS.includes(m.id) ? "hard" : "okay";
}

/** What a logged mood (the words on the day) is: by the person's list when it is on it, by Soma's own words when not.
 *  Null with no mood. */
export function toneOf(label: string | null | undefined, moods: Mood[]): MoodTone | null {
  if (!label) return null;
  const m = moods.find((x) => x.label.toLowerCase() === label.toLowerCase());
  if (m) return moodTone(m);
  return GOOD_MOODS.includes(label) ? "good" : HARD_MOODS.includes(label) ? "hard" : "okay";
}

/** An id for a mood of someone's own: "own-" and its words, unique among the moods they have. */
export function moodId(label: string, taken: string[]): string {
  const base = "own-" + (label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "mood");
  let id = base, i = 2;
  while (taken.includes(id)) id = `${base}-${i++}`;
  return id;
}

/** Stored moods, cleaned: words that fit, no two alike, at most MOODS_MAX, and at least one offered. Nothing usable
 *  stored is the defaults. */
export function cleanMoods(v: unknown, fallback: Mood[]): Mood[] {
  if (!Array.isArray(v) || !v.length) return fallback;
  const out: Mood[] = [];
  const ids = new Set<string>(), labels = new Set<string>();
  for (const m of v as Partial<Mood>[]) {
    if (!m || typeof m !== "object") continue;
    const id = typeof m.id === "string" && /^[a-z0-9][a-z0-9-]{0,47}$/.test(m.id) ? m.id : "";
    const label = typeof m.label === "string" ? m.label.trim().slice(0, MOOD_LABEL_MAX) : "";
    if (!id || !label || ids.has(id) || labels.has(label.toLowerCase())) continue;
    ids.add(id); labels.add(label.toLowerCase());
    out.push({ id, label, on: m.on !== false, ...(m.tone && MOOD_TONES.includes(m.tone) ? { tone: m.tone } : {}) });
    if (out.length >= MOODS_MAX) break;
  }
  if (!out.length) return fallback;
  if (!out.some((m) => m.on)) out[0] = { ...out[0], on: true };
  return out;
}
