// Dayhub Ops for the screenshots: what the /ops routes would answer for a made-up Dayhub of a few thousand people, so the
// Ops screens can be shot and judged (the synthetic test members can never be admins, so `npm run dev` cannot show
// Ops on real answers). Every person here is invented and lives at fixture.test. Dev only; never shipped.

const DAY = 86400000, HOUR = 3600000;

const PEOPLE = [
  { id: "800000000000000101", name: "Priya Natarajan", email: "priya@fixture.test", device: "iPhone · app · 11-08.1915", joined: 37 },
  { id: "800000000000000102", name: "Marcus Thompson", email: "marcus@fixture.test", device: "Android · app · 11-07.2210", joined: 52 },
  { id: "800000000000000103", name: "Lena Ortiz", email: "lena@fixture.test", device: "iPhone · browser · 11-08.1915", joined: 12 },
  { id: "800000000000000104", name: "Ana Silva", email: "ana@fixture.test", device: "iPhone · app · 11-06.0930", joined: 64 },
  { id: "800000000000000105", name: "Rae Chen", email: "rae@fixture.test", device: "Mac · browser · 11-08.1915", joined: 2 },
  { id: "800000000000000106", name: "Theo Brandt", email: "theo@fixture.test", device: "iPhone · app · 11-08.1915", joined: 30 },
  { id: "800000000000000107", name: "Jordan Kim", email: "jordan@fixture.test", device: "iPhone · app · 11-01.1200", joined: 45 },
  { id: "800000000000000108", name: "Sam Wright", email: "sam@fixture.test", device: "Windows · browser · 11-08.1915", joined: 9 },
];
const short = (name: string) => { const p = name.split(" "); return `${p[0]} ${p[p.length - 1][0]}.`; };
const first = (name: string) => name.split(" ")[0];
const fmt = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const fday = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function issues(now: number) {
  const p = (id: string) => PEOPLE.find((x) => x.id === id)!;
  const mk = (id: string, kind: string, sev: string, extra: { firstMs: number; lastMs: number } & Record<string, unknown>) => ({
    key: `${kind.toLowerCase().replace(/[^a-z]+/g, "-")}:${id}`, kind, sev, userId: id, person: short(p(id).name), email: p(id).email, first: first(p(id).name),
    isNew: false, handledBy: null, template: "", timeline: [], ...extra,
  });
  return [
    mk("800000000000000101", "Journal", "needs", { isNew: true, firstMs: now - 21 * HOUR, lastMs: now - 11 * HOUR, title: "Journal entries won't open", meta: `6 of 41 entries · since ${fday(now - 21 * HOUR)}`, fix: "ask them to reopen the home-screen app",
      fixLong: "Entries that fail on one device and open on another point at an old copy of the app on that device, not at the entries. Ask them to close Dayhub fully and open it again. If the same entries keep failing, their ids are in the log line.",
      template: "Hi Priya, some of your journal entries aren't opening on one of your devices. They're safe. Could you close Dayhub completely and open it again from your home screen?",
      timeline: [{ at: now - 21 * HOUR, text: `${fmt(now - 21 * HOUR)} · entries_unreadable · 6 of 41 · OperationError:6` }, { at: now - 11 * HOUR, text: `${fmt(now - 11 * HOUR)} · entries_unreadable · 6 of 41 · OperationError:6` }] }),
    mk("800000000000000102", "Fitbit", "needs", { firstMs: now - 3 * DAY, lastMs: now - 3 * DAY, title: "Fitbit disconnected", meta: `3 days · no steps since ${fday(now - 3 * DAY)}`, fix: "send the reconnect message",
      fixLong: "Google ended the connection, as it does about every 7 days while Dayhub's Google app is unverified. They need to connect again in Settings → Fitbit · Google Health. This clears itself the moment they do.",
      template: `Hi Marcus, your Fitbit stopped syncing on ${fday(now - 3 * DAY)}. Google ends the connection every so often: open Settings → Fitbit · Google Health and tap Connect, and your steps will catch up.`,
      timeline: [{ at: now - 3 * DAY, text: `${fmt(now - 3 * DAY)} · token_dead · Google ended the connection` }] }),
    mk("800000000000000103", "Errors", "needs", { isNew: true, firstMs: now - 10 * HOUR, lastMs: now - HOUR, title: "Same error, 14 times today", meta: "food · estimate_failed", fix: "check their errors and that part of Dayhub",
      fixLong: "Only they get it, so it is likely something in what they do or their device, not the service. Their errors are on their page, each with its detail.",
      template: "Hi Lena, something in Dayhub kept failing for you today. I'm looking into it and will let you know.", timeline: [{ at: now - HOUR, text: "14 times in 24 h · food.estimate_failed" }] }),
    mk("800000000000000104", "Reminders", "needs", { firstMs: now - 2 * DAY, lastMs: now - 2 * DAY, title: "Evening reminders stopped", meta: `their phone dropped the subscription · ${fday(now - 2 * DAY)}`, fix: "ask them to turn the evening nudge off and on",
      fixLong: "Their phone dropped the reminder subscription (404 or 410 from the push service), usually after a reinstall or a cleared Safari. Turning Evening nudge off and on again in Settings makes a new one.",
      template: "Hi Ana, your evening reminders stopped reaching your phone. Turn Evening nudge off and on again in Settings and they'll come back.", timeline: [{ at: now - 2 * DAY, text: `${fmt(now - 2 * DAY)} · subscription_gone · 410` }] }),
    mk("800000000000000105", "Approval", "needs", { firstMs: now - 2 * DAY - 3 * HOUR, lastMs: now - 2 * DAY - 3 * HOUR, title: "Waiting for approval 2 days", meta: `signed up ${fday(now - 2 * DAY)} · no invite`, fix: "approve them, or leave them waiting",
      fixLong: "Someone signed up without an invite link and is waiting on the \"waiting for approval\" screen. Approve them, or leave them pending.", approve: true,
      timeline: [{ at: now - 2 * DAY, text: `${fmt(now - 2 * DAY)} · signed up without an invite` }, { at: now - 5 * HOUR, text: `${fmt(now - 5 * HOUR)} · opened Dayhub, still waiting` }] }),
    mk("800000000000000106", "AI limits", "watching", { firstMs: now - 2 * DAY, lastMs: now - 4 * HOUR, title: "Hit the food estimate limit", meta: "3 days running · 60 a day", fix: "look at the pattern before raising it",
      fixLong: "Several days at the cap: either someone who logs everything, or a script holding their account. The cap protects the bill for everyone; admins are never capped.",
      timeline: [0, 1, 2].map((d) => ({ at: now - d * DAY, text: `${iso(now - d * DAY)} · reached the daily cap` })).reverse() }),
    mk("800000000000000107", "Gone quiet", "watching", { firstMs: now - 6 * DAY, lastMs: now - 6 * DAY, title: "A regular went quiet", meta: "closed 18 of 21 days · nothing for 6 days", fix: "a short personal check-in",
      fixLong: "People who stop after a long run often come back for a word from a person, not the app. Keep it short and about them.",
      template: "Hi Jordan, I noticed you haven't been on Dayhub this week after a great run. Everything OK? If something in the app got in your way, I'd love to know.", timeline: [{ at: now - 6 * DAY, text: `last closed day ${iso(now - 6 * DAY)}` }] }),
    mk("800000000000000108", "Messages", "watching", { isNew: true, firstMs: now - 5 * HOUR, lastMs: now - 5 * HOUR, title: "Wrote to you", meta: `${fday(now - 5 * HOUR)} · “Food search doesn't know oat milk”`, fix: "reply in Support",
      fixLong: "A reply shows in Dayhub as a message from you, and answering clears this.", template: "Hi Sam, thanks for writing. ", timeline: [{ at: now - 5 * HOUR, text: `${fmt(now - 5 * HOUR)} · message` }] }),
  ];
}

