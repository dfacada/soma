// Moves on the server: what a day's moves may hold, and what a round counts. The app's own copy, with the words and
// the choosing, is src/lib/moves.ts; ROUND_KINDS and roundAmount must say the same in both (scripts/test-moves.mjs
// runs this file's roundAmount against the app's on the same days).
//
// A day's moves (the activity row): pushups and steps in their own columns; every other move in types_json, as
// `true` (a session) or { n, u } (an amount in km, min or reps, with a `label` for "Other"). Nothing else is kept.

'use strict';

const { HttpError, fitText } = require('./db');

const UNITS = { km: 500, min: 1440, reps: 100000 }; // the most one day can hold, per unit
const KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const KEYS_MAX = 24;

/** types_json as sent → types_json as kept. Cleared moves (false, 0) are left out; anything else odd is a 400. */
function cleanTypes(v) {
  if (v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'types must be an object');
  const keys = Object.keys(v);
  if (keys.length > KEYS_MAX) throw new HttpError(400, `at most ${KEYS_MAX} moves a day`);
  const out = {};
  for (const k of keys) {
    if (!KEY.test(k)) throw new HttpError(400, 'a move is named by a short word');
    const x = v[k];
    if (x === true) { out[k] = true; continue; }
    if (x === false || x === null) continue;
    if (typeof x !== 'object' || Array.isArray(x)) throw new HttpError(400, `${k} must be true or an amount`);
    if (!Object.prototype.hasOwnProperty.call(UNITS, x.u)) throw new HttpError(400, `${k}: the unit must be km, min or reps`);
    const n = x.n;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > UNITS[x.u]) throw new HttpError(400, `${k}: the amount must be from 0 to ${UNITS[x.u]} ${x.u}`);
    if (n === 0) continue;
    const kept = { n: x.u === 'km' ? Math.round(n * 100) / 100 : Math.round(n), u: x.u };
    if (x.label !== undefined && x.label !== null && x.label !== '') {
      const label = fitText(`${k} label`, x.label, 40).trim();
      if (label) kept.label = label;
    }
    out[k] = kept;
  }
  return out;
}

// What a round can count. Targets are whole numbers: kilometres are kept in metres.
const ROUND_KINDS = {
  pushups: { unit: 'reps', scale: 1, def: 100, min: 1, max: 10000 },
  run: { unit: 'km', scale: 1000, def: 5000, min: 100, max: 200000 },
  walk: { unit: 'min', scale: 1, def: 30, min: 1, max: 1440 },
  cycle: { unit: 'km', scale: 1000, def: 15000, min: 100, max: 500000 },
  swim: { unit: 'min', scale: 1, def: 30, min: 1, max: 1440 },
  yoga: { unit: 'min', scale: 1, def: 20, min: 1, max: 1440 },
  steps: { unit: 'steps', scale: 1, def: 8000, min: 100, max: 100000 },
  minutes: { unit: 'min', scale: 1, def: 30, min: 1, max: 1440 }
};
/** A round with no kind is a push-up round (every round made before kinds). */
const kindOf = (k) => (k && Object.prototype.hasOwnProperty.call(ROUND_KINDS, k) ? k : 'pushups');
function needKind(k) {
  if (k === undefined || k === null || k === '') return 'pushups';
  if (!Object.prototype.hasOwnProperty.call(ROUND_KINDS, k)) throw new HttpError(400, 'kind must be one of: ' + Object.keys(ROUND_KINDS).join(', '));
  return k;
}
/** A daily target for a round of this kind, as a whole number in its kept unit. */
function needTarget(kind, v) {
  const k = ROUND_KINDS[kindOf(kind)];
  if (!Number.isInteger(v) || v < k.min || v > k.max) throw new HttpError(400, `dailyTarget must be a whole number from ${k.min} to ${k.max}`);
  return v;
}

const isAmount = (v) => Boolean(v) && typeof v === 'object' && Number(v.n) > 0;
/** One day's number for a round, in kept units, from { pushups, types, steps }. Null when nothing it counts was logged. */
function roundAmount(kind, day) {
  if (!day) return null;
  const k = kindOf(kind);
  if (k === 'pushups') return day.pushups === null || day.pushups === undefined || day.pushups === '' ? null : Number(day.pushups);
  if (k === 'steps') return day.steps === null || day.steps === undefined || day.steps === '' ? null : Number(day.steps);
  const types = day.types && typeof day.types === 'object' ? day.types : {};
  if (k === 'minutes') {
    let sum = 0, any = false;
    for (const v of Object.values(types)) if (isAmount(v) && v.u === 'min') { sum += Number(v.n); any = true; }
    return any ? Math.round(sum) : null;
  }
  const v = types[k];
  if (isAmount(v) && v.u === ROUND_KINDS[k].unit) return Math.round(Number(v.n) * ROUND_KINDS[k].scale);
  return v === true || isAmount(v) ? 0 : null;
}

/** The target someone joins a round with when they did not pick one: their own goal for that move, else the kind's
 *  default. Reads the settings blob the app keeps (src/lib/settings.ts), including settings from before moves. */
function goalForKind(settings, kind) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const k = kindOf(kind), d = ROUND_KINDS[k];
  let goal = null;
  if (k === 'steps') goal = Number(s.goals && s.goals.steps);
  else if (k !== 'minutes') {
    const mine = Array.isArray(s.moves) ? s.moves.find((m) => m && m.key === k) : null;
    if (mine) goal = Number(mine.goal) * d.scale;
    else if (k === 'pushups' && !Array.isArray(s.moves)) goal = Number(s.pushupTarget);
  }
  if (!Number.isFinite(goal) || goal <= 0) goal = d.def;
  return Math.min(d.max, Math.max(d.min, Math.round(goal)));
}

module.exports = { cleanTypes, ROUND_KINDS, kindOf, needKind, needTarget, roundAmount, goalForKind };
