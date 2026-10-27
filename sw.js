// SafeGuard UA — Service Worker (Offline Cache v2)
const CACHE_NAME = 'safeguard-ua-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './ukraine_regions.geojson',
  './ukraine_rayony.geojson',
  './ukraine_hromady.geojson'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ПОЛНА ІЗОЛЯЦІЯ: Service Worker НЕ перехоплює жодні API-запити та сторонні проксі
  if (
    url.hostname !== self.location.hostname ||
    url.pathname.includes('/api/') ||
    url.pathname.includes('active.json') ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('allorigins') ||
    url.hostname.includes('corsproxy') ||
    url.hostname.includes('usgs.gov')
  ) {
    return; // Віддаємо браузеру напряму без втручання Service Worker
  }

  // Кешуємо тільки локальні статичні файли (GeoJSON, HTML, manifest)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const respClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, respClone));
        }
        return networkResponse;
      });
    }).catch((err) => {
      return new Response('Офлайн режим SafeGuard UA', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })
  );
});
