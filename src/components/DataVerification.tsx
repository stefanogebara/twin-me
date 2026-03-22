import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
import { getAccessToken } from '@/services/api/apiBase';

// Platform SVG logos
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

const LinkedInLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#0A66C2">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const YoutubeLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#FF0000">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const DiscordLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#5865F2">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const RedditLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#FF4500">
    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
  </svg>
);

const GithubLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

const GmailLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#EA4335">
    <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
  </svg>
);

const WhoopLogo = () => (
  <svg viewBox="3 13 40 22" className="w-5 h-5" fill="none" stroke="#44A5CA" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16.47,26.68l-3.7097,-11.047" />
    <path d="M18.38,32.368l5.6196,-16.735" />
    <path d="M25.91,21.32l3.7097,11.047,5.6196,-16.735" />
  </svg>
);

const TwitchLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#9146FF">
    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
  </svg>
);

const OutlookLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#0078D4">
    <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.33.58-.52.36-.2.87-.2t.86.2q.35.21.57.55.22.34.33.75.09.42.09.83zm-1.98-4.26V3.2l5.5 1v15.6l-5.5 1V7.78zm10.2.6V3.77l3.6-.67V15.3l-3.6-.67V8.38z"/>
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

// All supported platforms
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
  linkedin: {
    name: 'LinkedIn',
    icon: <LinkedInLogo />,
    color: '#0A66C2'
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
  reddit: {
    name: 'Reddit',
    icon: <RedditLogo />,
    color: '#FF4500'
  },
  github: {
    name: 'GitHub',
    icon: <GithubLogo />,
    color: 'var(--foreground)'
  },
  google_gmail: {
    name: 'Gmail',
    icon: <GmailLogo />,
    color: '#EA4335'
  },
  gmail: {
    name: 'Gmail',
    icon: <GmailLogo />,
    color: '#EA4335'
  },
  whoop: {
    name: 'Whoop',
    icon: <WhoopLogo />,
    color: '#44A5CA'
  },
  twitch: {
    name: 'Twitch',
    icon: <TwitchLogo />,
    color: '#9146FF'
  },
  outlook: {
    name: 'Outlook',
    icon: <OutlookLogo />,
    color: '#0078D4'
  }
};

export const DataVerification: React.FC<DataVerificationProps> = ({ userId, connectedServices }) => {
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
          'Authorization': `Bearer ${getAccessToken() || localStorage.getItem('auth_token')}`
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
          background: 'rgba(255, 255, 255, 0.06)',
          backdropFilter: 'blur(10px) saturate(140%)',
          WebkitBackdropFilter: 'blur(10px) saturate(140%)',
          border: '1px solid rgba(255, 255, 255, 0.10)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
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
                  color: 'var(--foreground)',
                  fontFamily: 'var(--font-ui)'
                }}
              >
                {config.name}
              </h4>
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

  // Count all platforms that are connected AND have valid (non-expired) tokens
  const connectedCount = Object.keys(platformStatuses).filter(p =>
    platformStatuses[p]?.connected && !platformStatuses[p]?.tokenExpired
  ).length;

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center justify-between">
        <h3
          className="text-base font-medium"
          style={{
            color: 'var(--foreground)',
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
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            color: 'var(--foreground)'
          }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !platformStatuses && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" style={{
            color: 'var(--text-secondary)'
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
