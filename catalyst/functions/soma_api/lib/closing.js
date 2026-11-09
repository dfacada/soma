// The server's copy of the day-closing rule (the app's is src/lib/today.ts with src/lib/moves.ts movedOn). The evening
// nudge and Soma Ops both judge a day by it. This file is copied byte for byte into soma_api/lib/closing.js, because
// the two functions deploy apart; scripts/test-ops.mjs checks the copies match. Change the rule here, there and in
// the app together.

'use strict';

const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'];

/** A types_json value that is something logged: a session, or an amount above nothing (src/lib/moves.ts). */
const logged = (v) => v === true || (Boolean(v) && typeof v === 'object' && Number(v.n) > 0);

/** settings_json → what the rule needs: is weight one of the things, and the steps goal for someone who chose Steps
 *  as a move (null for anyone else, whose steps never close a day). */
function closingRules(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const steps = Array.isArray(s.moves) && s.moves.some((x) => x && x.key === 'steps');
  const goal = Number(s.goals && s.goals.steps);
  return { requireWeight: s.requireWeight !== false, stepsGoal: steps ? (Number.isFinite(goal) && goal > 0 ? goal : 8000) : null };
}

/** Did this day have a move: any move logged (even one since taken off the list), or steps at the goal for someone
 *  who chose Steps. */
function moved({ pushups, types, steps }, stepsGoal = null) {
  return Number(pushups) > 0 || Object.values(types || {}).some(logged) || (stepsGoal !== null && Number(steps) >= stepsGoal);
}

/** What is still open, in card order. An empty list is a closed day. */
function leftToday({ weight, mood, entries, meals, pushups, types, steps }, requireWeight, stepsGoal = null) {
  const left = [];
  if (requireWeight && !weight) left.push('Weight');
  if (!mood) left.push('Check-in');
  if (!entries) left.push('Journal');
  const eaten = MEALS.filter((k) => meals && meals[k]).length;
  if (eaten < 4) left.push(eaten === 0 ? 'Food' : `${4 - eaten} meal${eaten === 3 ? '' : 's'}`);
  if (!moved({ pushups, types, steps }, stepsGoal)) left.push('Activity');
  return left;
}

module.exports = { MEALS, logged, closingRules, moved, leftToday };
