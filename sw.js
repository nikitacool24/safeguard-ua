// SafeGuard UA — Service Worker (Live Network First v5)
const CACHE_NAME = 'safeguard-ua-v5';

// Кешуємо тільки важкі статичні полігони карти та іконки PWA
const PRECACHE_ASSETS = [
  './ukraine_regions.geojson',
  './ukraine_rayony.geojson',
  './ukraine_hromady.geojson',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Leaflet з CDN: без цього збій CDN або пошкоджений HTTP-кеш ламають усю карту
const CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];
const CDN_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // allSettled: відсутність одного файлу не зриває встановлення всього SW
      .then((cache) => Promise.allSettled(
        PRECACHE_ASSETS.concat(CDN_ASSETS).map((url) => cache.add(url))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Видаляємо всі старі кеші (v1–v4)
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

  // 1. Leaflet з CDN — cache-first. Ключ без query, щоб працював ?v=... із bootstrap.
  if (CDN_HOSTS.includes(url.hostname) && /\/leaflet(\.min)?\.(js|css)$/.test(url.pathname)) {
    const key = url.origin + url.pathname;
    event.respondWith(
      caches.match(key).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
            const respClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(key, respClone)).catch(() => {});
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 2. Всі запити до API та інших сторонніх доменів віддаємо напряму без кешу
  if (
    url.hostname !== self.location.hostname ||
    url.pathname.includes('/api/') ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('alerts.in.ua') ||
    url.hostname.includes('usgs.gov')
  ) {
    return;
  }

  // 3. ДЛЯ САМОГО index.html ТА КОРЕНЯ: NETWORK FIRST (завжди свіжа версія)
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

  // 4. Для важких GeoJSON та іконок: Cache First
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
