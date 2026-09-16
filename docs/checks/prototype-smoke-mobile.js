// Runs the prototype script under a tiny fake DOM and drives it through taps.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const script = src.match(/<script>([\s\S]*?)<\/script>\s*$/)[1];

const handlers = {};
const els = {};
function el(id) { return els[id] || (els[id] = { id, innerHTML: '', scrollTop: 0, textContent: '', value: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, querySelector() { return null; }, previousElementSibling: { querySelector() { return null; } } }); }
const store = {};
global.window = global; global.addEventListener = () => {}; global.matchMedia = () => ({ matches: false });
global.document = {
  getElementById: el,
  addEventListener(type, fn) { handlers[type] = fn; }
};
global.localStorage = { getItem: (k) => store[k] === undefined ? null : store[k], setItem: (k, v) => { store[k] = v; } };
global.confirm = () => true;
global.setInterval = () => 0; global.clearInterval = () => {}; global.setTimeout = (fn) => { fn(); return 0; }; global.clearTimeout = () => {};

new Function(script)();

function click(a, x) {
  const target = { closest: (sel) => sel === '[data-a]' ? { dataset: { a, x } } : null };
  handlers.click({ target });
}
const html = () => el('app').innerHTML;
const must = (cond, msg) => { if (!cond) { console.log('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); };

must(html().indexOf('to go') > 0 && html().indexOf('of the day') > 0 && html().indexOf('in a row') > 0, 'Today renders with progress ring and streak');
click('mood', 'Focused'); must(html().indexOf('Feeling focused') > 0, 'mood check-in');
click('meal', 'dinner'); must(html().indexOf('all four eaten') > 0, 'dinner tap completes food');
click('push-open'); must(el('sheet').innerHTML.indexOf('Push-ups today') > 0, 'push-up sheet opens');
el('push-inp').value = '40'; click('push-save'); must(/40 of \d+ push-ups/.test(html()), 'partial push-up count saved');
click('push-open'); click('push-target'); must(/\d+ push-ups, target hit/.test(html()), 'hit-the-target sets count to the day target');
click('act', 'gym'); must(html().indexOf('3 of 4 logged') > 0, 'activity counts any of the four');
click('rec'); click('rec'); must(html().indexOf('Recorded') > 0, 'record toggles to recorded');
must(html().indexOf('Day closed') > 0 && html().indexOf('4/4') > 0 && html().indexOf('10</span> <span class="muted">full days in a row') > 0, 'day closes at 4/4 and streak becomes 10');
click('tab', 'journal'); must(html().indexOf('Journal') > 0 && html().indexOf('Today ·') > 0, 'Journal renders with today group');
click('tab', 'food'); must(html().indexOf('Swap meal') > 0, 'Food renders');
click('swap', 'dinner'); must(el('sheet').innerHTML.indexOf('Swap dinner') > 0, 'swap sheet opens');
click('swap-pick', '10'); must(html().indexOf('Steak') > 0, 'swap applied');
el('extra-inp').value = 'a slice of birthday cake'; click('add-extra'); must(html().indexOf('birthday cake') > 0, 'extra added');
el('w-inp').value = '181.9'; click('weight'); must(html().indexOf('181.9 lb') > 0, 'weight logged');
click('tab', 'activity'); must(html().indexOf('Leaderboard') > 0 && html().indexOf('targets hit') > 0, 'Activity renders');
click('tab', 'insights'); must(html().indexOf('Mood by sleep') > 0, 'Insights renders');
click('range', '90'); must(html().indexOf('Last 90 days') > 0, 'insights range');
click('tab', 'settings'); must(html().indexOf('Prototype controls') > 0 && html().indexOf('Waiting for approval') > 0, 'Settings + admin render');
click('approve', '0'); must(html().indexOf('afacada23') < 0, 'approve removes pending');
click('day', '1'); click('tab', 'today'); must(html().indexOf('Fresh day') > 0 && html().indexOf('rest day for push-ups') > 0, 'next day (42, a rest day) opens fresh with rest-day copy');
must(html().indexOf('10</span> <span class="muted">full days in a row') > 0, 'streak still 10 the morning after (yesterday was full)');
must(html().indexOf('Best <span class="m">19</span>') > 0, 'best streak shown');
click('tab', 'settings'); click('reset'); click('tab', 'today'); must(html().indexOf('to go') > 0 && html().indexOf('9</span> <span class="muted">full days in a row') > 0, 'reset works, seed streak is 9');
console.log('done');
