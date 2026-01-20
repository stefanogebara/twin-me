import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
import { useTheme } from '@/contexts/ThemeContext';

// MVP Platform SVG logos only
const SpotifyLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#1DB954">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const CalendarLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="#4285F4" d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
  </svg>
);

const WhoopLogo = () => (
  <svg viewBox="0 0 1332 999" className="w-5 h-5" fill="#00A7E1">
    <path d="m969.3 804.3l-129.4-426.3h-118.7l189.2 620.8h117.8l303.7-998h-118.7zm-851.3-803.5h-117.9l188.4 620.7h118.6zm488.6 0l-302.8 997.9h117.8l303.7-997.9z"/>
  </svg>
);

interface PlatformStatus {
  connected: boolean;
  isActive: boolean;
  tokenExpired: boolean;
  lastSync?: string;
  status?: string;
  error?: string;
}

interface DataVerificationProps {
  userId: string;
  connectedServices: string[];
}

// MVP Platforms Only: Spotify, Google Calendar, Whoop
const platformConfig: Record<string, {
  name: string;
  icon: React.ReactNode;
  color: string;
}> = {
  spotify: {
    name: 'Spotify',
    icon: <SpotifyLogo />,
    color: '#1DB954'
  },
  google_calendar: {
    name: 'Google Calendar',
    icon: <CalendarLogo />,
    color: '#4285F4'
  },
  whoop: {
    name: 'Whoop',
    icon: <WhoopLogo />,
    color: '#00A7E1'
  }
};

export const DataVerification: React.FC<DataVerificationProps> = ({ userId, connectedServices }) => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [refreshingPlatform, setRefreshingPlatform] = useState<string | null>(null);

  const {
    data: platformStatuses,
    refetch: refetchPlatformStatus,
    isLoading: platformStatusLoading
  } = usePlatformStatus(userId, {
    enableRealtime: true,
    refetchInterval: 60000
  });

  const fetchVerificationData = async () => {
    setLoading(true);
    setError(null);

    try {
      await refetchPlatformStatus();
      setLastRefreshTime(new Date());
    } catch (err) {
      console.error('Error fetching verification data:', err);
      setError(err instanceof Error ? err.message : 'Failed to verify data access');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connectedServices.length > 0) {
      fetchVerificationData();
    }
  }, [connectedServices]);

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const handleReconnect = async (platform: string) => {
    setRefreshingPlatform(platform);
    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${baseUrl}/connectors/connect/${platform}?userId=${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to initiate reconnection: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success && result.data?.authUrl) {
        sessionStorage.setItem('reconnecting_platform', platform);
        window.location.href = result.data.authUrl;
      } else if (result.success && result.message === 'Token refreshed successfully') {
        await refetchPlatformStatus();
        setLastRefreshTime(new Date());
      } else {
        throw new Error(result.error || 'Failed to reconnect');
      }
    } catch (error) {
      console.error(`Error reconnecting ${platform}:`, error);
      setError(`Failed to reconnect ${platform}. Please try again.`);
    } finally {
      setRefreshingPlatform(null);
    }
  };

  const renderPlatformCard = (platform: string) => {
    const config = platformConfig[platform];
    if (!config) return null;

    const status = platformStatuses[platform];
    if (!status || (!status.connected && !status.tokenExpired)) return null;

    const needsReconnection = status.tokenExpired || status.status === 'token_expired' || status.status === 'encryption_key_mismatch';

    return (
      <div
        key={platform}
        className="p-4 rounded-xl transition-all hover:scale-[1.01]"
        style={{
          backgroundColor: theme === 'dark'
            ? 'rgba(45, 45, 41, 0.5)'
            : 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(10px)',
          border: '1px solid',
          borderColor: theme === 'dark'
            ? 'rgba(193, 192, 182, 0.1)'
            : 'rgba(0, 0, 0, 0.06)',
          boxShadow: theme === 'dark'
            ? '0 2px 8px rgba(0, 0, 0, 0.2)'
            : '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)'
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8">
              {config.icon}
            </div>
            <div>
              <h4
                className="text-sm font-medium"
                style={{
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
                  fontFamily: 'var(--font-ui)'
                }}
              >
                {config.name}
              </h4>
              {status.lastSync && (
                <p className="text-xs mt-0.5" style={{
                  color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
                }}>
                  {formatDate(status.lastSync)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {needsReconnection ? (
              <>
                <Clock className="w-4 h-4 flex-shrink-0" style={{ color: '#DC2626' }} />
                <button
                  onClick={() => handleReconnect(platform)}
                  disabled={refreshingPlatform === platform}
                  className="px-2 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                  style={{
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-ui)'
                  }}
                >
                  {refreshingPlatform === platform ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    'Reconnect'
                  )}
                </button>
              </>
            ) : (
              <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#059669' }} />
            )}
          </div>
        </div>
      </div>
    );
  };

  // Count only MVP platforms that are connected AND have valid (non-expired) tokens
  const MVP_PLATFORMS = Object.keys(platformConfig);
  const connectedCount = MVP_PLATFORMS.filter(p =>
    platformStatuses[p]?.connected && !platformStatuses[p]?.tokenExpired
  ).length;

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center justify-between">
        <h3
          className="text-base font-medium"
          style={{
            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
            fontFamily: 'var(--font-heading)'
          }}
        >
          Platform Status
        </h3>
        <button
          onClick={fetchVerificationData}
          disabled={loading}
          className="p-2 rounded-lg transition-all hover:opacity-80 disabled:opacity-50"
          style={{
            backgroundColor: theme === 'dark'
              ? 'rgba(193, 192, 182, 0.1)'
              : 'rgba(0, 0, 0, 0.05)',
            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
          }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !platformStatuses && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" style={{
            color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
          }} />
        </div>
      )}

      {error && (
        <div
          className="p-3 rounded-lg flex items-center gap-2"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderColor: 'rgba(239, 68, 68, 0.3)'
          }}
        >
          <AlertTriangle className="w-4 h-4" style={{ color: '#EF4444' }} />
          <span className="text-sm" style={{ color: '#DC2626' }}>{error}</span>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.keys(platformConfig).map(platform => renderPlatformCard(platform))}
          </div>

          {connectedCount > 0 && (
            <div
              className="p-3 rounded-lg"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}
            >
              <span className="text-sm" style={{ color: '#059669', fontWeight: 500 }}>
                {connectedCount} platform{connectedCount !== 1 ? 's' : ''} connected successfully
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};