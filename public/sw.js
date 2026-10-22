/* Cache immutable Vite assets only. Never cache private photos, API responses or user data. */
const ASSET_CACHE = 'rentdesk-assets-v3';
const SHELL_CACHE = 'rentdesk-navigation-v3';
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('rentdesk-') && ![ASSET_CACHE,SHELL_CACHE].includes(k)).map(k => caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => {
      if (res.ok && res.type === 'basic' && res.headers.get('content-type')?.includes('text/html')) event.waitUntil(caches.open(SHELL_CACHE).then(c => c.put('/index.html', res.clone())));
      return res;
    }).catch(async () => (await caches.match('/index.html')) || Response.error()));
    return;
  }
  if (!/^\/assets\/.+\.(?:js|css|svg|png|webp|woff2?)$/.test(url.pathname)) return;
  event.respondWith(caches.open(ASSET_CACHE).then(async cache => {
    const cached = await cache.match(req);
    if (cached) return cached;
    const response = await fetch(req);
    if (response.ok && response.type === 'basic') event.waitUntil((async () => {
      await cache.put(req, response.clone());
      const keys = await cache.keys();
      if (keys.length > 100) await Promise.all(keys.slice(0, keys.length - 100).map(key => cache.delete(key)));
    })());
    return response;
  }));
});
