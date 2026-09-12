import React, { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { API_URL, getAccessToken } from '@/services/api/apiBase';
import { safeRedirect } from '@/lib/safeRedirect';
import { usePlatformsSummary, connectedProviders } from '@/hooks/usePlatformsSummary';
import { Row } from '@/components/register';


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
    teaser: 'Your taste in music says more than you think',
    details: [
      'Your top genres and artists, and the moods behind them',
      'What you play at 2am, and on Monday morning',
      'How your energy shifts across the week',
    ],
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    color: '#4285F4',
    icon: <CalendarIcon />,
    category: 'google',
    teaser: 'Your calendar shows what you actually value',
    details: [
      'How you shape your days and protect your time',
      'Your work and life rhythm, and what you say yes to',
      'How you handle plans and surprises',
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
      'The topics you fall into late at night',
      "How you learn, and what you're curious about",
      'The niche interests that make your taste',
    ],
  },
];

interface PlatformConnectStepProps {
  userId: string;
  onContinue: (connectedPlatforms: string[]) => void;
}

/** Three platforms as rows of the page kit, then the step's one call to action. */
const PlatformConnectStep: React.FC<PlatformConnectStepProps> = ({ userId, onContinue }) => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Already-connected platforms from the canonical summary (batch-3
  // state-unification — replaces the raw /connectors/status mount fetch).
  // Merged with the local just-connected list from the sessionStorage
  // OAuth-return flow below.
  const { data: platformsSummary } = usePlatformsSummary();
  const connectedAll = [...new Set([...connected, ...connectedProviders(platformsSummary)])];

  // Check if returning from OAuth
  useEffect(() => {
    const justConnected = sessionStorage.getItem('onboarding_platform_connect');
    if (justConnected) {
      sessionStorage.removeItem('onboarding_platform_connect');
      setConnected(prev => [...new Set([...prev, justConnected])]);
    }
  }, []);

  const handleConnect = useCallback(async (platform: Platform) => {
    if (connecting || connectedAll.includes(platform.id)) return;
    setConnecting(platform.id);

    try {
      const token = getAccessToken();

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

      if (!result.success || !(result.authUrl || result.connectUrl)) {
        throw new Error(result.error || 'No authorization URL returned');
      }

      sessionStorage.setItem('onboarding_platform_connect', platform.id);
      sessionStorage.setItem('connecting_provider', platform.id);
      if (!safeRedirect(result.authUrl || result.connectUrl)) {
        // Stale keys would falsely mark the platform connected on the next mount (audit-2026-06-10)
        sessionStorage.removeItem('onboarding_platform_connect');
        sessionStorage.removeItem('connecting_provider');
        throw new Error('Blocked untrusted redirect URL');
      }
    } catch (error) {
      console.error(`Failed to connect ${platform.id}:`, error);
      toast.error(`Couldn't connect ${platform.name}`, {
        description: 'Something went wrong on our end. Please try again.',
      });
    } finally {
      setConnecting(null);
    }
  }, [connecting, connectedAll, userId]);

  const allConnected = PLATFORMS.every(p => connectedAll.includes(p.id));

  return (
    <div className="rs-flow w-full max-w-lg">
      {/* Heading */}
      <div className="text-center mb-10" style={{ display: 'grid', gap: 4 }}>
        <h2 className="rs-flow-title">I've seen what the internet knows about you.</h2>
        <p className="rs-flow-line">Now let me see what only you can show me.</p>
        {/* Negative assurance (Plaid trust-gap research): say what we CANNOT
            do, not just what we read — this is what moves connect rates. */}
        <p className="rs-quiet" style={{ marginTop: 8 }}>
          Read-only. I can never post, change or delete anything, and you can disconnect any time.
        </p>
      </div>

      {/* Platforms as rows */}
      <ul className="rg-list pb-stack mb-10">
        {PLATFORMS.map((platform) => {
          const isConnected = connectedAll.includes(platform.id);
          const isConnecting = connecting === platform.id;
          const isExpanded = expanded === platform.id;

          return (
            <React.Fragment key={platform.id}>
              <Row
                // The brand colour lives in the icon square only.
                icon={<span style={{ display: 'grid', placeItems: 'center', color: platform.color }}>{platform.icon}</span>}
                title={platform.name}
                line={isConnected ? (
                  <span className="rs-ok">Connected</span>
                ) : (
                  <>
                    {platform.teaser}{' '}
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : platform.id)}
                      aria-expanded={isExpanded}
                      className="rs-link"
                    >
                      What it reads
                    </button>
                  </>
                )}
                action={isConnected ? undefined : (
                  <button
                    type="button"
                    onClick={() => handleConnect(platform)}
                    disabled={!!connecting}
                    className="n-btn n-btn--ghost"
                  >
                    {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
                    {isConnecting ? 'Connecting' : 'Connect'}
                  </button>
                )}
                className={isExpanded && !isConnected ? 'rs-row-has-body' : undefined}
              />

              {/* What it reads: quiet lines under the row */}
              {isExpanded && !isConnected && (
                <li className="rs-body">
                  <ul className="rs-steps" style={{ listStyle: 'disc' }}>
                    {platform.details.map((detail, j) => <li key={j}>{detail}</li>)}
                  </ul>
                </li>
              )}
            </React.Fragment>
          );
        })}
      </ul>

      {/* Continue CTA */}
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => onContinue(connectedAll)}
          className={`n-btn pb-cta ${connectedAll.length > 0 ? 'n-btn--primary' : 'n-btn--ghost'}`}
        >
          {allConnected
            ? "Perfect, let's go deeper"
            : connectedAll.length > 0
            ? `Continue with ${connectedAll.length} platform${connectedAll.length > 1 ? 's' : ''}`
            : 'Continue'}
        </button>

        {connectedAll.length === 0 && (
          <button type="button" onClick={() => onContinue([])} className="rs-link">
            Skip, I'll connect later
          </button>
        )}
      </div>
    </div>
  );
};

export default PlatformConnectStep;
