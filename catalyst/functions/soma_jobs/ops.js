// Soma Ops' counting, on the 15-minute nudge cron (index.js). Three parts, each cheap when there is nothing to do:
//
//   snapshot  hourly: today's people seen, members, sign-ups, errors and AI use, into ops_state 'day:<UTC day>'.
//             "Seen" is only knowable on the day (profiles keep the last time, not every time), so the overview's
//             people-a-day chart starts the day this first ran.
//   rollup    once a day after 12:00 UTC, when yesterday is over nearly everywhere: who closed yesterday by the
//             server's copy of the closing rule (closing.js), written onto each profile's closed_json (the last 60
//             closed days), then the sign-up cohorts and the funnel into ops_state 'cohorts'. It also catches up the
//             13 days before, three a run, so a fresh deploy has two weeks of closed days by the afternoon.
//   alerts    every run: Telegram to the admins when a new problem appears, one reaches 10 people in an hour, server
//             errors run at twice their normal rate, or new errors follow a release. Never a name: a count and the
//             problem's code. At most once a problem an hour.
//
// The pure parts (cohorts, funnel, closed days, alert rules) are exported for scripts/test-ops.mjs.

'use strict';

const { writeLog } = require('./log');
const { closingRules, leftToday } = require('./closing');

const HOUR = 3600000, DAY = 86400000;
const num = (v) => Number(v) || 0;
const parse = (text, fallback) => { try { return text ? JSON.parse(text) : fallback; } catch (_e) { return fallback; } };
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const select = async (app, table, sql) => (await app.zcql().executeZCQLQuery(sql)).map((r) => r[table]).filter(Boolean);
async function selectAll(app, table, sql, max = 6000) {
  const out = [];
  for (let offset = 0; offset < max; offset += 300) {
    const page = await select(app, table, `${sql} LIMIT ${offset}, 300`);
    out.push(...page);
    if (page.length < 300) break;
  }
  return out;
}
const countOf = async (app, table, where) => num(((await select(app, table, `SELECT COUNT(ROWID) FROM ${table} WHERE ${where}`))[0] || {})['COUNT(ROWID)']);

// ── State ──
async function getState(app, key) {
  const rows = await select(app, 'ops_state', `SELECT ROWID, value FROM ops_state WHERE skey = '${key}'`);
  return rows[0] ? { rowId: rows[0].ROWID, value: parse(rows[0].value, {}) } : { rowId: null, value: null };
}
async function putState(app, key, value, rowId) {
  const row = { skey: key, value: JSON.stringify(value).slice(0, 9500), updated_ms: Date.now() };
  const t = app.datastore().table('ops_state');
  if (rowId) return t.updateRow(Object.assign(row, { ROWID: rowId }));
  try { return await t.insertRow(row); }
  catch (e) {
    const again = await getState(app, key);
    if (!again.rowId) throw e;
    return t.updateRow(Object.assign(row, { ROWID: again.rowId }));
  }
}
/** Merge `patch` into the JSON at `key`. */
async function mergeState(app, key, patch) {
  const cur = await getState(app, key);
  return putState(app, key, Object.assign({}, cur.value || {}, patch), cur.rowId);
}

/** When a profile was made (lib/ops.js createdMs; the same reading). */
function createdMs(p) {
  const ms = num(p.created_ms);
  if (ms) return ms;
  const t = Date.parse(String(p.CREATEDTIME || '').replace(' ', 'T').replace(/:(\d{3})$/, '.$1') + 'Z');
  return Number.isFinite(t) ? t : 0;
}

