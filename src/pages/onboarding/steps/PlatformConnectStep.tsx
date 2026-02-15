import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ArrowRight, Loader2, ExternalLink } from 'lucide-react';
import { useAnalytics } from '@/contexts/AnalyticsContext';

interface PlatformConnectStepProps {
  userId: string;
  userName?: string;
  onComplete: (connectedPlatforms: string[]) => void;
  onSkip: () => void;
}

interface PlatformCard {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: React.ReactNode;
  category: 'entertainment' | 'arctic' | 'google';
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const SpotifyIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
  </svg>
);

const YouTubeIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const WhoopIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 1332 999" fill="currentColor">
    <path d="m969.3 804.3l-129.4-426.3h-118.7l189.2 620.8h117.8l303.7-998h-118.7zm-851.3-803.5h-117.9l188.4 620.7h118.6zm488.6 0l-302.8 997.9h117.8l303.7-997.9z"/>
  </svg>
);

const PLATFORMS: PlatformCard[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Discover your musical soul',
    color: '#1DB954',
    icon: <SpotifyIcon />,
    category: 'entertainment',
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    description: 'Understand your rhythms',
    color: '#4285F4',
    icon: <CalendarIcon />,
    category: 'google',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Map your curiosity profile',
    color: '#FF0000',
    icon: <YouTubeIcon />,
    category: 'entertainment',
  },
  {
    id: 'whoop',
    name: 'Whoop',
    description: 'Read your body\'s story',
    color: '#00B388',
    icon: <WhoopIcon />,
    category: 'arctic',
  },
];

