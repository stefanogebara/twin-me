/**
 * React Hook for Service Worker Management
 * Registers and manages the Service Worker for background sync, push notifications, and offline support
 *
 * Usage:
 * const { registered, supported, registration, requestSync } = useServiceWorker();
 */

import { useState, useEffect, useCallback } from 'react';

interface UseServiceWorkerReturn {
  registered: boolean;
  supported: boolean;
  registration: ServiceWorkerRegistration | null;
  requestSync: (tag: string) => Promise<void>;
  requestNotificationPermission: () => Promise<NotificationPermission>;
  registerPeriodicSync: (tag: string, interval: number) => Promise<void>;
}

export function useServiceWorker(): UseServiceWorkerReturn {
  const [registered, setRegistered] = useState(false);
  const [supported, setSupported] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Check if Service Workers are supported
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      setSupported(true);
    }
  }, []);

  // Register Service Worker
  useEffect(() => {
    if (!supported) return;

    const registerServiceWorker = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/service-worker.js', {
          scope: '/',
        });

        setRegistration(reg);
        setRegistered(true);

        // Listen for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;

          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Optionally show user a notification to refresh
                // showUpdateNotification();
              }
            });
          }
        });

        // Listen for messages from Service Worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          // Handle different message types
          switch (event.data?.type) {
            case 'sync_complete':
              window.dispatchEvent(new CustomEvent('sw:sync_complete'));
              break;

            case 'extraction_complete':
              window.dispatchEvent(new CustomEvent('sw:extraction_complete'));
              break;

            case 'GET_USER_ID': {
              // Service Worker is requesting userId
              const userId = localStorage.getItem('userId');
              event.ports[0].postMessage({ userId });
              break;
            }

            default:
              break;
          }
        });

        // Check for existing service worker and activate immediately
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      } catch (error) {
        console.error('❌ Service Worker registration failed:', error);
        setRegistered(false);
      }
    };

    registerServiceWorker();
  }, [supported]);

  /**
   * Request background sync
   * Triggers a background sync that will run when connectivity is restored
   */
  const requestSync = useCallback(
    async (tag: string) => {
      if (!registration || !('sync' in registration)) {
        return;
      }

      try {
        await registration.sync.register(tag);
      } catch (error) {
        console.error(`❌ Background sync registration failed for ${tag}:`, error);
      }
    },
    [registration]
  );

  /**
   * Request notification permission
   * Required for push notifications
   */
  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      return 'denied' as NotificationPermission;
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (error) {
      console.error('❌ Notification permission request failed:', error);
      return 'denied' as NotificationPermission;
    }
  }, []);

  /**
   * Register periodic background sync (Chrome only)
   * Syncs data periodically even when app is closed
   */
  const registerPeriodicSync = useCallback(
    async (tag: string, interval: number) => {
      if (!registration || !('periodicSync' in registration)) {
        return;
      }

      try {
        const status = await navigator.permissions.query({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- non-standard permission name not in TS types
          name: 'periodic-background-sync' as any,
        });

        if (status.state === 'granted') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- periodicSync is non-standard API
          await (registration as any).periodicSync.register(tag, {
            minInterval: interval, // in milliseconds
          });
        }
      } catch (error) {
        console.error(`❌ Periodic sync registration failed for ${tag}:`, error);
      }
    },
    [registration]
  );

  return {
    registered,
    supported,
    registration,
    requestSync,
    requestNotificationPermission,
    registerPeriodicSync,
  };
}

/**
 * Example Usage:
 *
 * function App() {
 *   const { registered, requestSync, requestNotificationPermission, registerPeriodicSync } = useServiceWorker();
 *
 *   const handleConnectPlatform = async () => {
 *     // After connecting a platform, request background sync
 *     await requestSync('sync-platform-data');
 *   };
 *
 *   const handleEnableNotifications = async () => {
 *     const permission = await requestNotificationPermission();
 *
 *     if (permission === 'granted') {
 *       // Register periodic sync to check for updates every 30 minutes
 *       await registerPeriodicSync('sync-platforms', 30 * 60 * 1000);
 *     }
 *   };
 *
 *   // Listen for background sync completion
 *   useEffect(() => {
 *     const handleSyncComplete = () => {
 *       console.log('Background sync completed! Refreshing data...');
 *       // Refresh UI with new data
 *     };
 *
 *     window.addEventListener('sw:sync_complete', handleSyncComplete);
 *
 *     return () => {
 *       window.removeEventListener('sw:sync_complete', handleSyncComplete);
 *     };
 *   }, []);
 *
 *   return (
 *     <div>
 *       <div>Service Worker: {registered ? '✅ Active' : '❌ Not registered'}</div>
 *       <button onClick={handleEnableNotifications}>Enable Notifications</button>
 *     </div>
 *   );
 * }
 */
