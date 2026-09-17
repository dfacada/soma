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
  r = await call('PUT', '/activity/' + day, { pushups: 100, types: { walk: 30 } });
  check('activity saves', r.status === 200 && r.json.pushups === 100 && r.json.types.walk === 30, r.json);
  r = await call('PUT', '/activity/' + day, { pushups: 12.5 });
  check('fractional pushups is 400', r.status === 400, r.text);
  r = await call('PUT', '/day-logs/' + day, { meals: { breakfast: true }, extras: [{ name: 'Apple 🍎', kcal: 95 }] });
  check('day-log saves', r.status === 200 && r.json.meals.breakfast === true && r.json.extras[0].kcal === 95, r.json);

  console.log('vault and entries');
  const vault = { salt: 'c2FsdHNhbHRzYWx0c2FsdA==', verifierIv: 'aXZpdml2aXZpdml2', verifierCt: 'Y2lwaGVydGV4dA==' };
  await call('PUT', '/vault-meta', Object.assign({ replace: true }, vault));
  r = await call('GET', '/vault-meta');
  check('vault-meta round-trips', r.status === 200 && r.json.salt === vault.salt && r.json.verifierCt === vault.verifierCt, r.json);
  r = await call('PUT', '/vault-meta', vault);
  check('second vault without replace is 409', r.status === 409, r.text);
  r = await call('PUT', '/vault-meta', Object.assign({}, vault, { salt: 'not base64!' }));
  check('non-base64 salt is 400', r.status === 400, r.text);

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
  r = await call('POST', '/sign', { bucket: 'soma-drafts', method: 'PUT', keys: ['999000000000000001/test.bin'] });
  check('signs a key under own prefix', r.status === 200 && /^https:\/\//.test(r.json.urls[0].url), r.json);
  r = await call('POST', '/sign', { bucket: 'soma-drafts', method: 'GET', keys: ['120218000000022011/spike-25mb.bin'] });
  check("refuses another user's prefix", r.status === 403, r.text);
  r = await call('POST', '/sign', { bucket: 'soma-drafts', keys: ['999000000000000001/../120218000000022011/x'] });
  check('refuses path traversal', r.status === 403, r.text);

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

  console.log('cleanup');
  r = await call('DELETE', '/recipes/' + recipeId);
  check('recipe deletes', r.status === 200, r.text);
  r = await call('DELETE', '/entries/' + entryId);
  check('entry deletes', r.status === 200 && r.json.deleted === true, r.json);
  for (const res of ['checkins', 'weight', 'activity', 'day-logs']) {
    await call('DELETE', `/${res}/${day}`);
    await call('DELETE', `/${res}/${day2}`);
  }
  r = await call('GET', `/checkins?from=2001-01-01&to=2001-12-31`);
  check('test days are gone', r.status === 200 && r.json.days.length === 0, r.json);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.log(failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
