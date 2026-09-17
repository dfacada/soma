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
    check('a member cannot create a round', r.status === 403, r.text);
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
    check('board maps activity rows to day numbers', r.status === 200 && mine && mine[3] === 100 && r.json.members[0].displayName === 'Test User' && r.json.members[0].dailyTarget === 60, r.json);
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
  r = await call('POST', '/sign', { bucket: 'soma-drafts', method: 'PUT', keys: ['999000000000000001/test.bin'] });
  check('signs a key under own prefix', r.status === 200 && /^https:\/\//.test(r.json.urls[0].url), r.json);
  r = await call('POST', '/sign', { bucket: 'soma-drafts', method: 'GET', keys: ['120218000000022011/spike-25mb.bin'] });
  check("refuses another user's prefix", r.status === 403, r.text);
  r = await call('POST', '/sign', { bucket: 'soma-drafts', keys: ['999000000000000001/../120218000000022011/x'] });
  check('refuses path traversal', r.status === 403, r.text);

  console.log('jobs');
  r = await call('POST', '/jobs', { type: 'mine-bitcoin', entryId: 'test-entry-0001', source: 'tx-test-entry-0001.webm' });
  check('unknown job type is 400', r.status === 400, r.text);
  r = await call('POST', '/jobs', { type: 'transcribe', entryId: 'test-entry-0001', source: '../../etc/passwd' });
  check('a source that is not a tx- file is 400', r.status === 400, r.text);
  r = await call('POST', '/sign', { kind: 'drafts', method: 'PUT', names: ['tx-test-entry-0001.webm'] });
  await fetch(r.json.urls[0].url, { method: 'PUT', body: new Uint8Array(2048), headers: { 'Content-Type': 'application/octet-stream' } });
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
  r = await call('POST', '/sign', { kind: 'drafts', method: 'GET', names: ['tx-test-entry-0001.webm'] });
  // Stratus deletes are scheduled, so the object can still exist for a minute: what matters is that it was blanked.
  const gone = await fetch(r.json.urls[0].url);
  const left = gone.status === 404 ? 0 : (await gone.arrayBuffer()).byteLength;
  check('the plaintext audio is unreadable the moment the job ends', left <= 1, { status: gone.status, bytes: left });
  r = await call('GET', '/jobs/120218000000022006');
  check("someone else's job is 404", r.status === 404, r.text);
  r = await call('DELETE', '/jobs/' + jobId);
  check('job deletes', r.status === 200, r.text);

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
  r = await call('POST', '/google-health/auth-url', { redirectUri: 'https://soma-onkasary.onslate.com/settings/', state: 'short' });
  check('auth-url refuses a weak state', r.status === 400, r.text);
  r = await call('POST', '/google-health/auth-url', { redirectUri: 'https://soma-onkasary.onslate.com/settings/', state });
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
