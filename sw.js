// SafeGuard UA — Service Worker (Offline Cache v1)
const CACHE_NAME = 'safeguard-ua-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './ukraine_regions.geojson',
  './ukraine_rayony.geojson',
  './ukraine_hromady.geojson',
  './alerts_snapshot.json'
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

  // API та динамічні запити завжди пускаємо через мережу з фолбеком
  if (url.pathname.includes('/api/') || url.hostname.includes('workers.dev') || url.hostname.includes('alerts.in.ua')) {
    return;
  }

  // Для статичних ресурсів та GeoJSON: Cache First -> Network Fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const respClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, respClone));
        }
        return response;
      });
    }).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
