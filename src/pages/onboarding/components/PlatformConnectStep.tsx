import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Loader2, ChevronRight } from 'lucide-react';
import { getAccessToken } from '@/services/api/apiBase';
import { safeRedirect } from '@/lib/safeRedirect';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

interface Platform {
  id: string;
  name: string;
  color: string;
  icon: React.ReactNode;
  category: 'entertainment' | 'google';
  teaser: string;
  details: string[];
}

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

const PLATFORMS: Platform[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    color: '#1DB954',
    icon: <SpotifyIcon />,
    category: 'entertainment',
    teaser: 'Your taste in music reveals more than you think',
    details: [
      'Top genres, artists, and the moods behind them',
      'What you listen to at 2am vs. Monday morning',
      'How your energy shifts across the week',
    ],
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    color: '#4285F4',
    icon: <CalendarIcon />,
    category: 'google',
    teaser: 'Your calendar is a map of what you actually value',
    details: [
      'How you structure your days and protect your time',
      'Work-life rhythm and what you say yes to',
      'Your relationship with commitments and spontaneity',
    ],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    icon: <YouTubeIcon />,
    category: 'entertainment',
    teaser: "What you watch when no one's watching",
    details: [
      'Topics you rabbit-hole into late at night',
      "How you learn and what you're curious about",
      'The niche interests that define your taste',
    ],
  },
];

interface PlatformConnectStepProps {
  userId: string;
  onContinue: (connectedPlatforms: string[]) => void;
}

