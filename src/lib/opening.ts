// The words that meet you when Soma opens (David, 2026-09-17: "inspirational quotes that pop up before you do
// anything"). One phrase, full screen, once a day on each device (David, same day: "should happen once a day
// only"): the first open of the day gets the words, every later one goes straight in. They take turns by day. Anything else that wants attention on
// opening (the vault prompt) waits for `opened`, so two things never land on the screen at once.

export type Phrase = { text: string; note?: string };

/** David's two, and the defaults for everyone until they write their own. */
export const DEFAULT_PHRASES: Phrase[] = [
  { text: "I can do hard things.", note: "It is true every time. Hold on to it and new energy comes." },
  { text: "What is the story I’m telling myself?", note: "Most of it is fear of what might happen, not fact. Notice the story. Don’t take it for the truth." },
];
export const PHRASE_MAX = 140, NOTE_MAX = 240, PHRASES_MAX = 12;

let release: () => void = () => undefined;
/** Resolves once the opening words are out of the way, or straight away when there are none to show. */
export const opened = new Promise<void>((resolve) => { release = resolve; });
export const markOpened = () => release();

const SHOWN = "soma-opening-day", TURN = "soma-opening-turn";
const pad = (n: number) => (n < 10 ? "0" : "") + n;
/** The local calendar day, so "once a day" turns over at the user's midnight, not UTC's. */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** Whether today has had its words yet on this device. Without storage (a private window) they are simply skipped. */
export function alreadyShown(): boolean { try { return localStorage.getItem(SHOWN) === today(); } catch { return true; } }

/** The phrases take turns from one day to the next rather than coming up at random, so neither goes missing for a week.
 *  Reading whose turn it is changes nothing; `noteShown` is what moves it on. */
export function peekPhrase(phrases: Phrase[]): Phrase {
  let turn = 0;
  try { turn = Number(localStorage.getItem(TURN)) || 0; } catch { /* private window */ }
  return phrases[turn % phrases.length];
}

let noted = false;
/** Once per page load, however many times effects run: marks today as done and passes the turn on. */
export function noteShown() {
  if (noted) return;
  noted = true;
  try { localStorage.setItem(SHOWN, today()); localStorage.setItem(TURN, String((Number(localStorage.getItem(TURN)) || 0) + 1)); } catch { /* private window */ }
}
