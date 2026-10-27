// SafeGuard UA — Service Worker (Live Network First v3)
const CACHE_NAME = 'safeguard-ua-v3';

// Кешуємо тільки важкі статичні полігони карти
const STATIC_GEOJSON = [
  './ukraine_regions.geojson',
  './ukraine_rayony.geojson',
  './ukraine_hromady.geojson',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_GEOJSON);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Видаляємо всі старі кеші (v1, v2)
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

  // 1. Всі запити до API та сторонніх доменів віддаємо напряму без кешу
  if (
    url.hostname !== self.location.hostname ||
    url.pathname.includes('/api/') ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('alerts.in.ua') ||
    url.hostname.includes('usgs.gov')
  ) {
    return;
  }

  // 2. ДЛЯ САМОГО index.html ТА КОРЕНЯ: NETWORK FIRST (Завжди свіжа версія з мережі)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname === '/' || url.pathname.endsWith('/safeguard-ua/')) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        return networkResponse;
      }).catch(() => {
        // Тільки якщо повний офлайн — віддаємо кеш
        return caches.match('./index.html');
      })
    );
    return;
  }

  // 3. Для важких GeoJSON-файлів: Cache First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const respClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, respClone));
        }
        return networkResponse;
      });
    })
  );
});
