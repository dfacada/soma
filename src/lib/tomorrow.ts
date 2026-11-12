// Tomorrow's brief (David, 2026-11-02: "the hub of my day", starting with the next day laid out the night before).
// Pure: what Morgen, Todoist and Dayhub say about tomorrow in; the day in order, the free time between, the tasks, one
// line from Insights and the words for Telegram out. No React and no I/O, so scripts/test-tomorrow.mjs runs it as it is.
// Facts only: nothing here suggests what to do with the day.

import type { Driver } from "./great-days";
import type { Nights } from "./health";
import { MEALS, type Meal, type Settings } from "./settings";
import { addDays, dayKey, fromKey } from "./today";

/** Before this hour "tomorrow" is the day that has just begun: at 1 am the morning ahead is the one to plan. */
export const NEW_DAY_HOUR = 4;
/** A gap shorter than this is not worth calling free time. */
export const MIN_FREE_MIN = 30;
/** The waking day when Fitbit does not know better, in minutes after midnight. */
export const DEFAULT_WAKE = 7 * 60, DEFAULT_BED = 22 * 60;
const MINUTE = 60000, DAY_MS = 86400000;

/** The day the brief is about, "YYYY-MM-DD". */
export function briefDay(now: Date): string {
  const d = new Date(now);
  if (d.getHours() >= NEW_DAY_HOUR) d.setDate(d.getDate() + 1);
  return dayKey(d);
}

/** Local midnight at the start of a day and at its end (23 or 25 hours apart across a clock change). */
export function dayBounds(day: string): { start: number; end: number } {
  const s = fromKey(day); s.setHours(0, 0, 0, 0);
  const e = new Date(s); e.setDate(e.getDate() + 1);
  return { start: s.getTime(), end: e.getTime() };
}

// ── Time zones ──

const formats = new Map<string, Intl.DateTimeFormat>();
/** How many minutes the zone is ahead of UTC at that instant. Throws for a zone this device does not know. */
function offsetMin(ms: number, tz: string): number {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    formats.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / MINUTE;
}

/** A wall-clock time ("2026-11-03T09:30:00") in an IANA zone, as an instant. With no zone, or one this device does not
 *  know, the time is read on this device's own clock (a "floating" time). Null when the text is not a time. */
export function zonedMs(local: string, tz?: string | null): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(local || "");
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] || "0", m[5] || "0", m[6] || "0"].map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  if (tz) {
    try {
      // Guess with the offset at the wall time, then correct once with the offset at the guess (clock changes).
      const first = wall - offsetMin(wall, tz) * MINUTE;
      return wall - offsetMin(first, tz) * MINUTE;
    } catch { /* an unknown zone: read it as floating */ }
  }
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}

/** An ISO 8601 duration ("PT1H30M", "P1D", "P1W") in ms. Anything unreadable is 0. */
export function durationMs(iso: string | null | undefined): number {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso || "");
  if (!m) return 0;
  const [w, d, h, mi, s] = m.slice(1).map((v) => Number(v) || 0);
  return ((((w * 7 + d) * 24 + h) * 60 + mi) * 60 + s) * 1000;
}

// ── The calendar ──

