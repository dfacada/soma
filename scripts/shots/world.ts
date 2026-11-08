// A made-up member for screenshots: two months of days, journal entries, sleep and a push-up round, built fresh for
// each run and answered to the page by shoot.ts. Nothing in it is real, and none of it is ever sent anywhere.
//
// Food is David's real Macros setup (the default plan from food-data.ts and its snack presets), never invented meals.
// The journal is sealed with a vault made here from a random passphrase, so the page decrypts exactly what the real app
// would; the key is handed to the page the way the app keeps it (sessionStorage) and dies with the headless browser.
//
// The same date gives the same world: every number comes from a generator seeded by the day, so two captures in one
// run differ only where the code changed.

import type { ActivityDay, Checkin, DayLog, Days, EntryMeta, Me } from "../../src/lib/api";
import type { HealthLink, Night, Nights } from "../../src/lib/health";
import type { JournalEntry } from "../../src/lib/recovery";
import type { Log, Member, Round } from "../../src/lib/round";
import type { RoundRow } from "../../src/components/app/Rounds";
import type { Settings } from "../../src/lib/settings";
import { seenMark } from "../../src/lib/changelog";
import { SNACK_PRESETS } from "../../src/lib/food-data";
import { addDays, dayKey } from "../../src/lib/today";
import { createVault, encryptBytes, encryptJson, exportKey, toB64, type VaultMeta } from "../../src/lib/vault-crypto";

export const USER_ID = "fixture-member";
/** Where signed Stratus URLs point in the fixture. The page asks for them; shoot.ts answers from `blobs`. */
export const STRATUS = "https://stratus.fixture.test";

/** How today looks: part done (the usual evening), all but dinner (one tap from closing), or closed (all five). */
export type DayShape = "open" | "last" | "closed";
export type Theme = "night" | "light";
/** Whose screens these are: the settled member with two months behind them, someone on their first day (approved
 *  minutes ago: nothing logged, no vault, Fitbit not connected, settings as the app makes them), or someone who has
 *  just signed up and is waiting for approval. Everyone who joins Soma starts as the last two. */
export type Who = "settled" | "new" | "pending";

export type World = {
  now: Date;
  me: Me;
  settings: Partial<Settings>;
  displayName: string;
  days: { checkins: Checkin[]; dayLogs: DayLog[]; activity: ActivityDay[]; weight: { day: string; value: number }[] };
  entries: EntryMeta[];
  /** null: no vault made yet. */
  vault: VaultMeta | null;
  /** The vault key, base64, as the app stores it in sessionStorage once unlocked ("" with no vault). */
  keyB64: string;
  health: HealthLink;
  months: { month: string; ciphertext: string }[];
  rounds: RoundRow[];
  board: { round: Round; members: Member[]; logs: Record<string, Log> };
  /** Stratus objects by path ("entries/e_1.enc"). */
  blobs: Map<string, Uint8Array>;
};

// mulberry32: small, fast and the same everywhere.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const pick = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];
const clock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// Ordinary days, said out loud. Varied in length on purpose: one runs long enough to fold.
const SAID = [
  "Slept better than I expected. The walk at lunch helped, and I actually finished the book I've been dragging around for a month.",
  "Busy day. Meetings back to back, so the push-ups happened in sets between calls. Felt good to keep the streak anyway.",
  "Tired today. Didn't feel like training but went for a short run and it turned the whole afternoon around.",
  "Quiet Sunday. Cooked for the week, cleaned the kitchen, called my sister. Nothing big, and that was the point.",
  "Felt focused this morning. Got the hard thing done before ten and spent the rest of the day on smaller stuff.",
  "Low energy. I think it was the late night. Going to bed early and trying again tomorrow.",
  "Good conversation with an old friend tonight. We talked about how much has changed in a year, and how much hasn't. I keep thinking about what he said about slowing down: that you don't notice the good weeks while you're in them, only when you look back. I want to notice more of them while they're happening.",
  "Hit every meal today without thinking about it. The plan is starting to feel normal instead of like a plan.",
  "Rain all day, so the walk turned into stretching on the floor. Better than nothing.",
  "Grateful for an easy day. Took a long lunch outside and didn't look at my phone.",
  "Stressful afternoon, but the gym helped. Coming home I felt like a different person.",
  "Weighed in lower than last week. Small, but it's going the right way.",
  "Read for an hour before bed instead of scrolling. Want to keep that one.",
  "Long day. Proud of keeping it together and still getting the push-ups in.",
];
// The check-in stores the mood's label, as Today does.
const MOODS = ["Great", "Normal", "Focused", "Peaceful", "Tired", "Normal", "Great", "Down"];
const MEMBERS = [
  { name: "Jordan", target: 100 }, { name: "Priya", target: 80 }, { name: "Marcus", target: 100 },
  { name: "Elena", target: 60 }, { name: "Theo", target: 50 },
];

