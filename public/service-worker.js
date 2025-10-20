/**
 * Service Worker for Soul Signature Platform
 * Enables background sync, push notifications, and offline functionality
 *
 * Features:
 * - Background sync for platform data when connectivity restores
 * - Push notifications for real-time updates
 * - Offline support with cache-first strategy
 * - Periodic background sync (when supported)
 */

const CACHE_NAME = 'soul-signature-v1';
const API_URL = 'http://localhost:3001'; // Change to production URL in prod

// Files to cache for offline functionality
const STATIC_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
];

/**
 * Install Event - Cache static assets
 */
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Service Worker: Caching static assets');
      return cache.addAll(STATIC_CACHE);
    })
  );

  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

/**
 * Activate Event - Clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker: Activating...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log(`🗑️  Service Worker: Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  // Take control of all pages immediately
  return self.clients.claim();
});

/**
 * Fetch Event - Network-first strategy for API, cache-first for assets
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests - Network-first with fallback to cache
  if (url.origin === API_URL || url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone response to cache it
          const responseClone = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });

          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(request);
        })
    );
  }
  // Static assets - Cache-first strategy
  else {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        return (
          cachedResponse ||
          fetch(request).then((response) => {
            // Cache new assets
            return caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, response.clone());
              return response;
            });
          })
        );
      })
    );
  }
});

/**
 * Background Sync - Sync data when connectivity is restored
 */
self.addEventListener('sync', (event) => {
  console.log('🔄 Service Worker: Background sync triggered:', event.tag);

  if (event.tag === 'sync-platform-data') {
    event.waitUntil(syncPlatformData());
  }

  if (event.tag === 'sync-extraction') {
    event.waitUntil(syncExtraction());
  }
});

/**
 * Sync platform data in background
 */
async function syncPlatformData() {
  try {
    console.log('📡 Service Worker: Syncing platform data...');

    // Get userId from IndexedDB or localStorage
    const userId = await getUserId();

    if (!userId) {
      console.warn('⚠️  Service Worker: No userId found, skipping sync');
      return;
    }

    // Trigger platform sync
    const response = await fetch(`${API_URL}/api/platforms/sync-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    if (response.ok) {
      console.log('✅ Service Worker: Platform data synced successfully');

      // Notify all open tabs
      await notifyClients({
        type: 'sync_complete',
        message: 'Platform data synced in background',
      });
    } else {
      console.error('❌ Service Worker: Sync failed:', response.statusText);
    }
  } catch (error) {
    console.error('❌ Service Worker: Sync error:', error);
  }
}

/**
 * Sync extraction results in background
 */
async function syncExtraction() {
  try {
    console.log('📊 Service Worker: Syncing extraction data...');

    const userId = await getUserId();

    if (!userId) {
      console.warn('⚠️  Service Worker: No userId found, skipping extraction sync');
      return;
    }

    const response = await fetch(`${API_URL}/api/soul-data/extract-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    if (response.ok) {
      console.log('✅ Service Worker: Extraction synced successfully');

      await notifyClients({
        type: 'extraction_complete',
        message: 'Soul data extracted in background',
      });
    }
  } catch (error) {
    console.error('❌ Service Worker: Extraction sync error:', error);
  }
}

/**
 * Push Notification - Handle incoming push messages
 */
self.addEventListener('push', (event) => {
  console.log('📬 Service Worker: Push notification received');

  let data = { title: 'Soul Signature', body: 'New update available' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (error) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || data.message,
    icon: '/icon-192x192.png',
    badge: '/icon-96x96.png',
    data: data,
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

/**
 * Notification Click - Handle notification clicks
 */
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Service Worker: Notification clicked');

  event.notification.close();

  // Open or focus the app
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (let client of clientList) {
          if (client.url.includes('/soul-signature') && 'focus' in client) {
            return client.focus();
          }
        }

        // No window open, open a new one
        if (clients.openWindow) {
          return clients.openWindow('/soul-signature');
        }
      })
  );
});

/**
 * Periodic Background Sync (Chrome only, requires permission)
 * Syncs platform data periodically even when app is closed
 */
self.addEventListener('periodicsync', (event) => {
  console.log('⏰ Service Worker: Periodic sync triggered:', event.tag);

  if (event.tag === 'sync-platforms') {
    event.waitUntil(syncPlatformData());
  }
});

/**
 * Helper: Get userId from storage
 */
async function getUserId() {
  try {
    // Try to get from clients (open tabs)
    const clientList = await clients.matchAll({ type: 'window' });

    for (let client of clientList) {
      const response = await sendMessageToClient(client, { type: 'GET_USER_ID' });
      if (response && response.userId) {
        return response.userId;
      }
    }

    // Fallback: try IndexedDB or cache
    // Note: Service Workers can't access localStorage directly
    return null;
  } catch (error) {
    console.error('❌ Service Worker: Error getting userId:', error);
    return null;
  }
}

/**
 * Helper: Send message to client (open tab)
 */
function sendMessageToClient(client, message) {
  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();

    messageChannel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    client.postMessage(message, [messageChannel.port2]);
  });
}

/**
 * Helper: Notify all clients (open tabs)
 */
async function notifyClients(message) {
  const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });

  clientList.forEach((client) => {
    client.postMessage(message);
  });
}

/**
 * Message Handler - Handle messages from clients
 */
self.addEventListener('message', (event) => {
  console.log('📨 Service Worker: Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_USER_ID') {
    // Respond with userId if we have it cached
    event.ports[0].postMessage({ userId: null });
  }

  if (event.data && event.data.type === 'SYNC_NOW') {
    // Trigger immediate sync
    syncPlatformData();
  }
});

console.log('🚀 Service Worker: Loaded and ready');
