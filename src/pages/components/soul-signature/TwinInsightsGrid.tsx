import React from 'react';
import { Heart } from 'lucide-react';
import { GlassPanel } from '../../../components/layout/PageLayout';
import { SpotifyLogo, GoogleCalendarLogo } from '@/components/PlatformLogos';
import { ThemeColors } from './types';

interface TwinInsightsGridProps {
  onNavigate: (path: string) => void;
  colors: ThemeColors;
}

export const TwinInsightsGrid: React.FC<TwinInsightsGridProps> = ({
  onNavigate,
  colors
}) => {
  const { textColor, textMuted } = colors;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <GlassPanel
        hover
        className="cursor-pointer !p-4"
        onClick={() => onNavigate('/insights/spotify')}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(29, 185, 84, 0.1)' }}
          >
            <SpotifyLogo className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm mb-1" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
              Your Musical Soul
            </h4>
            <p className="text-xs" style={{ color: textMuted }}>
              What your listening reveals
            </p>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel
        hover
        className="cursor-pointer !p-4"
        onClick={() => onNavigate('/insights/whoop')}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(6, 182, 212, 0.1)' }}
          >
            <Heart className="w-5 h-5" style={{ color: '#06B6D4' }} />
          </div>
          <div>
            <h4 className="text-sm mb-1" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
              Body Stories
            </h4>
            <p className="text-xs" style={{ color: textMuted }}>
              What your body tells you
            </p>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel
        hover
        className="cursor-pointer !p-4"
        onClick={() => onNavigate('/insights/calendar')}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)' }}
          >
            <GoogleCalendarLogo className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm mb-1" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, color: textColor }}>
              Time Patterns
            </h4>
            <p className="text-xs" style={{ color: textMuted }}>
              How you structure your days
            </p>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
};