/** A short WAV (a soft tone) for entries with audio. Only fetched if a scene plays one. */
function wav(seconds: number, rate = 8000) {
  const n = seconds * rate, b = new DataView(new ArrayBuffer(44 + n * 2));
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) b.setUint8(at + i, s.charCodeAt(i)); };
  text(0, "RIFF"); b.setUint32(4, 36 + n * 2, true); text(8, "WAVE"); text(12, "fmt "); b.setUint32(16, 16, true);
  b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, rate, true); b.setUint32(28, rate * 2, true);
  b.setUint16(32, 2, true); b.setUint16(34, 16, true); text(36, "data"); b.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) b.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 1500), true);
  return new Uint8Array(b.buffer);
}

/** Day one. The account is minutes old: nothing logged, no vault, Fitbit not connected, and settings holding only
 *  the look, as a new profile does (the app fills the rest from its defaults, What's new included: never seen). A
 *  round is under way and open to join, because the admin made it before this person arrived. */
function newcomer(now: Date, theme: Theme, who: "new" | "pending"): World {
  const round: Round = {
    id: "round_fx", name: "November round", startDate: dayKey(addDays(now, -19)), lengthDays: 30, restDays: [7, 14, 21, 28],
    bonusHit: 30, bonusStreak: 10, badgeStreak: 7, badgeHits: 30, joinOpen: true, archived: false,
  };
  return {
    now,
    me: { id: USER_ID, email: "sam@fixture.test", name: "Sam Okafor", profile: { rowId: "2", displayName: "Sam Okafor", role: "member", status: who === "pending" ? "pending" : "active" } },
    displayName: "Sam Okafor",
    settings: { theme: theme === "night" ? "dark" : "light" },
    days: { checkins: [], dayLogs: [], activity: [], weight: [] },
    entries: [], vault: null, keyB64: "",
    health: { configured: true, link: null },
    months: [],
    rounds: [{ ...round, me: null }],
    board: { round, members: [], logs: {} },
    blobs: new Map(),
  };
}

