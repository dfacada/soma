// The two calls that read what someone said. Kept apart from food-say.ts and say-day.ts so those stay import-free
// and testable, as review-api.ts is from review.ts.

import { api } from "./api";
import type { Known } from "./food-match";
import { knownToSend, type Said } from "./food-say";
import { dayContext, wordsToSend, type Heard } from "./say-day";
import type { Settings } from "./settings";

/** Food said in one go (Food's box, Today's Food card): splits the words into items with the meal each was for. */
export async function describeFood(text: string, known: Known[]): Promise<Said[]> {
  return (await api<{ items: Said[] }>("POST", "/food/describe", { text, known: knownToSend(known) })).items;
}

/** Say your day: what was heard about the weight, the mood, the habits, the food and the moves. The server refuses
 *  unless the person has switched Say your day on. `cut` says only the first part of a very long recording was read. */
export async function describeDay(text: string, settings: Pick<Settings, "moods" | "habits" | "moves" | "goals">, known: Known[]): Promise<{ heard: Heard; cut: boolean }> {
  const words = wordsToSend(text);
  const heard = await api<Heard>("POST", "/day/describe", { text: words.text, ...dayContext(settings), known: knownToSend(known) });
  return { heard, cut: words.cut };
}
