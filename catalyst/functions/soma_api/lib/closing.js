// The server's copy of the day-closing rule (the app's is src/lib/today.ts with src/lib/moves.ts movedOn and
// settings.ts cleanCloses). The evening nudge and Dayhub Ops both judge a day by it. This file is copied byte for byte
// into soma_api/lib/closing.js, because the two functions deploy apart; scripts/test-ops.mjs checks the copies match.
// Change the rule here, there and in the app together.
//
// Since 2026-11-11 each person chooses what closes their day: weight is requireWeight, as it always was, and the
// check-in, the journal, food (and which meals count) and a move are settings.closes. All count unless switched off.

'use strict';

const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'];

/** A types_json value that is something logged: a session, or an amount above nothing (src/lib/moves.ts). */
const logged = (v) => v === true || (Boolean(v) && typeof v === 'object' && Number(v.n) > 0);

/** Everything counting: someone who never chose, and anyone before choosing existed. */
const ALL = Object.freeze({ checkin: true, journal: true, food: true, activity: true, meals: MEALS });

/** settings.closes → which of the four besides weight close the day, and the meals food asks for (card order, all
 *  four when none is left). Nothing at all closing a day is not a choice the app offers: with weight off too, the
 *  check-in counts (the app's cleanCloses reads it the same way). */
function countsOf(s) {
  const c = s.closes && typeof s.closes === 'object' && !Array.isArray(s.closes) ? s.closes : {};
  const meals = Array.isArray(c.meals) ? MEALS.filter((m) => c.meals.includes(m)) : [];
  const counts = { checkin: c.checkin !== false, journal: c.journal !== false, food: c.food !== false, activity: c.activity !== false, meals: meals.length ? meals : MEALS };
  if (s.requireWeight === false && !counts.checkin && !counts.journal && !counts.food && !counts.activity) counts.checkin = true;
  return counts;
}

/** settings_json → what the rule needs: is weight one of the things, the steps goal for someone who chose Steps as a
 *  move (null for anyone else, whose steps never close a day), and what else counts. */
function closingRules(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const steps = Array.isArray(s.moves) && s.moves.some((x) => x && x.key === 'steps');
  const goal = Number(s.goals && s.goals.steps);
  return { requireWeight: s.requireWeight !== false, stepsGoal: steps ? (Number.isFinite(goal) && goal > 0 ? goal : 8000) : null, counts: countsOf(s) };
}

/** Did this day have a move: any move logged (even one since taken off the list), or steps at the goal for someone
 *  who chose Steps. */
function moved({ pushups, types, steps }, stepsGoal = null) {
  return Number(pushups) > 0 || Object.values(types || {}).some(logged) || (stepsGoal !== null && Number(steps) >= stepsGoal);
}

/** Whether every meal that counts was eaten. */
const fed = (meals, need = MEALS) => need.every((k) => meals && meals[k]);

/** What is still open, in card order, of what counts for this person (`counts` from closingRules; everything when
 *  left out). An empty list is a closed day. */
function leftToday({ weight, mood, entries, meals, pushups, types, steps }, requireWeight, stepsGoal = null, counts = ALL) {
  const c = counts || ALL;
  const left = [];
  if (requireWeight && !weight) left.push('Weight');
  if (c.checkin && !mood) left.push('Check-in');
  if (c.journal && !entries) left.push('Journal');
  if (c.food) {
    const need = c.meals && c.meals.length ? c.meals : MEALS;
    const short = need.filter((k) => !(meals && meals[k])).length;
    if (short) left.push(short === need.length ? 'Food' : `${short} meal${short === 1 ? '' : 's'}`);
  }
  if (c.activity && !moved({ pushups, types, steps }, stepsGoal)) left.push('Activity');
  return left;
}

module.exports = { MEALS, ALL, logged, countsOf, closingRules, moved, fed, leftToday };