export const PlatformConnectStep: React.FC<PlatformConnectStepProps> = ({
  userId,
  userName,
  onComplete,
  onSkip,
}) => {
  const { trackFunnel } = useAnalytics();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState<string[]>([]);
  const [consented, setConsented] = useState<Record<string, boolean>>({});
  const [platformInsights, setPlatformInsights] = useState<Record<string, string>>({});

  const handleConnect = useCallback(async (platform: PlatformCard) => {
    if (connecting || connected.includes(platform.id)) return;
    if (!consented[platform.id]) return;

    setConnecting(platform.id);
    try {
      // Record consent before initiating platform connection
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
      await fetch(`${API_URL}/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          consent_type: 'platform_connect',
          platform: platform.id,
          consent_version: '1.0',
        }),
      });

      let apiUrl: string;
      let fetchOptions: RequestInit;

      if (platform.category === 'entertainment' || platform.category === 'google') {
        apiUrl = `${API_URL}/entertainment/connect/${platform.id}`;
        fetchOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          },
          body: JSON.stringify({ userId }),
        };
      } else {
        // Arctic-managed platforms
        apiUrl = `${API_URL}/arctic/connect/${platform.id}?userId=${encodeURIComponent(userId)}`;
        fetchOptions = {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        };
      }

      const response = await fetch(apiUrl, fetchOptions);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const result = await response.json();

      if (result.success && (result.authUrl || result.connectUrl)) {
        trackFunnel('platform_connect_initiated', { platform: platform.id, source: 'onboarding' });
        // Store return context so we come back to onboarding after OAuth
        sessionStorage.setItem('onboarding_platform_connect', platform.id);
        sessionStorage.setItem('connecting_provider', platform.id);
        window.location.href = result.authUrl || result.connectUrl;
      }
    } catch (error) {
      console.error(`Failed to connect ${platform.id}:`, error);
    } finally {
      setConnecting(null);
    }
  }, [connecting, connected, consented, userId]);

  // Check if returning from OAuth
  React.useEffect(() => {
    const justConnected = sessionStorage.getItem('onboarding_platform_connect');
    if (justConnected) {
      sessionStorage.removeItem('onboarding_platform_connect');
      setConnected(prev => [...prev, justConnected]);

      // Fetch platform preview insight
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
      fetch(`${API_URL}/onboarding/platform-preview/${justConnected}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.insight) {
            setPlatformInsights(prev => ({ ...prev, [justConnected]: data.insight }));
          }
        })
        .catch(err => console.warn('[PlatformConnect] Preview fetch failed:', err.message));
    }
  }, []);

  const firstName = (userName || '').split(' ')[0] || 'there';
  const hasConnections = connected.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#0C0C0C]">
      {/* Header */}
      <div className="flex justify-between items-center px-8 py-6">
        <div
          className="text-xl tracking-tight"
          style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7' }}
        >
          Twin Me
        </div>
        <button
          onClick={onSkip}
          className="text-sm tracking-wide uppercase opacity-40 hover:opacity-80 transition-opacity"
          style={{
            fontFamily: 'var(--font-body)',
            color: '#E8D5B7',
            letterSpacing: '0.1em',
          }}
        >
          Skip
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 md:px-8">
        <div className="max-w-lg w-full">
          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <h2
              className="text-2xl md:text-3xl mb-3"
              style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7' }}
            >
              Connect your digital life
            </h2>
            <p
              className="text-base opacity-60"
              style={{ fontFamily: 'var(--font-body)', color: '#E8D5B7' }}
            >
              Each platform reveals a different layer of who you are.
              Connect one or more to enrich your soul signature.
            </p>
          </motion.div>

          {/* Platform cards */}
          <div className="space-y-3 mb-8">
            {PLATFORMS.map((platform, index) => {
              const isConnected = connected.includes(platform.id);
              const isConnecting = connecting === platform.id;
              const hasConsent = !!consented[platform.id];

              return (
                <motion.div
                  key={platform.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className="rounded-xl overflow-hidden"
                  style={{
                    backgroundColor: isConnected
                      ? 'rgba(232, 213, 183, 0.08)'
                      : 'rgba(232, 213, 183, 0.03)',
                    border: isConnected
                      ? '1px solid rgba(232, 213, 183, 0.25)'
                      : '1px solid rgba(232, 213, 183, 0.1)',
                  }}
                >
                  <button
                    onClick={() => handleConnect(platform)}
                    disabled={isConnecting || isConnected || !hasConsent}
                    className="w-full flex items-center gap-4 px-5 py-4 transition-all duration-200 hover:scale-[1.01] disabled:opacity-70"
                  >
                    {/* Platform icon */}
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: `${platform.color}20`,
                        color: platform.color,
                      }}
                    >
                      {platform.icon}
                    </div>

                    {/* Text */}
                    <div className="flex-1 text-left">
                      <div
                        className="text-base font-medium"
                        style={{ color: '#E8D5B7', fontFamily: 'var(--font-body)' }}
                      >
                        {platform.name}
                      </div>
                      <div
                        className="text-sm opacity-50"
                        style={{ color: '#E8D5B7', fontFamily: 'var(--font-body)' }}
                      >
                        {platform.description}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex-shrink-0">
                      {isConnecting ? (
                        <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#E8D5B7' }} />
                      ) : isConnected ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                      ) : (
                        <ExternalLink className="w-4 h-4 opacity-30" style={{ color: '#E8D5B7' }} />
                      )}
                    </div>
                  </button>

                  {/* Consent checkbox - shown only when not yet connected */}
                  {!isConnected && (
                    <label
                      className="flex items-start gap-3 px-5 pb-4 pt-0 cursor-pointer select-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={hasConsent}
                        onChange={(e) =>
                          setConsented((prev) => ({ ...prev, [platform.id]: e.target.checked }))
                        }
                        className="mt-0.5 w-4 h-4 rounded accent-[#E8D5B7] flex-shrink-0"
                      />
                      <span
                        className="text-xs leading-relaxed opacity-50"
                        style={{ color: '#E8D5B7', fontFamily: 'var(--font-body)' }}
                      >
                        I consent to Twin Me accessing my {platform.name} data to build my soul signature
                      </span>
                    </label>
                  )}

                  {/* Platform insight - shown after connection */}
                  {isConnected && platformInsights[platform.id] && (
                    <motion.p
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5 }}
                      className="px-5 pb-4 text-xs leading-relaxed"
                      style={{ color: 'rgba(232, 213, 183, 0.6)', fontFamily: 'var(--font-body)' }}
                    >
                      Your twin learned: {platformInsights[platform.id]}
                    </motion.p>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Continue button */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <button
              onClick={() => onComplete(connected)}
              className="w-full px-6 py-4 rounded-xl text-base font-medium transition-all duration-200 hover:scale-[1.01] flex items-center justify-center gap-2"
              style={{
                background: hasConnections
                  ? 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)'
                  : 'transparent',
                color: hasConnections ? '#0C0C0C' : '#E8D5B7',
                border: hasConnections ? 'none' : '1px solid rgba(232, 213, 183, 0.2)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {hasConnections ? 'Continue' : 'Skip for now'}
              <ArrowRight className="w-4 h-4" />
            </button>
            {!hasConnections && (
              <p
                className="text-center text-xs mt-3 opacity-30"
                style={{ color: '#E8D5B7', fontFamily: 'var(--font-body)' }}
              >
                You can connect platforms later from your dashboard
              </p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default PlatformConnectStep;