// ── Snapshot ──
async function snapshot(app, now) {
  const day = utcDay(now), start = Date.parse(day + 'T00:00:00Z');
  const [seen, members, newest, errors, warns, ai] = await Promise.all([
    countOf(app, 'profiles', `status = 'active' AND last_seen_ms >= ${start}`),
    countOf(app, 'profiles', "status = 'active'"),
    select(app, 'profiles', 'SELECT created_ms, CREATEDTIME, invited_by FROM profiles ORDER BY CREATEDTIME DESC LIMIT 300'),
    countOf(app, 'logs', `lvl = 'error' AND is_test = false AND created_ms >= ${start}`),
    countOf(app, 'logs', `lvl = 'warn' AND is_test = false AND created_ms >= ${start}`),
    select(app, 'ai_usage', `SELECT kind, SUM(amount) FROM ai_usage WHERE day = '${day}' GROUP BY kind`)
  ]);
  const joined = newest.filter((p) => createdMs(p) >= start);
  const usage = {};
  for (const r of ai) usage[r.kind] = num(r['SUM(amount)']);
  await mergeState(app, 'day:' + day, { day, seen, members, signups: joined.length, invited: joined.filter((p) => p.invited_by).length, errors, warns, ai: usage, at: now });
}

// ── Rollup: who closed a day ──

/** The rows of one day, by person → facts for the closing rule. `entryDay(uid, ms)` is the person's day for an entry. */
function factsByPerson(rows, day, entryDay) {
  const by = new Map();
  const f = (uid) => { const k = String(uid); if (!by.has(k)) by.set(k, { weight: false, mood: null, entries: 0, meals: {}, pushups: 0, types: {}, steps: 0 }); return by.get(k); };
  for (const r of rows.weight) f(r.user_id).weight = true;
  for (const r of rows.checkins) f(r.user_id).mood = r.mood || null;
  for (const r of rows.logs) f(r.user_id).meals = parse(r.meals_json, {});
  for (const r of rows.activity) { const x = f(r.user_id); x.pushups = num(r.pushups); x.types = parse(r.types_json, {}); x.steps = num(r.steps); }
  for (const r of rows.entries) if (entryDay(String(r.user_id), num(r.created_ms)) === day) f(r.user_id).entries++;
  return by;
}

/** closed_json after judging `day`: the day added when closed, taken out when not, the newest 60 kept. */
function nextClosed(json, day, closed, firstClosed) {
  const cur = parse(json, {}) || {};
  const set = new Set(Array.isArray(cur.c) ? cur.c.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : []);
  if (closed) set.add(day); else set.delete(day);
  const c = [...set].sort().slice(-60);
  const f = closed ? (cur.f && cur.f < day ? cur.f : day) : (cur.f || firstClosed || null);
  return { c, f: c.length || f ? f : null };
}

const dayIn = (ms, tz) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms); } catch (_e) { return utcDay(ms); } };

async function rollupDay(app, day) {
  const start = Date.parse(day + 'T00:00:00Z');
  const where = `WHERE day = '${day}' ORDER BY ROWID`;
  const [weight, checkins, logs, activity, entries] = await Promise.all([
    selectAll(app, 'weight', `SELECT user_id FROM weight ${where}`),
    selectAll(app, 'checkins', `SELECT user_id, mood FROM checkins ${where}`),
    selectAll(app, 'day_logs', `SELECT user_id, meals_json FROM day_logs ${where}`),
    selectAll(app, 'activity', `SELECT user_id, pushups, types_json, steps FROM activity ${where}`),
    selectAll(app, 'entries', `SELECT user_id, created_ms FROM entries WHERE created_ms >= ${start - 14 * HOUR} AND created_ms < ${start + DAY + 12 * HOUR} ORDER BY ROWID`)
  ]);
  const uids = [...new Set([...weight, ...checkins, ...logs, ...activity].map((r) => String(r.user_id)))].filter((id) => /^\d{1,19}$/.test(id) && !/^99900000000000000\d$/.test(id));
  // Each person's own clock for their journal entries, when a phone of theirs told us; UTC otherwise.
  const tzOf = new Map(), profiles = new Map();
  for (let i = 0; i < uids.length; i += 200) {
    const chunk = uids.slice(i, i + 200).join(', ');
    const [subs, profs] = await Promise.all([
      select(app, 'push_subs', `SELECT user_id, tz FROM push_subs WHERE user_id IN (${chunk}) LIMIT 300`),
      select(app, 'profiles', `SELECT ROWID, user_id, status, settings_json, closed_json FROM profiles WHERE user_id IN (${chunk}) LIMIT 300`)
    ]);
    subs.forEach((s) => { if (s.tz && !tzOf.has(String(s.user_id))) tzOf.set(String(s.user_id), s.tz); });
    profs.forEach((p) => profiles.set(String(p.user_id), p));
  }
  const facts = factsByPerson({ weight, checkins, logs, activity, entries }, day, (uid, ms) => dayIn(ms, tzOf.get(uid) || 'UTC'));
  let closed = 0, logged = 0;
  const updates = [];
  for (const uid of uids) {
    const p = profiles.get(uid);
    if (!p || p.status !== 'active') continue;
    logged++;
    const rules = closingRules(parse(p.settings_json, {}));
    const isClosed = leftToday(facts.get(uid) || {}, rules.requireWeight, rules.stepsGoal).length === 0;
    if (isClosed) closed++;
    const next = JSON.stringify(nextClosed(p.closed_json, day, isClosed));
    if (next !== (p.closed_json || JSON.stringify({ c: [], f: null }))) updates.push({ ROWID: p.ROWID, closed_json: next });
  }
  for (let i = 0; i < updates.length; i += 100) await app.datastore().table('profiles').updateRows(updates.slice(i, i + 100));
  await mergeState(app, 'day:' + day, { day, closed, logged, rolledAt: Date.now() });
  return { day, closed, logged, updated: updates.length };
}

