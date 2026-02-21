import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { Clock, Award } from 'lucide-react';
import { GlassPanel } from '@/components/layout/PageLayout';
import { Clay3DIcon } from '@/components/Clay3DIcon';

interface PlatformStatus {
  id: string;
  name: string;
  connected: boolean;
  expired?: boolean;
  color: string;
}

interface YourPatternsSectionProps {
  platforms: PlatformStatus[];
  isCalendarConnected: boolean;
  isSpotifyConnected: boolean;
  todayEventsCount: number;
  onNavigate: (path: string) => void;
}

export const YourPatternsSection: React.FC<YourPatternsSectionProps> = ({
  platforms,
  isCalendarConnected,
  isSpotifyConnected,
  todayEventsCount,
  onNavigate,
}) => {
  const { theme } = useTheme();

  if (platforms.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-1 h-5 rounded-full"
          style={{
            background: 'linear-gradient(to bottom, var(--accent-vibrant), rgba(212, 168, 83, 0.2))'
          }}
        />
        <h3
          className="text-sm uppercase tracking-wider font-semibold"
          style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.8)' : '#57534e' }}
        >
          Your Patterns
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isCalendarConnected && (
          <GlassPanel variant="shimmer" hover className="cursor-pointer" onClick={() => onNavigate('/insights/calendar')}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                backgroundColor: theme === 'dark' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.05)'
              }}>
                <Clock className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <h4 className="text-sm mb-1" style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 500,
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}>Optimal Prep Time</h4>
                <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}>
                  {todayEventsCount > 0 ? `${todayEventsCount} events shaping your day` : 'Your schedule patterns'}
                </p>
              </div>
            </div>
          </GlassPanel>
        )}
        {isSpotifyConnected && (
          <GlassPanel variant="shimmer" hover className="cursor-pointer" onClick={() => onNavigate('/insights/spotify')}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.05)'
              }}>
                <Clay3DIcon name="headphones" size={20} />
              </div>
              <div>
                <h4 className="text-sm mb-1" style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 500,
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}>Focus Music</h4>
                <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}>
                  Your listening shapes your flow
                </p>
              </div>
            </div>
          </GlassPanel>
        )}
        {platforms.length >= 2 && (
          <GlassPanel variant="shimmer" hover className="cursor-pointer" onClick={() => onNavigate('/soul-signature')}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                backgroundColor: theme === 'dark' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.05)'
              }}>
                <Award className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h4 className="text-sm mb-1" style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 500,
                  color: theme === 'dark' ? '#C1C0B6' : '#0c0a09'
                }}>{platforms.length} Platforms Connected</h4>
                <p className="text-xs" style={{ color: theme === 'dark' ? 'rgba(193, 192, 182, 0.6)' : '#a8a29e' }}>
                  Building your soul signature
                </p>
              </div>
            </div>
          </GlassPanel>
        )}
      </div>
    </div>
  );
};
