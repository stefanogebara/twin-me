import React, { useState, useEffect } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface PlatformCardProps {
  name: string;
  description: string;
  color: string;
  icon: React.ReactNode;
  connected: boolean;
  connecting: boolean;
  onConnect: () => void;
}

const PlatformCard: React.FC<PlatformCardProps> = ({
  name, description, color, icon, connected, connecting, onConnect
}) => (
  <div className="flex items-center gap-4 p-4 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
    <div
      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
      style={{ backgroundColor: color }}
    >
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: "'Geist', sans-serif" }}>{name}</p>
      <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Geist', sans-serif" }}>{description}</p>
    </div>
    {connected ? (
      <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--foreground)' }} />
    ) : (
      <button
        onClick={onConnect}
        disabled={connecting}
        className="flex-shrink-0 px-4 py-1.5 text-xs rounded-full transition-opacity disabled:opacity-60"
        style={{
          backgroundColor: 'var(--foreground)',
          color: 'var(--background)',
          fontFamily: "'Geist', sans-serif",
          fontWeight: 400,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        {connecting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Connect'}
      </button>
    )}
  </div>
);

// Minimal SVG icons for the onboarding step
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

const DiscordIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
  </svg>
);

const YouTubeIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const LinkedInIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const GmailIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
  </svg>
);

const GitHubIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
  </svg>
);

const WhoopIcon = () => (
  <svg className="w-5 h-5" viewBox="3 13 40 22" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16.47,26.68l-3.7097,-11.047" />
    <path d="M18.38,32.368l5.6196,-16.735" />
    <path d="M25.91,21.32l3.7097,11.047,5.6196,-16.735" />
  </svg>
);

const MORE_PLATFORMS = [
  { name: 'LinkedIn', color: '#0A66C2', icon: <LinkedInIcon /> },
  { name: 'Whoop', color: 'var(--foreground)', icon: <WhoopIcon /> },
  { name: 'GitHub', color: '#24292E', icon: <GitHubIcon /> },
];

const RECOMMENDED = [
  { id: 'spotify', name: 'Spotify', description: 'Music taste & mood patterns', color: '#1DB954', icon: <SpotifyIcon />, type: 'entertainment' },
  { id: 'google_calendar', name: 'Google Calendar', description: 'Daily rhythms & priorities', color: '#4285F4', icon: <CalendarIcon />, type: 'entertainment' },
  { id: 'youtube', name: 'YouTube', description: 'What you watch reveals what you care about', color: '#FF0000', icon: <YouTubeIcon />, type: 'entertainment' },
  { id: 'gmail', name: 'Gmail', description: 'Communication patterns & priorities', color: '#EA4335', icon: <GmailIcon />, type: 'entertainment' },
  { id: 'discord', name: 'Discord', description: 'Community & communication style', color: '#5865F2', icon: <DiscordIcon />, type: 'entertainment' },
];

interface PlatformStepProps {
  onContinue: () => void;
}

const PlatformStep: React.FC<PlatformStepProps> = ({ onContinue }) => {
  const { user, authToken } = useAuth();
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  // Restore connected state when returning from OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const justConnected = params.get('connected');
    if (justConnected) {
      setConnected(prev => new Set([...prev, justConnected]));
      // Clean URL without triggering a navigation
      const cleanUrl = window.location.pathname + (window.location.search.replace(/[?&]connected=[^&]*/g, '').replace(/^\?$/, '') || '');
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  const handleConnect = async (platform: typeof RECOMMENDED[0]) => {
    const userId = user?.id;
    if (!userId) return;

    setConnecting(platform.id);
    try {
      // These providers all use the /entertainment/connect/:id POST endpoint
      const entertainmentProviders = ['spotify', 'discord', 'youtube', 'google_calendar', 'gmail', 'strava'];
      const isEntertainment = entertainmentProviders.includes(platform.id);

      let apiUrl: string;
      let fetchOptions: RequestInit;

      if (isEntertainment) {
        apiUrl = `${API_URL}/entertainment/connect/${platform.id}`;
        fetchOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ userId })
        };
      } else {
        apiUrl = `${API_URL}/arctic/connect/${platform.id}?userId=${encodeURIComponent(userId)}`;
        fetchOptions = { method: 'GET' };
      }

      const response = await fetch(apiUrl, fetchOptions);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const result = await response.json();

      if (result.success && result.authUrl) {
        sessionStorage.setItem('connecting_provider', platform.id);
        sessionStorage.setItem('onboarding_platform_step', '1');
        window.location.href = result.authUrl;
      } else if (result.success && result.connectUrl) {
        const width = 600, height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        window.open(result.connectUrl, 'nango-connect', `width=${width},height=${height},left=${left},top=${top}`);
        // Optimistically mark as connecting; user will return from popup
        setTimeout(() => {
          setConnected(prev => new Set([...prev, platform.id]));
          setConnecting(null);
        }, 3000);
      }
    } catch {
      setConnecting(null);
    }
  };

  const anyConnected = connected.size > 0;

  return (
    <div className="min-h-screen flex flex-col items-center overflow-y-auto px-4 py-12" >
      <div
        className="w-full max-w-md my-auto"
      >
        <h2
          className="mb-2 text-center"
          style={{
            fontFamily: 'Instrument Serif, Georgia, serif',
            fontWeight: 400,
            letterSpacing: '-0.04em',
            fontSize: '36px',
            color: 'var(--foreground)',
          }}
        >
          Now let's see your data
        </h2>
        <p
          className="text-center mb-8"
          style={{ fontFamily: "'Geist', sans-serif", fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}
        >
          Connect a platform and your twin comes to life with real context about you.
        </p>

        <div className="space-y-3 mb-4">
          {RECOMMENDED.map(p => (
            <PlatformCard
              key={p.id}
              name={p.name}
              description={p.description}
              color={p.color}
              icon={p.icon}
              connected={connected.has(p.id)}
              connecting={connecting === p.id}
              onConnect={() => handleConnect(p)}
            />
          ))}
        </div>

        {/* More platforms toggle */}
        <button
          onClick={() => setShowMore(v => !v)}
          className="w-full flex items-center justify-center gap-1 py-2 mb-2"
          style={{ fontFamily: "'Geist', sans-serif", fontSize: '12px', fontWeight: 400, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {showMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showMore ? 'Show less' : 'More platforms'}
        </button>

        {showMore && (
          <div
            className="mb-6"
          >
            <div className="grid grid-cols-2 gap-2 mb-2">
              {MORE_PLATFORMS.map(p => (
                <div
                  key={p.name}
                  className="flex items-center gap-2.5 p-3 opacity-45 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.icon}
                  </div>
                  <p className="text-xs font-medium truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>{p.name}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>Available in Settings after onboarding</p>
          </div>
        )}

        <button
          onClick={onContinue}
          className="w-full py-4 transition-all"
          style={{
            fontFamily: "'Geist', sans-serif",
            fontSize: '12px',
            fontWeight: 400,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            borderRadius: '9999px',
            cursor: 'pointer',
            backgroundColor: anyConnected ? 'var(--foreground)' : 'transparent',
            color: anyConnected ? '#1C1917' : 'var(--foreground)',
            border: anyConnected ? 'none' : '1.5px solid #D5D0C8',
          }}
        >
          {anyConnected ? 'Continue →' : 'Skip for now →'}
        </button>
      </div>
    </div>
  );
};

export default PlatformStep;