/** One event as the API hands it over from Morgen (routes/morgen.js): already trimmed, in Morgen's own terms. */
export type MorgenEvent = {
  id: string; uid?: string; calendarId: string; title?: string;
  /** Local date-time in `timeZone`, or a bare date for an all-day event. */
  start: string; timeZone?: string | null; duration?: string; allDay?: boolean;
  /** False when the event is marked free (it shows, but does not take up the time). */
  busy?: boolean; declined?: boolean; location?: string; video?: boolean; taskId?: string;
  calendar?: string; color?: string;
};
export type BriefEvent = {
  id: string; title: string; start: number; end: number; allDay: boolean; busy: boolean;
  calendar: string; color?: string; location?: string; video?: boolean; uid?: string;
  /** A task Morgen has put on the calendar. */
  task?: boolean;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Morgen's events → the ones that touch `day`, in this device's time, without repeats, in order. */
export function toEvents(raw: MorgenEvent[], day: string): BriefEvent[] {
  const { start: dayStart, end: dayEnd } = dayBounds(day);
  const out: BriefEvent[] = [];
  for (const r of raw) {
    if (!r || r.declined || typeof r.start !== "string") continue;
    // A calendar's colour is only ever a hex value: it goes into a style attribute.
    const color = typeof r.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(r.color) ? r.color : undefined;
    const base = { id: String(r.id), title: (r.title || "").trim() || "Busy", busy: r.busy !== false, calendar: r.calendar || "", color, location: r.location, video: r.video, uid: r.uid, task: Boolean(r.taskId) };
    if (r.allDay) {
      // An all-day event is a run of calendar dates, the same everywhere: count days on the calendar, not in hours.
      const first = r.start.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) continue;
      const days = Math.max(1, Math.round(durationMs(r.duration) / DAY_MS));
      const last = dayKey(addDays(fromKey(first), days - 1));
      if (day < first || day > last) continue;
      out.push({ ...base, allDay: true, busy: false, start: dayBounds(first).start, end: dayBounds(last).end });
      continue;
    }
    const start = zonedMs(r.start, r.timeZone);
    if (start === null) continue;
    const end = start + durationMs(r.duration);
    if (end <= dayStart && !(end === start && start === dayStart)) continue;
    if (start >= dayEnd) continue;
    out.push({ ...base, allDay: false, start, end });
  }
  return dedupe(out).sort((a, b) => (a.allDay === b.allDay ? a.start - b.start || a.end - b.end : a.allDay ? -1 : 1));
}

/** The same meeting often sits in two calendars (invited on two accounts, a shared calendar): keep it once, busy over free. */
export function dedupe(events: BriefEvent[]): BriefEvent[] {
  const kept: BriefEvent[] = [];
  const at = new Map<string, number>();
  for (const e of events) {
    const keys = [e.uid ? `u:${e.uid}|${e.start}` : "", `t:${norm(e.title)}|${e.start}|${e.end}`].filter(Boolean);
    const hit = keys.map((k) => at.get(k)).find((i) => i !== undefined);
    if (hit !== undefined) {
      if (!kept[hit].busy && e.busy) kept[hit] = e;
      keys.forEach((k) => at.set(k, hit));
      continue;
    }
    keys.forEach((k) => at.set(k, kept.length));
    kept.push(e);
  }
  return kept;
}

export type Block = { start: number; end: number };

