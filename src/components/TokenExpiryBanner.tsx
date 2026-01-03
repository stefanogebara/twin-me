/**
 * Token Expiry Banner Component
 *
 * Displays a banner when platform tokens are expiring or expired.
 * Fetches notifications from the backend API and shows actionable alerts.
 */

import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, X, RefreshCw, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  // Get real-time platform connection status
  const { data: platformStatus } = usePlatformStatus(user?.id);

  // Check if we just completed a connection (URL has ?connected=true)
  const searchParams = new URLSearchParams(location.search);
  const justConnected = searchParams.get('connected') === 'true';
  const connectedProvider = searchParams.get('provider');

  // Fetch notifications on mount and after successful connections
  useEffect(() => {
    if (!user?.id || isDemoMode) return;

    const fetchNotifications = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `${API_URL}/notifications/unread?userId=${encodeURIComponent(user.id)}`
        );
        const data = await response.json();

        if (data.success && data.notifications) {
          // Filter for token-related notifications only
          const tokenNotifications = data.notifications.filter(
            (n: TokenNotification) =>
              n.type === 'token_expiring' || n.type === 'token_expired'
          );
          setNotifications(tokenNotifications);
        }
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotifications();

    // Poll every 5 minutes
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id, isDemoMode, API_URL]);

  // Dismiss a notification
  const handleDismiss = async (notificationId: string) => {
    setDismissedIds(prev => new Set([...prev, notificationId]));

    try {
      await fetch(`${API_URL}/notifications/${notificationId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id })
      });
    } catch (error) {
      console.error('Failed to dismiss notification:', error);
    }
  };

  // Handle reconnect action
  const handleReconnect = (platform: string) => {
    if (onReconnect) {
      onReconnect(platform);
    } else {
      // Default: navigate to get-started page
      window.location.href = '/get-started';
    }
  };

  // Filter out dismissed notifications AND notifications for platforms that are now connected
  const visibleNotifications = notifications.filter(n => {
    // Skip if dismissed
    if (dismissedIds.has(n.id)) return false;

    // Skip if we just connected this platform via URL params
    if (justConnected && connectedProvider?.toLowerCase() === n.platform.toLowerCase()) {
      return false;
    }

    // Skip if platform status shows it's connected and NOT expired
    const status = platformStatus[n.platform.toLowerCase()];
    if (status && status.connected && !status.tokenExpired) {
      return false;
    }

    return true;
  });

  // Don't render if no notifications or in demo mode
  if (isDemoMode || visibleNotifications.length === 0) {
    return null;
  }

  // Get the most urgent notification to display
  const urgentNotification = visibleNotifications.find(n => n.type === 'token_expired')
    || visibleNotifications[0];

  const isExpired = urgentNotification.type === 'token_expired';
  const platformName = urgentNotification.platform.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div
      className={cn(
        "w-full px-4 py-3 flex items-center justify-between gap-4",
        isExpired
          ? "bg-red-500/10 border-b border-red-500/20"
          : "bg-yellow-500/10 border-b border-yellow-500/20",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "p-2 rounded-full",
          isExpired ? "bg-red-500/20" : "bg-yellow-500/20"
        )}>
          {isExpired ? (
            <AlertTriangle className={cn("w-4 h-4", isExpired ? "text-red-500" : "text-yellow-500")} />
          ) : (
            <Bell className="w-4 h-4 text-yellow-500" />
          )}
        </div>

        <div>
          <p className={cn(
            "font-medium text-sm",
            isExpired ? "text-red-600" : "text-yellow-600"
          )}>
            {isExpired
              ? `${platformName} connection expired`
              : `${platformName} connection expiring soon`}
          </p>
          <p className="text-xs text-gray-500">
            {urgentNotification.message}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => handleReconnect(urgentNotification.platform)}
          size="sm"
          className={cn(
            "h-8 px-3 text-xs",
            isExpired
              ? "bg-red-500 hover:bg-red-600 text-white"
              : "bg-yellow-500 hover:bg-yellow-600 text-white"
          )}
        >
          <RefreshCw className="w-3 h-3 mr-1.5" />
          Reconnect
        </Button>

        <Button
          onClick={() => handleDismiss(urgentNotification.id)}
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Badge for multiple notifications */}
      {visibleNotifications.length > 1 && (
        <div className="absolute right-16 top-1/2 -translate-y-1/2">
          <span className="text-xs text-gray-500">
            +{visibleNotifications.length - 1} more
          </span>
        </div>
      )}
    </div>
  );
};

export default TokenExpiryBanner;
