import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
import { useTheme } from '@/contexts/ThemeContext';

// Platform SVG logos as components
const SpotifyLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#1DB954">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const YoutubeLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#FF0000">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const DiscordLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#5865F2">
    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
  </svg>
);

const GithubLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

const LinkedInLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#0077B5">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const SlackLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/>
    <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.527 2.527 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/>
    <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"/>
    <path fill="#ECB22E" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
  </svg>
);

const GmailLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
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

const OuraLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#D4AF37">
    <circle cx="12" cy="12" r="10" fill="none" stroke="#D4AF37" strokeWidth="2.5"/>
    <circle cx="12" cy="12" r="5" fill="none" stroke="#D4AF37" strokeWidth="2"/>
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
  youtube: {
    name: 'YouTube',
    icon: <YoutubeLogo />,
    color: '#FF0000'
  },
  discord: {
    name: 'Discord',
    icon: <DiscordLogo />,
    color: '#5865F2'
  },
  github: {
    name: 'GitHub',
    icon: <GithubLogo />,
    color: '#333333'
  },
  linkedin: {
    name: 'LinkedIn',
    icon: <LinkedInLogo />,
    color: '#0077B5'
  },
  slack: {
    name: 'Slack',
    icon: <SlackLogo />,
    color: '#4A154B'
  },
  google_gmail: {
    name: 'Gmail',
    icon: <GmailLogo />,
    color: '#EA4335'
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
  },
  oura: {
    name: 'Oura',
    icon: <OuraLogo />,
    color: '#D4AF37'
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

  // Count only platforms that are connected AND have valid (non-expired) tokens
  const connectedCount = Object.keys(platformStatuses).filter(p =>
    platformStatuses[p].connected && !platformStatuses[p].tokenExpired
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