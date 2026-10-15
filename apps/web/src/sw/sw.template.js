// Service worker template (D-250). vite.config.ts fills in the version and the precache list below and writes dist/sw.js.
// - Precache: the app shell, so the game opens offline. A new build has a new cache name; the old one is deleted on activate.
// - A new worker waits for every tab to close before it takes over (no skipWaiting), so an open page never loses its
//   lazily loaded chunks (the difficulty worker) to a cache swap.
// - seeds.json: network first, last good copy as the fallback. Card art: cache first, filled as cards are seen.
const VERSION = '__VERSION__';
const SHELL = `vd-shell-${VERSION}`;
const RUNTIME = 'vd-runtime';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('vd-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (request.mode === 'navigate') {
    event.respondWith(caches.match(new URL('./', self.location.href).href, { cacheName: SHELL }).then((hit) => hit || fetch(request)));
  } else if (path.endsWith('/seeds.json')) {
    event.respondWith(networkFirst(request));
  } else if (path.includes('/art/')) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(caches.match(request, { cacheName: SHELL }).then((hit) => hit || fetch(request)));
  }
});
