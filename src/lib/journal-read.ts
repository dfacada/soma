// Reading the journal for Insights, privately (David, 2026-11-02: "if Claude reads them … there's no correlation to
// who they are"). Pure, so scripts/test-journal-read.mjs runs it as it is.
//
// Two ways to read a day's words, and the person picks (settings.journalInsights):
//   - on the phone (the default): a word list scores the tone. Nothing leaves the device.
//   - with Claude: before any text leaves the phone, deidentify() takes out names, emails, phone numbers, addresses,
//     links and long numbers, and the days go out shuffled under random labels with no dates. Dayhub's server sends
//     them on under Dayhub's own key with nothing about the account; only a tone and a few generic themes come back.
// Either way the result is kept encrypted with the vault key, on this device.

/** Words that are capitalised but are not names, so they stay. */
const NOT_NAMES = new Set([
  "I", "I'm", "I've", "I'd", "I'll", "OK", "Okay", "TV",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
  "Christmas", "Easter", "Thanksgiving", "God", "Mom", "Mum", "Dad", "Soma", "Dayhub",
]);

const SENTENCE_START = /(^|[.!?…]\s+|\n\s*)$/;

/** Ordinary ways to start a sentence. A capitalised first word not on this list, not a feeling word and not used in
 *  lower case elsewhere in the text is taken for a name and removed: too much goes rather than too little. */
const STARTERS = new Set(("a an the and but so or then also just still really maybe anyway well now later finally first next last " +
  "today yesterday tonight tomorrow morning afternoon evening overall honestly basically actually " +
  "i we you he she it they my our your his her their this that these those there here what when where why how who " +
  "after before while since because if once until all some every each most much many lots lot little few one two three " +
  "had have has went got get was were is are am be been did do does didn't don't felt feel feeling woke slept ate worked " +
  "spent made took started need needed want wanted going gonna think thought tried trying working walked ran trained " +
  "not no yes ok pretty very kind sort quite super kinda").split(" "));

/** The text with anything that could say who someone is replaced. Best effort: it removes what it can recognise
 *  (and every capitalised word it cannot place), so a name written in lower case can still slip through. */
export function deidentify(text: string, alsoRemove: string[] = []): string {
  let t = text
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[email]")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link]")
    .replace(/\b\d+\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Way|Court|Ct|Place|Pl)\b\.?/g, "[address]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]")
    .replace(/\b\d{5,}\b/g, "[number]");
  for (const word of alsoRemove.flatMap((w) => w.split(/\s+/)).filter((w) => w.length > 1)) {
    t = t.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "[name]");
  }
  // Capitalised words in the middle of a sentence are names (people, places, firms). At the start of a sentence a
  // capitalised word is a name unless it is an ordinary opener, a feeling word, or written in lower case elsewhere.
  const lower = new Set((t.match(/\b[a-z][a-z'’-]*/g) || []));
  const names = new Set<string>();
  t.replace(/[A-Z][a-zA-Z'’-]+/g, (w, at: number) => {
    if (NOT_NAMES.has(w)) return w;
    const atStart = SENTENCE_START.test(t.slice(Math.max(0, at - 3), at));
    const plain = w.toLowerCase();
    if (!atStart || !(STARTERS.has(plain) || POSITIVE.includes(plain) || NEGATIVE.includes(plain) || lower.has(plain))) names.add(w);
    return w;
  });
  if (names.size) t = t.replace(/[A-Z][a-zA-Z'’-]+/g, (w) => (names.has(w) ? "[name]" : w));
  return t;
}

const POSITIVE = ["good", "great", "happy", "glad", "grateful", "thankful", "love", "loved", "proud", "calm", "peaceful", "relaxed", "rested",
  "energized", "energised", "strong", "excited", "fun", "enjoyed", "enjoy", "awesome", "amazing", "wonderful", "productive", "focused",
  "better", "best", "nice", "laughed", "smile", "smiled", "accomplished", "progress", "win", "won", "clear", "hopeful", "confident",
  "beautiful", "fantastic", "solid", "content", "lucky", "blessed", "motivated", "refreshed", "healthy", "light", "easy", "connected"];
const NEGATIVE = ["bad", "sad", "tired", "exhausted", "stressed", "stress", "anxious", "anxiety", "worried", "worry", "angry", "mad", "upset",
  "frustrated", "frustrating", "lonely", "awful", "terrible", "hard", "rough", "sick", "pain", "hurt", "overwhelmed", "drained", "low",
  "down", "lazy", "guilty", "regret", "argument", "fight", "fought", "cried", "crying", "annoyed", "bored", "struggle", "struggled",
  "struggling", "heavy", "behind", "late", "failed", "fail", "worse", "worst", "hate", "scared", "nervous"];
const NEGATORS = new Set(["not", "no", "never", "don't", "didn't", "wasn't", "isn't", "can't", "couldn't", "won't", "hardly"]);

/** The tone of some words, -1 (heavy) … 1 (bright), from a word list. Null when there is nothing to go on. */
export function phoneTone(text: string): number | null {
  const words = text.toLowerCase().replace(/[’]/g, "'").match(/[a-z']+/g) || [];
  let pos = 0, neg = 0;
  words.forEach((w, i) => {
    const flipped = NEGATORS.has(words[i - 1]) || NEGATORS.has(words[i - 2]);
    if (POSITIVE.includes(w)) { if (flipped) neg++; else pos++; }
    else if (NEGATIVE.includes(w)) { if (flipped) pos++; else neg++; }
  });
  if (pos + neg === 0) return null;
  // Damped, so one "great" in a long entry does not read as a perfect day.
  return (pos - neg) / (pos + neg + 2);
}

/** The days to send, shuffled, each under a random label. `back` turns a label into its day again, on the phone only. */
export function shuffleForSending(days: { day: string; text: string }[], random = Math.random): { items: { id: string; text: string }[]; back: Record<string, string> } {
  const order = days.map((d) => ({ d, r: random() })).sort((a, b) => a.r - b.r).map((x) => x.d);
  const back: Record<string, string> = {};
  const items = order.map((d) => {
    let id = "";
    do { id = Math.floor(random() * 0xffffff).toString(36); } while (back[id]);
    back[id] = d.day;
    return { id, text: d.text };
  });
  return { items, back };
}

/** A short fingerprint of a day's text, so a day is only read again when its words change. */
export function fingerprint(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ":" + text.length;
}
