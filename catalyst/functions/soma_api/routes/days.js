// One row per user per day: /checkins, /day-logs, /weight, /activity.
//   GET    /<res>?from=YYYY-MM-DD&to=YYYY-MM-DD   up to 300 days, oldest first
//   GET    /<res>/:day                             404 when nothing is logged
//   PUT    /<res>/:day                             partial upsert; only fields sent are written
//   DELETE /<res>/:day

'use strict';

const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError, dayStore, packJson, unpackJson, fitText } = require('../lib/db');

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
    types: Object.assign({ col: 'types_json' }, json('types', {}))
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
    res.json(await store.put(req.admin, req.user.id, req.params.day, req.body || {}));
  }));
  router.delete('/' + name + '/:day', member, wrap(async (req, res) => {
    res.json({ deleted: await store.remove(req.admin, req.user.id, req.params.day) });
  }));
}

module.exports = router;