const PlatformConnectStep: React.FC<PlatformConnectStepProps> = ({ userId, onContinue }) => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Fetch already-connected platforms on mount
  useEffect(() => {
    const fetchExisting = async () => {
      try {
        const token = getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');
        const response = await fetch(`${API_URL}/connectors/status/${encodeURIComponent(userId)}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!response.ok) return;
        const result = await response.json();
        if (result.success && result.data) {
          const alreadyConnected = Object.entries(result.data)
            .filter(([, info]) => (info as { connected: boolean }).connected)
            .map(([platform]) => platform);
          if (alreadyConnected.length > 0) setConnected(alreadyConnected);
        }
      } catch {
        // Silent
      }
    };
    fetchExisting();
  }, [userId]);

  // Check if returning from OAuth
  useEffect(() => {
    const justConnected = sessionStorage.getItem('onboarding_platform_connect');
    if (justConnected) {
      sessionStorage.removeItem('onboarding_platform_connect');
      setConnected(prev => [...new Set([...prev, justConnected])]);
    }
  }, []);

  const handleConnect = useCallback(async (platform: Platform) => {
    if (connecting || connected.includes(platform.id)) return;
    setConnecting(platform.id);

    try {
      const token = getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');

      await fetch(`${API_URL}/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          consent_type: 'platform_connect',
          platform: platform.id,
          consent_version: '1.0',
        }),
      });

      const apiUrl = `${API_URL}/entertainment/connect/${platform.id}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (result.success && (result.authUrl || result.connectUrl)) {
        sessionStorage.setItem('onboarding_platform_connect', platform.id);
        sessionStorage.setItem('connecting_provider', platform.id);
        if (!safeRedirect(result.authUrl || result.connectUrl)) {
          console.error('Platform connect blocked: untrusted redirect URL');
        }
      }
    } catch (error) {
      console.error(`Failed to connect ${platform.id}:`, error);
    } finally {
      setConnecting(null);
    }
  }, [connecting, connected, userId]);

  const allConnected = PLATFORMS.every(p => connected.includes(p.id));

  return (
    <div
      className="w-full max-w-lg"
    >
      {/* Heading */}
      <div
        className="text-center mb-8"
      >
        <h2
          className="text-2xl md:text-3xl mb-3"
          style={{ fontFamily: 'var(--font-heading)', color: '#E8D5B7' }}
        >
          I've seen what the internet knows about you.
        </h2>
        <p
          className="text-sm opacity-60 leading-relaxed"
          style={{ fontFamily: "'Inter', sans-serif", color: '#E8D5B7' }}
        >
          Now let me see what only you can show me.
        </p>
      </div>

      {/* Platform cards */}
      <div className="flex flex-col gap-3 mb-8">
        {PLATFORMS.map((platform, i) => {
          const isConnected = connected.includes(platform.id);
          const isConnecting = connecting === platform.id;
          const isExpanded = expanded === platform.id;

          return (
            <div
              key={platform.id}
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: isConnected
                  ? 'rgba(232, 213, 183, 0.08)'
                  : 'rgba(232, 213, 183, 0.04)',
                border: isConnected
                  ? `1px solid ${platform.color}55`
                  : '1px solid rgba(232, 213, 183, 0.1)',
              }}
            >
              {/* Card header row */}
              <div className="flex items-center gap-4 px-5 py-4">
                <div style={{ color: platform.color }}>{platform.icon}</div>

                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium mb-0.5"
                    style={{ color: '#E8D5B7', fontFamily: "'Inter', sans-serif" }}
                  >
                    {platform.name}
                  </div>
                  <div
                    className="text-xs opacity-50 truncate"
                    style={{ color: '#E8D5B7', fontFamily: "'Inter', sans-serif" }}
                  >
                    {platform.teaser}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Expand toggle */}
                  {!isConnected && (
                    <button
                      onClick={() => setExpanded(isExpanded ? null : platform.id)}
                      className="opacity-30 hover:opacity-60 transition-opacity"
                      aria-label="Show details"
                    >
                      <ChevronRight
                        className="w-4 h-4 transition-transform duration-200"
                        style={{
                          color: '#E8D5B7',
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        }}
                      />
                    </button>
                  )}

                  {/* Connect / connected button */}
                  {isConnected ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ backgroundColor: `${platform.color}22` }}>
                      <CheckCircle2 className="w-3.5 h-3.5" style={{ color: platform.color }} />
                      <span className="text-xs" style={{ color: platform.color, fontFamily: "'Inter', sans-serif" }}>
                        Connected
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleConnect(platform)}
                      disabled={!!connecting}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                      style={{
                        backgroundColor: platform.color,
                        color: 'var(--foreground)',
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {isConnecting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : null}
                      <span className="text-xs font-medium">
                        {isConnecting ? 'Connecting...' : 'Connect'}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Expandable detail bullets */}
                {isExpanded && !isConnected && (
                  <div
                    className="overflow-hidden"
                  >
                    <div
                      className="px-5 pb-4 pt-0 border-t"
                      style={{ borderColor: 'rgba(232, 213, 183, 0.08)' }}
                    >
                      <ul className="mt-3 space-y-1.5">
                        {platform.details.map((detail, j) => (
                          <li
                            key={j}
                            className="flex items-start gap-2 text-xs opacity-50"
                            style={{ color: '#E8D5B7', fontFamily: "'Inter', sans-serif" }}
                          >
                            <span className="mt-0.5 shrink-0" style={{ color: platform.color }}>·</span>
                            {detail}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
            </div>
          );
        })}
      </div>

      {/* Continue CTA */}
      <div
        className="flex flex-col items-center gap-3"
      >
        <button
          onClick={() => onContinue(connected)}
          className="w-full py-3.5 rounded-xl text-sm font-medium transition-all duration-200 hover:opacity-90"
          style={{
            backgroundColor: connected.length > 0 ? '#E8D5B7' : 'rgba(232, 213, 183, 0.1)',
            color: connected.length > 0 ? '#0C0C0C' : 'rgba(232, 213, 183, 0.5)',
            fontFamily: "'Inter', sans-serif",
            border: connected.length > 0 ? 'none' : '1px solid rgba(232, 213, 183, 0.15)',
          }}
        >
          {allConnected
            ? "Perfect — let's go deeper"
            : connected.length > 0
            ? `Continue with ${connected.length} platform${connected.length > 1 ? 's' : ''} connected`
            : 'Continue'}
        </button>

        {connected.length === 0 && (
          <button
            onClick={() => onContinue([])}
            className="text-xs opacity-25 hover:opacity-50 transition-opacity"
            style={{ color: '#E8D5B7', fontFamily: "'Inter', sans-serif" }}
          >
            Skip — I'll connect later
          </button>
        )}
      </div>
    </div>
  );
};

export default PlatformConnectStep;