function counts(list: { sev: string; kind: string; isNew: boolean; firstMs: number }[]) {
  const c = { open: 0, needs: 0, watching: 0, handled: 0, newToday: 0, oldestMs: null as number | null, byKind: {} as Record<string, number> };
  for (const it of list) {
    (c as unknown as Record<string, number>)[it.sev]++;
    if (it.sev !== "handled") { c.open++; if (it.isNew) c.newToday++; if (c.oldestMs === null || it.firstMs < c.oldestMs) c.oldestMs = it.firstMs; c.byKind[it.kind] = (c.byKind[it.kind] || 0) + 1; }
  }
  return c;
}

function person(now: number, id: string) {
  const p = PEOPLE.find((x) => x.id === id) || PEOPLE[0];
  const pattern = ["11111", "11111", "10111", "11111", "01101", "11111", "11111", "00100", "11111", "11011", "11111", "11111", "11111", "11101"];
  const days = pattern.map((row, i) => {
    const [w, c, j, f, m] = row.split("").map((x) => x === "1");
    return { day: iso(now - (13 - i) * DAY), weight: w, checkin: c, journal: j ? 1 : 0, meals: f ? 4 : 2, food: f, move: m, closed: w && c && j && f && m };
  }).reverse();
  return {
    person: { userId: p.id, name: p.name, email: p.email, role: "member", status: "active", joinedMs: now - p.joined * DAY, lastSeenMs: now - 11 * HOUR, invitedBy: "800000000000000107", device: p.device,
      shortName: short(p.name), first: first(p.name), invitedByName: "Jordan K.", zone: "America/Chicago", moves: { moves: ["run (main)", "push-ups", "yoga"], legacy: false }, requireWeight: true,
      counts: { weight: true, checkin: true, journal: true, food: true, activity: true, meals: 4 } },
    days, closed: days.filter((d) => d.closed).length, streak: 3,
    journal: { entries: 41, lastMs: now - 11 * HOUR },
    issues: issues(now).filter((it) => it.userId === p.id),
    errors: [
      { at: now - 11 * HOUR, level: "warn", source: "client", area: "journal", event: "entries_unreadable", message: "", status: null, screen: "/journal/", device: "iPhone" },
      { at: now - 21 * HOUR, level: "warn", source: "client", area: "journal", event: "entries_unreadable", message: "", status: null, screen: "/journal/", device: "iPhone" },
      { at: now - 4 * DAY, level: "error", source: "client", area: "api", event: "refused", message: "PUT /day-logs failed", status: 409, screen: "/food/", device: "Mac" },
    ],
    thread: [
      { at: now - 7 * DAY, sender: "member", who: null, body: "Is there a way to get my runs out of Dayhub? I want them in a spreadsheet.", read: true, feedback: true },
      { at: now - 7 * DAY + 25 * 60000, sender: "admin", who: "Alex R.", body: "Yes: Settings → Your data → Download my data. Runs are in the file under activity.", read: true },
    ],
    ai: [["food", "food estimates", 12, 60], ["tone", "journal readings", 0, 20], ["review", "weekly reviews", 0, 6], ["speech", "reading aloud", 0, 15000], ["transcribe", "transcriptions", 3, 40]].map(([kind, what, used, max]) => ({ kind, what, used, max })),
    self: false,
  };
}

