import React from 'react';
import { Music2, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { SpotifyArtist } from '@/hooks/useSpotifyInsights';

interface TopArtistsCardProps {
  artists: SpotifyArtist[];
  className?: string;
}

export const TopArtistsCard: React.FC<TopArtistsCardProps> = ({ artists, className = '' }) => {
  // Get max plays for scaling bars
  const maxPlays = Math.max(...artists.map(a => a.plays), 1);

  return (
    <Card className={`p-6 ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#1DB954]/10 flex items-center justify-center">
          <Music2 className="w-5 h-5 text-[#1DB954]" />
        </div>
        <div>
          <h3 className="text-lg font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
            Top Artists
          </h3>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Your most listened artists
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {artists.slice(0, 5).map((artist, index) => (
          <div
            key={artist.name}
            className="group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-sm font-medium flex-shrink-0" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.3)' }}>
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
                    {artist.name}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {artist.genre}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {artist.plays.toLocaleString('en-US')}
                </span>
                {artist.popularity >= 80 && (
                  <TrendingUp className="w-3 h-3 text-[#1DB954]" />
                )}
              </div>
            </div>

            {/* Visual bar */}
            <div className="w-full h-1.5 bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#1DB954] to-[#1ed760] rounded-full transition-all duration-600"
                style={{ width: `${(artist.plays / maxPlays) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {artists.length === 0 && (
        <div className="text-center py-8">
          <Music2 className="w-12 h-12 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
            No artist data available yet
          </p>
        </div>
      )}
    </Card>
  );
};
