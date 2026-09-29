/**
 * NAWI-ReportPro Service Worker
 * Conforms to OIML R-76 & Indian Legal Metrology Field Operations
 * Provides offline caching, network-first SPA fallback, and resilient queue support.
 */

const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `nawi-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `nawi-runtime-${CACHE_VERSION}`;
const IMAGE_CACHE = `nawi-images-${CACHE_VERSION}`;

// Precache essential application shell assets
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

/**
 * Service Worker Installation
 */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // Pre-cache individual items resiliently
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          fetch(url, { cache: 'no-cache' })
            .then((response) => {
              if (response.ok) {
                return cache.put(url, response);
              }
              return Promise.resolve();
            })
            .catch(() => Promise.resolve())
        )
      );
    })
  );
});

/**
 * Service Worker Activation & Cache Cleanup
 */
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!currentCaches.includes(cacheName)) {
              return caches.delete(cacheName);
            }
            return Promise.resolve();
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

/**
 * Fetch Event Handler
 * Implements intelligent caching strategies:
 * - HTML / SPA Navigation: Network-first with Cache/Shell Fallback
 * - Static Assets (JS/CSS/Fonts): Cache-first with Stale-While-Revalidate
 * - API Requests: Network-first or Network-only (Mutations bypass cache)
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip unsupported schemes (e.g. chrome-extension, data:)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // 1. Never cache mutating API requests (POST, PUT, DELETE, PATCH)
  if (request.method !== 'GET') {
    return;
  }

  // 2. Handle API GET requests (Network-first with short runtime cache)
  if (url.pathname.startsWith('/api/')) {
    // Only cache read-only reference data (e.g. instruments list), do not cache dynamic sessions
    if (url.pathname.startsWith('/api/instruments') || url.pathname.startsWith('/api/auth/me')) {
      event.respondWith(
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(async () => {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response(
              JSON.stringify({
                success: false,
                offline: true,
                message: 'Network offline. Using offline cached data.',
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          })
      );
      return;
    }
    return; // Pass through remaining GET API calls
  }

  // 3. Handle SPA HTML Navigation (Network-first with index.html fallback)
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // Check if the specific page is cached, else return root app shell /index.html
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;

          const shell = await caches.match('/index.html') || await caches.match('/');
          if (shell) return shell;

          return new Response('Offline - NAWI-ReportPro App Shell unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' },
          });
        })
    );
    return;
  }

  // 4. Handle Static Assets (JS, CSS, Web Fonts, Images, Icons)
  const isStaticAsset =
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.jsx') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.ttf') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.includes('/assets/');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Stale-While-Revalidate in background
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(STATIC_CACHE).then((cache) => {
                  cache.put(request, networkResponse);
                });
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            return new Response('', { status: 408, statusText: 'Request Timeout' });
          });
      })
    );
  }
});

/**
 * Message Handler for Inter-Process Communication
 */
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }

  if (event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      return Promise.all(names.map((n) => caches.delete(n)));
    }).then(() => {
      event.ports[0]?.postMessage({ success: true });
    });
  }
});

/**
 * Background Sync Handler (for browsers supporting SyncManager)
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'nawi-sync-queue') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'TRIGGER_OFFLINE_SYNC' });
        });
      })
    );
  }
});
