import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  Music,
  Youtube,
  Heart,
  Activity,
  Mail,
  Calendar,
  Github,
  Linkedin,
  Sparkles
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface Platform {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  category: 'entertainment' | 'health' | 'professional';
  tagline: string;
  description: string;
  discovers: string[];
  available: boolean;
}

const PLATFORMS: Platform[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    icon: Music,
    color: '#1DB954',
    category: 'entertainment',
    tagline: 'Your emotional soundtrack',
    description: 'Your music reveals your emotional landscape and how you process feelings',
    discovers: ['Mood patterns', 'Nostalgia triggers', 'Energy preferences', 'Openness to new sounds'],
    available: true
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: Youtube,
    color: '#FF0000',
    category: 'entertainment',
    tagline: 'Your curiosity map',
    description: 'Your viewing habits show what truly captures your curiosity',
    discovers: ['Learning style', 'Interest depth', 'Attention patterns', 'Expertise areas'],
    available: true
  },
  {
    id: 'whoop',
    name: 'Whoop',
    icon: Activity,
    color: '#00A7E1',
    category: 'health',
    tagline: 'Your body\'s rhythm',
    description: 'Your body tells truths your mind might miss',
    discovers: ['Sleep consistency', 'Stress response', 'Recovery patterns', 'Physical discipline'],
    available: true
  },
  {
    id: 'oura',
    name: 'Oura',
    icon: Heart,
    color: '#D4AF37',
    category: 'health',
    tagline: 'Your recovery patterns',
    description: 'Your rest and readiness reveal your self-care habits',
    discovers: ['Sleep quality', 'HRV patterns', 'Readiness cycles', 'Body awareness'],
    available: true
  },
  {
    id: 'google_calendar',
    name: 'Calendar',
    icon: Calendar,
    color: '#4285F4',
    category: 'professional',
    tagline: 'Your time priorities',
    description: 'How you allocate time shows what you truly value',
    discovers: ['Work-life balance', 'Planning style', 'Commitment patterns', 'Priority signals'],
    available: true
  },
  {
    id: 'gmail',
    name: 'Gmail',
    icon: Mail,
    color: '#EA4335',
    category: 'professional',
    tagline: 'Your communication style',
    description: 'Your emails reveal how you connect and express yourself',
    discovers: ['Response patterns', 'Writing style', 'Network breadth', 'Communication rhythm'],
    available: true
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: Github,
    color: '#6e5494',
    category: 'professional',
    tagline: 'Your builder identity',
    description: 'Your code contributions show how you create and collaborate',
    discovers: ['Technical interests', 'Collaboration style', 'Project commitment', 'Learning patterns'],
    available: true
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: Linkedin,
    color: '#0A66C2',
    category: 'professional',
    tagline: 'Your professional identity',
    description: 'Your career path reveals your ambitions, expertise, and professional network',
    discovers: ['Career trajectory', 'Industry expertise', 'Professional network', 'Growth mindset'],
    available: true
  }
];

interface PlatformStoriesStepProps {
  connectedPlatforms: string[];
  onConnect: (platformId: string) => Promise<void>;
  onContinue: () => void;
  onBack: () => void;
  onSkip: () => void;
  isDemoMode?: boolean;
}

