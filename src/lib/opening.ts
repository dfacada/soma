// The words that meet you when Dayhub opens (David, 2026-09-17: "inspirational quotes that pop up before you do
// anything"). One phrase, full screen, once a day on each device (David, same day: "should happen once a day
// only"): the first open of the day gets the words, every later one goes straight in. They take turns by day. Anything else that wants attention on
// opening (the vault prompt) waits for `opened`, so two things never land on the screen at once.
//
// Where the words come from is the person's choice (David, 2026-11-08: "inspirational or ... your own or combo of
// both"): Dayhub's own set (opening-words.ts), their own phrases, or both, taking turns a day each.

import { SOMA_PHRASES } from "./opening-words";

export type Phrase = { text: string; note?: string };
export type OpeningSource = "soma" | "mine" | "both";
export const OPENING_SOURCES: OpeningSource[] = ["soma", "mine", "both"];
export const PHRASE_MAX = 140, NOTE_MAX = 240, PHRASES_MAX = 12;

const same = (a: Phrase, b: Phrase) => a.text.trim().toLowerCase() === b.text.trim().toLowerCase();

/**
 * The phrase for one turn. "soma": Dayhub's set in order. "mine": the person's own. "both": theirs on even turns and
 * Dayhub's on odd ones, each list keeping its own order, with any of Dayhub's that they also keep left out so no day
 * repeats the one before. With none of their own, Dayhub's alone: words that are switched on always have something to
 * say. Pure, for scripts/test-opening.mjs.
 */
export function phraseFor(turn: number, source: OpeningSource, mine: Phrase[], soma: Phrase[] = SOMA_PHRASES): Phrase {
  const t = Math.max(0, Math.floor(Number(turn) || 0));
  if (source === "soma" || !mine.length) return soma[t % soma.length];
  if (source === "mine") return mine[t % mine.length];
  const theirs = soma.filter((p) => !mine.some((m) => same(m, p)));
  const pool = theirs.length ? theirs : soma;
  return t % 2 === 0 ? mine[(t / 2) % mine.length] : pool[((t - 1) / 2) % pool.length];
}

let release: () => void = () => undefined;
/** Resolves once the opening words are out of the way, or straight away when there are none to show. */
export const opened = new Promise<void>((resolve) => { release = resolve; });
export const markOpened = () => release();

let releaseInstall: (shown: boolean) => void = () => undefined;
/** Resolves once the install splash has been shown and closed, or straight away when there is none to show; the
 *  value says whether it showed, so What's new can wait for the next open instead of stacking behind it. */
export const installDone = new Promise<boolean>((resolve) => { releaseInstall = resolve; });
export const markInstallDone = (shown: boolean) => releaseInstall(shown);

let releaseNews: () => void = () => undefined;
/** Resolves once What's new has been shown and closed, or straight away when there is nothing new. It waits for
 *  `opened` itself, so the vault prompt waits on this alone: opening words, then What's new, then the vault. */
export const newsDone = new Promise<void>((resolve) => { releaseNews = resolve; });
export const markNewsDone = () => releaseNews();

const SHOWN = "soma-opening-day", TURN = "soma-opening-turn";
const pad = (n: number) => (n < 10 ? "0" : "") + n;
/** The local calendar day, so "once a day" turns over at the user's midnight, not UTC's. */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** Whether today has had its words yet on this device. Without storage (a private window) they are simply skipped. */
export function alreadyShown(): boolean { try { return localStorage.getItem(SHOWN) === today(); } catch { return true; } }

/** The phrases take turns from one day to the next rather than coming up at random, so none goes missing for a week.
 *  Reading whose turn it is changes nothing; `noteShown` is what moves it on. */
export function peekPhrase(opening: { source: OpeningSource; phrases: Phrase[] }): Phrase {
  let turn = 0;
  try { turn = Number(localStorage.getItem(TURN)) || 0; } catch { /* private window */ }
  return phraseFor(turn, opening.source, opening.phrases);
}

let noted = false;
/** Once per page load, however many times effects run: marks today as done and passes the turn on. */
export function noteShown() {
  if (noted) return;
  noted = true;
  try { localStorage.setItem(SHOWN, today()); localStorage.setItem(TURN, String((Number(localStorage.getItem(TURN)) || 0) + 1)); } catch { /* private window */ }
}