// ── Cohorts and the funnel ──

const mondayOf = (ms) => { const d = new Date(ms); const back = (d.getUTCDay() + 6) % 7; return utcDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)); };

/**
 * people: [{ joinedMs, closed: ['YYYY-MM-DD'…], vault: bool }] who signed up in the last six weeks. A person's week k is
 * the 7 days from their sign-up day + 7(k-1); a cell is a share of the cohort with 4 or more closed days that week, shown
 * once the week is over for everyone in it. `today` is the UTC day the counting stops before.
 */
function cohortTable(people, today, weeks = 6) {
  const todayMs = Date.parse(today + 'T00:00:00Z');
  const groups = new Map();
  for (const p of people) {
    if (!p.joinedMs) continue;
    const w = mondayOf(p.joinedMs);
    if (!groups.has(w)) groups.set(w, []);
    groups.get(w).push(p);
  }
  const rows = [...groups.keys()].sort().slice(-weeks).map((w) => {
    const list = groups.get(w);
    const cells = Array.from({ length: weeks }, (_, k) => {
      const ends = list.map((p) => Date.parse(utcDay(p.joinedMs) + 'T00:00:00Z') + (k + 1) * 7 * DAY);
      if (Math.max(...ends) > todayMs) return null; // not over for everyone yet
      const kept = list.filter((p) => closedInWeek(p, k) >= 4).length;
      return Math.round((kept / list.length) * 100);
    });
    return { week: w, n: list.length, cells };
  });
  return rows;
}

function closedInWeek(p, k) {
  const startMs = Date.parse(utcDay(p.joinedMs) + 'T00:00:00Z') + k * 7 * DAY;
  const from = utcDay(startMs), to = utcDay(startMs + 6 * DAY);
  return (p.closed || []).filter((d) => d >= from && d <= to).length;
}

/** The funnel for the newest cohort whose third week is over: signed up → made a vault → closed a first day → closed 4+
 *  days in week 1 → still closing (4+) in week 3. */
function funnel(people, today) {
  const todayMs = Date.parse(today + 'T00:00:00Z');
  const done = people.filter((p) => p.joinedMs && Date.parse(utcDay(p.joinedMs) + 'T00:00:00Z') + 21 * DAY <= todayMs);
  if (!done.length) return null;
  const week = [...new Set(done.map((p) => mondayOf(p.joinedMs)))].sort().pop();
  const list = done.filter((p) => mondayOf(p.joinedMs) === week);
  return {
    week, steps: [
      ['Signed up', list.length],
      ['Made a vault', list.filter((p) => p.vault).length],
      ['Closed a first day', list.filter((p) => (p.closed || []).some((d) => d >= utcDay(p.joinedMs))).length],
      ['Closed 4+ days in week 1', list.filter((p) => closedInWeek(p, 0) >= 4).length],
      ['Still closing in week 3', list.filter((p) => closedInWeek(p, 2) >= 4).length]
    ]
  };
}

