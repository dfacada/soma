// End-to-end checks against the deployed Development API, as the synthetic test member
// (TEST_KEY in secrets.json; see functions/soma_api/lib/auth.js). Cleans up after itself.
//
//   node test-api.js

'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'https://soma-939530195.development.catalystserverless.com/server/soma_api/execute';
const KEY = JSON.parse(fs.readFileSync(path.join(__dirname, 'secrets.json'), 'utf8')).soma_api.TEST_KEY;

let passed = 0;
const failures = [];

async function call(method, route, body, headers) {
  const res = await fetch(BASE + route, {
    method,
    headers: Object.assign({ 'x-test-key': KEY }, body === undefined ? {} : { 'Content-Type': 'application/json' }, headers),
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_e) { /* not JSON */ }
  return { status: res.status, json, text };
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failures.push(name); console.log('  FAIL ' + name + (detail ? '  → ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  let r;
  const day = '2001-02-03', day2 = '2001-02-05';

  console.log('identity');
  r = await call('GET', '/me');
  check('/me as test member', r.status === 200 && r.json.profile.role === 'member' && r.json.profile.status === 'active', r.json);
  r = await call('GET', '/me', undefined, { 'x-test-key': 'wrong' });
  check('/me with a wrong key is 401', r.status === 401, r.text);
  r = await call('GET', '/admin/profiles');
  check('admin routes refuse a member', r.status === 403, r.text);

  console.log('checkins');
  const habits = { 'Meditate 🧘': true, 'Café ☕': false, '読書': true };
  r = await call('PUT', '/checkins/' + day, { mood: 'calm', habits, counts: { water: 5 } });
  check('PUT creates', r.status === 200 && r.json.mood === 'calm', r.json);
  check('emoji, accents and CJK survive insertRow', r.status === 200 && same(r.json.habits, habits), r.json && r.json.habits);
  r = await call('PUT', '/checkins/' + day, { mood: 'tired' });
  check('partial PUT keeps other fields', r.status === 200 && r.json.mood === 'tired' && same(r.json.habits, habits) && r.json.counts.water === 5, r.json);
  r = await call('GET', '/checkins/' + day);
  check('GET one day', r.status === 200 && r.json.day === day, r.json);
  await call('PUT', '/checkins/' + day2, { mood: 'good' });
  r = await call('GET', `/checkins?from=2001-02-01&to=2001-02-28`);
  check('range returns both days in order', r.status === 200 && same(r.json.days.map((d) => d.day), [day, day2]), r.json);
  r = await call('GET', `/checkins?from=2001-02-04&to=2001-02-28`);
  check('range bounds are honoured', r.status === 200 && same(r.json.days.map((d) => d.day), [day2]), r.json);
  r = await call('PUT', '/checkins/' + day, { habits: { blob: 'x'.repeat(10001) } });
  check('oversize JSON is 413, not truncated', r.status === 413, r.text);
  r = await call('GET', '/checkins/' + day);
  check('…and the stored row is untouched', same(r.json.habits, habits), r.json);

  console.log('validation');
  r = await call('PUT', "/checkins/2001-02-03' OR '1'='1", { mood: 'x' });
  check('injection in :day is 400', r.status === 400, r.text);
  r = await call('PUT', '/checkins/2001-13-40', { mood: 'x' });
  check('impossible date is 400', r.status === 400, r.text);
  r = await call('PUT', '/checkins/' + day, {});
  check('empty body is 400', r.status === 400, r.text);
  r = await call('PUT', '/checkins/' + day, '{not json');
  check('malformed JSON is 400', r.status === 400, r.text);
  r = await call('GET', '/checkins/1999-01-01');
  check('unlogged day is 404', r.status === 404, r.text);

  console.log('weight, activity, day-logs');
  r = await call('PUT', '/weight/' + day, { value: 182.4 });
  check('weight round-trips as a number', r.status === 200 && r.json.value === 182.4, r.json);
  r = await call('PUT', '/weight/' + day, { value: 'heavy' });
  check('non-numeric weight is 400', r.status === 400, r.text);
  r = await call('PUT', '/activity/' + day, { pushups: 100, types: { walk: { n: 30, u: 'min' }, gym: true } });
  check('activity saves', r.status === 200 && r.json.pushups === 100 && r.json.types.walk.n === 30 && r.json.types.gym === true, r.json);
  r = await call('PUT', '/activity/' + day, { pushups: 12.5 });
  check('fractional pushups is 400', r.status === 400, r.text);
  // Backfill: push-ups count for the round only when logged within two days; the record takes them either way.
  r = await call('PUT', '/activity/' + day, { pushups: 100, roundPushups: 999 });
  check('push-ups logged years late: the record has them, the round does not', r.status === 200 && r.json.pushups === 100 && r.json.roundPushups == null, r.json);
  const nowDay = new Date().toISOString().slice(0, 10);
  r = await call('PUT', '/activity/' + nowDay, { pushups: 40, roundPushups: 999 });
  check('push-ups logged on the day count for the round, and the client cannot set that', r.status === 200 && r.json.roundPushups === 40, r.json);
  await call('DELETE', '/activity/' + nowDay);
  // The same two fields under a "__proto__" key: a careless copy of the body would bring them in through the
  // prototype (it did until 2026-11-10). Sent as text, because JSON.stringify would not write that key from a literal.
  r = await call('PUT', '/activity/' + day, '{"pushups":100,"__proto__":{"roundPushups":999,"roundJson":{"steps":999999}}}');
  check('…nor smuggle the round fields in under a __proto__ key', r.status === 200 && r.json.pushups === 100 && r.json.roundPushups == null && r.json.roundJson == null, r.json);
  r = await call('PUT', '/activity/' + day, '{"__proto__":{"pushups":7}}');
  check('…and a body with nothing of its own saves nothing', r.status === 400, r.text);
  r = await call('PUT', '/day-logs/' + day, { meals: { breakfast: true }, extras: [{ name: 'Apple 🍎', kcal: 95 }] });
  check('day-log saves', r.status === 200 && r.json.meals.breakfast === true && r.json.extras[0].kcal === 95, r.json);

  console.log('settings and /days');
  r = await call('PUT', '/settings', { settings: { pushupTarget: 60, habits: [{ id: 'read', label: 'Read 📚' }] }, displayName: 'Test User' });
  check('settings save', r.status === 200, r.text);
  r = await call('GET', '/settings');
  check('settings round-trip', r.status === 200 && r.json.settings.pushupTarget === 60 && r.json.settings.habits[0].label === 'Read 📚' && r.json.displayName === 'Test User', r.json);
  r = await call('PUT', '/settings', { settings: [1, 2] });
  check('array settings is 400', r.status === 400, r.text);
  r = await call('PUT', '/settings', { displayName: '   ' });
  check('blank displayName is 400', r.status === 400, r.text);
  r = await call('GET', '/days?from=2001-02-01&to=2001-02-28&fromMs=0&toMs=4102444800000');
  check('/days returns every set', r.status === 200 && same(r.json.checkins.map((d) => d.day), [day, day2]) && r.json.weight[0].value === 182.4
    && r.json.activity[0].pushups === 100 && r.json.dayLogs[0].meals.breakfast === true && Array.isArray(r.json.entries), r.json);
  r = await call('GET', '/days?from=2001-02-28&to=2001-02-01');
  check('/days with reversed range is 400', r.status === 400, r.text);

  console.log('rounds');
  r = await call('GET', '/rounds');
  const testRound = r.status === 200 && r.json.rounds.find((x) => x.name === '__test_round__');
  if (!testRound) {
    console.log('  skip (no __test_round__ row; only an admin can create one)');
  } else {
    const rid = testRound.id;
    await call('DELETE', `/rounds/${rid}/me`);
    check('rounds list carries the round', testRound.lengthDays === 28 && same(testRound.restDays, [7, 14, 21, 28]) && testRound.joinOpen === true, testRound);
    r = await call('POST', '/rounds', { name: 'nope', startDate: '2001-02-01', lengthDays: 10 });
    check("a member's round cannot start years ago", r.status === 400, r.text);
    r = await call('PUT', `/rounds/${rid}`, { name: 'hijack' });
    check('a member cannot edit a round', r.status === 403, r.text);
    r = await call('POST', `/rounds/${rid}/join`, { dailyTarget: 0, today: '2001-02-03' });
    check('a zero target is 400', r.status === 400, r.text);
    r = await call('POST', `/rounds/${rid}/join`, { dailyTarget: 100, today: '2001-02-03' });
    check('join sets target and start day from the date the caller names', r.status === 201 && r.json.dailyTarget === 100 && r.json.startDay === 3 && r.json.status === 'active', r.json);
    r = await call('POST', `/rounds/${rid}/join`, { dailyTarget: 100, today: '2001-02-03' });
    check('joining twice is 409', r.status === 409, r.text);
    r = await call('PUT', `/rounds/${rid}/me`, { dailyTarget: 60 });
    check('own target can change', r.status === 200 && r.json.dailyTarget === 60, r.json);
    r = await call('GET', `/rounds/${rid}/board`);
    const mine = r.json && r.json.logs['999000000000000001'];
    // The board reads round_pushups, which the API only sets within two days of the day itself, so the 100 logged
    // against a day in 2001 shows in the record and nowhere on the board. The member row is still there.
    check('board carries the member', r.status === 200 && r.json.members[0].displayName === 'Test User' && r.json.members[0].dailyTarget === 60, r.json);
    check('push-ups logged years late never reach the board', r.status === 200 && (!mine || mine[3] === undefined), mine);
    r = await call('DELETE', `/rounds/${rid}/members/120218000000022011`);
    check('a member cannot remove someone else', r.status === 403, r.text);
    r = await call('DELETE', `/rounds/${rid}/me`);
    check('leaving marks the membership removed', r.status === 200 && r.json.status === 'removed', r.json);
    r = await call('POST', `/rounds/${rid}/join`, { dailyTarget: 80, today: '2001-02-20' });
    check('rejoining keeps the original start day and join order', r.status === 201 && r.json.startDay === 3 && r.json.joinSeq === 1 && r.json.dailyTarget === 80, r.json);
    await call('DELETE', `/rounds/${rid}/me`);
  }
  r = await call('GET', '/rounds/999/board');
  check('an unknown round is 404', r.status === 404, r.text);

  // Private rounds (routes/rounds.js) and their invite links (routes/invites.js). Member one makes a round, member
  // two joins with the link, and member four, who starts out waiting for approval like a real sign-up, is let in by it.
  console.log('private rounds and invite links');
  {
    const as2 = (method, route, body) => call(method, route, body, { 'x-test-member': '2' });
    const as4 = (method, route, body) => call(method, route, body, { 'x-test-member': '4' });
    const today = new Date().toISOString().slice(0, 10);
    r = await call('POST', '/rounds', { name: '__test_private__', startDate: today, lengthDays: 7, restDays: [7], dailyTarget: 50, today });
    check('a member makes a private round, is in it, and gets its invite link', r.status === 201 && r.json.inviteOnly === true && /^[0-9A-HJKMNP-TV-Z]{10}$/.test(r.json.invite && r.json.invite.code), r.json);
    const pid = r.json && r.json.id, code = r.json && r.json.invite && r.json.invite.code;
    r = await call('GET', '/rounds');
    const made = r.json.rounds.find((x) => x.id === pid);
    check("…it is in the maker's list, with their target", made && made.me && made.me.status === 'active' && made.me.dailyTarget === 50 && made.ownerId === '999000000000000001', made);
    r = await as2('GET', '/rounds');
    check('someone else does not see a private round', r.status === 200 && !r.json.rounds.some((x) => x.id === pid), r.json && r.json.rounds.map((x) => x.name));
    r = await as2('GET', `/rounds/${pid}/board`);
    check('…nor its board', r.status === 403, r.text);
    r = await as2('POST', `/rounds/${pid}/join`, { dailyTarget: 40, today });
    check('…nor joins it without the link', r.status === 403, r.text);
    r = await as2('GET', `/rounds/${pid}/invite`);
    check('…nor can ask for the link', r.status === 403, r.text);
    const pub = await fetch(BASE + '/invites/' + code.toLowerCase());
    const preview = await pub.json();
    check('the link says what it is for to someone not signed in, typed in any case', pub.status === 200 && preview.ok === true && preview.round && preview.round.name === '__test_private__' && preview.from === 'Test', preview);
    const unknown = await fetch(BASE + '/invites/ZZZZZZZZZZ');
    check('a code that does not exist is a plain 404', unknown.status === 404);
    r = await as2('POST', `/invites/${code}/accept`, { today });
    check('with the link, a member joins the round, with their own push-up target', r.status === 200 && r.json.approved === false && r.json.round && r.json.round.id === pid, r.json);
    r = await as2('GET', `/rounds/${pid}/board`);
    check('…and both are on the board', r.status === 200 && r.json.members.filter((m) => m.status === 'active').length === 2, r.json && r.json.members);
    r = await as2('PUT', `/rounds/${pid}`, { name: 'hijack' });
    check('only its maker can change it', r.status === 403, r.text);
    r = await call('PUT', `/rounds/${pid}`, { startDate: '2001-01-01', lengthDays: 366 });
    check("its maker cannot stretch it back over months of other people's record", r.status === 400, r.text);
    r = await call('PUT', `/rounds/${pid}`, { lengthDays: 30 });
    check('…and its dates are fixed once someone else has joined', r.status === 409, r.text);
    await as2('PUT', '/activity/' + today, { pushups: 20 });
    r = await as2('POST', `/rounds/${pid}/invite`);
    check('…or replace its link', r.status === 403, r.text);
    r = await as2('GET', `/rounds/${pid}/invite`);
    check('a member can pass the link on', r.status === 200 && r.json.code === code, r.json);
    r = await call('POST', `/rounds/${pid}/invite`);
    const code2 = r.json && r.json.code;
    check('the maker replaces the link', r.status === 201 && code2 && code2 !== code, r.json);
    r = await call('GET', `/rounds/${pid}/board`);
    check("the board carries a member's push-ups for today", r.status === 200 && r.json.logs['999000000000000002'] && r.json.logs['999000000000000002'][1] === 20, r.json && r.json.logs);
    r = await call('DELETE', `/rounds/${pid}/members/999000000000000002`);
    check('…and can take someone out', r.status === 200 && r.json.status === 'banned', r.json);
    r = await call('GET', `/rounds/${pid}/board`);
    check('someone taken out is off the board: no name, no counts', r.status === 200 && !r.json.members.some((m) => m.userId === '999000000000000002') && !r.json.logs['999000000000000002'], r.json);
    await as2('DELETE', '/activity/' + today);
    r = await as2('POST', `/invites/${code}/accept`, { today });
    check('the replaced link opens nothing', r.status === 410, r.text);
    r = await as2('POST', `/invites/${code2}/accept`, { today });
    check('someone taken out cannot come back with the new one', r.status === 403, r.text);
    r = await as2('GET', '/rounds');
    check('…and the round is gone from their list', r.status === 200 && !r.json.rounds.some((x) => x.id === pid), r.json && r.json.rounds.map((x) => x.name));
    r = await call('POST', '/admin/invites', { maxUses: 5 });
    check('a member cannot make sign-up codes', r.status === 403, r.text);

    // Member four as a brand-new sign-up. A previous run let it in, so its account is deleted first; the profile
    // that comes back is a new one, waiting, as a stranger's would be.
    const fresh = async (query) => {
      r = await as4('GET', '/me');
      if (r.json && r.json.profile && r.json.profile.status !== 'pending') await as4('DELETE', '/account', { confirm: 'DELETE' });
      for (let i = 0; i < 40; i++) {
        r = await as4('GET', '/me' + query);
        if (r.status === 200 && r.json.profile.status !== 'deleting') return r;
        await new Promise((res) => setTimeout(res, 3000));
      }
      return r;
    };
    r = await fresh('');
    check('a new sign-up waits for approval', r.status === 200 && r.json.profile.status === 'pending', r.json);
    r = await as4('GET', '/rounds');
    check('…and can do nothing yet', r.status === 403, r.text);
    r = await as4('POST', `/invites/${code}/accept`, { today });
    check('…a replaced link does not let them in', r.status === 410, r.text);
    r = await as4('POST', `/invites/${code2}/accept`, { today });
    check('…the round link lets them in, and into the round, in one go', r.status === 200 && r.json.approved === true && r.json.round && r.json.round.id === pid, r.json);
    r = await as4('GET', '/me');
    check('…approved, with a note of whose invite it was', r.status === 200 && r.json.profile.status === 'active' && r.json.profile.invitedBy === '999000000000000001', r.json);
    r = await fresh('?invite=' + code2);
    check('arriving through the link, a new sign-up is let in on its very first visit', r.status === 200 && r.json.profile.status === 'active' && r.json.profile.invitedBy === '999000000000000001', r.json);
    r = await as4('POST', `/invites/${code2}/accept`, { today });
    check('…and then joins the round without counting twice', r.status === 200 && r.json.approved === false && r.json.round && r.json.round.id === pid, r.json);
    r = await call('GET', `/rounds/${pid}/invite`);
    check('the link counts the two people it let in, not the members who joined with it', r.status === 200 && r.json.uses === 2, r.json);

    // Tidy: the maker leaves and archives it, so it drops out of every list and never counts against the cap.
    await call('PUT', `/rounds/${pid}`, { archived: true });
    const dead = await (await fetch(BASE + '/invites/' + code2)).json();
    check("an archived round's link lets nobody in any more", dead.ok === false && /ended|turned off/.test(dead.reason), dead);
    await call('DELETE', `/rounds/${pid}/me`);
    r = await call('GET', '/rounds');
    check('an archived private round its maker has left is out of their list', r.status === 200 && !r.json.rounds.some((x) => x.id === pid), r.json && r.json.rounds.map((x) => x.name));
  }

  // Moves and rounds of any move (2026-11-08, lib/moves.js). A round counts one kind of move; targets are whole
  // numbers in its kept unit (km as metres); the board reads each day as frozen at its last on-time save (round_json)
  // and sends only the one number for its kind, never anyone's other moves.
  console.log('moves and rounds of any move');
  {
    const as2 = (method, route, body) => call(method, route, body, { 'x-test-member': '2' });
    const today = new Date().toISOString().slice(0, 10);
    const ME = '999000000000000001', TWO = '999000000000000002';
    // A run that failed half way may have left its rounds live, and a member can run only three at once.
    r = await call('GET', '/rounds');
    for (const x of (r.json && r.json.rounds) || []) if (x.inviteOnly && !x.archived && x.ownerId === ME && x.name.startsWith('__test_')) await call('PUT', `/rounds/${x.id}`, { archived: true });

    r = await call('PUT', '/activity/' + day, { types: { walk: 30 } });
    check('a bare number for a move is refused', r.status === 400, r.text);
    r = await call('PUT', '/activity/' + day, { types: { run: { n: 3, u: 'miles' } } });
    check('an unknown unit is refused', r.status === 400, r.text);
    r = await call('PUT', '/activity/' + day, { types: { run: { n: 5, u: 'km' } }, roundJson: { types: { run: { n: 99, u: 'km' } } } });
    check('moves logged years late: the record has them, the round does not, and the client cannot set that', r.status === 200 && r.json.types.run.n === 5 && r.json.roundJson == null, r.json);
    r = await call('PUT', '/activity/' + today, { pushups: 0, types: { run: { n: 5.25, u: 'km' }, yoga: { n: 20, u: 'min' }, gym: true, walk: false } });
    check('moves logged on the day are frozen for rounds, cleared ones dropped', r.status === 200 && same(r.json.roundJson && r.json.roundJson.types, { run: { n: 5.25, u: 'km' }, yoga: { n: 20, u: 'min' }, gym: true }), r.json);
    r = await call('PUT', '/activity/' + today, { steps: 9000 });
    check('typed steps freeze beside the moves, keeping them', r.status === 200 && r.json.steps === 9000 && r.json.roundJson && r.json.roundJson.steps === 9000 && r.json.roundJson.types.run.n === 5.25, r.json);
    r = await call('PUT', '/activity/' + today, { steps: 12.5 });
    check('fractional steps are 400', r.status === 400, r.text);
    await as2('PUT', '/activity/' + today, { types: { run: { n: 3, u: 'km' }, walk: { n: 15, u: 'min' } } });

    r = await call('POST', '/rounds', { name: '__test_run__', startDate: today, lengthDays: 7, kind: 'run', dailyTarget: 50, today });
    check('a run target under 100 metres is refused', r.status === 400, r.text);
    r = await call('GET', '/rounds');
    check('…before anything is made: no empty round is left behind', r.status === 200 && !r.json.rounds.some((x) => x.name === '__test_run__' && !x.archived), r.json && r.json.rounds.map((x) => x.name));
    r = await call('POST', '/rounds', { name: '__test_run__', startDate: today, lengthDays: 7, kind: 'chess', dailyTarget: 5000, today });
    check('an unknown kind is refused', r.status === 400, r.text);
    r = await call('POST', '/rounds', { name: '__test_run__', startDate: today, lengthDays: 7, kind: 'run', dailyTarget: 5000, today });
    check('a member makes a run round with a 5 km target', r.status === 201 && r.json.kind === 'run' && Boolean(r.json.invite), r.json);
    const runId = r.json && r.json.id, runCode = r.json && r.json.invite && r.json.invite.code;
    r = await call('PUT', `/rounds/${runId}`, { kind: 'pushups' });
    check('what a round counts is fixed once made', r.status === 409, r.text);
    r = await as2('POST', `/invites/${runCode}/accept`, { today });
    check('the link joins someone to a run round', r.status === 200 && r.json.round && r.json.round.kind === 'run', r.json);
    const pub = await (await fetch(BASE + '/invites/' + runCode)).json();
    check('the link says what the round counts to someone not signed in', pub.round && pub.round.kind === 'run', pub);
    r = await call('GET', `/rounds/${runId}/board`);
    const two = r.json && r.json.members && r.json.members.find((x) => x.userId === TWO);
    check('…with the kind\'s default target when they have no run goal: 5 km, in metres', Boolean(two) && two.dailyTarget === 5000, r.json && r.json.members);
    check("the board has each member's run that day, in metres, and nothing else of theirs", r.status === 200 && r.json.logs[ME] && r.json.logs[ME][1] === 5250 && r.json.logs[TWO] && r.json.logs[TWO][1] === 3000
      && JSON.stringify(r.json).indexOf('yoga') === -1 && JSON.stringify(r.json).indexOf('walk') === -1, r.json);
    r = await as2('PUT', `/rounds/${runId}/me`, { dailyTarget: 3000 });
    check('a member changes their own target, in metres', r.status === 200 && r.json.dailyTarget === 3000, r.json);
    r = await as2('PUT', `/rounds/${runId}/me`, { dailyTarget: 2.5 });
    check('…and a fraction of a metre is refused', r.status === 400, r.text);

    r = await call('POST', '/rounds', { name: '__test_minutes__', startDate: today, lengthDays: 7, kind: 'minutes', dailyTarget: 30, today });
    const minId = r.json && r.json.id, minCode = r.json && r.json.invite && r.json.invite.code;
    await as2('POST', `/invites/${minCode}/accept`, { today });
    r = await call('GET', `/rounds/${minId}/board`);
    check('a minutes round adds up every timed move (yoga 20; walk 15, and a run in km has no minutes)', r.status === 200 && r.json.logs[ME] && r.json.logs[ME][1] === 20 && r.json.logs[TWO] && r.json.logs[TWO][1] === 15, r.json && r.json.logs);

    r = await call('POST', '/rounds', { name: '__test_steps__', startDate: today, lengthDays: 7, kind: 'steps', dailyTarget: 8000, today });
    const stepsId = r.json && r.json.id;
    r = await call('GET', `/rounds/${stepsId}/board`);
    check('a steps round counts the steps frozen with the day', r.status === 200 && r.json.logs[ME] && r.json.logs[ME][1] === 9000, r.json && r.json.logs);

    // Tidy: archived and left, so they drop out of every list and never count against the cap.
    for (const id of [runId, minId, stepsId]) {
      if (!id) continue;
      await call('PUT', `/rounds/${id}`, { archived: true });
      await call('DELETE', `/rounds/${id}/me`);
      await as2('DELETE', `/rounds/${id}/me`);
    }
    await call('DELETE', '/activity/' + today);
    await as2('DELETE', '/activity/' + today);
  }

  console.log('vault and entries');
  const vault = { salt: 'c2FsdHNhbHRzYWx0c2FsdA==', verifierIv: 'aXZpdml2aXZpdml2', verifierCt: 'Y2lwaGVydGV4dA==' };
  await call('PUT', '/vault-meta', Object.assign({ replace: true }, vault));
  r = await call('GET', '/vault-meta');
  check('vault-meta round-trips', r.status === 200 && r.json.salt === vault.salt && r.json.verifierCt === vault.verifierCt, r.json);
  r = await call('PUT', '/vault-meta', vault);
  check('second vault without replace is 409', r.status === 409, r.text);
  r = await call('PUT', '/vault-meta', Object.assign({}, vault, { salt: 'not base64!' }));
  check('non-base64 salt is 400', r.status === 400, r.text);

  console.log('vault recovery code');
  {
    // Stand-ins for what the browser seals (scripts/test-recovery.mjs checks the real crypto): 61 bytes, as a key is.
    const sealedCopy = Buffer.from('a sealed vault key stands in here, sixty-one bytes long......').toString('base64');
    r = await call('PUT', '/vault-meta/recovery', { recoveryKey: 'not base64!' });
    check('a recovery copy must be base64', r.status === 400, r.text);
    r = await call('PUT', '/vault-meta/recovery', { recoveryKey: 'A'.repeat(200) });
    check('…and the size of one sealed key, not more', r.status === 413, r.text);
    r = await call('PUT', '/vault-meta/recovery', { recoveryKey: sealedCopy });
    check("the recovery code's sealed copy of the key saves", r.status === 200, r.text);
    r = await call('GET', '/vault-meta');
    check('…and comes back with the time it was made', r.status === 200 && r.json.recoveryKey === sealedCopy && r.json.recoveryMs > Date.now() - 600000 && r.json.salt === vault.salt, r.json);
    r = await call('PUT', '/vault-meta/passphrase', { wrapSalt: 'c2FsdHNhbHQ=', wrappedKey: sealedCopy });
    check('a passphrase chosen with the recovery code saves', r.status === 200, r.text);
    r = await call('GET', '/vault-meta');
    check('…and comes back beside the first salt, which stays', r.status === 200 && r.json.wrapSalt === 'c2FsdHNhbHQ=' && r.json.wrappedKey === sealedCopy && r.json.salt === vault.salt, r.json);
    r = await call('PUT', '/vault-meta/passphrase', { wrapSalt: 'c2FsdHNhbHQ=' });
    check('a seal with no key is 400', r.status === 400, r.text);
    r = await call('PUT', '/vault-meta/recovery', { recoveryKey: sealedCopy }, { 'x-test-member': '2' });
    check('no vault yet: there is nothing to make a code for (404)', r.status === 404, r.text);
    await call('PUT', '/vault-meta', Object.assign({ replace: true }, vault));
    r = await call('GET', '/vault-meta');
    check('a replaced vault forgets the old recovery copy and passphrase seal', r.status === 200 && r.json.recoveryKey === null && r.json.wrappedKey === null && r.json.wrapSalt === null && r.json.recoveryMs === null, r.json);
  }

  console.log('vault passkeys (a simulated passkey, real P-256 signatures)');
  {
    const nodeCrypto = require('crypto');
    const ORIGIN = 'http://localhost:3000';
    const b64u = (b) => Buffer.from(b).toString('base64url');
    const sha = (b) => nodeCrypto.createHash('sha256').update(b).digest();
    const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const credId = b64u(nodeCrypto.randomBytes(20));
    const clientData = (type, challenge, origin) => Buffer.from(JSON.stringify({ type, challenge: b64u(Buffer.from(challenge, 'utf8')), origin: origin || ORIGIN }));
    const authData = (flags, rp) => Buffer.concat([sha(rp || 'localhost'), Buffer.from([flags]), Buffer.from([0, 0, 0, 0])]);
    const assertion = (challenge, opts) => {
      const o = opts || {};
      const cd = clientData(o.type || 'webauthn.get', challenge, o.origin);
      const ad = authData(o.flags === undefined ? 0x05 : o.flags, o.rp);
      const sig = nodeCrypto.sign('sha256', Buffer.concat([ad, sha(cd)]), o.key || privateKey);
      return { challenge, id: o.id || credId, clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(sig) };
    };
    const challenge = async (purpose) => (await call('POST', '/vault-passkeys/challenge', { purpose })).json.challenge;

    await call('DELETE', '/vault-passkeys');
    let ch = await challenge('register');
    r = await call('POST', '/vault-passkeys/register', { challenge: ch, id: credId, clientDataJSON: b64u(clientData('webauthn.create', ch)), publicKey: b64u(publicKey.export({ format: 'der', type: 'spki' })), alg: -7 });
    const share = r.json && r.json.share;
    check('passkey registers and returns a 32-byte share', r.status === 200 && Buffer.from(share || '', 'base64url').length === 32, r.text);
    r = await call('GET', '/vault-passkeys');
    check('list shows the passkey and never the share', r.status === 200 && r.json.passkeys.length === 1 && r.json.passkeys[0].id === credId && !r.text.includes(share), r.text);

    ch = await challenge('unlock');
    r = await call('POST', '/vault-passkeys/unlock', assertion(ch));
    check('a valid Face ID signature gets the share', r.status === 200 && r.json.share === share, r.text);
    r = await call('POST', '/vault-passkeys/unlock', assertion(ch));
    check('the same challenge cannot be used twice', r.status === 400, r.text);
    r = await call('POST', '/vault-passkeys/unlock', assertion(await challenge('unlock'), { flags: 0x01 }));
    check('no user verification (no Face ID) is refused', r.status === 403, r.text);
    r = await call('POST', '/vault-passkeys/unlock', assertion(await challenge('unlock'), { key: nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey }));
    check('a signature from another key is refused', r.status === 403, r.text);
    r = await call('POST', '/vault-passkeys/unlock', assertion(await challenge('register')));
    check('a register challenge cannot unlock', r.status === 400, r.text);
    const good = await challenge('unlock');
    r = await call('POST', '/vault-passkeys/unlock', assertion(good.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))));
    check('a forged challenge is refused', r.status === 400, r.text);
    r = await call('POST', '/vault-passkeys/unlock', assertion(good, { origin: 'https://evil.example' }));
    check('another origin is refused', r.status === 400, r.text);
    // The address Dayhub lived at until 2026-11-10. Slate can hand that name to anyone now, so it must stay refused.
    r = await call('POST', '/vault-passkeys/unlock', assertion(good, { origin: 'https://soma-onkasary.onslate.com' }));
    check('the address Dayhub left is refused too', r.status === 400 && /origin/.test(r.text), r.text);
    r = await call('POST', '/vault-passkeys/unlock', assertion(good, { rp: 'evil.example' }));
    check('another relying party is refused', r.status === 400, r.text);
    r = await call('POST', '/vault-passkeys/unlock', assertion(await challenge('unlock'), { id: b64u(nodeCrypto.randomBytes(20)) }));
    check('an unknown passkey is 404', r.status === 404, r.text);
    r = await call('POST', '/vault-passkeys/register', { challenge: 'x', id: 'short' });
    check('bad register body is 400', r.status === 400, r.text);
    r = await call('DELETE', '/vault-passkeys/' + credId);
    check('this device forgotten', r.status === 200 && r.json.removed === 1, r.json);
    r = await call('POST', '/vault-passkeys/unlock', assertion(await challenge('unlock')));
    check('a forgotten passkey gets nothing', r.status === 404, r.text);
  }

  const entryId = 'test-entry-0001';
  r = await call('PUT', '/entries/' + entryId, { createdMs: 981158400000, hasAudio: true, audioSize: 123456, audioMime: 'audio/webm', transcriptStatus: 'pending' });
  check('entry creates', r.status === 200 && r.json.hasAudio === true && r.json.hasPhoto === false && r.json.audioSize === 123456, r.json);
  r = await call('PUT', '/entries/' + entryId, { transcriptStatus: 'done' });
  check('entry partial update', r.status === 200 && r.json.transcriptStatus === 'done' && r.json.hasAudio === true && r.json.createdMs === 981158400000, r.json);
  r = await call('GET', '/entries');
  check('entries list', r.status === 200 && r.json.entries.some((e) => e.id === entryId), r.json);
  r = await call('GET', '/entries?before=981158400000');
  check('entries paging excludes the cursor row', r.status === 200 && !r.json.entries.some((e) => e.id === entryId), r.json);
  r = await call('PUT', '/entries/new-entry-0002', { hasAudio: true });
  check('new entry without createdMs is 400', r.status === 400, r.text);

  console.log('sign');
  r = await call('POST', '/sign', { kind: 'audio', method: 'PUT', names: ['test-entry-0001.enc'] });
  check('signs by kind under own prefix', r.status === 200 && r.json.urls[0].key === '999000000000000001/audio/test-entry-0001.enc' && /^https:\/\//.test(r.json.urls[0].url), r.json);
  const put = await fetch(r.json.urls[0].url, { method: 'PUT', body: new Uint8Array([1, 2, 3, 4]), headers: { 'Content-Type': 'application/octet-stream' } });
  r = await call('POST', '/sign', { kind: 'audio', method: 'GET', names: ['test-entry-0001.enc'] });
  const got = new Uint8Array(await (await fetch(r.json.urls[0].url)).arrayBuffer());
  check('signed PUT then GET round-trips bytes', put.status === 200 && same([...got], [1, 2, 3, 4]), { put: put.status, got: [...got] });
  r = await call('POST', '/sign', { kind: 'audio', names: ['../x.enc'] });
  check('kind form refuses traversal in a name', r.status === 400, r.text);
  r = await call('POST', '/sign', { kind: 'audio', names: ['a/b.enc'] });
  check('kind form refuses a slash in a name', r.status === 400, r.text);
  r = await call('POST', '/sign', { kind: 'secrets', names: ['x.enc'] });
  check('unknown kind is 400', r.status === 400, r.text);
  r = await call('POST', '/sign', { bucket: 'soma-drafts', method: 'GET', keys: ['999000000000000001/test.bin'] });
  check("the spike page's old whole-key form is gone", r.status === 400, r.text);
  r = await call('POST', '/spike/sign', {});
  check('the spike routes are gone', r.status === 404, r.text);

  console.log('jobs');
  r = await call('POST', '/jobs', { type: 'mine-bitcoin', entryId: 'test-entry-0001', source: 'tx-test-entry-0001.webm' });
  check('unknown job type is 400', r.status === 400, r.text);
  r = await call('POST', '/jobs', { type: 'transcribe', entryId: 'test-entry-0001', source: '../../etc/passwd' });
  check('a source that is not a tx- file is 400', r.status === 400, r.text);
  const upload = async () => {
    const s = await call('POST', '/sign', { kind: 'drafts', method: 'PUT', names: ['tx-test-entry-0001.webm'] });
    await fetch(s.json.urls[0].url, { method: 'PUT', body: new Uint8Array(2048), headers: { 'Content-Type': 'application/octet-stream', overwrite: 'true' } });
  };
  const leftOf = async (name) => {
    const s = await call('POST', '/sign', { kind: 'drafts', method: 'GET', names: [name] });
    const got = await fetch(s.json.urls[0].url);
    return got.status === 404 ? 0 : (await got.arrayBuffer()).byteLength;
  };
  await upload();
  await call('PUT', '/settings', { settings: { cloudTranscription: false } });
  r = await call('POST', '/jobs', { type: 'transcribe', entryId: 'test-entry-0001', source: 'tx-test-entry-0001.webm' });
  check('a journal recording is refused while cloud transcription is off (the server keeps the switch too)', r.status === 403, r.text);
  check('…and the audio it refused is shredded at once', (await leftOf('tx-test-entry-0001.webm')) <= 1);
  await upload();
  await call('PUT', '/settings', { settings: { cloudTranscription: true } });
  r = await call('POST', '/jobs', { type: 'transcribe', entryId: 'test-entry-0001', source: 'tx-test-entry-0001.webm' });
  check('transcribe job queues', r.status === 201 && r.json.status === 'queued', r.json);
  const jobId = r.json && r.json.id;
  let job = null;
  for (let i = 0; i < 30 && jobId; i++) {
    await new Promise((res) => setTimeout(res, 2000));
    job = (await call('GET', '/jobs/' + jobId)).json;
    if (job.status === 'done' || job.status === 'failed') break;
  }
  // Without a provider key the job must fail cleanly; with one, 2 KB of zeros is not audio and the provider says so.
  check('the job finishes with a recorded outcome', job && job.status === 'failed' && ['not_configured', 'provider_error'].includes(job.error), job);
  // Stratus deletes are scheduled, so the object can still exist for a minute: what matters is that it was blanked.
  const left = await leftOf('tx-test-entry-0001.webm');
  check('the plaintext audio is unreadable the moment the job ends', left <= 1, { bytes: left });
  r = await call('GET', '/jobs/120218000000022006');
  check("someone else's job is 404", r.status === 404, r.text);
  r = await call('DELETE', '/jobs/' + jobId);
  check('job deletes', r.status === 200, r.text);
  await upload();
  r = await call('POST', '/jobs', { type: 'transcribe', entryId: 'test-entry-0001', source: 'tx-test-entry-0001.webm' }, { 'x-test-cap': '0' });
  check("past the day's cap a transcription is a 429 that names the cap (not the queue's 429, which the app retries)", r.status === 429 && r.json && r.json.limit === 'transcribe', r.json);
  check('…and the audio it refused is shredded at once', (await leftOf('tx-test-entry-0001.webm')) <= 1);

  console.log('recipes, errors, feedback');
  r = await call('POST', '/recipes', { recipe: { name: 'Bowl', kcal: 640 } });
  check('recipe creates', r.status === 201 && r.json.recipe.kcal === 640, r.json);
  const recipeId = r.json && r.json.id;
  r = await call('PUT', '/recipes/' + recipeId, { recipe: { name: 'Bowl', kcal: 700 } });
  check('recipe updates', r.status === 200 && r.json.recipe.kcal === 700, r.json);
  r = await call('GET', '/recipes');
  check('recipe lists', r.status === 200 && r.json.recipes.some((x) => x.id === recipeId), r.json);
  r = await call('PUT', '/recipes/120218000000025016', { recipe: { name: 'x' } });
  check("a row id the caller doesn't own is 404", r.status === 404, r.text);
  r = await call('POST', '/errors', { message: 'test error', context: 'test-api', detail: 'y'.repeat(20000) });
  check('error report clips instead of failing', r.status === 201, r.text);
  r = await call('POST', '/feedback', { body: 'test feedback' });
  check('feedback saves', r.status === 201, r.text);

  r = await call('GET', '/days?from=2000-06-01&to=2001-06-01&fromMs=0&toMs=1');
  check('/days takes a year at a time', r.status === 200 && r.json.activity.some((x) => x.day === day), r.json);
  r = await call('GET', '/days?from=1999-01-01&to=2001-06-01');
  check('…and refuses much more than that', r.status === 400, r.text);

  console.log('google health');
  r = await call('GET', '/google-health');
  check('link status reads, nothing linked', r.status === 200 && typeof r.json.configured === 'boolean' && r.json.link === null, r.json);
  const configured = r.json && r.json.configured;
  r = await call('PUT', '/activity/' + day, { steps: 8123 });
  check('steps save without touching push-ups', r.status === 200 && r.json.steps === 8123 && r.json.pushups === 100, r.json);
  r = await call('GET', `/days?from=${day}&to=${day}`);
  check('/days carries steps', r.status === 200 && r.json.activity[0].steps === 8123, r.json);
  r = await call('PUT', '/activity/' + day, { steps: -1 });
  check('negative steps are refused', r.status === 400, r.text);
  r = await call('PUT', '/google-health/link', { ciphertext: 'not base64!' });
  check('link refuses anything but base64', r.status === 400, r.text);
  const sealed = Buffer.from('x'.repeat(90)).toString('base64');
  r = await call('PUT', '/google-health/link', { ciphertext: sealed });
  check('link saves ciphertext', r.status === 200, r.text);
  r = await call('PUT', '/google-health/link', { ciphertext: sealed });
  r = await call('GET', '/google-health');
  check('…and reads it back, once', r.status === 200 && r.json.link && r.json.link.ciphertext === sealed && r.json.link.createdMs > 0, r.json);
  const state = 'abcdefghijklmnop1234';
  r = await call('POST', '/google-health/auth-url', { redirectUri: 'https://evil.example/settings/', state });
  check('auth-url refuses a redirect that is not ours', r.status === 400, r.text);
  r = await call('POST', '/google-health/auth-url', { redirectUri: 'https://soma-onkasary.onslate.com/settings/', state });
  check('auth-url refuses the address Dayhub left', r.status === 400, r.text);
  r = await call('POST', '/google-health/auth-url', { redirectUri: 'https://dayhub-onkasary.onslate.com/settings/', state: 'short' });
  check('auth-url refuses a weak state', r.status === 400, r.text);
  r = await call('POST', '/google-health/auth-url', { redirectUri: 'https://dayhub-onkasary.onslate.com/settings/', state });
  check(configured ? 'auth-url asks for offline, read-only activity' : 'auth-url is 503 until the keys are set',
    configured ? r.status === 200 && r.json.url.includes('access_type=offline') && r.json.url.includes('googlehealth.activity_and_fitness.readonly') && r.json.url.includes('googlehealth.sleep.readonly') && r.json.url.includes('state=' + state) && !r.json.url.includes('secret') : r.status === 503, r.json);
  r = await call('POST', '/google-health/sync', { refreshToken: 'not-a-real-token-0000', from: day2, to: day });
  check('sync refuses a backwards range', r.status === 400, r.text);
  r = await call('POST', '/google-health/sync', { refreshToken: 'not-a-real-token-0000', from: '2001-01-01', to: '2001-12-31' });
  check('sync refuses more than its day limit', r.status === 400, r.text);
  r = await call('POST', '/google-health/sync', { refreshToken: 'not-a-real-token-0000', from: day, to: day2 });
  check(configured ? 'a dead token is a 409 reconnect, not a 500' : 'sync is 503 until the keys are set', configured ? r.status === 409 && r.json.error === 'reconnect' : r.status === 503, r.json);
  r = await call('POST', '/google-health/exchange', { code: 'not-a-real-code-0000', redirectUri: 'http://localhost:3000/settings/' });
  check(configured ? 'a bad code is refused cleanly' : 'exchange is 503 until the keys are set', configured ? r.status === 400 : r.status === 503, r.json);
  r = await call('PUT', '/health-months/2001-02', { ciphertext: sealed });
  check('a month of encrypted health data saves', r.status === 200, r.text);
  r = await call('PUT', '/health-months/2001-02', { ciphertext: sealed + 'AAAA' });
  r = await call('GET', '/health-months?from=2001-01&to=2001-03');
  check('…reads back as one row, the latest', r.status === 200 && r.json.months.length === 1 && r.json.months[0].month === '2001-02' && r.json.months[0].ciphertext === sealed + 'AAAA', r.json);
  r = await call('PUT', '/health-months/2001-13', { ciphertext: sealed });
  check('a bad month is refused', r.status === 400, r.text);
  r = await call('PUT', '/health-months/2001-02', { ciphertext: 'x'.repeat(10001) });
  check('an oversize month is a 413, never a silent cut', r.status === 413, r.text);
  r = await call('DELETE', '/health-months/2001-02');
  check('…and deletes', r.status === 200 && r.json.deleted === true, r.json);
  r = await call('POST', '/google-health/disconnect', {});
  check('disconnect forgets the link', r.status === 200 && r.json.removed === true && r.json.revoked === false, r.json);
  r = await call('GET', '/google-health');
  check('…and it is gone', r.status === 200 && r.json.link === null, r.json);

  console.log('log');
  r = await call('POST', '/logs', { area: 'journal', message: 'no event' });
  check('a log line needs an event', r.status === 400, r.text);
  r = await call('POST', '/logs', { level: 'error', area: 'journal', event: 'playback_failed', message: 'NotAllowedError', detail: JSON.stringify({ stage: 'play', mime: 'audio/mp4' }) });
  check('the app can report a failure', r.status === 201 && r.json.ok === true, r.json);
  r = await call('GET', '/admin/logs');
  check('only an admin can read the log', r.status === 403, r.text);
  r = await call('GET', '/admin/logs/summary');
  check('…or its summary', r.status === 403, r.text);

  console.log('push');
  r = await call('GET', '/push');
  check('the VAPID public key is served, never the private one', r.status === 200 && r.json.configured === true && /^[A-Za-z0-9_-]{80,}$/.test(r.json.publicKey) && !JSON.stringify(r.json).toLowerCase().includes('private'), r.json);
  const endpoint = 'https://web.push.apple.com/test-' + 'a'.repeat(40);
  const keys = { p256dh: 'B' + 'x'.repeat(86), auth: 'y'.repeat(22) };
  r = await call('PUT', '/push/subscription', { endpoint: 'https://evil.example/push', keys, tz: 'America/New_York' });
  check('only real push services are accepted as endpoints', r.status === 400, r.text);
  // A push service's name to the parser that checks, someone else's host to the one that sends (lib/push-endpoint.js).
  for (const [why, address] of [['a semicolon in the host', 'https://evil.example;.push.apple.com/push'], ['a sign-in part', 'https://user:pw@web.push.apple.com/push'], ['a port', 'https://web.push.apple.com:8443/push']]) {
    r = await call('PUT', '/push/subscription', { endpoint: address, keys, tz: 'America/New_York' });
    check('…and not one that only looks like one: ' + why, r.status === 400, r.text);
  }
  r = await call('PUT', '/push/subscription', { endpoint, keys, tz: 'Mars/Olympus' });
  check('an unknown time zone is refused', r.status === 400, r.text);
  r = await call('POST', '/push/test');
  check('a test with no device is a 409', r.status === 409, r.text);
  r = await call('PUT', '/push/subscription', { endpoint, keys, tz: 'America/New_York' });
  check('a subscription saves', r.status === 200, r.text);
  r = await call('PUT', '/push/subscription', { endpoint, keys, tz: 'Europe/London' });
  check('…and saving it again updates, not duplicates', r.status === 200, r.text);
  r = await call('DELETE', '/push/subscription', { endpoint });
  check('…and deletes', r.status === 200 && r.json.deleted === true, r.json);
  r = await call('DELETE', '/push/subscription', { endpoint });
  check('…once', r.status === 200 && r.json.deleted === false, r.json);

  console.log('tomorrow brief: keys and Morgen');
  await call('DELETE', '/links/morgen');
  await call('DELETE', '/links/todoist');
  r = await call('GET', '/links');
  check('no keys to begin with', r.status === 200 && r.json.links.morgen === null && r.json.links.todoist === null, r.json);
  const sealedToken = Buffer.from('stands in for a vault-sealed token ' + Date.now()).toString('base64');
  r = await call('PUT', '/links/todoist', { ciphertext: sealedToken });
  check('a sealed token saves', r.status === 200, r.text);
  r = await call('GET', '/links');
  check('…and comes back as the same ciphertext, for that provider only', r.status === 200 && r.json.links.todoist && r.json.links.todoist.ciphertext === sealedToken && r.json.links.morgen === null, r.json);
  r = await call('PUT', '/links/todoist', { ciphertext: 'a plain token, not sealed!' });
  check('anything but base64 is refused', r.status === 400, r.text);
  r = await call('PUT', '/links/google', { ciphertext: sealedToken });
  check('an unknown provider is refused', r.status === 400, r.text);
  r = await call('DELETE', '/links/todoist');
  check('…and deletes', r.status === 200 && r.json.deleted === true, r.json);
  r = await call('POST', '/morgen/events', { from: '2026-11-03T05:00:00Z', to: '2026-11-04T05:00:00Z' });
  check('Morgen with no key is a 400', r.status === 400, r.text);
  r = await call('POST', '/morgen/events', { key: 'not-a-real-morgen-key-0000000000', from: '2026-11-03T05:00:00Z', to: '2026-11-13T05:00:00Z' });
  check('more than three days is a 400', r.status === 400, r.text);
  r = await call('POST', '/morgen/events', { key: 'not-a-real-morgen-key-0000000000', from: '2026-11-03T05:00:00Z', to: '2026-11-04T05:00:00Z' });
  check('a key Morgen refuses is a 409 with a sentence, and the key is not in it', r.status === 409 && /Morgen did not accept that key/.test(r.json && r.json.error) && !r.text.includes('not-a-real'), r.text);
  r = await call('GET', '/telegram');
  check('the test member has no Telegram chat', r.status === 200 && r.json.connected === false, r.json);
  r = await call('POST', '/telegram/send', { text: 'Tomorrow · Tuesday 3 November\n\nDayhub\nWeigh in · 100 push-ups', speak: false, title: "Tomorrow's brief" });
  check('the brief cannot go to Telegram before a chat is paired (409, which the brief explains)', r.status === 409, r.text);
  // The pairing code: one person's, for ten minutes and one pairing (lib/pair-code.js; scripts/test-security.mjs
  // holds the "works once" rule, since a real pairing needs a message sent to the bot).
  r = await call('POST', '/telegram/code');
  const pairing = r.json && r.json.code;
  check('a pairing code is DAYHUB- and six characters, good for under ten minutes', r.status === 200 && /^DAYHUB-[A-Z0-9]{6}$/.test(pairing) && r.json.expiresMs > Date.now() && r.json.expiresMs <= Date.now() + 600000, r.json);
  r = await call('POST', '/telegram/code', undefined, { 'x-test-member': '2' });
  check("…and is not another member's code", r.status === 200 && r.json.code !== pairing, r.json);
  r = await call('POST', '/telegram/pair', {});
  check('pairing with no message sent to the bot is a 404 that says what to do', r.status === 404 && /Send the code to the bot/.test(r.json && r.json.error), r.text);

  console.log('daily caps on the paid AI features');
  r = await call('POST', '/food/estimate', { text: 'an apple' }, { 'x-test-cap': '0' });
  check("past the day's cap a food estimate is a 429 that says so, and no model is called", r.status === 429 && r.json && r.json.limit === 'food' && /daily limit/.test(r.json.error), r.json);
  r = await call('POST', '/food/describe', { text: 'an apple for breakfast' }, { 'x-test-cap': '0' });
  check('…the same for a whole day said at once', r.status === 429 && r.json && r.json.limit === 'food', r.json);
  r = await call('POST', '/review/speak', { text: 'A short line to read.' }, { 'x-test-cap': '0' });
  check('…and for reading aloud', r.status === 429 && r.json && r.json.limit === 'speech', r.json);
  r = await call('POST', '/food/estimate', { text: 'a medium apple' }, { 'x-test-cap': '1000' });
  check('under the cap, Claude Haiku 5.5 estimates a food', r.status === 200 && r.json.kcal > 30 && r.json.kcal < 300, r.json);

  console.log('consent is kept on the server too');
  await call('PUT', '/settings', { settings: { weeklyReview: { consent: false } } });
  r = await call('POST', '/review/write', { entries: [{ day: '2001-02-03', text: 'A test day.' }] });
  check('the week in review is refused while reading the journal is switched off', r.status === 403, r.text);
  await call('PUT', '/settings', { settings: {} });
  r = await call('POST', '/insights/journal-tone', { items: [{ id: 'a1', text: 'A test day.' }] });
  check('journal insights are refused unless With Claude is chosen', r.status === 403, r.text);

  // Data Store has no row-level security: every query is scoped by the caller in code. A second synthetic member
  // (x-test-member: 2) tries every way to see or change the first member's rows, which exist at this point.
  console.log('isolation between members');
  {
    const as2 = (method, route, body) => call(method, route, body, { 'x-test-member': '2' });
    const sealed2 = Buffer.from('member one sealed this, not member two'.repeat(2)).toString('base64');
    await call('PUT', '/reviews/2001-02-05', { ciphertext: sealed2, hasAudio: false });
    await call('PUT', '/health-months/2001-03', { ciphertext: sealed2 });
    await call('PUT', '/links/todoist', { ciphertext: sealed2 });

    r = await as2('GET', '/me');
    check('the second test member is someone else', r.status === 200 && r.json.id === '999000000000000002' && r.json.profile.role === 'member' && r.json.profile.status === 'active', r.json);
    r = await call('GET', '/me', undefined, { 'x-test-member': '5' });
    check('there is no fifth test member', r.status === 401, r.text);
    r = await as2('GET', '/checkins/' + day);
    check("member two cannot read member one's day", r.status === 404, r.text);
    r = await as2('GET', '/days?from=2001-02-01&to=2001-02-28&fromMs=981000000000&toMs=983000000000');
    check("…nor find it in a /days window, entries included", r.status === 200 && ['checkins', 'dayLogs', 'activity', 'weight', 'entries'].every((k) => r.json[k].length === 0), r.json);
    r = await as2('PUT', '/checkins/' + day, { mood: 'intruder' });
    check('member two writing the same day writes their own row', r.status === 200 && r.json.mood === 'intruder', r.json);
    r = await call('GET', '/checkins/' + day);
    check("…and member one's row is untouched", r.status === 200 && r.json.mood === 'tired', r.json);
    r = await as2('DELETE', '/checkins/' + day);
    check('member two deleting that day removes only their own row', r.status === 200 && r.json.deleted === true, r.json);
    r = await call('GET', '/checkins/' + day);
    check("…member one's is still there", r.status === 200 && r.json.mood === 'tired', r.json);

    r = await as2('GET', '/entries');
    check("member one's journal entry is not in member two's list", r.status === 200 && !r.json.entries.some((e) => e.id === entryId), r.json);
    r = await as2('PUT', '/entries/' + entryId, { transcriptStatus: 'failed' });
    check("member two cannot take over member one's entry id", r.status === 409, r.text);
    r = await call('GET', '/entries');
    check('…and the entry is unchanged', r.status === 200 && r.json.entries.some((e) => e.id === entryId && e.transcriptStatus === 'done'), r.json);
    r = await as2('DELETE', '/entries/' + entryId);
    check("member two cannot delete member one's entry", r.status === 404, r.text);

    r = await as2('GET', '/recipes');
    check("member one's recipe is not in member two's list", r.status === 200 && !r.json.recipes.some((x) => x.id === recipeId), r.json);
    r = await as2('PUT', '/recipes/' + recipeId, { recipe: { name: 'stolen' } });
    check("member two cannot change member one's recipe", r.status === 404, r.text);
    r = await as2('DELETE', '/recipes/' + recipeId);
    check("member two cannot delete member one's recipe", r.status === 404, r.text);

    r = await as2('GET', '/vault-meta');
    check("member two does not get member one's vault salt", r.status === 200 && (r.json.exists === false || r.json.salt !== vault.salt), r.json);
    r = await as2('GET', '/reviews');
    check("member two does not get member one's weekly reviews", r.status === 200 && !r.json.reviews.some((x) => x.ciphertext === sealed2), r.json);
    r = await as2('GET', '/health-months?from=2001-01&to=2001-12');
    check("member two does not get member one's sleep months", r.status === 200 && r.json.months.length === 0, r.json);
    r = await as2('GET', '/links');
    check("member two does not get member one's sealed Todoist token", r.status === 200 && r.json.links.todoist === null, r.json);
    r = await as2('POST', '/sign', { kind: 'entries', method: 'GET', names: [entryId + '.enc'] });
    check("signing the same file name as member two points into member two's own folder", r.status === 200 && r.json.urls[0].key === '999000000000000002/entries/' + entryId + '.enc', r.json);
    r = await as2('GET', '/admin/profiles');
    check('member two is not an admin either', r.status === 403, r.text);

    r = await call('GET', '/account/export');
    check("member one's export carries their own days, recipe, settings and journal index", r.status === 200 && r.json.checkins.some((c) => c.day === day && c.mood === 'tired') && r.json.recipes.some((x) => x.name === 'Bowl') && r.json.journal.some((j) => j.id === entryId) && r.json.account.email === 'test@soma.invalid', r.json && Object.keys(r.json));
    check('…and what the vault sealed, as the ciphertext it is, with linked services named but no token', r.status === 200 && r.json.reviews.some((x) => x.ciphertext === sealed2) && r.json.linked.some((l) => l.service === 'todoist') && r.json.linked.every((l) => Object.keys(l).join() === 'service,since'), r.json && r.json.linked);
    r = await as2('GET', '/account/export');
    check("member two's export has none of member one's rows", r.status === 200 && !r.json.checkins.some((c) => c.mood === 'tired') && !r.json.recipes.some((x) => x.name === 'Bowl') && !r.json.journal.some((j) => j.id === entryId) && r.json.reviews.length === 0 && r.json.account.email === 'test2@soma.invalid', r.json);

    await call('DELETE', '/reviews/2001-02-05');
    await call('DELETE', '/health-months/2001-03');
    await call('DELETE', '/links/todoist');
  }

  // Dayhub Ops is admin only, route by route, and the synthetic members can never be admins. Messages: a member writes
  // to the admin and reads their own thread, never another member's.
  console.log('Dayhub Ops and messages');
  {
    const as2 = (method, route, body) => call(method, route, body, { 'x-test-member': '2' });
    const other = '999000000000000002';
    const routes = [
      ['GET', '/ops/badges'], ['GET', '/ops/overview'], ['GET', '/ops/issues'], ['POST', '/ops/issues/fitbit:' + other + '/handled', { handled: true }],
      ['GET', '/ops/people'], ['GET', '/ops/people?q=test'], ['GET', '/ops/people/' + other], ['POST', '/ops/people/' + other + '/reveal', { reason: 'testing the door' }],
      ['POST', '/ops/people/' + other + '/messages', { body: 'hello' }], ['POST', '/ops/people/' + other + '/delete', { confirm: 'test2@soma.invalid', reason: 'testing the door' }],
      ['GET', '/ops/errors'], ['GET', '/ops/errors/sample?area=api&event=crash'], ['POST', '/ops/errors/state', { area: 'api', event: 'crash', action: 'mute' }],
      ['PUT', '/ops/alerts', { fresh: false }], ['GET', '/ops/support'], ['GET', '/ops/audit']
    ];
    let refused = 0;
    for (const [m, route, body] of routes) {
      r = await call(m, route, body);
      if (r.status === 403) refused++; else check(`a member cannot ${m} ${route}`, false, r.status + ' ' + r.text);
    }
    check(`every Ops route refuses a member (${routes.length})`, refused === routes.length);
    r = await as2('GET', '/ops/people/999000000000000001');
    check("member two cannot open member one's Ops page", r.status === 403, r.text);

    r = await call('POST', '/messages', { body: '   ' });
    check('an empty message is refused', r.status === 400, r.text);
    r = await call('POST', '/messages', { body: 'x'.repeat(2001) });
    check('a message over 2,000 characters is refused', r.status === 413, r.text);
    const words = 'Test message ' + Date.now();
    r = await call('POST', '/messages', { body: words });
    check('a member can write to the admin', r.status === 201 && r.json.body === words && r.json.sender === 'member', r.json);
    r = await call('GET', '/messages');
    check('…and sees it in their own thread', r.status === 200 && r.json.messages.some((m) => m.body === words && m.sender === 'member'), r.json);
    check('…with what they sent through the old feedback form in it too', r.status === 200 && r.json.messages.some((m) => m.feedback && m.body === 'test feedback'), r.json && r.json.messages.slice(-3));
    check('…and nothing unread from the admin', r.status === 200 && r.json.unread === 0, r.json && r.json.unread);
    r = await as2('GET', '/messages');
    check("member two does not see member one's messages", r.status === 200 && !r.json.messages.some((m) => m.body === words), r.json);
    r = await call('POST', '/messages/read');
    check('marking the thread read works', r.status === 200 && typeof r.json.read === 'number', r.json);
    r = await call('GET', '/account/export');
    check("the export carries the member's messages", r.status === 200 && Array.isArray(r.json.messages) && r.json.messages.some((m) => m.body === words && m.from === 'you'), r.json && r.json.messages);
    r = await call('GET', '/me?b=11-08.0000&i=1');
    check('/me takes the build and the home-screen flag without a fuss', r.status === 200 && r.json.profile.device === undefined, r.json);
  }

  // A third test member is filled with data, then deletes its account. soma_jobs does the deleting in the
  // background and removes the profile last, so a fresh profile on /me means everything else has gone.
  console.log('deleting an account');
  {
    const as3 = (method, route, body) => call(method, route, body, { 'x-test-member': '3' });
    r = await as3('GET', '/me');
    check('the third test member is someone else again', r.status === 200 && r.json.id === '999000000000000003' && r.json.profile.status === 'active', r.json);
    await as3('PUT', '/checkins/' + day, { mood: 'calm' });
    await as3('PUT', '/weight/' + day, { value: 170 });
    await as3('POST', '/recipes', { recipe: { name: 'Gone soon', kcal: 100 } });
    await as3('PUT', '/vault-meta', vault);
    const s3 = await as3('POST', '/sign', { kind: 'entries', method: 'PUT', names: ['doomed-entry-0001.enc'] });
    await fetch(s3.json.urls[0].url, { method: 'PUT', body: new Uint8Array([9, 9, 9, 9]), headers: { 'Content-Type': 'application/octet-stream', overwrite: 'true' } });
    await as3('PUT', '/entries/doomed-entry-0001', { createdMs: 981158400000, hasAudio: false });
    r = await as3('GET', '/account/export');
    check('before: their export has their day, weight, recipe and entry', r.status === 200 && r.json.checkins.length === 1 && r.json.weight[0].value === 170 && r.json.recipes[0].name === 'Gone soon' && r.json.journal[0].id === 'doomed-entry-0001', r.json);

    r = await as3('DELETE', '/account', {});
    check('deleting needs the word DELETE', r.status === 400, r.text);
    r = await as3('DELETE', '/account', { confirm: 'DELETE' });
    check('a deletion is accepted and goes to the background', r.status === 202 && r.json.deleting === true && r.json.queued === true, r.json);
    r = await as3('GET', '/checkins/' + day);
    check('…and from that moment the account can do nothing', r.status === 403 || r.status === 404, r.text);
    let fresh = false;
    for (let i = 0; i < 40 && !fresh; i++) {
      await new Promise((res) => setTimeout(res, 3000));
      r = await as3('GET', '/me');
      fresh = r.status === 200 && r.json.profile.status === 'active';
    }
    check('the deletion finishes within two minutes', fresh, r.json);
    r = await as3('GET', '/account/export');
    check('after: nothing of theirs is left in any table', r.status === 200 && r.json.checkins.length === 0 && r.json.weight.length === 0 && r.json.recipes.length === 0 && r.json.journal.length === 0 && Object.keys(r.json.settings).length === 0, r.json);
    r = await as3('GET', '/vault-meta');
    check('…the vault is gone too', r.status === 200 && r.json.exists === false, r.json);
    // Stratus deletes land a little after they are asked for: give the file a minute and a half to disappear.
    let fileGone = false;
    for (let i = 0; i < 18 && !fileGone; i++) {
      const g3 = await as3('POST', '/sign', { kind: 'entries', method: 'GET', names: ['doomed-entry-0001.enc'] });
      const got3 = await fetch(g3.json.urls[0].url);
      fileGone = got3.status === 404;
      if (!fileGone) await new Promise((res) => setTimeout(res, 5000));
    }
    check('…and so are their files', fileGone);
  }

  console.log('cleanup');
  r = await call('DELETE', '/recipes/' + recipeId);
  check('recipe deletes', r.status === 200, r.text);
  r = await call('DELETE', '/entries/' + entryId);
  check('entry deletes, with its audio object', r.status === 200 && r.json.deleted === true && r.json.objects.includes('audio'), r.json);
  for (const res of ['checkins', 'weight', 'activity', 'day-logs']) {
    await call('DELETE', `/${res}/${day}`);
    await call('DELETE', `/${res}/${day2}`);
  }
  // Local dev runs as this same member (see src/lib/catalyst.ts): leave it on default settings.
  r = await call('PUT', '/settings', { settings: {} });
  check('settings reset', r.status === 200, r.text);
  r = await call('GET', `/checkins?from=2001-01-01&to=2001-12-31`);
  check('test days are gone', r.status === 200 && r.json.days.length === 0, r.json);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.log(failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
