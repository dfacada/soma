// The evening nudge. A cron runs this every 15 minutes (params.type = 'nudge'). For every device that has asked for
// it: once its owner's local clock passes their chosen time, and only if their day is not closed, push one
// notification naming what is left. A closed day gets nothing. One nudge a day per device, never a second.
//
// A day closes on the same five things as in the app (src/lib/today.ts dayStatus): weight when it is required,
// a check-in mood, a journal entry, all four meals, any activity. This is the server's copy of that rule; when the
// rule changes there, change it here. Journal entries are encrypted, but the fact that one exists is not.
//
// params.test = '1' with params.user_id sends that user a test notification now, whatever the time or the day.

'use strict';

const webpush = require('web-push');
const { writeLog } = require('./log');

const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'];
const WINDOW_MIN = 120; // how long after the chosen time a late cron run may still nudge
const SUBJECT = 'https://soma-onkasary.onslate.com/privacy/';
const parse = (text, fallback) => { try { return text ? JSON.parse(text) : fallback; } catch (_e) { return fallback; } };

/** The wall clock in a time zone: { day: 'YYYY-MM-DD', minutes since local midnight }. Null for a zone Node does not know. */
function localNow(now, tz) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
  } catch (_e) { return null; }
}

/** settings_json → what the nudge needs, with the app's defaults for anything missing. */
function nudgeSettings(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const n = s.nudge && typeof s.nudge === 'object' ? s.nudge : {};
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(n.time || '');
  return { on: n.on === true, minutes: m ? Number(m[1]) * 60 + Number(m[2]) : 20 * 60 + 30, requireWeight: s.requireWeight !== false };
}

/** Is it this device's moment? After the chosen time, inside the window, and not already nudged today. */
function due(local, minutes, lastDay) {
  return Boolean(local) && local.minutes >= minutes && local.minutes < minutes + WINDOW_MIN && lastDay !== local.day;
}

/** What is still open, in card order. An empty list is a closed day. */
function leftToday({ weight, mood, entries, meals, pushups, types }, requireWeight) {
  const left = [];
  if (requireWeight && !weight) left.push('Weight');
  if (!mood) left.push('Check-in');
  if (!entries) left.push('Journal');
  const eaten = MEALS.filter((k) => meals && meals[k]).length;
  if (eaten < 4) left.push(eaten === 0 ? 'Food' : `${4 - eaten} meal${eaten === 3 ? '' : 's'}`);
  if (!(pushups > 0) && !Object.values(types || {}).some(Boolean)) left.push('Activity');
  return left;
}

function message(left) {
  const n = ['One', 'Two', 'Three', 'Four', 'Five'][left.length - 1] || String(left.length);
  return { title: left.length === 1 ? 'One to go' : `${n} to go`, body: left.join(' · ') + (left.length === 1 ? ' closes the day.' : ''), url: '/' };
}

const select = async (app, table, sql) => (await app.zcql().executeZCQLQuery(sql)).map((r) => r[table]).filter(Boolean);

async function dayFacts(app, uid, local, now) {
  const where = `WHERE ukey = '${uid}:${local.day}'`;
  const startMs = now - (local.minutes * 60000 + (now % 60000));
  const [w, c, l, a, e] = await Promise.all([
    select(app, 'weight', `SELECT ROWID FROM weight ${where}`),
    select(app, 'checkins', `SELECT mood FROM checkins ${where}`),
    select(app, 'day_logs', `SELECT meals_json FROM day_logs ${where}`),
    select(app, 'activity', `SELECT pushups, types_json FROM activity ${where}`),
    select(app, 'entries', `SELECT ROWID FROM entries WHERE user_id = ${uid} AND created_ms >= ${startMs} LIMIT 1`)
  ]);
  return { weight: w.length > 0, mood: c[0] && c[0].mood, entries: e.length, meals: parse(l[0] && l[0].meals_json, {}), pushups: Number(a[0] && a[0].pushups) || 0, types: parse(a[0] && a[0].types_json, {}) };
}

