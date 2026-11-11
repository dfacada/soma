// One row per user per day: /checkins, /day-logs, /weight, /activity.
//   GET    /<res>?from=YYYY-MM-DD&to=YYYY-MM-DD   up to 300 days, oldest first
//   GET    /<res>/:day                             404 when nothing is logged
//   PUT    /<res>/:day                             partial upsert; only fields sent are written
//   DELETE /<res>/:day

'use strict';

const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError, dayStore, packJson, unpackJson, fitText } = require('../lib/db');
const { cleanTypes } = require('../lib/moves');

// Moves count for a round only when logged within two days of the day they were done; a later backfill still
// updates `pushups` and `types` (the person's own record and streak) but never `round_pushups` or `round_json`, which
// are all a board reads. round_json is the day's moves (and typed steps) as they stood at the last on-time save.
// The server does not know the member's time zone, so "two days" is measured generously from the day's UTC start:
// three days plus 14 hours covers the end of the day after next in every zone (UTC-12 to UTC+14).
const ROUND_GRACE_MS = (3 * 24 + 14) * 3600 * 1000;
const EARLY_MS = 14 * 3600 * 1000;
function countsForRound(day, now) {
  const start = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(start) && now >= start - EARLY_MS && now <= start + ROUND_GRACE_MS;
}

const json = (name, fallback) => ({ in: (v) => packJson(name, v), out: (t) => unpackJson(t, fallback) });
function number(name, min, max, integer) {
  return {
    in(v) {
      if (v === null) return null;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
        throw new HttpError(400, `${name} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`);
      }
      return v;
    },
    out: (v) => (v === null || v === undefined || v === '' ? null : Number(v))
  };
}

const RESOURCES = {
  checkins: dayStore('checkins', {
    mood: { col: 'mood', in: (v) => fitText('mood', v, 20), out: (v) => v || null },
    habits: Object.assign({ col: 'habits_json' }, json('habits', {})),
    counts: Object.assign({ col: 'counts_json' }, json('counts', {}))
  }),
  'day-logs': dayStore('day_logs', {
    meals: Object.assign({ col: 'meals_json' }, json('meals', {})),
    extras: Object.assign({ col: 'extras_json' }, json('extras', []))
  }),
  weight: dayStore('weight', {
    value: Object.assign({ col: 'value' }, number('value', 1, 2000, false))
  }),
  activity: dayStore('activity', {
    pushups: Object.assign({ col: 'pushups' }, number('pushups', 0, 100000, true)),
    // Every move but push-ups and steps: true for a session, { n, u } for an amount (lib/moves.js says what is kept).
    types: { col: 'types_json', in: (v) => packJson('types', cleanTypes(v)), out: (t) => unpackJson(t, {}) },
    // Written by the Google Health sync (routes/health.js); a member may also set it by hand.
    steps: Object.assign({ col: 'steps' }, number('steps', 0, 1000000, true)),
    // Set here, never by the client: see countsForRound.
    roundPushups: Object.assign({ col: 'round_pushups' }, number('roundPushups', 0, 100000, true)),
    roundJson: Object.assign({ col: 'round_json' }, json('roundJson', null))
  })
};

const router = express.Router();

for (const [name, store] of Object.entries(RESOURCES)) {
  router.get('/' + name, member, wrap(async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) throw new HttpError(400, 'from and to are required');
    if (from > to) throw new HttpError(400, 'from is after to');
    res.json({ days: await store.range(req.admin, req.user.id, from, to) });
  }));
  router.get('/' + name + '/:day', member, wrap(async (req, res) => {
    const row = await store.get(req.admin, req.user.id, req.params.day);
    if (!row) throw new HttpError(404, 'nothing logged for that day');
    res.json(row);
  }));
  router.put('/' + name + '/:day', member, wrap(async (req, res) => {
    // The body's own keys, copied as plain data. Object.assign would run the "__proto__" setter for a body that
    // carries that key, and the two fields deleted below would come straight back through the copy's prototype
    // (found 2026-11-10: it let a member write their own frozen round count for any day).
    const sent = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const body = Object.fromEntries(Object.entries(sent).filter(([k]) => k !== '__proto__'));
    if (name === 'activity') {
      delete body.roundPushups;
      delete body.roundJson;
      if (body.steps !== undefined && body.steps !== null && !(Number.isInteger(body.steps) && body.steps >= 0 && body.steps <= 1000000)) throw new HttpError(400, 'steps must be an integer between 0 and 1000000');
      if (countsForRound(req.params.day, Date.now())) {
        if (body.pushups !== undefined) body.roundPushups = body.pushups;
        if (body.types !== undefined || body.steps !== undefined) {
          // Merged over what was frozen before: a save of moves alone keeps the typed steps, and the other way round.
          const cur = await store.get(req.admin, req.user.id, req.params.day);
          const snap = Object.assign({}, cur && cur.roundJson && typeof cur.roundJson === 'object' ? cur.roundJson : {});
          if (body.types !== undefined) snap.types = cleanTypes(body.types);
          if (body.steps !== undefined) snap.steps = body.steps;
          body.roundJson = snap;
        }
      }
    }
    res.json(await store.put(req.admin, req.user.id, req.params.day, body));
  }));
  router.delete('/' + name + '/:day', member, wrap(async (req, res) => {
    res.json({ deleted: await store.remove(req.admin, req.user.id, req.params.day) });
  }));
}

module.exports = router;
module.exports.countsForRound = countsForRound;