export async function buildWorld({ now, theme, day, who = "settled" }: { now: Date; theme: Theme; day: DayShape; who?: Who }): Promise<World> {
  if (who !== "settled") return newcomer(now, theme, who);
  const todayKey = dayKey(now);
  const r = rng(hash(todayKey));
  // The passphrase never leaves this function: only the key is kept, and only for this run.
  const { key, meta } = await createVault(Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(36)).join(""));
  const seal = async (value: unknown) => toB64(await encryptJson(key, value));
  const blobs = new Map<string, Uint8Array>();

  const checkins: Checkin[] = [], dayLogs: DayLog[] = [], activity: ActivityDay[] = [], weight: { day: string; value: number }[] = [];
  const entries: EntryMeta[] = [];
  const nights: Nights = {};
  const SPAN = 60, CLOSED_RUN = 12;
  let said = 0;

  for (let back = SPAN - 1; back >= 0; back--) {
    const date = addDays(now, -back), k = dayKey(date), isToday = back === 0;
    // The last twelve days before today were all closed, so the streak reads like someone who keeps it up.
    const full = back > 0 && back <= CLOSED_RUN;
    const closedToday = isToday && day === "closed", lastToday = isToday && day === "last";

    if (full || isToday || r() > 0.12) weight.push({ day: k, value: Math.round((187.6 - 0.085 * (SPAN - back) + (r() - 0.5) * 1.1) * 10) / 10 });
    const mood = pick(r, MOODS);
    checkins.push({
      day: k, mood,
      habits: { meditate: r() < 0.6, read: r() < 0.5, early: r() < 0.55, water: r() < 0.8 },
      counts: { drinks: r() < 0.7 ? 0 : 1 + Math.floor(r() * 3) },
    });

    const ate = (p: number) => full || r() < p;
    const meals = isToday
      ? { breakfast: true, lunch: true, snack: true, dinner: closedToday }
      : { breakfast: ate(0.95), lunch: ate(0.93), snack: ate(0.9), dinner: ate(0.94) };
    const snack = SNACK_PRESETS[Math.floor(r() * SNACK_PRESETS.length)];
    dayLogs.push({ day: k, meals, extras: !isToday && r() < 0.25 && snack ? [{ name: snack.name, kcal: snack.kcal, protein: snack.protein, carbs: snack.carbs, fat: snack.fat }] : [] });

    const pushups = isToday ? (closedToday || lastToday ? 100 : 60) : full || r() < 0.85 ? 100 + Math.round((r() - 0.35) * 30) : 0;
    activity.push({
      day: k, pushups: pushups || null,
      types: isToday ? { walk: true } : { walk: r() < 0.6, gym: r() < 0.4, run: r() < 0.15 },
      steps: isToday ? 6420 : Math.round(4800 + r() * 8200),
    });

    // Journal: most days have one entry, said in the evening. Today has one only once it is (nearly) closed.
    if ((!isToday && (full || r() < 0.6)) || closedToday || lastToday) {
      const at = new Date(date); at.setHours(isToday ? 18 : 20 + Math.floor(r() * 3), Math.floor(r() * 60), 0, 0);
      const id = `e_fx_${k.replaceAll("-", "")}`;
      const seconds = 40 + Math.floor(r() * 180);
      const entry: JournalEntry = {
        id, createdAt: at.toISOString(),
        title: at.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " + at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase(),
        transcript: SAID[said++ % SAID.length], transcriptStatus: "done", mood,
        hasAudio: true, audioSize: seconds * 16000, audioMime: "audio/mp4", audioDuration: seconds, updatedAt: null,
      };
      blobs.set(`entries/${id}.enc`, await encryptJson(key, entry));
      blobs.set(`audio/${id}.enc`, await encryptBytes(key, wav(2)));
      entries.push({ id, createdMs: at.getTime(), hasAudio: true, hasPhoto: false, transcriptStatus: "done" });
    }

    // Sleep, filed under the morning you woke up.
    const asleep = 395 + Math.round((r() - 0.5) * 110), awake = 18 + Math.floor(r() * 30);
    const deep = 62 + Math.floor(r() * 40), rem = 85 + Math.floor(r() * 40);
    const bed = 23 * 60 + Math.floor((r() - 0.4) * 70);
    const night: Night = { asleep, awake, inBed: asleep + awake, deep, rem, light: asleep - deep - rem, start: clock((bed + 1440) % 1440), end: clock((bed + asleep + awake) % 1440) };
    nights[k] = night;
  }
  entries.sort((a, b) => b.createdMs - a.createdMs);

  const months = [...new Set(Object.keys(nights).map((d) => d.slice(0, 7)))].sort();
  const sealedMonths = await Promise.all(months.map(async (month) => ({ month, ciphertext: await seal(Object.fromEntries(Object.entries(nights).filter(([d]) => d.startsWith(month)))) })));

  // A push-up round on its twentieth day, with five others.
  const round: Round = {
    id: "round_fx", name: "November round", startDate: dayKey(addDays(now, -19)), lengthDays: 30, restDays: [7, 14, 21, 28],
    bonusHit: 30, bonusStreak: 10, badgeStreak: 7, badgeHits: 30, joinOpen: false, archived: false,
  };
  const mine: Log = {};
  for (let d = 1; d <= 20; d++) { const a = activity[activity.length - 21 + d]; if (a?.pushups) mine[d] = a.pushups; }
  const members: Member[] = [{ userId: USER_ID, displayName: "Alex", dailyTarget: 100, startDay: 1, joinSeq: 1, status: "active" }];
  const logs: Record<string, Log> = { [USER_ID]: mine };
  MEMBERS.forEach((m, i) => {
    const id = `member_fx_${i}`;
    members.push({ userId: id, displayName: m.name, dailyTarget: m.target, startDay: i === 4 ? 6 : 1, joinSeq: i + 2, status: "active" });
    const log: Log = {};
    for (let d = i === 4 ? 6 : 1; d <= 20; d++) { if (round.restDays.includes(d)) continue; if (r() < 0.86 - i * 0.04) log[d] = d === 20 && r() < 0.5 ? Math.round(m.target * 0.4) : m.target + Math.round((r() - 0.3) * 20); }
    logs[id] = log;
  });

  return {
    now,
    me: { id: USER_ID, email: "member@fixture.test", name: "Alex Rivera", profile: { rowId: "1", displayName: "Alex", role: "admin", status: "active" } },
    displayName: "Alex",
    settings: {
      theme: theme === "night" ? "dark" : "light",
      // Settled in: What's new seen, the install tip shown, a long best streak, transcription on.
      seenChanges: seenMark(), seenInstall: true, bestStreak: 21, cloudTranscription: true,
      // The opening words and the unlock prompt are once-a-day moments with their own scenes; off for the rest.
      opening: { on: false, source: "both", phrases: [] }, unlockOnOpen: false,
    },
    days: { checkins, dayLogs, activity, weight },
    entries,
    vault: meta,
    keyB64: await exportKey(key),
    health: { configured: true, link: { ciphertext: await seal({ refreshToken: "fixture" }), createdMs: now.getTime() - 40 * 86400000 } },
    months: sealedMonths,
    rounds: [{ ...round, me: { userId: USER_ID, dailyTarget: 100, startDay: 1, joinSeq: 1, status: "active" } }],
    board: { round, members, logs },
    blobs,
  };
}

