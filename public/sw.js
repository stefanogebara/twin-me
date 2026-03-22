/**
 * Service Worker — Web Push Notifications for TwinMe
 * Receives push events and displays native browser notifications.
 */

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};

  const title = data.title || 'TwinMe';
  const options = {
    body: data.body || 'Your twin has something for you',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: data.tag || 'twinme-notification',
    data: {
      url: data.url || '/dashboard',
      insightId: data.insightId,
      category: data.category,
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const path = event.notification.data?.url || '/dashboard';
  // Build full URL from service worker's origin
  const fullUrl = new URL(path, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if open
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin)) {
          return client.focus().then((focused) => {
            // Navigate via postMessage since client.navigate() isn't universal
            focused.postMessage({ type: 'NOTIFICATION_CLICK', url: path });
            return focused;
          });
        }
      }
      // No existing tab — open new one
      return clients.openWindow(fullUrl);
    })
  );
});
