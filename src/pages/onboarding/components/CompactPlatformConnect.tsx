import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { enrichmentService } from '@/services/enrichmentService';
import type { PlatformDataPoint } from '@/services/enrichmentService';
import PlatformDataReveal from './PlatformDataReveal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface Platform {
  id: string;
  name: string;
  color: string;
  icon: React.ReactNode;
  category: 'entertainment' | 'arctic' | 'google';
}

const SpotifyIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
  </svg>
);

const YouTubeIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const WhoopIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 1332 999" fill="currentColor">
    <path d="m969.3 804.3l-129.4-426.3h-118.7l189.2 620.8h117.8l303.7-998h-118.7zm-851.3-803.5h-117.9l188.4 620.7h118.6zm488.6 0l-302.8 997.9h117.8l303.7-997.9z"/>
  </svg>
);

const TwitchIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
  </svg>
);

const PLATFORMS: Platform[] = [
  { id: 'spotify', name: 'Spotify', color: '#1DB954', icon: <SpotifyIcon />, category: 'entertainment' },
  { id: 'youtube', name: 'YouTube', color: '#FF0000', icon: <YouTubeIcon />, category: 'entertainment' },
  { id: 'google_calendar', name: 'Calendar', color: '#4285F4', icon: <CalendarIcon />, category: 'google' },
  { id: 'whoop', name: 'Whoop', color: '#00B388', icon: <WhoopIcon />, category: 'arctic' },
  { id: 'twitch', name: 'Twitch', color: '#9146FF', icon: <TwitchIcon />, category: 'entertainment' },
];

interface CompactPlatformConnectProps {
  userId: string;
  onPlatformConnected?: (platformId: string) => void;
}

const CompactPlatformConnect: React.FC<CompactPlatformConnectProps> = ({
  userId,
  onPlatformConnected,
}) => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState<string[]>([]);
  const [platformInsights, setPlatformInsights] = useState<Record<string, string>>({});
  const [platformReveals, setPlatformReveals] = useState<Record<string, {
    insight: string;
    dataPoints: PlatformDataPoint[];
    twinReaction: string;
  }>>({});

  // Fetch already-connected platforms on mount
  useEffect(() => {
    const fetchExisting = async () => {
      try {
        const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        const response = await fetch(`${API_URL}/connectors/status/${encodeURIComponent(userId)}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
        });
        if (!response.ok) return;
        const result = await response.json();
        if (result.success && result.data) {
          const alreadyConnected = Object.entries(result.data)
            .filter(([, info]) => (info as { connected: boolean }).connected)
            .map(([platform]) => platform);
          if (alreadyConnected.length > 0) {
            setConnected(prev => [...new Set([...prev, ...alreadyConnected])]);
          }
        }
      } catch {
        // Silent — not critical for onboarding
      }
    };
    fetchExisting();
  }, [userId]);

  // Check if returning from OAuth and fetch rich platform preview
  useEffect(() => {
    const justConnected = sessionStorage.getItem('onboarding_platform_connect');
    if (justConnected) {
      sessionStorage.removeItem('onboarding_platform_connect');
      setConnected(prev => [...new Set([...prev, justConnected])]);
      onPlatformConnected?.(justConnected);

      // Fetch enhanced platform preview with data points
      enrichmentService.fetchPlatformPreview(justConnected)
        .then(result => {
          if (result.success && result.rawCount > 0) {
            setPlatformInsights(prev => ({ ...prev, [justConnected]: result.insight }));
            // Show rich data reveal if we have data points
            if (result.dataPoints?.length > 0 || result.twinReaction) {
              setPlatformReveals(prev => ({
                ...prev,
                [justConnected]: {
                  insight: result.insight,
                  dataPoints: result.dataPoints || [],
                  twinReaction: result.twinReaction || '',
                },
              }));
            }
          }
        })
        .catch(() => {
          // Silent — insight is a nice-to-have
        });
    }
  }, [onPlatformConnected]);

  const handleConnect = useCallback(async (platform: Platform) => {
    if (connecting || connected.includes(platform.id)) return;
    setConnecting(platform.id);

    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token');

      // Record consent
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
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ userId }),
        };
      } else {
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
        sessionStorage.setItem('onboarding_platform_connect', platform.id);
        sessionStorage.setItem('connecting_provider', platform.id);
        window.location.href = result.authUrl || result.connectUrl;
      }
    } catch (error) {
      console.error(`Failed to connect ${platform.id}:`, error);
    } finally {
      setConnecting(null);
    }
  }, [connecting, connected, userId, onPlatformConnected]);

  return (
    <div>
      <p
        className="text-sm mb-3 opacity-50"
        style={{ color: '#E8D5B7', fontFamily: 'var(--font-body)' }}
      >
        Optionally connect platforms for a richer signature
      </p>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {PLATFORMS.map((platform, i) => {
          const isConnected = connected.includes(platform.id);
          const isConnecting = connecting === platform.id;

          return (
            <motion.button
              key={platform.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => handleConnect(platform)}
              disabled={isConnecting || isConnected}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 hover:scale-[1.03] disabled:hover:scale-100"
              style={{
                width: 120,
                backgroundColor: isConnected
                  ? 'rgba(232, 213, 183, 0.1)'
                  : 'rgba(232, 213, 183, 0.04)',
                border: isConnected
                  ? '1px solid rgba(232, 213, 183, 0.3)'
                  : '1px solid rgba(232, 213, 183, 0.1)',
                color: platform.color,
              }}
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#E8D5B7' }} />
              ) : isConnected ? (
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              ) : (
                platform.icon
              )}
              <span
                className="text-xs truncate"
                style={{ color: '#E8D5B7', fontFamily: 'var(--font-body)' }}
              >
                {platform.name}
              </span>
            </motion.button>
          );
        })}
      </div>
      {/* Rich data reveal after platform connect */}
      {Object.entries(platformReveals).map(([platformId, reveal]) => {
        const platformInfo = PLATFORMS.find(p => p.id === platformId);
        return (
          <PlatformDataReveal
            key={platformId}
            platform={platformId}
            platformName={platformInfo?.name || platformId}
            insight={reveal.insight}
            dataPoints={reveal.dataPoints}
            twinReaction={reveal.twinReaction}
            onDismiss={() => {
              setPlatformReveals(prev => {
                const next = { ...prev };
                delete next[platformId];
                return next;
              });
            }}
          />
        );
      })}
      {/* Simple insight fallback for platforms without rich data */}
      {Object.entries(platformInsights)
        .filter(([platformId]) => !platformReveals[platformId])
        .map(([platformId, insight]) => (
          <motion.div
            key={platformId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mt-2 px-3 py-2 rounded-lg text-xs"
            style={{
              backgroundColor: 'rgba(232, 213, 183, 0.06)',
              border: '1px solid rgba(232, 213, 183, 0.15)',
              color: '#E8D5B7',
              fontFamily: 'var(--font-body)',
            }}
          >
            <span className="opacity-50">Your twin noticed: </span>
            <span className="opacity-80">{insight}</span>
          </motion.div>
        ))}
      <p
        className="text-xs mt-2 opacity-30"
        style={{ color: '#E8D5B7', fontFamily: 'var(--font-body)' }}
      >
        Skip for now - you can always connect later
      </p>
    </div>
  );
};

export default CompactPlatformConnect;
