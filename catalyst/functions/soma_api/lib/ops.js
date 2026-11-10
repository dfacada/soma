// Dayhub Ops, the pure part: no Data Store here, so scripts/test-ops.mjs runs every rule on rows it makes up.
// routes/ops.js reads the rows and hands them in. Rows come straight from ZCQL: numbers and booleans as strings.
//
// What Ops may know about a person is deliberately small: who they are (name, email, id), when they came and were last
// seen, whether each of the five things was done on a day (never what was eaten, weighed or moved; those take a
// reason and land in the audit, routes/ops.js /reveal), what failed for them, and what they wrote to the admin.
// Journal entries are sealed with the person's passphrase; Ops counts them and nothing more.

'use strict';

const { closingRules, moved, MEALS } = require('./closing');

const HOUR = 3600000, DAY = 86400000;
const num = (v) => Number(v) || 0;
const parse = (text, fallback) => { try { return text ? JSON.parse(text) : fallback; } catch (_e) { return fallback; } };
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// ── Words ──

/** The first name to greet someone by: the first word of their name, else their email's local part, capitalised. */
function firstName(name, email) {
  const first = String(name || '').trim().split(/\s+/)[0];
  if (first) return first;
  const local = String(email || '').split('@')[0].split(/[._+-]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'there';
}

/** "Priya N.": first name and an initial, which is how Ops lists people. */
function shortName(name, email) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
  return parts[0] || String(email || '').split('@')[0] || 'Someone';
}

/** A browser's user agent → the kind of device, for "last seen on". Nothing finer: Ops does not fingerprint people. */
function deviceOf(ua) {
  const s = String(ua || '');
  if (/iPad/.test(s)) return 'iPad';
  if (/iPhone|iPod/.test(s)) return 'iPhone';
  if (/Android/.test(s)) return 'Android';
  if (/Macintosh|Mac OS X/.test(s)) return 'Mac';
  if (/Windows/.test(s)) return 'Windows';
  if (/Linux|CrOS/.test(s)) return 'Linux';
  return 'Unknown';
}

