// Morgen, for tomorrow's brief (David, 2026-11-02). Morgen keeps no calendar of its own: an event made in Morgen is
// stored in one of the calendars connected to it (Google, Microsoft, iCloud, Fastmail, CalDAV, feeds), and its API
// returns the events of all of them. So one read covers his Google calendars and what he made in Morgen.
//
// The phone cannot ask Morgen itself: Morgen's API only answers browsers on its own sites (its CORS list), so this
// function is the go-between, exactly like Google Health. The key arrives sealed nowhere: the phone opens it with the
// vault key and sends it with this one request. It is used for the calls below and dropped. Nothing is stored and
// nothing about an event or the key is logged; only counts and Morgen's answers are.
//
//   POST /morgen/events { key, from, to, skip? } → { events: [event], calendars: [calendar] }
//     from, to   ISO instants (the day's local midnights, from the phone); at most three days apart
//     skip       calendar ids left out of the brief (Settings → Tomorrow)
//
// An event comes back trimmed to what the brief shows: when, how long, the title, the calendar, the first place,
// whether it is busy, declined, a video call, or a task Morgen put on the calendar. Never a description, an attendee
// or a link.

'use strict';

const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError } = require('../lib/db');
const { writeLog } = require('../lib/log');

const router = express.Router();
const BASE = 'https://api.morgen.so/v3';
// Each /list call costs 10 of the 300 points Morgen allows a person every 15 minutes: one for the calendars, one per
// account. Eight accounts is more than anyone connects.
const MAX_ACCOUNTS = 8;
const MAX_SPAN_MS = 3 * 86400000;

const note = (req, event, message, detail, level) => writeLog(req.admin, {
  level: level || 'warn', source: 'api', area: 'morgen', event, message, detail,
  userId: req.user.id, test: req.user.id === '999000000000000001'
});

const needKey = (v) => { if (typeof v !== 'string' || !/^[\x21-\x7e]{16,4096}$/.test(v)) throw new HttpError(400, 'bad key'); return v; };
function needInstant(v, what) {
  const t = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/.test(v) ? Date.parse(v) : NaN;
  if (!Number.isFinite(t)) throw new HttpError(400, what + ' must be an ISO time in UTC');
  return t;
}

/** One call to Morgen. Its refusals become sentences a person can act on; the key is never part of one. */
async function morgen(req, key, path) {
  let res;
  try {
    res = await fetch(BASE + path, { headers: { authorization: 'ApiKey ' + key, accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  } catch (_e) { throw new HttpError(502, 'Morgen did not answer'); }
  const json = await res.json().catch(() => null);
  if (res.ok) return json;
  const why = String((json && (json.message || json.error)) || 'HTTP ' + res.status).slice(0, 160);
  if (res.status === 401) { await note(req, 'key_refused', 'Morgen did not accept the key', { status: 401 }); throw new HttpError(409, 'Morgen did not accept that key. Copy it again from platform.morgen.so, under Developers API.'); }
  if (res.status === 403) { await note(req, 'no_api_access', why, { status: 403 }); throw new HttpError(409, 'Your Morgen plan does not include API access (Morgen says: ' + why + ').'); }
  if (res.status === 429) {
    const wait = Math.max(1, Math.ceil((Number(res.headers.get('retry-after')) || 60) / 60));
    await note(req, 'rate_limited', 'Morgen is limiting requests', { retryMinutes: wait });
    throw new HttpError(429, `Morgen is limiting requests. Try again in ${wait} minute${wait === 1 ? '' : 's'}.`);
  }
  console.error(JSON.stringify({ action: 'morgen', path: path.split('?')[0], status: res.status, error: why }));
  throw new HttpError(502, 'Morgen did not answer: ' + why);
}

/** Morgen's lists come wrapped ({ data: { events } }); accept the bare form too, since the API is early access. */
const listOf = (json, name) => {
  const d = json && json.data !== undefined ? json.data : json;
  if (Array.isArray(d)) return d;
  return d && Array.isArray(d[name]) ? d[name] : [];
};
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

function calendarOf(c) {
  const meta = c['morgen.so:metadata'] || {};
  return {
    id: String(c.id), accountId: String(c.accountId), integration: text(c.integrationId, 20) || '',
    name: text(meta.overrideName, 80) || text(c.name, 80) || 'Calendar', color: text(meta.overrideColor, 20) || text(c.color, 20) || undefined,
    readable: !c.myRights || c.myRights.mayReadItems !== false
  };
}

/** Did the person this account belongs to say no to it? */
function declinedByMe(ev) {
  return Object.values(ev.participants || {}).some((p) => p && (p.accountOwner === true || (p.roles && p.roles.accountOwner === true)) && p.participationStatus === 'declined');
}

function eventOf(ev, calendars) {
  const cal = calendars.get(String(ev.calendarId)) || {};
  const place = Object.values(ev.locations || {}).map((l) => l && text(l.name, 120)).find(Boolean);
  const derived = ev['morgen.so:derived'] || {};
  const meta = ev['morgen.so:metadata'] || {};
  return {
    id: text(String(ev.id), 300), uid: text(ev.uid, 300), calendarId: String(ev.calendarId),
    title: text(ev.title, 200) || '', start: text(ev.start, 40), timeZone: text(ev.timeZone, 64) || null, duration: text(ev.duration, 40),
    allDay: ev.showWithoutTime === true, busy: ev.freeBusyStatus !== 'free', declined: declinedByMe(ev),
    location: place, video: Boolean(derived.virtualRoom || ev['google.com:hangoutLink']), taskId: meta.taskId ? String(meta.taskId).slice(0, 100) : undefined,
    calendar: cal.name, color: cal.color
  };
}

router.post('/morgen/events', member, wrap(async (req, res) => {
  const b = req.body || {};
  const key = needKey(b.key);
  const from = needInstant(b.from, 'from'), to = needInstant(b.to, 'to');
  if (to <= from || to - from > MAX_SPAN_MS) throw new HttpError(400, 'from and to must be in order and at most three days apart');
  const skip = new Set((Array.isArray(b.skip) ? b.skip : []).slice(0, 200).map(String));

  const calendars = listOf(await morgen(req, key, '/calendars/list'), 'calendars').map(calendarOf);
  const byId = new Map(calendars.map((c) => [c.id, c]));
  const accounts = new Map();
  for (const c of calendars) {
    if (!c.readable || skip.has(c.id)) continue;
    if (!accounts.has(c.accountId)) accounts.set(c.accountId, []);
    accounts.get(c.accountId).push(c.id);
  }
  const start = new Date(from).toISOString().replace(/\.\d{3}Z$/, 'Z'), end = new Date(to).toISOString().replace(/\.\d{3}Z$/, 'Z');
  // The accounts are asked side by side: a slow one must not push the whole read past the 30-second limit.
  const lists = await Promise.all([...accounts.entries()].slice(0, MAX_ACCOUNTS).map(([accountId, ids]) =>
    morgen(req, key, '/events/list?' + new URLSearchParams({ accountId, calendarIds: ids.join(','), start, end }).toString())));
  const events = lists.flatMap((json) => listOf(json, 'events')).filter((ev) => ev && ev.start).map((ev) => eventOf(ev, byId));

  console.log(JSON.stringify({ action: 'morgen_events', user: req.user.id, calendars: calendars.length, accounts: accounts.size, events: events.length }));
  res.json({ events, calendars: calendars.map(({ readable: _r, ...c }) => c) });
}));

module.exports = router;
module.exports.parse = { calendarOf, eventOf, declinedByMe, listOf };