async function cohorts(app, now) {
  const since = now - 7 * 7 * DAY;
  const rows = (await selectAll(app, 'profiles', 'SELECT user_id, created_ms, CREATEDTIME, status, closed_json FROM profiles ORDER BY CREATEDTIME DESC', 3000))
    .filter((p) => createdMs(p) >= since && p.status !== 'deleting' && !/^99900000000000000\d$/.test(String(p.user_id)));
  const vault = new Set();
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((p) => String(p.user_id)).join(', ');
    (await select(app, 'vault_meta', `SELECT user_id FROM vault_meta WHERE user_id IN (${chunk}) LIMIT 300`)).forEach((v) => vault.add(String(v.user_id)));
  }
  const people = rows.map((p) => ({ joinedMs: createdMs(p), closed: (parse(p.closed_json, {}) || {}).c || [], vault: vault.has(String(p.user_id)) }));
  const today = utcDay(now);
  await mergeState(app, 'cohorts', { table: cohortTable(people, today), funnel: funnel(people, today), people: people.length, at: now });
}

async function rollup(app, now) {
  const h = new Date(now).getUTCHours();
  if (h < 12) return; // yesterday is not over everywhere yet
  const days = Array.from({ length: 14 }, (_, i) => utcDay(now - (i + 1) * DAY));
  const states = await select(app, 'ops_state', `SELECT skey, value FROM ops_state WHERE skey IN (${days.map((d) => `'day:${d}'`).join(', ')}) LIMIT 300`);
  const rolled = new Set(states.filter((s) => typeof (parse(s.value, {}) || {}).closed === 'number').map((s) => s.skey.slice(4)));
  const todo = days.filter((d) => !rolled.has(d)).slice(0, 3);
  if (!todo.length) return;
  // Oldest first, so closed_json grows in order and a person's first closed day is right.
  for (const d of todo.reverse()) {
    const r = await rollupDay(app, d);
    console.log(JSON.stringify(Object.assign({ action: 'ops_rollup' }, r)));
  }
  await cohorts(app, now);
}

// ── Alerts ──

/** Which alerts to send, from what the log says. Pure. problems: [{ id, first, people1h, count15 }]; api: { last15,
 *  per15 }; release: { at } | null; sent: Map id → last sent ms. */
function alertsDue({ toggles, problems, api, release, sent, now }) {
  const out = [];
  const fresh = (p) => p.first > now - 20 * 60000;
  const quiet = (id) => !sent.has(id) || sent.get(id) < now - HOUR;
  for (const p of problems) {
    if (toggles.fresh && fresh(p) && quiet('fresh:' + p.id)) out.push({ id: 'fresh:' + p.id, text: `Soma: a new problem, ${p.id}, ${p.count15} time${p.count15 === 1 ? '' : 's'} in the last 15 minutes.` });
    else if (toggles.deploy && release && fresh(p) && p.first - release.at < HOUR && p.first >= release.at && quiet('deploy:' + p.id)) out.push({ id: 'deploy:' + p.id, text: `Soma: ${p.id} started within an hour of the release.` });
    if (toggles.wide && p.people1h >= 10 && quiet('wide:' + p.id)) out.push({ id: 'wide:' + p.id, text: `Soma: ${p.id} reached ${p.people1h} people in the last hour.` });
  }
  if (toggles.api && api.last15 >= 10 && api.last15 >= 2 * Math.max(api.per15, 1) && quiet('api')) out.push({ id: 'api', text: `Soma: ${api.last15} server errors in 15 minutes, about ${Math.max(1, Math.round(api.last15 / Math.max(api.per15, 1)))} times the usual.` });
  return out;
}

async function telegram(app, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return 0;
  const rows = await select(app, 'profiles', "SELECT telegram_chat FROM profiles WHERE role = 'admin' AND status = 'active' LIMIT 20");
  const chats = rows.map((r) => r.telegram_chat).filter(Boolean).map(String);
  let sent = 0;
  for (const chat of chats) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }), signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('Telegram answered ' + res.status);
    sent++;
  }
  return sent;
}