const PlatformCard: React.FC<{
  platform: Platform;
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  theme: string;
  isDemoMode?: boolean;
}> = ({ platform, isConnected, isConnecting, onConnect, theme, isDemoMode }) => {
  const Icon = platform.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        backgroundColor: isConnected
          ? theme === 'dark' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.06)'
          : theme === 'dark' ? 'rgba(193, 192, 182, 0.06)' : 'rgba(0, 0, 0, 0.03)',
        border: `1px solid ${
          isConnected
            ? theme === 'dark' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.15)'
            : theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'
        }`
      }}
    >
      <div className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${platform.color}15` }}
          >
            <Icon className="w-6 h-6" style={{ color: platform.color }} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <span
                className="text-[16px] font-medium"
                style={{
                  fontFamily: 'var(--font-heading)',
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}
              >
                {platform.name}
              </span>
              {isConnected && (
                <span
                  className="px-2.5 py-1 rounded-full text-[12px] font-medium flex items-center gap-1.5"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                    color: '#22c55e',
                    fontFamily: 'var(--font-body)'
                  }}
                >
                  <Check className="w-3 h-3" />
                  Connected
                </span>
              )}
            </div>
            <span
              className="text-[14px]"
              style={{
                fontFamily: 'var(--font-body)',
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c'
              }}
            >
              {platform.tagline}
            </span>
          </div>
        </div>

        {!isConnected && (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="px-5 py-2.5 rounded-full text-[14px] font-medium transition-all hover:opacity-80"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              color: theme === 'dark' ? '#C1C0B6' : '#0c0a09',
              fontFamily: 'var(--font-body)'
            }}
          >
            {isConnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isDemoMode ? (
              "Sign in to connect"
            ) : (
              "Connect"
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
};

export const PlatformStoriesStep: React.FC<PlatformStoriesStepProps> = ({
  connectedPlatforms,
  onConnect,
  onContinue,
  onBack,
  onSkip,
  isDemoMode = false
}) => {
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<'all' | 'entertainment' | 'health' | 'professional'>('all');
  const { theme } = useTheme();

  const handleConnect = async (platformId: string) => {
    setConnectingPlatform(platformId);
    try {
      await onConnect(platformId);
    } finally {
      setConnectingPlatform(null);
    }
  };

  const filteredPlatforms = activeCategory === 'all'
    ? PLATFORMS
    : PLATFORMS.filter(p => p.category === activeCategory);

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'entertainment', label: 'Entertainment' },
    { id: 'health', label: 'Health' },
    { id: 'professional', label: 'Professional' }
  ];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: theme === 'dark' ? '#232320' : '#FAFAFA',
        color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
      }}
    >
      {/* Header */}
      <div
        className="px-6 lg:px-[60px] py-5 flex items-center justify-between"
        style={{
          borderBottom: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'}`
        }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
          style={{
            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e',
            fontFamily: 'var(--font-body)'
          }}
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="text-[14px]">Back</span>
        </button>

        <div className="flex items-center gap-2">
          <Sparkles
            className="w-4 h-4"
            style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e' }}
          />
          <span
            className="text-[14px]"
            style={{
              fontFamily: 'var(--font-body)',
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
            }}
          >
            Step 2 of 3
          </span>
        </div>

        <button
          onClick={onSkip}
          className="text-[14px] transition-opacity hover:opacity-70"
          style={{
            color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e',
            fontFamily: 'var(--font-body)'
          }}
        >
          Skip
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 px-6 lg:px-[60px] py-10 overflow-auto">
        <div className="max-w-[700px] mx-auto">
          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-10"
          >
            <h1
              className="text-[clamp(1.75rem,4vw,2.5rem)] mb-4"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 400,
                fontStyle: 'italic',
                letterSpacing: '-0.02em',
                color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
              }}
            >
              Connect Your Platforms
            </h1>
            <p
              className="text-[16px] leading-[1.7]"
              style={{
                fontFamily: 'var(--font-body)',
                color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e'
              }}
            >
              Each platform tells a different part of your story. The more you connect, the richer your Soul Signature becomes.
            </p>
          </motion.div>

          {/* Category tabs */}
          <div
            className="flex gap-2 mb-8 p-1.5 rounded-full w-fit"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.06)' : 'rgba(0, 0, 0, 0.03)'
            }}
          >
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id as typeof activeCategory)}
                className="px-4 py-2 rounded-full text-[13px] font-medium transition-all"
                style={{
                  backgroundColor: activeCategory === cat.id
                    ? theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                    : 'transparent',
                  color: activeCategory === cat.id
                    ? theme === 'dark' ? '#232320' : '#ffffff'
                    : theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#57534e',
                  fontFamily: 'var(--font-body)'
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Connected count badge */}
          {connectedPlatforms.length > 0 && (
            <div className="mb-6">
              <span
                className="px-4 py-2 rounded-full text-[13px] font-medium"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.08)',
                  color: '#22c55e',
                  fontFamily: 'var(--font-body)'
                }}
              >
                {connectedPlatforms.length} platform{connectedPlatforms.length !== 1 ? 's' : ''} connected
              </span>
            </div>
          )}

          {/* Platform list */}
          <div className="space-y-3">
            {filteredPlatforms.map((platform, index) => (
              <motion.div
                key={platform.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <PlatformCard
                  platform={platform}
                  isConnected={connectedPlatforms.includes(platform.id)}
                  isConnecting={connectingPlatform === platform.id}
                  onConnect={() => handleConnect(platform.id)}
                  theme={theme}
                  isDemoMode={isDemoMode}
                />
              </motion.div>
            ))}
          </div>

          {/* Info box */}
          {connectedPlatforms.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-8 p-5 rounded-2xl text-center"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.06)',
                border: `1px solid ${theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)'}`
              }}
            >
              <p
                className="text-[14px]"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: '#3b82f6'
                }}
              >
                {isDemoMode
                  ? "Sign in to connect your platforms and generate your Soul Signature."
                  : "Connect at least one platform to generate your Soul Signature."
                }
              </p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-6 lg:px-[60px] py-5"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.03)' : 'rgba(0, 0, 0, 0.02)',
          borderTop: `1px solid ${theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'}`
        }}
      >
        <div className="max-w-[700px] mx-auto flex justify-between items-center">
          <span
            className="text-[14px]"
            style={{
              fontFamily: 'var(--font-body)',
              color: theme === 'dark' ? 'rgba(193, 192, 182, 0.5)' : '#a8a29e'
            }}
          >
            {connectedPlatforms.length > 0 ? (
              "Ready to generate your signature"
            ) : (
              "Connect platforms to continue"
            )}
          </span>

          <button
            onClick={onContinue}
            disabled={connectedPlatforms.length === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-full text-[14px] font-medium transition-all"
            style={{
              backgroundColor: connectedPlatforms.length > 0
                ? theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                : theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              color: connectedPlatforms.length > 0
                ? theme === 'dark' ? '#232320' : '#ffffff'
                : theme === 'dark' ? 'rgba(193, 192, 182, 0.4)' : '#a8a29e',
              fontFamily: 'var(--font-body)',
              opacity: connectedPlatforms.length > 0 ? 1 : 0.6,
              cursor: connectedPlatforms.length > 0 ? 'pointer' : 'not-allowed'
            }}
          >
            Generate Soul Signature
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlatformStoriesStep;
