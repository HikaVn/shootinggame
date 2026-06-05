/* ASTRAL VANGUARD — service worker
 * Network-first so a freshly deployed build is always served when online; the
 * cache is only a fallback for offline. This fixes mobile browsers serving a
 * stale index.html (and therefore stale JS/CSS) after a new deploy.
 * The cache name is stamped with the build id at deploy time, so each release
 * gets a clean cache and old ones are purged on activate.
 */
const CACHE = 'av-__BUILD__';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) { const c = await caches.open(CACHE); c.put(req, fresh.clone()).catch(() => {}); }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw err;
    }
  })());
});
