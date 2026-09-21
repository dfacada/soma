// One row per user per day: /checkins, /day-logs, /weight, /activity.
//   GET    /<res>?from=YYYY-MM-DD&to=YYYY-MM-DD   up to 300 days, oldest first
//   GET    /<res>/:day                             404 when nothing is logged
//   PUT    /<res>/:day                             partial upsert; only fields sent are written
//   DELETE /<res>/:day

'use strict';

const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError, dayStore, packJson, unpackJson, fitText } = require('../lib/db');

// Push-ups count for a round only when logged within two days of the day they were done; a later backfill still
// updates `pushups` (the person's own record and streak) but never `round_pushups`, which is all the board reads.
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
    types: Object.assign({ col: 'types_json' }, json('types', {})),
    // Written by the Google Health sync (routes/health.js); a member may also set it by hand.
    steps: Object.assign({ col: 'steps' }, number('steps', 0, 1000000, true)),
    // Set here, never by the client: see countsForRound.
    roundPushups: Object.assign({ col: 'round_pushups' }, number('roundPushups', 0, 100000, true))
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
    const body = Object.assign({}, req.body || {});
    if (name === 'activity') {
      delete body.roundPushups;
      if (body.pushups !== undefined && countsForRound(req.params.day, Date.now())) body.roundPushups = body.pushups;
    }
    res.json(await store.put(req.admin, req.user.id, req.params.day, body));
  }));
  router.delete('/' + name + '/:day', member, wrap(async (req, res) => {
    res.json({ deleted: await store.remove(req.admin, req.user.id, req.params.day) });
  }));
}

module.exports = router;
module.exports.countsForRound = countsForRound;
