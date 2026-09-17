// The caller's own settings, and the one-call read that screens load from.

'use strict';

const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError, select, selectAll, needId, needDay, packJson, unpackJson, fitText, bool } = require('../lib/db');

const router = express.Router();

// ── Settings: one JSON blob on the profile row (docs/HANDOFF.md §6). The client owns the shape and
// merges it over its defaults, so adding a setting never needs a schema change. ──
router.get('/settings', member, wrap(async (req, res) => {
  const rows = await select(req.admin, 'profiles', `SELECT ROWID, display_name, settings_json, MODIFIEDTIME FROM profiles WHERE user_id = ${needId(req.user.id)}`);
  res.json({ displayName: rows[0].display_name || '', settings: unpackJson(rows[0].settings_json, {}), updatedAt: rows[0].MODIFIEDTIME });
}));

router.put('/settings', member, wrap(async (req, res) => {
  const b = req.body || {};
  const values = { ROWID: req.profile.rowId };
  if (b.settings !== undefined) {
    if (Array.isArray(b.settings)) throw new HttpError(400, 'settings must be an object');
    values.settings_json = packJson('settings', b.settings);
  }
  if (b.displayName !== undefined) {
    const name = fitText('displayName', b.displayName, 100);
    if (!name || !name.trim()) throw new HttpError(400, 'displayName cannot be empty');
    values.display_name = name.trim();
  }
  if (Object.keys(values).length === 1) throw new HttpError(400, 'nothing to save; expected settings or displayName');
  await req.admin.datastore().table('profiles').updateRow(values);
  res.json({ ok: true });
}));

// ── GET /days?from&to: everything logged in a date window, in one round trip. ──
// Today needs the last week for its strip and streak; Insights will ask for more. Entries are matched
// by createdMs, so the client passes the window's epoch bounds for its own timezone.
const num = (v) => (v === null || v === '' || v === undefined ? null : Number(v));
const SETS = [
  ['checkins', 'checkins', 'day, mood, habits_json, counts_json', (r) => ({ day: r.day, mood: r.mood || null, habits: unpackJson(r.habits_json, {}), counts: unpackJson(r.counts_json, {}) })],
  ['dayLogs', 'day_logs', 'day, meals_json, extras_json', (r) => ({ day: r.day, meals: unpackJson(r.meals_json, {}), extras: unpackJson(r.extras_json, []) })],
  ['activity', 'activity', 'day, pushups, types_json, steps', (r) => ({ day: r.day, pushups: num(r.pushups), types: unpackJson(r.types_json, {}), steps: num(r.steps) })],
  ['weight', 'weight', 'day, value', (r) => ({ day: r.day, value: Number(r.value) })]
];

router.get('/days', member, wrap(async (req, res) => {
  const from = needDay(req.query.from);
  const to = needDay(req.query.to);
  if (from > to) throw new HttpError(400, 'from is after to');
  const uid = needId(req.user.id);
  // Insights asks for a year. ZCQL gives 300 rows a query, so every set is paged; the window is capped instead.
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 400) throw new HttpError(400, 'at most 400 days a request');
  const where = `WHERE user_id = ${uid} AND day >= '${from}' AND day <= '${to}' ORDER BY day ASC`;

  const jobs = SETS.map(([, table, cols]) => selectAll(req.admin, table, `SELECT ${cols} FROM ${table} ${where}`, 600));
  if (req.query.fromMs !== undefined || req.query.toMs !== undefined) {
    const fromMs = needId(req.query.fromMs, 'fromMs');
    const toMs = needId(req.query.toMs, 'toMs');
    jobs.push(selectAll(req.admin, 'entries',
      `SELECT entry_id, created_ms, has_audio, has_photo, transcript_status FROM entries WHERE user_id = ${uid} AND created_ms >= ${fromMs} AND created_ms <= ${toMs} ORDER BY created_ms DESC`, 1500));
  }
  const results = await Promise.all(jobs);

  const out = { from, to };
  SETS.forEach(([key, , , shape], i) => { out[key] = results[i].map(shape); });
  out.entries = (results[SETS.length] || []).map((r) => ({
    id: r.entry_id, createdMs: Number(r.created_ms), hasAudio: bool(r.has_audio), hasPhoto: bool(r.has_photo), transcriptStatus: r.transcript_status || 'none'
  }));
  res.json(out);
}));

module.exports = router;
