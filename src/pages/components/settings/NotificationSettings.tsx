import React, { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, Mail } from 'lucide-react';
import { API_URL, getAccessToken } from '@/services/api/apiBase';
import { Switch } from '@/components/ui/switch';
import { Row } from '@/components/register';


const getAuthHeaders = () => {
  const token = getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

interface NotificationSettingsProps {
  userId: string;
}

const PUSH_SUPPORTED = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

/** Two rows of the page kit: render inside a List. */
const NotificationSettings: React.FC<NotificationSettingsProps> = ({ userId }) => {
  // Email notification state
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Push notification state
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(true);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    PUSH_SUPPORTED ? Notification.permission : 'denied'
  );

  // ── Fetch email preference on mount ──────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setEmailLoading(false);
      setPushLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_URL}/users/preferences`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setEmailEnabled(!data.email_digest_unsubscribed);
        }
      } catch {
        // Non-fatal: default to enabled
      } finally {
        setEmailLoading(false);
      }
    })();
  }, [userId]);

  // ── Fetch push subscription status on mount ──────────────────────────
  useEffect(() => {
    if (!PUSH_SUPPORTED) {
      setPushLoading(false);
      return;
    }

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        setPushEnabled(!!existing);
      } catch {
        // Non-fatal
      } finally {
        setPushLoading(false);
      }
    })();
  }, []);

  // ── Email toggle handler ─────────────────────────────────────────────
  const handleEmailToggle = useCallback(async (enabled: boolean) => {
    setEmailError(null);
    const previous = emailEnabled;
    setEmailEnabled(enabled);

    try {
      const res = await fetch(`${API_URL}/users/preferences`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ email_digest_unsubscribed: !enabled }),
      });

      if (!res.ok) {
        throw new Error('Failed to update preference');
      }
    } catch {
      setEmailEnabled(previous);
      setEmailError('Could not update email preference');
    }
  }, [emailEnabled]);

  // ── Push toggle handler ──────────────────────────────────────────────
  const handlePushToggle = useCallback(async (enabled: boolean) => {
    if (!PUSH_SUPPORTED) return;
    setPushError(null);

    if (enabled) {
      try {
        // Request permission if needed
        if (Notification.permission === 'default') {
          const result = await Notification.requestPermission();
          setPushPermission(result);
          if (result !== 'granted') {
            setPushError('Notifications are blocked. Allow them in your browser settings.');
            return;
          }
        }

        if (Notification.permission !== 'granted') {
          setPushPermission(Notification.permission);
          setPushError('Notifications are blocked. Allow them in your browser settings.');
          return;
        }

        // Register service worker and subscribe
        const reg = await navigator.serviceWorker.ready;

        // Get VAPID key
        const vapidRes = await fetch(`${API_URL}/web-push/vapid-key`);
        if (!vapidRes.ok) {
          setPushError('Could not enable push notifications. Please try again.');
          return;
        }
        const { publicKey } = await vapidRes.json();
        if (!publicKey) {
          setPushError('Could not enable push notifications. Please try again.');
          return;
        }

        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        // Send to backend — only mark enabled after the server confirms
        const subscribeRes = await fetch(`${API_URL}/web-push/subscribe`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });

        if (!subscribeRes.ok) {
          setPushError('Could not save your push subscription. Please try again.');
          return;
        }

        setPushEnabled(true);
      } catch {
        // Permission denied or subscription failed
        setPushError('Could not enable push notifications. Please try again.');
      }
    } else {
      try {
        const reg = await navigator.serviceWorker.ready;
        const subscription = await reg.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();
          await fetch(`${API_URL}/web-push/unsubscribe`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ endpoint }),
          });
        }
        setPushEnabled(false);
      } catch {
        // Non-fatal
      }
    }
  }, []);

  const pushLine = !PUSH_SUPPORTED
    ? 'Not supported in this browser'
    : pushPermission === 'denied'
      ? 'Blocked. Allow it in your browser settings.'
      : 'Insights as they happen, in this browser';

  return (
    <>
      <Row
        icon={<Mail />}
        title="Email"
        line={emailError ? <span className="rs-bad">{emailError}</span> : 'When your twin notices something important'}
        action={
          <Switch
            checked={emailEnabled}
            onCheckedChange={handleEmailToggle}
            disabled={emailLoading}
            aria-label="Email notifications"
          />
        }
      />
      <Row
        icon={pushEnabled ? <Bell /> : <BellOff />}
        title="Browser"
        line={pushError ? <span className="rs-bad">{pushError}</span> : pushLine}
        action={
          <Switch
            checked={pushEnabled}
            onCheckedChange={handlePushToggle}
            disabled={pushLoading || !PUSH_SUPPORTED || pushPermission === 'denied'}
            aria-label="Browser notifications"
          />
        }
      />
    </>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────

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

export default NotificationSettings;
