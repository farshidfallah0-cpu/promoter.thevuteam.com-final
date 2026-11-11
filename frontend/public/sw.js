// Minimal service worker.
//
// index.html has always registered '/sw.js', but this file never existed —
// every load silently 404'd on the registration. A registered service worker
// with a fetch handler is part of Chrome/Android's install criteria, so without
// one the browser falls back to a plain bookmark shortcut (blank/generic icon,
// no standalone window) instead of a real installed PWA using the manifest icon.
//
// Bump CACHE_VERSION any time the icon files change — that changes this file's
// bytes, which is what makes the browser detect an update, install the new SW,
// and (via 'activate' below) throw away the old cache instead of quietly
// keeping stale icons around forever.
const CACHE_VERSION = 'vu-pwa-v9';
const PRECACHE_URLS = [
  // Promoter app (also used by the admin manifest — both apps share this artwork)
  '/manifest.json',
  '/images/icon-192x192.png',
  '/images/icon-512x512.png',
  '/images/icon-192x192-maskable.png',
  '/images/icon-512x512-maskable.png',
  // Admin Dashboard app
  '/manifest-admin.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => {
        // Fetch fresh copies without relying on browser cache
        return cache.addAll(
          PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' }))
        );
      })
      .catch((err) => console.error('SW precache error:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// Cache-first for the precached manifest/icons
self.addEventListener('fetch', (event) => {
  // Only handle GET requests — skip POST/PUT/DELETE (API calls) entirely
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip cross-origin requests (API calls to backend)
  if (url.origin !== self.location.origin) {
    return; // Will default to browser's normal fetch
  }

  // Check if this request is for one of our precached assets (ignoring query strings like ?v=1)
  if (PRECACHE_URLS.some((p) => url.pathname === p)) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cached) => {
        return cached || fetch(event.request);
      }).catch(() => {
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      })
    );
    return;
  }

  // Network-first for everything else; fall back gracefully on error
  event.respondWith(
    fetch(event.request).catch(() => {
      // If network fails, try cache as fallback
      return caches.match(event.request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        // If nothing matches, we must return a Response object to avoid crashing the fetch handler
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});
