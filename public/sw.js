// Soma service worker. Two jobs: cache-first for Next's hashed build assets, and showing the evening nudge.
//
// Slate serves every response with `cache-control: no-store` (the alternative it offers is a one-year max-age
// on everything, HTML included, which would strand users on an old index.html; see catalyst/SPIKE.md). no-store
// is right for HTML and wrong for /_next/static/*, whose file names change whenever their content does. Without
// this worker a phone would re-download all the JS, CSS and fonts on every open.
//
// Everything else (pages, the API, Stratus, the Catalyst SDK) is never touched here, so this file cannot serve a
// stale page or interfere with sign-in. There is no offline mode.

const CACHE = 'soma-static-v1';
const MAX_ENTRIES = 160;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/_next/static/')) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(event.request);
    if (hit) return hit;
    const res = await fetch(event.request);
    if (res.ok) {
      await cache.put(event.request, res.clone());
      // Old builds' files pile up; keys() is insertion-ordered, so the front of the list is the oldest.
      const keys = await cache.keys();
      if (keys.length > MAX_ENTRIES) await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((k) => cache.delete(k)));
    }
    return res;
  }));
});

// ── Notifications (catalyst/functions/soma_jobs/nudge.js): the evening nudge, the week in review, tomorrow's brief.
// iOS requires every push to show a notification, so a payload that cannot be read still shows something sensible.
// Each kind has its own tag, so tomorrow's brief never replaces the evening nudge.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* not JSON */ }
  const tag = typeof data.tag === 'string' && /^soma-[a-z]+$/.test(data.tag) ? data.tag : 'soma-nudge';
  event.waitUntil(self.registration.showNotification(data.title || 'Soma', {
    body: data.body || 'Your day is still open.', icon: '/icon-192.png', badge: '/icon-192.png', tag, data: { url: data.url || '/' }
  }));
});

// A tap opens the notification's page. When Soma is already open it is brought forward and asked to go there itself
// (NudgeKeeper listens), so it switches without a reload; before, it was only brought forward, wherever it was.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const asked = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  const target = asked.origin === self.location.origin ? asked : new URL('/', self.location.origin);
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (tabs) => {
    const open = tabs.find((t) => new URL(t.url).origin === self.location.origin);
    if (!open) return self.clients.openWindow(target.href);
    const shown = (await open.focus().catch(() => null)) || open;
    if (new URL(shown.url).pathname !== target.pathname) shown.postMessage({ type: 'soma:open', path: target.pathname });
  }));
});