async function run(app, params) {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) { console.error(JSON.stringify({ action: 'nudge', error: 'VAPID keys are not set' })); await writeLog(app, { source: 'job', area: 'push', event: 'not_configured', message: 'VAPID keys are not set' }); return; }
  webpush.setVapidDetails(SUBJECT, pub, priv);

  const test = params.test === '1' && /^\d{1,19}$/.test(String(params.user_id));
  const subs = [];
  for (let offset = 0; offset < 3000; offset += 300) {
    const page = await select(app, 'push_subs', `SELECT ROWID, user_id, endpoint, p256dh, auth_secret, tz, last_day, fails FROM push_subs ${test ? `WHERE user_id = ${params.user_id}` : ''} ORDER BY ROWID ASC LIMIT ${offset}, 300`);
    subs.push(...page);
    if (page.length < 300) break;
  }
  if (!subs.length) return;

  const now = Date.now();
  const table = app.datastore().table('push_subs');
  const users = new Map(); // user_id → { settings, facts by local day }
  const tally = { devices: subs.length, sent: 0, closed: 0, notDue: 0, gone: 0, failed: 0 };

  for (const sub of subs) {
    const uid = String(sub.user_id);
    if (!users.has(uid)) {
      const profile = (await select(app, 'profiles', `SELECT status, settings_json FROM profiles WHERE user_id = ${uid}`))[0];
      users.set(uid, { active: Boolean(profile) && profile.status === 'active', settings: nudgeSettings(parse(profile && profile.settings_json, {})), facts: new Map() });
    }
    const user = users.get(uid);
    const local = localNow(now, sub.tz || 'UTC') || localNow(now, 'UTC');
    let payload;
    if (test) payload = { title: 'Soma', body: 'Notifications work on this device.', url: '/settings/' };
    else {
      if (!user.active || !user.settings.on || !due(local, user.settings.minutes, sub.last_day)) { tally.notDue++; continue; }
      if (!user.facts.has(local.day)) user.facts.set(local.day, await dayFacts(app, uid, local, now));
      const left = leftToday(user.facts.get(local.day), user.settings.requireWeight);
      // Either way this device is settled for today: a closed day stays quiet, an open one is nudged exactly once.
      if (!left.length) { tally.closed++; await table.updateRow({ ROWID: sub.ROWID, last_day: local.day }); continue; }
      payload = message(left);
    }
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } }, JSON.stringify(payload), { TTL: 3 * 3600, urgency: 'normal' });
      tally.sent++;
      if (!test) await table.updateRow({ ROWID: sub.ROWID, last_day: local.day, fails: 0 });
    } catch (e) {
      // 404 and 410 mean the browser has dropped this subscription for good.
      if (e.statusCode === 404 || e.statusCode === 410) { tally.gone++; await table.deleteRow(sub.ROWID).catch(() => undefined); }
      else {
        tally.failed++;
        const fails = (Number(sub.fails) || 0) + 1;
        console.error(JSON.stringify({ action: 'nudge_send', status: e.statusCode || null, error: String(e.body || e.message).slice(0, 200) }));
        await writeLog(app, { source: 'job', area: 'push', event: 'send_failed', message: String(e.body || e.message).slice(0, 200), status: e.statusCode || undefined, detail: { fails, host: (() => { try { return new URL(sub.endpoint).hostname; } catch (_e) { return null; } })() }, userId: uid, test: uid === '999000000000000001' });
        if (fails >= 8) await table.deleteRow(sub.ROWID).catch(() => undefined); else await table.updateRow({ ROWID: sub.ROWID, fails }).catch(() => undefined);
      }
    }
  }
  if (test || tally.sent || tally.gone || tally.failed) console.log(JSON.stringify(Object.assign({ action: test ? 'nudge_test' : 'nudge' }, tally)));
}

module.exports = { run, localNow, nudgeSettings, due, leftToday, message };