/** What the API would answer. `unknown` marks a route the fixture does not know, so the capture can say so. */
export function answer(w: World, method: string, path: string, body: unknown): { status: number; json: unknown; unknown?: true } {
  const [route, query = ""] = path.split("?");
  const q = new URLSearchParams(query);
  const ok = (json: unknown = {}) => ({ status: 200, json });
  if (method === "GET") {
    switch (route) {
      case "/me": return ok(w.me);
      case "/settings": return ok({ displayName: w.displayName, settings: w.settings });
      case "/days": {
        const from = q.get("from") || "", to = q.get("to") || "", fromMs = Number(q.get("fromMs")), toMs = Number(q.get("toMs"));
        const inRange = <T extends { day: string }>(rows: T[]) => rows.filter((x) => x.day >= from && x.day <= to);
        const days: Days = {
          from, to, checkins: inRange(w.days.checkins), dayLogs: inRange(w.days.dayLogs), activity: inRange(w.days.activity), weight: inRange(w.days.weight),
          entries: w.entries.filter((e) => e.createdMs >= fromMs && e.createdMs <= toMs),
        };
        return ok(days);
      }
      case "/entries": return ok({ entries: w.entries });
      case "/vault-meta": return ok(w.vault ? { exists: true, ...w.vault } : { exists: false });
      case "/google-health": return ok(w.health);
      case "/health-months": return ok({ months: w.months });
      case "/rounds": return ok({ rounds: w.rounds });
      case "/recipes": return ok({ recipes: [] });
      case "/reviews": return ok({ reviews: [] });
      case "/drafts": return ok({ drafts: [] });
      case "/links": return ok({ links: { morgen: null, todoist: null } });
      case "/push": return ok({ publicKey: null });
      case "/telegram": return ok({ connected: false, chat: null, configured: true });
      case "/vault-passkeys": return ok({ passkeys: [] });
      case "/admin/profiles": return ok({ profiles: [] });
      case "/admin/feedback": return ok({ items: [] });
    }
    if (route === `/rounds/${w.board.round.id}/board`) {
      return w.board.members.some((m) => m.userId === USER_ID) ? ok(w.board) : { status: 403, json: { error: "join the round to see its board" } };
    }
    return { status: 404, json: { error: "not in the fixture" }, unknown: true };
  }
  if (method === "POST" && route === "/sign") {
    const { kind, names } = (body || {}) as { kind: string; names: string[] };
    return ok({ urls: (names || []).map((name) => ({ name, url: `${STRATUS}/${kind}/${name}` })) });
  }
  if (method === "POST" && route === "/logs") return { status: 201, json: {} };
  // Saves succeed and change nothing: a scene that taps sees the app's own optimistic state.
  const known = /^\/(checkins|day-logs|weight|activity)\/\d{4}-\d{2}-\d{2}$/.test(route) || ["/settings"].includes(route);
  return known ? ok() : { ...ok(), unknown: true };
}
