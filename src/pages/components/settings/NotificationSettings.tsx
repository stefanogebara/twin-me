import React, { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, Mail, Moon, AlertCircle } from 'lucide-react';
import { getAccessToken } from '@/services/api/apiBase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

const getAuthHeaders = () => {
  const token = getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

interface NotificationSettingsProps {
  userId: string;
}

const PUSH_SUPPORTED = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

const NotificationSettings: React.FC<NotificationSettingsProps> = ({ userId }) => {
  // Email notification state
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Push notification state
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(true);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    PUSH_SUPPORTED ? Notification.permission : 'denied'
  );

  // ── Fetch email preference on mount ──────────────────────────────────
  useEffect(() => {
    if (!userId) return;

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

    if (enabled) {
      try {
        // Request permission if needed
        if (Notification.permission === 'default') {
          const result = await Notification.requestPermission();
          setPushPermission(result);
          if (result !== 'granted') return;
        }

        if (Notification.permission !== 'granted') {
          setPushPermission(Notification.permission);
          return;
        }

        // Register service worker and subscribe
        const reg = await navigator.serviceWorker.ready;

        // Get VAPID key
        const vapidRes = await fetch(`${API_URL}/web-push/vapid-key`);
        if (!vapidRes.ok) return;
        const { publicKey } = await vapidRes.json();
        if (!publicKey) return;

        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        // Send to backend
        await fetch(`${API_URL}/web-push/subscribe`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });

        setPushEnabled(true);
      } catch {
        // Permission denied or subscription failed
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

  return (
    <div>
      {/* ── Email Notifications ── */}
      <SettingRow
        icon={<Mail className="w-4 h-4" style={{ color: 'var(--accent-vibrant)' }} />}
        label="Email Notifications"
        description="Get notified when your twin notices something important"
        error={emailError}
      >
        <ToggleSwitch
          enabled={emailEnabled}
          onChange={handleEmailToggle}
          disabled={emailLoading}
          label="Toggle email notifications"
        />
      </SettingRow>

      {/* ── Push Notifications ── */}
      <SettingRow
        icon={
          pushEnabled
            ? <Bell className="w-4 h-4" style={{ color: 'var(--accent-vibrant)' }} />
            : <BellOff className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
        }
        label="Push Notifications"
        description={
          !PUSH_SUPPORTED
            ? 'Not supported in this browser'
            : pushPermission === 'denied'
              ? 'Blocked by browser — enable in browser settings'
              : 'Browser notifications for real-time insights'
        }
      >
        <ToggleSwitch
          enabled={pushEnabled}
          onChange={handlePushToggle}
          disabled={pushLoading || !PUSH_SUPPORTED || pushPermission === 'denied'}
          label="Toggle push notifications"
        />
      </SettingRow>

      {/* ── Quiet Hours ── */}
      <SettingRow
        icon={<Moon className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />}
        label="Quiet Hours"
        description="No notifications between 11 PM and 8 AM"
        isLast
      >
        <span
          className="text-[12px] px-2.5 py-1 rounded-full"
          style={{
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          Always on
        </span>
      </SettingRow>
    </div>
  );
};

// ── Sub-components ───────────────────────────────────────────────────────

interface SettingRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  error?: string | null;
  isLast?: boolean;
  children: React.ReactNode;
}

const SettingRow: React.FC<SettingRowProps> = ({ icon, label, description, error, isLast, children }) => (
  <div
    className="flex items-center justify-between py-4"
    style={{ borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)' }}
  >
    <div className="flex items-center gap-3 min-w-0">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <span className="text-sm block" style={{ color: 'var(--foreground)' }}>
          {label}
        </span>
        <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {description}
        </p>
        {error && (
          <p className="flex items-center gap-1 text-[11px] mt-1" style={{ color: '#ef4444' }}>
            <AlertCircle className="w-3 h-3" />
            {error}
          </p>
        )}
      </div>
    </div>
    <div className="flex-shrink-0 ml-4">
      {children}
    </div>
  </div>
);

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  label?: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ enabled, onChange, disabled, label }) => (
  <button
    role="switch"
    aria-checked={enabled}
    aria-label={label}
    onClick={() => !disabled && onChange(!enabled)}
    className="relative w-10 h-5 rounded-full transition-colors duration-200 ease-out active:scale-95"
    style={{
      backgroundColor: enabled ? 'var(--accent-vibrant)' : 'var(--glass-surface-border)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    }}
  >
    <div
      className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 ease-out"
      style={{ left: enabled ? '22px' : '2px' }}
    />
  </button>
);

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
