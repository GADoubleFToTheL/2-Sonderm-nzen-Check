// Network-first: online gibt es immer die neueste App und Münzliste,
// offline wird auf den zuletzt gespeicherten Stand zurückgegriffen.
const CACHE = 'euro2-v12';
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'data/coins.json', 'data/credits.json', 'data/numista.json', 'data/details.json',
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Münzbilder ändern sich praktisch nie: erst aus dem Speicher, im Hintergrund aktualisieren.
  if (new URL(req.url).pathname.includes('/img/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const refresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => undefined);
      if (hit) { event.waitUntil(refresh); return hit; }
      return (await refresh) || Response.error();
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const fallback = async () =>
      (await cache.match(req, { ignoreSearch: true })) ||
      (req.mode === 'navigate' ? await cache.match('index.html') : undefined) ||
      Response.error();
    try {
      const res = await Promise.race([
        fetch(req),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
      ]);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return fallback();
    }
  })());
});
