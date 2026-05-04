/* eslint-disable no-restricted-globals */

/**
 * ModuLearn service worker.
 *
 * Strategy:
 *   - App shell (HTML/JS/CSS): network-first, fall back to cache.
 *     Means a learner who opens the app offline gets the last-loaded
 *     shell instead of a browser error page.
 *   - Lesson media (Supabase Storage `lesson-media` bucket + simulation
 *     assets): cache-first. Once an image has been downloaded over WiFi,
 *     it's served from cache forever (until the SW is replaced).
 *   - API calls (Supabase REST + Edge Functions + Modal): NEVER cached.
 *     Always go to the network. Offline writes are queued by the
 *     frontend's writeQueue (services/writeQueue.js), not by the SW.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE   = `modulearn-shell-${CACHE_VERSION}`;
const ASSET_CACHE   = `modulearn-assets-${CACHE_VERSION}`;

// Files we want available even on first cold-cache offline visit.
const SHELL_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/images/logo.png',
];

// Hostname patterns that should NEVER be cached (network-only).
const NETWORK_ONLY = [
  /\.supabase\.co\/auth\//,         // auth endpoints
  /\.supabase\.co\/rest\//,         // PostgREST data
  /\.supabase\.co\/functions\/v1\//, // Edge Functions
  /\.modal\.run/,                   // Modal pyBKT
  /\.modal\.com/,
];

// Hostname patterns that should be cache-first (durable assets).
const ASSET_HOSTS = [
  /\.supabase\.co\/storage\/v1\/object\/public\//,  // Supabase Storage
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_PRECACHE))
  );
  // Activate immediately on install — don't wait for tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.endsWith(`-${CACHE_VERSION}`))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;       // queueing of writes is app-side

  const url = new URL(request.url);

  // Always network-only for live API calls.
  if (NETWORK_ONLY.some((re) => re.test(url.href))) return;

  // Cache-first for durable assets (Supabase Storage public URLs).
  if (ASSET_HOSTS.some((re) => re.test(url.href))) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch {
          // Offline + uncached asset → return a tiny SVG placeholder so
          // the page still renders something instead of a broken image.
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="100%" height="100%" fill="#e5e7eb"/><text x="50%" y="50%" font-family="sans-serif" font-size="11" fill="#6b7280" text-anchor="middle" dominant-baseline="middle">offline</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
      })
    );
    return;
  }

  // Same-origin app shell + bundle: network-first, fall back to cache.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful HTML/CSS/JS responses for next offline visit.
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
  }
});