async function alerts(app, now) {
  const lv = "lvl = 'error' AND is_test = false";
  // Three reads on a quiet run: the state rows, the last hour's errors, and the server's last 15 minutes.
  const [states, hour, last15] = await Promise.all([
    select(app, 'ops_state', "SELECT ROWID, skey, value FROM ops_state WHERE skey IN ('release', 'alerts', 'alerted') LIMIT 10"),
    selectAll(app, 'logs', `SELECT area, event, user_id, created_ms FROM logs WHERE ${lv} AND created_ms > ${now - HOUR} ORDER BY created_ms DESC`, 3000),
    countOf(app, 'logs', `${lv} AND source = 'api' AND created_ms > ${now - 15 * 60000}`)
  ]);
  const st = (k) => { const r = states.find((x) => x.skey === k); return r ? { rowId: r.ROWID, value: parse(r.value, {}) } : { rowId: null, value: null }; };

  // A release is noticed when this function's own SOMA_RELEASE changes (deploy.js deploys both functions alike).
  const rel = process.env.SOMA_RELEASE || null, relState = st('release');
  let release = relState.value && relState.value.at ? relState.value : null;
  if (rel && (!release || release.id !== rel)) { release = { id: rel, at: now }; await putState(app, 'release', release, relState.rowId); }

  const toggles = Object.assign({ fresh: true, wide: true, api: true, deploy: false }, st('alerts').value || {});
  if (!toggles.fresh && !toggles.wide && !toggles.api && !toggles.deploy) return;
  if (!hour.length && last15 < 10) return;

  const [history, day] = await Promise.all([
    hour.length ? select(app, 'logs', `SELECT area, event, MIN(created_ms) FROM logs WHERE ${lv} GROUP BY area, event LIMIT 300`) : Promise.resolve([]),
    last15 >= 10 ? countOf(app, 'logs', `${lv} AND source = 'api' AND created_ms > ${now - DAY} AND created_ms <= ${now - 15 * 60000}`) : Promise.resolve(0)
  ]);
  const first = new Map(history.map((h) => [`${h.area}.${h.event}`, num(h['MIN(created_ms)'])]));
  const per = new Map();
  for (const r of hour) {
    const id = `${r.area}.${r.event}`;
    if (!per.has(id)) per.set(id, { id, first: first.get(id) || num(r.created_ms), people: new Set(), count15: 0 });
    const p = per.get(id);
    if (r.user_id) p.people.add(String(r.user_id));
    if (num(r.created_ms) > now - 15 * 60000) p.count15++;
  }
  const problems = [...per.values()].map((p) => ({ id: p.id, first: p.first, people1h: p.people.size, count15: p.count15 }));
  const sentState = st('alerted');
  const sent = new Map(Object.entries((sentState.value && sentState.value.sent) || {}).map(([k, v]) => [k, num(v)]));
  const due = alertsDue({ toggles, problems, api: { last15, per15: day / 95 }, release, sent, now });
  if (!due.length) return;
  for (const a of due.slice(0, 5)) {
    try { await telegram(app, a.text); sent.set(a.id, now); }
    catch (e) { await writeLog(app, { level: 'warn', source: 'job', area: 'ops', event: 'alert_failed', message: e.message }); break; }
  }
  // Keep a day of marks: older ones can never matter again.
  const keep = Object.fromEntries([...sent].filter(([, at]) => at > now - DAY));
  await putState(app, 'alerted', { sent: keep }, sentState.rowId);
}

/** Everything for one cron run. Each part fails alone and is logged. */
async function run(app, now = Date.now()) {
  const top = new Date(now).getUTCMinutes() < 15;
  if (top) await snapshot(app, now).catch((e) => writeLog(app, { level: 'warn', source: 'job', area: 'ops', event: 'snapshot_failed', message: e.message }));
  if (top) await rollup(app, now).catch((e) => writeLog(app, { level: 'warn', source: 'job', area: 'ops', event: 'rollup_failed', message: e.message }));
  await alerts(app, now).catch((e) => writeLog(app, { level: 'warn', source: 'job', area: 'ops', event: 'alerts_failed', message: e.message }));
}

module.exports = { run, snapshot, rollupDay, rollup, cohorts, factsByPerson, nextClosed, cohortTable, closedInWeek, funnel, alertsDue, mondayOf };
