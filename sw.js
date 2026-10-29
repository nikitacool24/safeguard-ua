// SafeGuard UA — Service Worker (Live Network First v4)
const CACHE_NAME = 'safeguard-ua-v4';

// Кешуємо тільки важкі статичні полігони карти та іконки PWA
const PRECACHE_ASSETS = [
  './ukraine_regions.geojson',
  './ukraine_rayony.geojson',
  './ukraine_hromady.geojson',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // allSettled: відсутність одного файлу не зриває встановлення всього SW
      .then((cache) => Promise.allSettled(PRECACHE_ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Видаляємо всі старі кеші (v1–v3)
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

  // 2. ДЛЯ САМОГО index.html ТА КОРЕНЯ: NETWORK FIRST (завжди свіжа версія)
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

  // 3. Для важких GeoJSON та іконок: Cache First
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
