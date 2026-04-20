/**
 * Token Expiry Banner Component
 *
 * Displays a banner when platform tokens are expiring or expired.
 * Fetches notifications from the backend API and shows actionable alerts.
 */

import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getAccessToken } from '@/services/api/apiBase';

import { AlertTriangle, X, RefreshCw, Bell } from 'lucide-react';
import { PLATFORM_DISPLAY_NAMES } from '@/lib/platformNames';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
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
  const { user, isDemoMode } = useAuth();
  const location = useLocation();
  const [notifications, setNotifications] = useState<TokenNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

  const { data: platformStatus } = usePlatformStatus(user?.id);

  const searchParams = new URLSearchParams(location.search);
  const justConnected = searchParams.get('connected') === 'true';
  const connectedProvider = searchParams.get('provider');

  useEffect(() => {
    if (!user?.id || isDemoMode) return;

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
  }, [user?.id, isDemoMode, API_URL]);

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

    const status = platformStatus[n.platform.toLowerCase()];
    if (status && status.connected && !status.tokenExpired) {
      return false;
    }

    return true;
  });

  if (isDemoMode || visibleNotifications.length === 0) {
    return null;
  }

  const urgentNotification = visibleNotifications.find(n => n.type === 'token_expired')
    || visibleNotifications[0];

  const isExpired = urgentNotification.type === 'token_expired';
  const platformName = PLATFORM_DISPLAY_NAMES[urgentNotification.platform]
    || urgentNotification.platform.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div
      className={cn(
        "w-full px-4 py-3 flex items-center justify-between gap-4",
        className
      )}
      style={{
        backgroundColor: isExpired
          ? 'rgba(239, 68, 68, 0.08)'
          : 'rgba(201, 185, 154, 0.08)',
        borderBottom: isExpired
          ? '1px solid rgba(239, 68, 68, 0.2)'
          : '1px solid rgba(201, 185, 154, 0.2)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="p-2 rounded-full"
          style={{
            backgroundColor: isExpired
              ? 'rgba(239, 68, 68, 0.12)'
              : 'rgba(201, 185, 154, 0.12)',
          }}
        >
          {isExpired ? (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          ) : (
            <Bell className="w-4 h-4 text-amber-500" />
          )}
        </div>

        <div>
          <p
            className="font-medium text-sm"
            style={{ color: isExpired ? '#dc2626' : '#C9B99A' }}
          >
            {isExpired
              ? `${platformName} connection expired`
              : `${platformName} connection expiring soon`}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {urgentNotification.message}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => handleReconnect(urgentNotification.platform)}
          className="h-8 px-3 text-xs rounded-lg flex items-center gap-1.5 font-medium transition-opacity hover:opacity-90"
          style={{
            backgroundColor: isExpired ? '#dc2626' : '#C9B99A',
            color: 'var(--foreground)',
          }}
        >
          <RefreshCw className="w-3 h-3" />
          Reconnect
        </button>

        <button
          onClick={() => handleDismiss(urgentNotification.id)}
          className="h-8 w-8 p-0 flex items-center justify-center rounded-lg hover:bg-black/5 transition-colors"
          title="Dismiss"
          style={{ color: 'var(--text-secondary)' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {visibleNotifications.length > 1 && (
        <div className="absolute right-16 top-1/2 -translate-y-1/2">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            +{visibleNotifications.length - 1} more
          </span>
        </div>
      )}
    </div>
  );
};

export default TokenExpiryBanner;
