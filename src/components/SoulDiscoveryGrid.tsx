import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Card } from '@/components/ui/card';
import { Music, Film, Youtube, Gamepad2, Book, MessageSquare, Code, Briefcase, Mail, Github, Linkedin, CheckCircle2, Plus } from 'lucide-react';

interface PlatformData {
  name: string;
  icon: React.ElementType;
  connected: boolean;
  dataPoints: number;
  description: string;
}

interface SoulDiscoveryGridProps {
  platforms: Record<string, any>;
  onConnectPlatform: (platform: string) => void;
}

export const SoulDiscoveryGrid: React.FC<SoulDiscoveryGridProps> = ({
  platforms,
  onConnectPlatform
}) => {
  const { theme } = useTheme();

  // Simplified to Personal vs Professional categories
  const platformsByCategory: Record<string, PlatformData[]> = {
    personal: [
      {
        name: 'Spotify',
        icon: Music,
        connected: platforms['spotify']?.connected || false,
        dataPoints: platforms['spotify']?.dataPoints || 0,
        description: 'Musical soul & mood patterns'
      },
      {
        name: 'Netflix',
        icon: Film,
        connected: platforms['netflix']?.connected || false,
        dataPoints: platforms['netflix']?.dataPoints || 0,
        description: 'Narrative preferences & viewing habits'
      },
      {
        name: 'YouTube',
        icon: Youtube,
        connected: platforms['youtube']?.connected || false,
        dataPoints: platforms['youtube']?.dataPoints || 0,
        description: 'Learning interests & curiosity profile'
      },
      {
        name: 'Steam',
        icon: Gamepad2,
        connected: platforms['steam']?.connected || false,
        dataPoints: platforms['steam']?.dataPoints || 0,
        description: 'Gaming preferences & playtime patterns'
      },
      {
        name: 'Goodreads',
        icon: Book,
        connected: platforms['goodreads']?.connected || false,
        dataPoints: platforms['goodreads']?.dataPoints || 0,
        description: 'Reading tastes & intellectual interests'
      },
      {
        name: 'Reddit',
        icon: MessageSquare,
        connected: platforms['reddit']?.connected || false,
        dataPoints: platforms['reddit']?.dataPoints || 0,
        description: 'Community interests & discussion style'
      }
    ],
    professional: [
      {
        name: 'GitHub',
        icon: Github,
        connected: platforms['github']?.connected || false,
        dataPoints: platforms['github']?.dataPoints || 0,
        description: 'Code & collaboration patterns'
      },
      {
        name: 'LinkedIn',
        icon: Linkedin,
        connected: platforms['linkedin']?.connected || false,
        dataPoints: platforms['linkedin']?.dataPoints || 0,
        description: 'Professional network & career'
      },
      {
        name: 'Gmail',
        icon: Mail,
        connected: platforms['google_gmail']?.connected || false,
        dataPoints: platforms['google_gmail']?.dataPoints || 0,
        description: 'Communication patterns & style'
      }
    ]
  };

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="mb-6">
        <h2
          className="text-2xl mb-2 font-heading font-medium"
          style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
        >
          Soul Discovery Channels
        </h2>
        <p
          className="font-body"
          style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.7)' : '#78716c' }}
        >
          The roots of your authenticity lie in your personal choices, not your professional achievements
        </p>
      </div>

      {/* Personal Platforms - Primary emphasis */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3
              className="text-lg font-heading font-medium"
              style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
            >
              Personal Universe
            </h3>
            <span
              className="text-sm font-body"
              style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}
            >
              Your authentic soul signature
            </span>
          </div>
          <span
            className="text-xs font-medium"
            style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
          >
            {platformsByCategory.personal.filter(p => p.connected).length}/{platformsByCategory.personal.length} connected
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {platformsByCategory.personal.map((platform) => {
            const Icon = platform.icon;
            const isConnected = platform.connected;

            return (
              <button
                key={platform.name}
                onClick={() => onConnectPlatform(platform.name.toLowerCase())}
                className="group relative rounded-xl p-5 transition-all duration-300 hover:scale-[1.02] text-left"
                style={{
                  backgroundColor: isConnected
                    ? (theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(12, 10, 9, 0.05)')
                    : (theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(255, 255, 255, 0.5)'),
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: isConnected
                    ? (theme === 'dark' ? 'rgba(193, 192, 182, 0.3)' : 'rgba(12, 10, 9, 0.15)')
                    : (theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)')
                }}
              >
                {/* Platform icon and status */}
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200"
                    style={{
                      backgroundColor: isConnected
                        ? (theme === 'dark' ? '#C1C0B6' : '#0c0a09')
                        : (theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : '#e7e5e4')
                    }}
                  >
                    <Icon
                      className="w-6 h-6 transition-all duration-200"
                      style={{
                        color: isConnected
                          ? (theme === 'dark' ? '#232320' : '#ffffff')
                          : (theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c')
                      }}
                    />
                  </div>

                  {/* Status indicator */}
                  {isConnected ? (
                    <CheckCircle2
                      className="w-5 h-5"
                      style={{ color: theme === 'dark' ? '#4ade80' : '#16a34a' }}
                    />
                  ) : (
                    <Plus
                      className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}
                    />
                  )}
                </div>

                {/* Platform name */}
                <h4
                  className="text-sm font-heading font-medium mb-1"
                  style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
                >
                  {platform.name}
                </h4>

                {/* Platform description */}
                <p
                  className="text-xs font-body line-clamp-1"
                  style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
                >
                  {platform.description}
                </p>

                {/* Minimal data points display (only if connected and has data) */}
                {isConnected && platform.dataPoints > 0 && (
                  <div
                    className="mt-3 pt-3"
                    style={{
                      borderTopWidth: '1px',
                      borderTopStyle: 'solid',
                      borderTopColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'
                    }}
                  >
                    <span
                      className="text-xs font-medium"
                      style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
                    >
                      {platform.dataPoints.toLocaleString()} data points
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Professional Platforms - Secondary emphasis */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3
              className="text-lg font-heading font-medium"
              style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
            >
              Professional Universe
            </h3>
            <span
              className="text-sm font-body"
              style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}
            >
              Your public-facing identity
            </span>
          </div>
          <span
            className="text-xs font-medium"
            style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
          >
            {platformsByCategory.professional.filter(p => p.connected).length}/{platformsByCategory.professional.length} connected
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {platformsByCategory.professional.map((platform) => {
            const Icon = platform.icon;
            const isConnected = platform.connected;

            return (
              <button
                key={platform.name}
                onClick={() => onConnectPlatform(platform.name.toLowerCase())}
                className="group relative rounded-xl p-5 transition-all duration-300 hover:scale-[1.02] text-left"
                style={{
                  backgroundColor: isConnected
                    ? (theme === 'dark' ? 'rgba(193, 192, 182, 0.15)' : 'rgba(12, 10, 9, 0.05)')
                    : (theme === 'dark' ? 'rgba(193, 192, 182, 0.05)' : 'rgba(255, 255, 255, 0.5)'),
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: isConnected
                    ? (theme === 'dark' ? 'rgba(193, 192, 182, 0.3)' : 'rgba(12, 10, 9, 0.15)')
                    : (theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)')
                }}
              >
                {/* Platform icon and status */}
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200"
                    style={{
                      backgroundColor: isConnected
                        ? (theme === 'dark' ? '#C1C0B6' : '#0c0a09')
                        : (theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : '#e7e5e4')
                    }}
                  >
                    <Icon
                      className="w-6 h-6 transition-all duration-200"
                      style={{
                        color: isConnected
                          ? (theme === 'dark' ? '#232320' : '#ffffff')
                          : (theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c')
                      }}
                    />
                  </div>

                  {/* Status indicator */}
                  {isConnected ? (
                    <CheckCircle2
                      className="w-5 h-5"
                      style={{ color: theme === 'dark' ? '#4ade80' : '#16a34a' }}
                    />
                  ) : (
                    <Plus
                      className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}
                    />
                  )}
                </div>

                {/* Platform name */}
                <h4
                  className="text-sm font-heading font-medium mb-1"
                  style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
                >
                  {platform.name}
                </h4>

                {/* Platform description */}
                <p
                  className="text-xs font-body line-clamp-1"
                  style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#78716c' }}
                >
                  {platform.description}
                </p>

                {/* Minimal data points display (only if connected and has data) */}
                {isConnected && platform.dataPoints > 0 && (
                  <div
                    className="mt-3 pt-3"
                    style={{
                      borderTopWidth: '1px',
                      borderTopStyle: 'solid',
                      borderTopColor: theme === 'dark' ? 'rgba(193, 192, 182, 0.1)' : 'rgba(0, 0, 0, 0.06)'
                    }}
                  >
                    <span
                      className="text-xs font-medium"
                      style={{ color: theme === 'dark' ? '#C1C0B6' : '#0c0a09' }}
                    >
                      {platform.dataPoints.toLocaleString()} data points
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