function problems(now: number) {
  const mk = (area: string, event: string, status: string, people: number, count: number, trend: number[], firstMs: number, message: string, release: string | null, level = "error") =>
    ({ id: `${area}.${event}`, area, event, level, message, people, count, trend, firstMs, lastMs: now - 40 * 60000, status, mutedUntil: null, fixedAt: null, release });
  return [
    mk("food", "estimate_failed", "new", 1, 14, [0, 0, 0, 0, 0, 0, 1, 3, 4, 3, 2, 1], now - 10 * HOUR, "the estimate came back in a form Dayhub could not read", "11-08.1915"),
    mk("insights", "tone_failed", "new", 2, 3, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1], now - 3 * HOUR, "502 from the journal reader", "11-08.1915"),
    mk("google-health", "token_dead", "spiking", 23, 31, [1, 1, 2, 1, 2, 3, 2, 4, 3, 5, 3, 4], now - 40 * DAY, "Google ended the connection (revoked, expired, or 7-day Testing limit)", "several", "warn"),
    mk("journal", "entries_unreadable", "steady", 3, 9, [0, 1, 0, 1, 1, 0, 2, 1, 0, 1, 1, 1], now - 13 * DAY, "", "11-07.2210", "warn"),
    mk("push", "send_failed", "steady", 7, 21, [0, 0, 0, 0, 0, 0, 0, 0, 7, 7, 7, 0], now - 36 * DAY, "410 Gone", null),
    mk("api", "unreachable", "steady", 64, 140, [9, 8, 12, 11, 13, 10, 14, 12, 11, 15, 13, 12], now - 52 * DAY, "Failed to fetch", "several", "warn"),
  ];
}

