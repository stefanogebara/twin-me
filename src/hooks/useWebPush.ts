/**
 * useWebPush — Register service worker + subscribe to web push notifications.
 * Call once in App.tsx after auth. Handles permission prompt, subscription,
 * and sending the subscription to the backend.
 */

import { useEffect, useState } from 'react';
import { getAccessToken, isDemoMode } from '@/services/api/apiBase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

function getAuthHeaders() {
  const token = getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export function useWebPush(isAuthenticated: boolean) {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [subscribed, setSubscribed] = useState(false);

  // Listen for notification click messages from service worker
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICK' && event.data.url) {
        window.location.href = event.data.url;
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (isDemoMode()) return; // No push registration in demo mode
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (permission === 'denied') return;

    // Already subscribed this session
    if (subscribed) return;

    (async () => {
      try {
        // Register service worker
        const reg = await navigator.serviceWorker.register('/sw.js');

        // Check if already subscribed
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          // Send to backend (idempotent upsert)
          await sendSubscriptionToBackend(existing);
          setSubscribed(true);
          return;
        }

        // If permission is default, request it
        if (Notification.permission === 'default') {
          const result = await Notification.requestPermission();
          setPermission(result);
          if (result !== 'granted') return;
        }

        if (Notification.permission !== 'granted') return;

        // Get VAPID public key from backend
        const vapidRes = await fetch(`${API_URL}/web-push/vapid-key`);
        if (!vapidRes.ok) return; // VAPID keys not configured — skip silently
        const { publicKey } = await vapidRes.json();
        if (!publicKey) return;

        // Subscribe
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        // Send subscription to backend
        await sendSubscriptionToBackend(subscription);
        setSubscribed(true);
      } catch (err) {
        console.warn('Web push setup failed (non-fatal):', err);
      }
    })();
  }, [isAuthenticated, permission, subscribed]);

  return { permission, subscribed };
}

async function sendSubscriptionToBackend(subscription: PushSubscription) {
  await fetch(`${API_URL}/web-push/subscribe`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