/** A time zone name the caller sent, if Node knows it; UTC otherwise. */
function zoneOr(tz) {
  if (typeof tz !== 'string' || !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(0); return tz; } catch (_e) { return 'UTC'; }
}
const fmtDay = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(ms);
const fmtTime = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
/** The calendar day of an instant in a zone, as YYYY-MM-DD. */
const dayIn = (ms, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

/** "3 days", "1 day", "today". */
function daysText(n) { return n <= 0 ? 'today' : n === 1 ? '1 day' : `${n} days`; }

/** When a profile was made: created_ms (written since Ops), else the Data Store's CREATEDTIME read as UTC, which can
 *  be a few hours off for accounts from before Ops and is only ever used for weekly counts. */
function createdMs(p) {
  const ms = num(p.created_ms);
  if (ms) return ms;
  const t = Date.parse(String(p.CREATEDTIME || '').replace(' ', 'T').replace(/:(\d{3})$/, '.$1') + 'Z');
  return Number.isFinite(t) ? t : 0;
}

// ── Issues ──
// An issue is a person and something that needs a look. Every issue comes from a signal still present in the data:
// when the signal clears (they reconnect, a reply is sent, they are approved), the issue is gone without anyone
// closing it. Marking one handled only hides it until the signal comes back newer than the mark.

const KINDS = ['Fitbit', 'Journal', 'Errors', 'Reminders', 'AI limits', 'Approval', 'Gone quiet', 'Messages'];
const SEV_OF = { Fitbit: 'needs', Journal: 'needs', Errors: 'needs', Reminders: 'needs', Approval: 'needs', 'AI limits': 'watching', 'Gone quiet': 'watching', Messages: 'watching' };
const AI_WHAT = { food: 'food estimate', tone: 'journal reading', review: 'weekly review', speech: 'reading aloud', transcribe: 'transcription' };

/** The log events the issue rules read, for routes/ops.js to ask for (and nothing else). */
const ISSUE_EVENTS = [
  ['google-health', 'token_dead'], ['google-health', 'connected'],
  ['journal', 'entries_unreadable'],
  ['push', 'send_failed'], ['push', 'subscription_gone'],
  ['quota', 'cap_reached']
];

const keyOf = (kind, userId, extra) => [kind.toLowerCase().replace(/[^a-z]+/g, '-'), userId, extra].filter(Boolean).join(':');

/**
 * src: {
 *   logs:     rows of ISSUE_EVENTS from the last 14 days: { user_id, area, event, lvl, created_ms, message, detail, http_status }
 *   repeats:  { user_id, area, event, n } — one person's error, 10 or more times in 24 hours
 *   spread:   Map 'area.event' → how many people had that error in 24 hours
 *   pending:  profiles waiting for approval
 *   quiet:    profiles with closed_json, last_seen_ms (candidates for "gone quiet")
 *   messages: member messages nobody has answered: { ROWID, user_id, body, created_ms }
 *   feedback: feedback rows not yet acknowledged (the form from before messages): { ROWID, user_id, body, CREATEDTIME }
 *   subs:     Set of user ids that still have a push subscription
 *   nudgeOn:  Set of user ids whose evening nudge is switched on
 *   people:   Map user id → { name, email }
 *   states:   Map issue key → { handledAt, by }
 * }
 */
function detectIssues(src, now, tz = 'UTC') {
  const out = [];
  const person = (uid) => src.people.get(String(uid)) || { name: '', email: '' };
  const add = (kind, uid, extra, facts) => {
    const p = person(uid);
    out.push(Object.assign({ key: keyOf(kind, String(uid), extra), kind, userId: String(uid), person: shortName(p.name, p.email), email: p.email, first: firstName(p.name, p.email) }, facts));
  };

  const byUser = new Map();
  for (const r of src.logs || []) {
    if (!r.user_id) continue;
    const uid = String(r.user_id);
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(r);
  }
  for (const list of byUser.values()) list.sort((a, b) => num(b.created_ms) - num(a.created_ms));

  for (const [uid, list] of byUser) {
    // Fitbit · Google Health: the newest of "ended" and "connected" is "ended".
    const health = list.filter((r) => r.area === 'google-health' && (r.event === 'token_dead' || r.event === 'connected'));
    if (health[0] && health[0].event === 'token_dead') {
      const dead = [];
      for (const r of health) { if (r.event !== 'token_dead') break; dead.push(r); }
      const first = num(dead[dead.length - 1].created_ms), last = num(dead[0].created_ms);
      add('Fitbit', uid, null, {
        firstMs: first, lastMs: last,
        title: 'Fitbit disconnected', meta: `${daysText(Math.floor((now - first) / DAY))} · no steps since ${fmtDay(first, tz)}`,
        fix: 'send the reconnect message',
        fixLong: 'Google ended the connection, as it does about every 7 days while Dayhub\'s Google app is unverified. They need to connect again in Settings → Fitbit · Google Health. This clears itself the moment they do.',
        template: `Hi {first}, your Fitbit stopped syncing on ${fmtDay(first, tz)}. Google ends the connection every so often: open Settings → Fitbit · Google Health and tap Connect, and your steps will catch up.`,
        timeline: dead.slice(0, 4).reverse().map((r) => ({ at: num(r.created_ms), text: `${fmtTime(num(r.created_ms), tz)} · token_dead · ${r.message ? 'Google ended the connection' : 'invalid_grant'}` }))
      });
    }

    // Journal entries that would not open, in the last two days. "info" means the app was away and the network
    // dropped, which explains itself; only warnings count.
    const unreadable = list.filter((r) => r.area === 'journal' && r.event === 'entries_unreadable' && r.lvl !== 'info' && num(r.created_ms) > now - 2 * DAY);
    if (unreadable.length) {
      const d = parse(unreadable[0].detail, {});
      const count = num(d.count), of = num(d.of);
      add('Journal', uid, null, {
        firstMs: num(unreadable[unreadable.length - 1].created_ms), lastMs: num(unreadable[0].created_ms),
        title: 'Journal entries won\'t open', meta: `${count ? `${count}${of ? ` of ${of}` : ''} entries` : 'some entries'} · since ${fmtDay(num(unreadable[unreadable.length - 1].created_ms), tz)}`,
        fix: 'ask them to reopen the home-screen app',
        fixLong: 'Entries that fail on one device and open on another point at an old copy of the app on that device, not at the entries. Ask them to close Dayhub fully and open it again. If the same entries keep failing, their ids are in the log line.',
        template: 'Hi {first}, some of your journal entries aren\'t opening on one of your devices. They\'re safe. Could you close Dayhub completely and open it again from your home screen?',
        timeline: unreadable.slice(0, 4).reverse().map((r) => { const x = parse(r.detail, {}); return { at: num(r.created_ms), text: `${fmtTime(num(r.created_ms), tz)} · entries_unreadable · ${num(x.count)} of ${num(x.of)}${x.reasons ? ` · ${String(x.reasons).replace(/[{}"]/g, '').slice(0, 60)}` : ''}` }; })
      });
    }

    // Reminders: the phone dropped its subscription and nothing replaced it, while the nudge is still on.
    const gone = list.find((r) => r.area === 'push' && r.event === 'subscription_gone' && num(r.created_ms) > now - 7 * DAY);
    if (gone && !src.subs.has(uid) && src.nudgeOn.has(uid)) {
      add('Reminders', uid, 'gone', {
        firstMs: num(gone.created_ms), lastMs: num(gone.created_ms),
        title: 'Evening reminders stopped', meta: `their phone dropped the subscription · ${fmtDay(num(gone.created_ms), tz)}`,
        fix: 'ask them to turn the evening nudge off and on',
        fixLong: 'Their phone dropped the reminder subscription (404 or 410 from the push service), usually after a reinstall or a cleared Safari. Turning Evening nudge off and on again in Settings makes a new one.',
        template: 'Hi {first}, your evening reminders stopped reaching your phone. Turn Evening nudge off and on again in Settings and they\'ll come back.',
        timeline: [{ at: num(gone.created_ms), text: `${fmtTime(num(gone.created_ms), tz)} · subscription_gone · ${gone.http_status || ''}`.trim() }]
      });
    }
    // Or sends that keep failing on two or more of the last three days.
    const failed = list.filter((r) => r.area === 'push' && r.event === 'send_failed' && num(r.created_ms) > now - 3 * DAY);
    const failDays = new Set(failed.map((r) => utcDay(num(r.created_ms))));
    if (failDays.size >= 2) {
      add('Reminders', uid, 'failing', {
        firstMs: num(failed[failed.length - 1].created_ms), lastMs: num(failed[0].created_ms),
        title: 'Evening reminders failing', meta: `${failDays.size} nights · push ${failed[0].http_status || 'error'}`,
        fix: 'ask them to turn the evening nudge off and on',
        fixLong: 'The push service keeps refusing this device. If it carries on, the subscription is dropped after eight failures; a new one comes from turning Evening nudge off and on again.',
        template: 'Hi {first}, your evening reminders haven\'t been reaching your phone. Could you turn Evening nudge off and on again in Settings?',
        timeline: failed.slice(0, 4).reverse().map((r) => ({ at: num(r.created_ms), text: `${fmtTime(num(r.created_ms), tz)} · send_failed · ${r.http_status || ''}`.trim() }))
      });
    }

    // A daily AI limit reached on two or more of the last three days: worth a look before raising it.
    const caps = list.filter((r) => r.area === 'quota' && r.event === 'cap_reached' && num(r.created_ms) > now - 3 * DAY);
    const byKind = new Map();
    for (const r of caps) { const k = parse(r.detail, {}).kind || 'food'; if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push(r); }
    for (const [kind, rows] of byKind) {
      const days = new Set(rows.map((r) => utcDay(num(r.created_ms))));
      if (days.size < 2) continue;
      const max = parse(rows[0].detail, {}).max;
      add('AI limits', uid, kind, {
        firstMs: num(rows[rows.length - 1].created_ms), lastMs: num(rows[0].created_ms),
        title: `Hit the ${AI_WHAT[kind] || kind} limit`, meta: `${days.size} days running${max ? ` · ${max} a day` : ''}`,
        fix: 'look at the pattern before raising it',
        fixLong: 'Several days at the cap: either someone who logs everything, or a script holding their account. The cap protects the bill for everyone; admins are never capped.',
        template: '',
        timeline: [...days].sort().map((d) => ({ at: Date.parse(d + 'T12:00:00Z'), text: `${d} · reached the daily cap` }))
      });
    }
  }

  // The same error, ten or more times in a day, for one person.
  for (const r of src.repeats || []) {
    const n = num(r.n), id = `${r.area}.${r.event}`;
    const others = Math.max(0, num(src.spread && src.spread.get(id)) - 1);
    add('Errors', r.user_id, id, {
      firstMs: num(r.first) || now, lastMs: num(r.last) || now,
      title: `Same error, ${n} times today`, meta: `${r.area} · ${r.event}`,
      fix: others ? `${others} other ${others === 1 ? 'person has' : 'people have'} it too: see Errors` : 'check their errors and that part of Dayhub',
      fixLong: others ? `${others + 1} people hit ${id} today, so this is Dayhub, not them. The Errors page has it grouped with a sample.` : 'Only they get it, so it is likely something in what they do or their device, not the service. Their errors are on their page, each with its detail.',
      template: 'Hi {first}, something in Dayhub kept failing for you today. I\'m looking into it and will let you know.',
      timeline: [{ at: num(r.last) || now, text: `${n} times in 24 h · ${id}` }]
    });
  }

  // Waiting for approval for more than a day.
  for (const p of src.pending || []) {
    const made = createdMs(p);
    if (!made || made > now - DAY) continue;
    const waited = Math.floor((now - made) / DAY);
    add('Approval', p.user_id, null, {
      firstMs: made, lastMs: made,
      title: `Waiting for approval ${daysText(waited)}`, meta: `signed up ${fmtDay(made, tz)} · no invite`,
      fix: 'approve them, or leave them waiting',
      fixLong: 'Someone signed up without an invite link and is waiting on the "waiting for approval" screen. Approve them, or leave them pending.',
      template: '', approve: true,
      timeline: [{ at: made, text: `${fmtTime(made, tz)} · signed up without an invite` }].concat(num(p.last_seen_ms) > made + HOUR ? [{ at: num(p.last_seen_ms), text: `${fmtTime(num(p.last_seen_ms), tz)} · opened Dayhub, still waiting` }] : [])
    });
  }

  // A regular who went quiet: 12 or more closed days in the three weeks before they stopped, and nothing for 5 days.
  for (const p of src.quiet || []) {
    const q = quietOf(parse(p.closed_json, {}), num(p.last_seen_ms), now);
    if (!q) continue;
    add('Gone quiet', p.user_id, null, {
      firstMs: q.lastMs, lastMs: q.lastMs,
      title: 'A regular went quiet', meta: `closed ${q.closed} of 21 days · nothing for ${daysText(q.quietDays)}`,
      fix: 'a short personal check-in',
      fixLong: 'People who stop after a long run often come back for a word from a person, not the app. Keep it short and about them.',
      template: 'Hi {first}, I noticed you haven\'t been on Dayhub this week after a great run. Everything OK? If something in the app got in your way, I\'d love to know.',
      timeline: [{ at: q.lastMs, text: `last closed day ${q.lastDay}` }]
    });
  }

  // Someone wrote and nobody has answered yet: one issue a person, newest words first.
  const wrote = new Map();
  for (const m of src.messages || []) { const uid = String(m.user_id); if (!wrote.has(uid)) wrote.set(uid, []); wrote.get(uid).push({ at: num(m.created_ms), body: m.body || '', via: 'message' }); }
  for (const f of src.feedback || []) { const uid = String(f.user_id); if (!wrote.has(uid)) wrote.set(uid, []); wrote.get(uid).push({ at: createdMs(f), body: f.body || '', via: 'feedback' }); }
  for (const [uid, list] of wrote) {
    list.sort((a, b) => b.at - a.at);
    const words = list[0].body.replace(/\s+/g, ' ').trim();
    add('Messages', uid, null, {
      firstMs: list[list.length - 1].at, lastMs: list[0].at,
      title: list.length === 1 ? 'Wrote to you' : `Wrote to you ${list.length} times`, meta: `${fmtDay(list[0].at, tz)} · “${words.length > 70 ? words.slice(0, 67) + '…' : words}”`,
      fix: 'reply in Support',
      fixLong: 'A reply shows in Dayhub as a message from you, and answering clears this.',
      template: 'Hi {first}, thanks for writing. ',
      timeline: list.slice(0, 4).reverse().map((m) => ({ at: m.at, text: `${fmtTime(m.at, tz)} · ${m.via === 'feedback' ? 'feedback from Settings' : 'message'}` }))
    });
  }

  for (const it of out) {
    const st = src.states && src.states.get(it.key);
    const handled = Boolean(st && num(st.handledAt) >= it.lastMs);
    it.sev = handled ? 'handled' : SEV_OF[it.kind];
    it.handledBy = handled ? st.by || null : null;
    it.isNew = it.firstMs > now - DAY;
    it.template = it.template ? it.template.replace('{first}', it.first) : '';
  }
  return out.sort((a, b) => sevRank(a.sev) - sevRank(b.sev) || b.lastMs - a.lastMs);
}
const sevRank = (s) => (s === 'needs' ? 0 : s === 'watching' ? 1 : 2);

/** Counts for the tabs and the nav badge. */
function issueCounts(issues) {
  const c = { open: 0, needs: 0, watching: 0, handled: 0, newToday: 0, oldestMs: null, byKind: {} };
  for (const it of issues) {
    c[it.sev]++;
    if (it.sev !== 'handled') {
      c.open++;
      if (it.isNew) c.newToday++;
      if (c.oldestMs === null || it.firstMs < c.oldestMs) c.oldestMs = it.firstMs;
      c.byKind[it.kind] = (c.byKind[it.kind] || 0) + 1;
    }
  }
  return c;
}

/** closed_json { c: ['YYYY-MM-DD', …] } → a regular gone quiet, or null. */
function quietOf(closed, lastSeenMs, now) {
  const days = Array.isArray(closed && closed.c) ? closed.c.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [];
  if (!days.length) return null;
  const lastDay = days[days.length - 1];
  const lastMs = Date.parse(lastDay + 'T12:00:00Z');
  const quietDays = Math.floor((now - lastMs) / DAY);
  if (quietDays < 5 || quietDays > 30) return null;
  if (lastSeenMs && lastSeenMs > now - 5 * DAY) return null; // still opening Dayhub: not gone, just not closing
  const from = utcDay(lastMs - 20 * DAY);
  const n = days.filter((d) => d >= from && d <= lastDay).length;
  return n >= 12 ? { closed: n, quietDays, lastDay, lastMs } : null;
}

// ── Errors, grouped into problems ──

const TREND_HOURS = 12;
/**
 * rows:    error and warning rows from the last 24 hours: { area, event, lvl, user_id, created_ms, message, detail }
 * history: { area, event, first } — first seen within the log's 30 days
 * states:  Map 'area.event' → { mutedUntil, fixedAt }
 */
function groupProblems(rows, history, states, now) {
  const firstSeen = new Map((history || []).map((h) => [`${h.area}.${h.event}`, num(h.first)]));
  const map = new Map();
  for (const r of rows) {
    const id = `${r.area}.${r.event}`;
    if (!map.has(id)) map.set(id, { id, area: r.area, event: r.event, level: r.lvl, message: r.message || '', people: new Set(), count: 0, trend: new Array(TREND_HOURS).fill(0), lastMs: 0, recent3h: 0, releases: new Set() });
    const p = map.get(id), at = num(r.created_ms);
    p.count++;
    if (r.user_id) p.people.add(String(r.user_id));
    if (r.lvl === 'error') p.level = 'error';
    if (at > p.lastMs) { p.lastMs = at; p.message = r.message || p.message; }
    const h = Math.floor((now - at) / HOUR);
    if (h >= 0 && h < TREND_HOURS) p.trend[TREND_HOURS - 1 - h]++;
    if (at > now - 3 * HOUR) p.recent3h++;
    const d = parse(r.detail, null);
    const rel = d && (d.build || d.release);
    if (rel) p.releases.add(String(rel).slice(0, 24));
  }
  const out = [];
  for (const p of map.values()) {
    const st = (states && states.get(p.id)) || {};
    const first = firstSeen.get(p.id) || p.lastMs;
    const earlier = (p.count - p.recent3h) / 7; // the previous 21 hours, per 3 hours
    let status;
    if (num(st.fixedAt) && p.lastMs <= num(st.fixedAt)) status = 'fixed';
    else if (num(st.fixedAt)) status = 'back';
    else if (num(st.mutedUntil) > now) status = 'muted';
    else if (first > now - DAY) status = 'new';
    else if (p.recent3h >= 5 && p.recent3h >= 2 * Math.max(earlier, 1)) status = 'spiking';
    else status = 'steady';
    out.push({
      id: p.id, area: p.area, event: p.event, level: p.level, message: p.message, people: p.people.size, count: p.count,
      trend: p.trend, firstMs: first, lastMs: p.lastMs, status, mutedUntil: num(st.mutedUntil) || null, fixedAt: num(st.fixedAt) || null,
      release: p.releases.size === 1 ? [...p.releases][0] : p.releases.size > 1 ? 'several' : null
    });
  }
  const rank = { back: 0, new: 1, spiking: 2, steady: 3, muted: 4, fixed: 5 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || b.people - a.people || b.count - a.count);
}

// ── One person's days ──

/**
 * The five things, done or not, for each of `days` (YYYY-MM-DD, newest first). rows: { weight: [{day}],
 * checkins: [{day, mood}], logs: [{day, meals_json}], activity: [{day, pushups, types_json, steps}],
 * entries: [{created_ms}] }. `entryDay` turns an entry's time into the person's day. No values leave here.
 */
function doneGrid(rows, days, settings, entryDay) {
  const rules = closingRules(settings);
  const at = new Map(days.map((d) => [d, { day: d, weight: false, checkin: false, journal: 0, meals: 0, move: false, closed: false }]));
  for (const r of rows.weight || []) if (at.has(r.day)) at.get(r.day).weight = true;
  for (const r of rows.checkins || []) if (at.has(r.day) && r.mood) at.get(r.day).checkin = true;
  for (const r of rows.logs || []) if (at.has(r.day)) { const m = parse(r.meals_json, {}); at.get(r.day).meals = MEALS.filter((k) => m[k]).length; }
  for (const r of rows.activity || []) if (at.has(r.day)) at.get(r.day).move = moved({ pushups: r.pushups, types: parse(r.types_json, {}), steps: r.steps }, rules.stepsGoal);
  for (const r of rows.entries || []) { const d = entryDay(num(r.created_ms)); if (at.has(d)) at.get(d).journal++; }
  const out = days.map((d) => at.get(d));
  for (const g of out) g.closed = (g.weight || !rules.requireWeight) && g.checkin && g.journal > 0 && g.meals === 4 && g.move;
  return { days: out, requireWeight: rules.requireWeight };
}

/** Closed days in a row, counting back from yesterday (today counts once it is closed). `days` newest first. */
function streakOf(days) {
  let n = 0;
  for (let i = 0; i < days.length; i++) {
    if (days[i].closed) n++;
    else if (i === 0) continue; // today, still open
    else break;
  }
  return n;
}

// ── People ──

/** Does a profile match what the admin typed: an exact id, or part of a name or an email, any case. */
function matches(p, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  if (/^\d{6,19}$/.test(s)) return String(p.user_id) === s;
  return String(p.display_name || '').toLowerCase().includes(s) || String(p.email || '').toLowerCase().includes(s);
}

// ── Support ──

/** Messages and old feedback → one thread a person, newest activity first. Unanswered: the person spoke last. */
function threads(messages, feedback) {
  const by = new Map();
  const push = (uid, m) => { if (!by.has(uid)) by.set(uid, []); by.get(uid).push(m); };
  for (const m of messages || []) push(String(m.user_id), { at: num(m.created_ms), sender: m.sender === 'admin' ? 'admin' : 'member', body: m.body || '', open: m.sender !== 'admin' && !num(m.read_ms) });
  for (const f of feedback || []) push(String(f.user_id), { at: createdMs(f), sender: 'member', body: f.body || '', open: !(f.acknowledged === true || f.acknowledged === 'true'), feedback: true });
  const out = [];
  for (const [userId, list] of by) {
    list.sort((a, b) => b.at - a.at);
    const words = list[0].body.replace(/\s+/g, ' ').trim();
    out.push({ userId, lastMs: list[0].at, lastSender: list[0].sender, preview: words.length > 90 ? words.slice(0, 87) + '…' : words, unanswered: list[0].sender === 'member' && list.some((m) => m.open), count: list.length });
  }
  return out.sort((a, b) => Number(b.unanswered) - Number(a.unanswered) || b.lastMs - a.lastMs);
}

module.exports = {
  HOUR, DAY, KINDS, ISSUE_EVENTS, firstName, shortName, deviceOf, zoneOr, fmtDay, fmtTime, dayIn, createdMs,
  detectIssues, issueCounts, quietOf, groupProblems, doneGrid, streakOf, matches, threads, keyOf
};
