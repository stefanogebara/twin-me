import React, { useState } from 'react';
import { motion } from 'framer-motion';
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
  <div className="flex items-center gap-4 p-4 rounded-2xl border border-[#E8E8E4] bg-white">
    <div
      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
      style={{ backgroundColor: color }}
    >
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-[#0c0a09] text-sm">{name}</p>
      <p className="text-xs text-[#6B6B63] truncate">{description}</p>
    </div>
    {connected ? (
      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
    ) : (
      <button
        onClick={onConnect}
        disabled={connecting}
        className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor: color }}
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

const RECOMMENDED = [
  { id: 'spotify', name: 'Spotify', description: 'Music taste & mood patterns', color: '#1DB954', icon: <SpotifyIcon />, type: 'entertainment' },
  { id: 'google_calendar', name: 'Google Calendar', description: 'Daily rhythms & priorities', color: '#4285F4', icon: <CalendarIcon />, type: 'entertainment' },
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

  const handleConnect = async (platform: typeof RECOMMENDED[0]) => {
    const userId = user?.id;
    if (!userId) return;

    setConnecting(platform.id);
    try {
      const entertainmentTypes = ['entertainment'];
      const isEntertainment = entertainmentTypes.includes(platform.type);

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
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <h2 className="text-2xl font-bold text-[#0c0a09] mb-2 text-center" style={{ fontFamily: 'var(--font-heading)' }}>
          Now let's see your data
        </h2>
        <p className="text-sm text-[#6B6B63] text-center mb-8">
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
          className="w-full text-sm text-[#6B6B63] flex items-center justify-center gap-1 py-2 mb-6"
        >
          {showMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showMore ? 'Show less' : 'More platforms'}
        </button>

        {showMore && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-[#6B6B63] text-center mb-6 bg-[#F0F0EC] rounded-xl p-4"
          >
            More platforms — YouTube, LinkedIn, Gmail, GitHub, Reddit — are available in Settings after onboarding.
          </motion.p>
        )}

        <button
          onClick={onContinue}
          className="w-full py-4 rounded-2xl font-semibold text-base transition-colors"
          style={{
            backgroundColor: anyConnected ? '#0c0a09' : '#E8E8E4',
            color: anyConnected ? '#FAFAFA' : '#6B6B63',
          }}
        >
          {anyConnected ? 'Continue →' : 'Skip for now →'}
        </button>
      </motion.div>
    </div>
  );
};

export default PlatformStep;
