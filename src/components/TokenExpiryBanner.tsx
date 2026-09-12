/**
 * Token Expiry Banner Component
 *
 * Displays a banner when platform tokens are expiring or expired.
 * Fetches notifications from the backend API and shows actionable alerts.
 */

import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { API_URL, getAccessToken } from '@/services/api/apiBase';

import { AlertTriangle, X, RefreshCw, Bell } from 'lucide-react';
import { PLATFORM_DISPLAY_NAMES } from '@/lib/platformNames';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformsSummary, isConnected, needsReconnect } from '@/hooks/usePlatformsSummary';
import { cn } from '@/lib/utils';

interface TokenNotification {
  id: string;
  type: 'token_expiring' | 'token_expired';
  title: string;
  message: string;
  platform: string;
  priority: 'high' | 'medium' | 'low';
  action_url: string;
  metadata?: {
    days_until_expiry?: number;
    connection_id?: string;
  };
}

interface TokenExpiryBannerProps {
  className?: string;
  onReconnect?: (platform: string) => void;
}

export const TokenExpiryBanner: React.FC<TokenExpiryBannerProps> = ({
  className,
  onReconnect
}) => {
  const { user } = useAuth();
  const location = useLocation();
  const [notifications, setNotifications] = useState<TokenNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const { data: platformsSummary } = usePlatformsSummary();

  const searchParams = new URLSearchParams(location.search);
  const justConnected = searchParams.get('connected') === 'true';
  const connectedProvider = searchParams.get('provider');

  useEffect(() => {
    if (!user?.id) return;

    const fetchNotifications = async () => {
      setIsLoading(true);
      try {
        const token = getAccessToken();
        const response = await fetch(
          `${API_URL}/notifications/unread?userId=${encodeURIComponent(user.id)}`,
          {
            headers: {
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
          }
        );
        if (!response.ok) return;
        const data = await response.json();

        if (data.success && data.notifications) {
          const tokenNotifications = data.notifications.filter(
            (n: TokenNotification) =>
              n.type === 'token_expiring' || n.type === 'token_expired'
          );
          setNotifications(tokenNotifications);
        }
      } catch {
        // Silently ignore — notifications are non-critical
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotifications();

    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const handleDismiss = async (notificationId: string) => {
    setDismissedIds(prev => new Set([...prev, notificationId]));

    try {
      await fetch(`${API_URL}/notifications/${notificationId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id })
      });
    } catch {
      // Silently ignore — dismiss is best-effort
    }
  };

  const handleReconnect = (platform: string) => {
    if (onReconnect) {
      onReconnect(platform);
    } else {
      window.location.href = '/get-started';
    }
  };

  const visibleNotifications = notifications.filter(n => {
    if (dismissedIds.has(n.id)) return false;

    if (justConnected && connectedProvider?.toLowerCase() === n.platform.toLowerCase()) {
      return false;
    }

    // Suppress when the platform is connected and not in genuine auth failure
    // (state === 'expired') — canonical batch-3 semantics; 'stale' never
    // resurrects an expiry notification.
    const platformId = n.platform.toLowerCase();
    if (isConnected(platformsSummary, platformId) && !needsReconnect(platformsSummary, platformId)) {
      return false;
    }

    return true;
  });

  if (visibleNotifications.length === 0) {
    return null;
  }

  const urgentNotification = visibleNotifications.find(n => n.type === 'token_expired')
    || visibleNotifications[0];

  const isExpired = urgentNotification.type === 'token_expired';
  const platformName = PLATFORM_DISPLAY_NAMES[urgentNotification.platform]
    || urgentNotification.platform.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  // A row on the page under a hairline, in the register: colour only in state.
  // The icon carries the state (danger red, or ember for "expiring"); the title
  // is danger text only when it has expired (5.5:1), ink otherwise. Reconnect is
  // the danger control (white, pink line, red text) when expired, the secondary
  // when not. Never a red fill.
  return (
    <div
      className={cn(
        "w-full px-4 py-3 flex items-center justify-between gap-4",
        className
      )}
      style={{
        backgroundColor: 'var(--rg-page)',
        borderBottom: '1px solid var(--rg-rule)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-8 h-8 flex-shrink-0 grid place-items-center"
          style={{ backgroundColor: 'var(--rg-field)', borderRadius: 'var(--rg-radius-icon)' }}
        >
          {isExpired ? (
            <AlertTriangle className="w-4 h-4 text-[var(--rg-danger)]" aria-hidden="true" />
          ) : (
            <Bell className="w-4 h-4 text-[var(--rg-ember)]" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0">
          <p
            className="font-medium text-[13px] leading-5"
            style={{ color: isExpired ? 'var(--rg-danger)' : 'var(--rg-ink)' }}
          >
            {isExpired
              ? `${platformName} connection expired`
              : `${platformName} connection expiring soon`}
          </p>
          <p className="text-[13px] font-[350] truncate" style={{ color: 'var(--rg-ink-2)' }}>
            {urgentNotification.message}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => handleReconnect(urgentNotification.platform)}
          className="h-8 px-4 text-[13px] flex items-center gap-1.5 transition-colors"
          style={{
            backgroundColor: 'var(--rg-white)',
            border: `1px solid ${isExpired ? 'var(--rg-danger-line)' : 'var(--rg-rule)'}`,
            borderRadius: 'var(--rg-radius)',
            color: isExpired ? 'var(--rg-danger)' : 'var(--rg-ink)',
          }}
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          Reconnect
        </button>

        <button
          onClick={() => handleDismiss(urgentNotification.id)}
          className="h-8 w-8 p-0 flex items-center justify-center hover:bg-[var(--rg-hover)] transition-colors"
          title="Dismiss"
          aria-label="Dismiss"
          style={{ color: 'var(--rg-ink-2)', borderRadius: 'var(--rg-radius)' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {visibleNotifications.length > 1 && (
        <div className="absolute right-16 top-1/2 -translate-y-1/2">
          <span className="text-[13px] font-[350]" style={{ color: 'var(--rg-ink-3)' }}>
            +{visibleNotifications.length - 1} more
          </span>
        </div>
      )}
    </div>
  );
};

export default TokenExpiryBanner;
