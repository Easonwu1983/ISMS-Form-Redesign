const CACHE_NAME = 'isms-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/styles.critical.min.css',
  '/app-core.bundle.min.js',
  '/units-core.json',
  '/favicon.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  // Only cache GET requests, skip API calls
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      // Network first, fallback to cache
      return fetch(event.request).then(function (response) {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, clone); });
        }
        return response;
      }).catch(function () {
        return cached || new Response('Offline', { status: 503 });
      });
    })
  );
});
