/**
 * Legacy service worker — NEUTRALIZED (2026-06-16).
 *
 * This file used to run a CACHE-FIRST strategy over the app shell ('/',
 * '/index.html') with clients.claim(). That pinned returning users to an old
 * build: it kept serving the cached index.html (and its old hashed JS) forever,
 * so deploys never reached them. It is registered NOWHERE in the app now, but
 * it still lingers + controls in browsers that visited an older version.
 *
 * This kill-switch version caches nothing and removes itself. Browsers that
 * still have it registered fetch this on their next update check (SW scripts
 * are revalidated against the network, bypassing the HTTP cache), activate it,
 * purge every cache, unregister, and reload their tabs — so users finally come
 * back from the network on the current build. See src/services/swCleanup.ts for
 * the in-app counterpart that handles anyone who reaches the new bundle.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clientList = await self.clients.matchAll({ type: 'window' });
      for (const client of clientList) {
        try {
          client.navigate(client.url);
        } catch (_) {
          // Some browsers block SW-initiated navigation — best-effort.
        }
      }
    } catch (_) {
      // Never let cleanup throw out of activate.
    }
  })());
});

// Deliberately NO fetch handler — nothing is ever served from cache again.