/** Gaps of at least `minMin` minutes between `from` and `to` that no busy timed event covers. */
export function freeBlocks(events: BriefEvent[], from: number, to: number, minMin = MIN_FREE_MIN): Block[] {
  const busy = events.filter((e) => !e.allDay && e.busy && e.end > e.start)
    .map((e) => ({ start: Math.max(from, e.start), end: Math.min(to, e.end) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const out: Block[] = [];
  let at = from;
  for (const b of busy) {
    if (b.start - at >= minMin * MINUTE) out.push({ start: at, end: b.start });
    at = Math.max(at, b.end);
  }
  if (to - at >= minMin * MINUTE) out.push({ start: at, end: to });
  return out;
}

const clockMin = (hhmm: string | undefined) => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const quarter = (min: number) => Math.round(min / 15) * 15;

/** The waking day the free time is counted in: the usual wake-up and sleep times over the fortnight of nights before
 *  `day` (the median, from Fitbit, at least three nights), else 7 am to 10 pm. Events outside it stretch it. */
export function wakingDay(day: string, nights: Nights | null, events: BriefEvent[]): Block & { fromFitbit: boolean } {
  const { start: dayStart, end: dayEnd } = dayBounds(day);
  const since = dayKey(addDays(fromKey(day), -14));
  const recent = Object.entries(nights || {}).filter(([k]) => k >= since && k < day).map(([, n]) => n);
  const wakes = recent.map((n) => clockMin(n.end)).filter((v): v is number => v !== null);
  // Falling asleep after midnight is late, not early: 00:40 counts as 24:40.
  const beds = recent.map((n) => clockMin(n.start)).filter((v): v is number => v !== null).map((v) => (v < 12 * 60 ? v + 24 * 60 : v));
  const fromFitbit = wakes.length >= 3 && beds.length >= 3;
  const wake = fromFitbit ? quarter(median(wakes)) : DEFAULT_WAKE;
  const bed = fromFitbit ? quarter(median(beds)) : DEFAULT_BED;
  // The clock, not a fixed number of hours, so a day with a clock change still starts at its usual time.
  const at = (min: number) => { const d = new Date(dayStart); d.setMinutes(min); return Math.min(dayEnd, d.getTime()); };
  let from = at(wake), to = at(Math.max(wake + 60, bed));
  for (const e of events) {
    if (e.allDay) continue;
    if (e.start >= dayStart && e.start < from) from = e.start;
    if (e.end <= dayEnd && e.end > to) to = e.end;
  }
  return { start: from, end: to, fromFitbit };
}

export type Row = { kind: "event"; event: BriefEvent } | { kind: "free"; start: number; end: number };

/** The timed part of the day in order, with the free blocks where they fall. */
export function timeline(events: BriefEvent[], free: Block[]): Row[] {
  const rows: Row[] = [
    ...events.filter((e) => !e.allDay).map((event): Row => ({ kind: "event", event })),
    ...free.map((b): Row => ({ kind: "free", ...b })),
  ];
  const at = (r: Row) => (r.kind === "event" ? r.event.start : r.start);
  return rows.sort((a, b) => at(a) - at(b) || (a.kind === "free" ? 1 : -1));
}

// ── Todoist ──

/** A task as Todoist's API v1 returns it (only what the brief reads). */
export type TodoistTask = {
  id: string; content: string; priority?: number;
  due?: { date?: string; datetime?: string | null; is_recurring?: boolean; string?: string } | null;
  duration?: { amount?: number; unit?: string } | null;
};
export type BriefTask = {
  id: string; text: string;
  /** Todoist's own numbers: 4 is P1, the most urgent; 1 is no priority. */
  priority: number;
  /** The local day it is due, and the time when it has one ("14:30"). */
  due: string; time: string | null; minutes: number | null; recurring: boolean;
};

/** Plain words: Markdown links keep their text, and Todoist's "* " (a task that cannot be ticked) goes. */
export function plainTask(content: string): string {
  return String(content || "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^\*\s+/, "").replace(/\s+/g, " ").trim().slice(0, 200);
}

const pad = (n: number) => (n < 10 ? "0" : "") + n;

export function toTasks(raw: TodoistTask[]): BriefTask[] {
  const out: BriefTask[] = [];
  for (const r of raw) {
    if (!r || !r.due) continue;
    const when = r.due.datetime || (r.due.date && r.due.date.includes("T") ? r.due.date : null);
    let due = (r.due.date || "").slice(0, 10), time: string | null = null;
    if (when) {
      // A time with a zone (Z or an offset) is an instant; one without is "floating", the same clock time anywhere.
      if (/(Z|[+-]\d{2}:?\d{2})$/.test(when)) {
        const d = new Date(when);
        if (!Number.isNaN(d.getTime())) { due = dayKey(d); time = `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
      } else {
        due = when.slice(0, 10);
        time = when.slice(11, 16) || null;
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;
    const amount = Number(r.duration?.amount) || 0;
    out.push({
      id: String(r.id), text: plainTask(r.content) || "(untitled task)", priority: Math.min(4, Math.max(1, Number(r.priority) || 1)),
      due, time, minutes: amount ? (r.duration?.unit === "day" ? amount * 24 * 60 : amount) : null, recurring: r.due.is_recurring === true,
    });
  }
  return out;
}

/** The tasks due on the day, and only those (David, 2026-11-03: not the earlier ones left undone). A task Morgen has
 *  already put on the calendar that day shows there, once, and is left out of the list. */
export function dueTasks(tasks: BriefTask[], day: string, events: BriefEvent[] = []): BriefTask[] {
  const onCalendar = new Set(events.filter((e) => e.task).map((e) => norm(e.title)));
  const byPriority = (a: BriefTask, b: BriefTask) => b.priority - a.priority;
  // Timed tasks first, by the clock; then the rest, most urgent first.
  const byTime = (a: BriefTask, b: BriefTask) => (a.time && b.time && a.time !== b.time ? (a.time < b.time ? -1 : 1) : a.time && !b.time ? -1 : b.time && !a.time ? 1 : byPriority(a, b));
  return tasks.filter((t) => t.due === day && !onCalendar.has(norm(t.text))).sort(byTime);
}

export const todoistUrl = (id: string) => `https://app.todoist.com/app/task/${encodeURIComponent(id)}`;

/** A task's time as a clock label ("2:30 pm"), or null when it has none. */
export function taskClock(t: BriefTask): string | null {
  if (!t.time) return null;
  const d = fromKey(t.due);
  d.setHours(Number(t.time.slice(0, 2)), Number(t.time.slice(3, 5)), 0, 0);
  return clockLabel(d.getTime());
}

// ── Words ──

/** "7 am", "8:30 pm", "12 pm". */
export function clockLabel(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}${m ? ":" + pad(m) : ""} ${h < 12 ? "am" : "pm"}`;
}

/** "7–8:30 am", "11:30 am–1 pm". A block that runs to midnight ends at "midnight". */
export function rangeLabel(start: number, end: number): string {
  const s = new Date(start), e = new Date(end);
  const midnight = e.getHours() === 0 && e.getMinutes() === 0 && end > start;
  if (midnight) return `${clockLabel(start)}–midnight`;
  const sameHalf = (s.getHours() < 12) === (e.getHours() < 12);
  return sameHalf ? `${clockLabel(start).replace(/ [ap]m$/, "")}–${clockLabel(end)}` : `${clockLabel(start)}–${clockLabel(end)}`;
}

/** "9–9:30 am"; "until 1:30 am" for one that began the night before; "9 am" for one with no length. */
export function eventTime(e: BriefEvent, day: string): string {
  if (e.start < dayBounds(day).start) return `until ${clockLabel(e.end)}`;
  return e.end > e.start ? rangeLabel(e.start, e.end) : clockLabel(e.start);
}

/** "45 min", "2 h", "2 h 30". */
export function lengthLabel(ms: number): string {
  const min = Math.round(ms / MINUTE);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${pad(m)}` : `${h} h`;
}

/** Habits that are not done in a block of time (a bedtime, a count of glasses) are never tied to one. */
const NOT_A_BLOCK = /night|bed|sleep|water|drink/i;
const PHRASES: Record<string, { phrase: string; need: number; evening?: boolean }> = {
  active: { phrase: "moving", need: 30 },
  steps: { phrase: "a walk", need: 30 },
  journal: { phrase: "a journal entry", need: 15, evening: true },
};

export type Insight = { text: string; driver: Driver; block: Block | null };

/** One line from Insights, tied to tomorrow's free time: the strongest habit that comes with great days and can be
 *  done in a block, and the first free block it fits (the evening for the journal, the morning first otherwise).
 *  `free` is null when the calendar is not known, and then no block is named. */
export function insightLine(lifts: Driver[], free: Block[] | null): Insight | null {
  for (const d of lifts) {
    // The main move says itself ("your run"); it gets twenty minutes, like a habit.
    const known = PHRASES[d.key] || (d.phrase ? { phrase: d.phrase, need: 20 } : undefined);
    const habit = d.key.startsWith("habit:") && !NOT_A_BLOCK.test(d.label) ? { phrase: `“${d.label}”`, need: 20 } : null;
    const fit = known || habit;
    if (!fit) continue;
    const lead = `Great days come with ${fit.phrase}`;
    if (!free) return { text: lead, driver: d, block: null };
    const roomy = free.filter((b) => b.end - b.start >= fit.need * MINUTE);
    const hour = (b: Block) => new Date(b.start).getHours();
    const block = (known?.evening ? roomy.find((b) => hour(b) >= 17) : roomy.find((b) => hour(b) < 12)) || roomy[0] || null;
    return { text: block ? `${lead} · ${rangeLabel(block.start, block.end)} is free` : `${lead} · no free ${fit.need} minutes tomorrow`, driver: d, block };
  }
  return null;
}

/** Dayhub's side of the day, as the brief and its text show it. */
export type SomaSide = {
  weighIn: boolean;
  /** The main move and its goal that day (the round's target when the round counts it), or null with no moves yet.
   *  `goal` reads as words: "100 push-ups", "5 km", "a session". */
  move: { name: string; goal: string; rest: boolean; dayNumber: number | null } | null;
  /** The meals one tap logs: a plan's four, or as many of their own usual meals as they have so far. */
  meals: { key: Meal; meal: string; name: string; kcal: number; protein: number }[];
  /** Their own meals rather than a plan's (settings.mealPlan "own"). */
  own: boolean;
  kcal: number; protein: number;
};

/** What Dayhub already knows about the day: weigh-in when weight closes days, the main move's goal or a rest day (the
 *  round's, from `rounds.goalFor`), and the four planned meals. */
export function somaSide(settings: Settings, move: SomaSide["move"]): SomaSide {
  const meals = MEALS.flatMap((key) => {
    const p = settings.plan[key];
    return p ? [{ key, meal: key.charAt(0).toUpperCase() + key.slice(1), name: p.name, kcal: Math.round(Number(p.kcal) || 0), protein: Math.round(Number(p.protein) || 0) }] : [];
  });
  return {
    weighIn: settings.requireWeight, move, meals, own: settings.mealPlan === "own",
    kcal: meals.reduce((n, m) => n + m.kcal, 0), protein: meals.reduce((n, m) => n + m.protein, 0),
  };
}

export type Brief = {
  day: string; builtMs: number;
  /** Null when there is no calendar to read; an error is kept beside it so one failing source never hides the other. */
  events: BriefEvent[] | null; eventsError?: string;
  tasks: BriefTask[] | null; tasksError?: string;
};

/** The one line the Today card shows: "4 events, first at 8:30 am · 3 tasks · rest day". */
export function summaryLine(brief: Brief | null, soma: SomaSide): string {
  const parts: string[] = [];
  if (brief?.events) {
    const timed = brief.events.filter((e) => !e.allDay);
    // "First" is the first to start on the day, not one still running from the night before.
    const first = timed.find((e) => e.start >= dayBounds(brief.day).start);
    parts.push(timed.length ? `${timed.length} event${timed.length === 1 ? "" : "s"}${first ? `, first at ${clockLabel(first.start)}` : ""}` : "Nothing on the calendar");
  }
  if (brief?.tasks) {
    const n = dueTasks(brief.tasks, brief.day, brief.events || []).length;
    if (n) parts.push(`${n} task${n === 1 ? "" : "s"}`);
  }
  if (soma.move) parts.push(soma.move.rest ? "rest day" : soma.move.goal);
  return parts.join(" · ");
}

/** Whether the brief should go to Telegram by itself now: switched on, not already sent for its day, and read after
 *  the brief time on the evening before that day (a brief read at 7 pm for a 9 pm time waits for the next read). */
export function sendDue(brief: Brief | null, setting: { telegram: boolean; time: string; sent: string }): boolean {
  if (!brief || !setting.telegram || setting.sent === brief.day) return false;
  const m = /^(\d{2}):(\d{2})$/.exec(setting.time);
  if (!m) return false;
  const eve = fromKey(brief.day);
  eve.setDate(eve.getDate() - 1);
  eve.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return brief.builtMs >= eve.getTime();
}

/** "Tuesday 3 November". */
export const dayTitle = (day: string) => fromKey(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** Text for Telegram's HTML mode: only &, < and > need escaping. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const PRIORITY_MARK: Record<number, string> = { 4: "🔴 ", 3: "🟠 ", 2: "🔵 " };
const MEAL_MARK: Record<string, string> = { breakfast: "🍳", lunch: "🥗", snack: "🍎", dinner: "🍽" };
/** Under Telegram's 4,096 characters, with room to spare for the tags. */
const TELEGRAM_MAX = 3800;

/** The brief as a Telegram message (HTML mode; David, 2026-11-03: "more visually appealing and easy to read"): a bold
 *  heading per part, one thing per line, the clock in monospace so the times line up, a coloured dot for Todoist's
 *  priorities. Times and titles, the free time, the tasks, Dayhub's side: never a description, an attendee or a link,
 *  because Telegram keeps whatever it is sent. Every word that came from Morgen, Todoist or the plan is escaped. */
export function briefText(brief: Brief, soma: SomaSide, free: Block[] | null, insight: Insight | null): string {
  const lines: string[] = [`🌙 <b>${esc(dayTitle(brief.day))}</b>`];
  if (brief.events) {
    lines.push("", "📅 <b>Calendar</b>");
    for (const e of brief.events.filter((x) => x.allDay)) lines.push(`🗓 ${esc(e.title)} <i>· all day</i>`);
    const timed = brief.events.filter((e) => !e.allDay);
    if (!timed.length) lines.push("<i>Nothing booked</i>");
    for (const e of timed) lines.push(`<code>${esc(eventTime(e, brief.day))}</code>  ${esc(e.title)}${e.busy ? "" : " <i>(free)</i>"}`);
    if (free?.length) {
      lines.push("", "🟢 <b>Free</b>");
      for (const b of free) lines.push(`<code>${esc(rangeLabel(b.start, b.end))}</code>  <i>${esc(lengthLabel(b.end - b.start))}</i>`);
    }
  }
  if (brief.tasks) {
    const due = dueTasks(brief.tasks, brief.day, brief.events || []);
    lines.push("", `✅ <b>Todoist</b>${due.length ? ` · ${due.length} due` : ""}`);
    if (!due.length) lines.push("<i>Nothing due</i>");
    for (const t of due) lines.push(`${PRIORITY_MARK[t.priority] || "▫️ "}${esc(t.text)}${t.time ? `  <code>${esc(taskClock(t) || "")}</code>` : ""}`);
  }
  lines.push("", "💪 <b>Dayhub</b>");
  if (soma.weighIn) lines.push("⚖️ Weigh in");
  if (soma.move) lines.push(soma.move.rest ? `😌 Rest day for ${soma.move.name.toLowerCase()}` : `🏃 ${soma.move.goal}${soma.move.dayNumber ? ` <i>· day ${soma.move.dayNumber}</i>` : ""}`);
  for (const m of soma.meals) lines.push(`${MEAL_MARK[m.key] || "🍽"} ${esc(m.name)}  <i>${m.kcal.toLocaleString("en-US")} kcal</i>`);
  if (soma.meals.length) lines.push(`<i>${soma.kcal.toLocaleString("en-US")} kcal · ${soma.protein} g protein ${soma.own ? "in your usual meals" : "planned"}</i>`);
  if (insight) lines.push("", `✨ <i>${esc(insight.text)}</i>`);
  // Too long for one message: stop at a whole line, never inside a tag.
  let out = "";
  for (const line of lines) {
    if (out.length + line.length + 3 > TELEGRAM_MAX) return out + "\n…";
    out += (out ? "\n" : "") + line;
  }
  return out;
}
