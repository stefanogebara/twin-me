import React from 'react';
import { GlassPanel } from '@/components/layout/PageLayout';
import { Music, Users, PieChart, BarChart3 } from 'lucide-react';

interface SpotifyEmptyStateProps {
  colors: {
    text: string;
    textSecondary: string;
    spotifyGreen: string;
  };
  theme: string;
  navigate: (path: string) => void;
}

export const SpotifyEmptyState: React.FC<SpotifyEmptyStateProps> = ({
  colors,
  theme,
  navigate,
}) => {
  return (
    <div className="space-y-4">
      <GlassPanel className="text-center py-10">
        <Music className="w-12 h-12 mx-auto mb-4" style={{ color: colors.textSecondary }} />
        <h3 style={{ color: colors.text, fontFamily: 'var(--font-heading)' }}>
          Your twin is listening
        </h3>
        <p className="mt-2 mb-6 max-w-sm mx-auto" style={{ color: colors.textSecondary }}>
          As you listen to music, your twin will notice patterns and share observations.
        </p>
        <button
          onClick={() => navigate('/get-started')}
          className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{ backgroundColor: colors.spotifyGreen, color: '#fff' }}
        >
          Connect Spotify
        </button>
        <div
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(29, 185, 84, 0.08)' : 'rgba(29, 185, 84, 0.05)',
            color: colors.spotifyGreen,
            border: '1px solid rgba(29, 185, 84, 0.2)',
          }}
        >
          <div aria-hidden="true" className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: colors.spotifyGreen }} />
          Your twin is collecting data... check back soon
        </div>
      </GlassPanel>

      {/* Preview cards showing what insights will look like */}
      <div aria-hidden="true" className="opacity-50 pointer-events-none space-y-3">
        <p className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>
          Preview of your insights
        </p>
        {/* Placeholder: Top Artists */}
        <GlassPanel className="!p-4" style={{ border: '1px dashed' }}>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4" style={{ color: colors.textSecondary }} />
            <span className="text-sm" style={{ color: colors.textSecondary }}>Top Artists</span>
          </div>
          <div className="space-y-2">
            {[80, 60, 40].map((width, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-20 h-3 rounded animate-pulse" style={{ backgroundColor: theme === 'dark' ? 'rgba(193,192,182,0.08)' : 'rgba(0,0,0,0.04)' }} />
                <div className="flex-1 h-4 rounded-lg overflow-hidden animate-pulse" style={{ backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)' }}>
                  <div className="h-full rounded-lg" style={{ width: `${width}%`, backgroundColor: `${colors.spotifyGreen}40` }} />
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
        {/* Placeholder: Genre + Listening Hours */}
        <div className="grid grid-cols-2 gap-3">
          <GlassPanel className="!p-4" style={{ border: '1px dashed' }}>
            <div className="flex items-center gap-2 mb-3">
              <PieChart className="w-4 h-4" style={{ color: colors.textSecondary }} />
              <span className="text-sm" style={{ color: colors.textSecondary }}>Genres</span>
            </div>
            <div className="w-16 h-16 mx-auto rounded-full" style={{ border: `3px dashed ${theme === 'dark' ? 'rgba(193,192,182,0.12)' : 'rgba(0,0,0,0.08)'}` }} />
          </GlassPanel>
          <GlassPanel className="!p-4" style={{ border: '1px dashed' }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4" style={{ color: colors.textSecondary }} />
              <span className="text-sm" style={{ color: colors.textSecondary }}>Peak Hours</span>
            </div>
            <div className="flex items-end gap-1 h-12">
              {[3, 5, 8, 6, 4, 7, 3].map((h, i) => (
                <div key={i} className="flex-1 rounded-t" style={{ height: `${h * 12}%`, backgroundColor: `${colors.spotifyGreen}20` }} />
              ))}
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
};
