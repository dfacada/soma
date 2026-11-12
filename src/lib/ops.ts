// Dayhub Ops, the browser side without React: what the /ops routes answer (catalyst/functions/soma_api/routes/ops.js)
// and the small words and dates the screens share. Admin only; every route checks again on the server.

export type Sev = "needs" | "watching" | "handled";
export type Issue = {
  key: string; kind: string; sev: Sev; userId: string; person: string; email: string; first: string;
  title: string; meta: string; fix: string; fixLong: string; template: string; approve?: boolean;
  firstMs: number; lastMs: number; isNew: boolean; handledBy: string | null;
  timeline: { at: number; text: string }[];
};
export type IssueCounts = { open: number; needs: number; watching: number; handled: number; newToday: number; oldestMs: number | null; byKind: Record<string, number> };
export type Badges = { needs: number; open: number; unanswered: number; byKind: Record<string, number>; env: string | null; release: string | null };

export type Cohorts = {
  table: { week: string; n: number; cells: (number | null)[] }[];
  funnel: { week: string; steps: [string, number][] } | null;
  people: number; at: number;
};
export type Overview = {
  at: number;
  tiles: {
    seenToday: number; seenWeek: number; members: number; signupsWeek: number; signupsCapped: boolean; invitedWeek: number;
    closedYesterday: { closed: number; of: number; logged: number } | null;
    errors24: number; errorsNormal: number | null; ai: Record<string, number>; limits: Record<string, number>; release: string | null;
  };
  days: { day: string; seen: number | null; closed: number | null; logged: number | null; signups: number | null }[];
  cohorts: Cohorts | null;
};

export type PersonRow = { userId: string; name: string; email: string; role: "admin" | "member"; status: "pending" | "active" | "disabled" | "deleting"; joinedMs: number | null; lastSeenMs: number | null; invitedBy: string | null; device: string | null };
/** `food`: every meal that counts for them was eaten. */
export type DoneDay = { day: string; weight: boolean; checkin: boolean; journal: number; meals: number; food: boolean; move: boolean; closed: boolean };
/** Which of the five close this person's day (settings.closes, since 2026-11-11), and how many meals food asks for. */
export type Counts = { weight: boolean; checkin: boolean; journal: boolean; food: boolean; activity: boolean; meals: number };
export type ThreadMessage = { at: number; sender: "admin" | "member"; who: string | null; body: string; read: boolean; feedback?: boolean };
export type PersonView = {
  person: PersonRow & { shortName: string; first: string; invitedByName: string | null; zone: string; moves: { moves: string[]; legacy: boolean }; requireWeight: boolean; counts: Counts };
  days: DoneDay[]; closed: number; streak: number;
  journal: { entries: number; lastMs: number | null };
  issues: Issue[];
  errors: { at: number; level: string; source: string; area: string; event: string; message: string; status: number | null; screen: string | null; device: string | null }[];
  thread: ThreadMessage[];
  ai: { kind: string; what: string; used: number; max: number }[];
  self: boolean;
};
export type Revealed = {
  reason: string; unit: string;
  weight: { day: string; value: number }[];
  food: { day: string; meals: Record<string, { name: string; kcal: number | null } | null> }[];
  activity: { day: string; pushups: number; steps: number; types: Record<string, unknown> }[];
};

export type ProblemStatus = "new" | "spiking" | "steady" | "muted" | "fixed" | "back";
export type Problem = {
  id: string; area: string; event: string; level: string; message: string; people: number; count: number; trend: number[];
  firstMs: number; lastMs: number; status: ProblemStatus; mutedUntil: number | null; fixedAt: number | null; release: string | null;
};
export type Alerts = { fresh: boolean; wide: boolean; api: boolean; deploy: boolean };
export type ErrorsView = { at: number; problems: Problem[]; errors24: number; warnings24: number; capped: boolean; normal: number | null; alerts: Alerts; retentionDays: number };
export type Sample = { at: number; level: string; source: string; message: string; detail: string | null; status: number | null };

export type SupportThread = { userId: string; person: string; email: string; lastMs: number; lastSender: "admin" | "member"; preview: string; unanswered: boolean; count: number };
export type AuditItem = { at: number; actor: string | null; actorId: string; action: string; target: string | null; targetId: string | null; reason: string | null; detail: unknown };

// ── Words and dates ──

/** The admin's own time zone, sent so the server can write "since Nov 5" in it. */
export const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };
/** Local midnight, for "seen today". */
export const localMidnight = (now = Date.now()) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

export const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const fmtTime = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** "Sunday 8 November". */
export const fmtLong = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
/** "Oct 5" from "2026-10-05" without a time zone shifting it. */
export const fmtIsoDay = (day: string) => new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "just now", "12 min ago", "3 h ago", "yesterday", "Nov 2". */
export function ago(ms: number | null, now = Date.now()): string {
  if (!ms) return "never";
  const d = now - ms;
  if (d < 60000) return "just now";
  if (d < 3600000) return `${Math.floor(d / 60000)} min ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)} h ago`;
  if (d < 2 * 86400000) return "yesterday";
  return fmtDay(ms);
}

export const n = (v: number) => v.toLocaleString("en-US");
export const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");
export const initial = (name: string, email = "") => (name || email || "?").trim().charAt(0).toUpperCase();

/** What an audit row's action means, in words. */
export const ACTION_WORDS: Record<string, string> = {
  person_viewed: "opened the page of", values_shown: "showed the values of", message_sent: "wrote to",
  account_deleted: "deleted the account of", issue_handled: "marked an issue handled for", issue_reopened: "reopened an issue for",
  profile_status: "changed the status of", profile_role: "changed the role of", activity_viewed: "looked at the activity of",
  error_mute: "muted a problem", error_unmute: "unmuted a problem", error_fixed: "marked a problem fixed", error_unfixed: "reopened a problem",
  alerts_changed: "changed the Telegram alerts", invite_made: "made a sign-up invite", invite_revoked: "turned off a sign-up invite",
};

export const STATUS_WORDS: Record<ProblemStatus, string> = { new: "New", spiking: "Spiking", steady: "Steady", muted: "Muted", fixed: "Fixed", back: "Back" };
export const SEV_WORDS: Record<Sev, string> = { needs: "Needs you", watching: "Watching", handled: "Handled" };