/** Answers for the Ops routes, or null for a route that is not Ops'. */
export function opsAnswer(nowDate: Date, route: string, q: URLSearchParams = new URLSearchParams()): unknown | null {
  const now = nowDate.getTime();
  if (route === "/ops/badges") { const c = counts(issues(now)); return { needs: c.needs, open: c.open, unanswered: 1, byKind: c.byKind, env: "Development", release: "11-08.1902" }; }
  if (route === "/ops/issues") { const list = issues(now); return { issues: list, counts: counts(list), partial: false, at: now }; }
  if (route === "/ops/overview") {
    const seen = [1102, 1150, 1188, 1176, 1210, 1095, 1032, 1190, 1222, 1260, 1248, 1301, 1156, 1284];
    return {
      at: now,
      tiles: { seenToday: 1284, seenWeek: 6902, members: 9710, signupsWeek: 214, signupsCapped: false, invitedWeek: 168, closedYesterday: { closed: 705, of: 1156, logged: 1090 }, errors24: 312, errorsNormal: 280, ai: { food: 3920, tone: 610, review: 1980, transcribe: 820, speech: 412000 }, limits: { food: 60, tone: 20, review: 6, speech: 15000, transcribe: 40 }, release: "11-08.1902" },
      days: seen.map((v, i) => ({ day: iso(now - (13 - i) * DAY), seen: i < 3 ? null : v, closed: null, logged: null, signups: null })),
      cohorts: {
        table: [["2026-09-28", 180, [72, 58, 49, 44, 41, 39]], ["2026-10-05", 205, [70, 55, 47, 43, 40, null]], ["2026-10-12", 231, [74, 60, 52, 46, null, null]], ["2026-10-19", 198, [69, 57, 50, null, null, null]], ["2026-10-26", 214, [71, 59, null, null, null, null]], ["2026-11-02", 220, [null, null, null, null, null, null]]]
          .map(([week, n, cells]) => ({ week, n, cells })),
        funnel: { week: "2026-10-12", steps: [["Signed up", 231], ["Made a vault", 205], ["Closed a first day", 188], ["Closed 4+ days in week 1", 171], ["Still closing in week 3", 120]] },
        people: 1248, at: now - 6 * HOUR,
      },
    };
  }
  if (route === "/ops/people") return { people: PEOPLE.filter((p) => q.get("status") !== "pending" || p.id === "800000000000000105").map((p) => ({ userId: p.id, name: p.name, email: p.email, role: "member", status: p.id === "800000000000000105" ? "pending" : "active", joinedMs: now - p.joined * DAY, lastSeenMs: now - (p.joined % 7) * HOUR * 5, invitedBy: null, device: p.device })), more: false, next: PEOPLE.length };
  if (route.startsWith("/ops/people/")) return person(now, route.split("/")[3]);
  if (route === "/ops/errors") return { at: now, problems: problems(now), errors24: 312, warnings24: 180, capped: false, normal: 280, alerts: { fresh: true, wide: true, api: true, deploy: false }, retentionDays: 30 };
  if (route === "/ops/errors/sample") return { sample: { at: now - 40 * 60000, level: "error", source: "client", message: "the estimate came back in a form Dayhub could not read", status: 502, detail: JSON.stringify({ status: 502, chars: 1180, screen: "/food/", installed: true, build: "11-08.1915" }) } };
  if (route === "/ops/support") return { threads: [
    { userId: "800000000000000108", person: "Sam W.", email: "sam@fixture.test", lastMs: now - 5 * HOUR, lastSender: "member", preview: "Food search doesn't know oat milk", unanswered: true, count: 1 },
    { userId: "800000000000000101", person: "Priya N.", email: "priya@fixture.test", lastMs: now - 7 * DAY, lastSender: "admin", preview: "Yes: Settings → Your data → Download my data. Runs are in the file under activity.", unanswered: false, count: 2 },
  ] };
  if (route === "/ops/audit") return { items: [
    { at: now - 2 * HOUR, actor: "Alex R.", actorId: "1", action: "values_shown", target: "Priya N.", targetId: "800000000000000101", reason: "She asked me to fix a wrong weight on Nov 6", detail: { days: 14 } },
    { at: now - 3 * HOUR, actor: "Alex R.", actorId: "1", action: "message_sent", target: "Marcus T.", targetId: "800000000000000102", reason: null, detail: { chars: 168 } },
    { at: now - 26 * HOUR, actor: "Alex R.", actorId: "1", action: "error_mute", target: null, targetId: null, reason: null, detail: { problem: "push.send_failed" } },
    { at: now - 2 * DAY, actor: "Alex R.", actorId: "1", action: "profile_status", target: "Rae C.", targetId: "800000000000000105", reason: null, detail: { from: "pending", to: "active" } },
  ], more: false };
  if (route === "/admin/invites") return { invites: [{ code: "FX7Q2M", maxUses: 10, uses: 3, expiresMs: now + 20 * DAY, revoked: false, createdAt: iso(now - 10 * DAY) }] };
  if (route === "/admin/logs") return { items: [], more: false };
  if (route === "/admin/logs/summary") return { day: { error: 312, warn: 180 }, week: { error: 2010, warn: 1200 }, capped: true, areas: [] };
  return null;
}
