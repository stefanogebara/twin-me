import React from 'react';
import { motion } from 'framer-motion';
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
    <Card className={`bg-white border border-stone-200 p-6 shadow-md hover:shadow-lg transition-shadow duration-200 ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#1DB954]/10 flex items-center justify-center">
          <Music2 className="w-5 h-5 text-[#1DB954]" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-medium text-stone-900">
            Top Artists
          </h3>
          <p className="text-xs text-stone-500">
            Your most listened artists
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {artists.slice(0, 5).map((artist, index) => (
          <motion.div
            key={artist.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-ui text-sm font-medium text-stone-400 flex-shrink-0">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-ui text-sm font-medium text-stone-900 truncate">
                    {artist.name}
                  </p>
                  <p className="text-xs text-stone-500 truncate">
                    {artist.genre}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <span className="text-xs font-mono text-stone-600">
                  {artist.plays.toLocaleString()}
                </span>
                {artist.popularity >= 80 && (
                  <TrendingUp className="w-3 h-3 text-[#1DB954]" />
                )}
              </div>
            </div>

            {/* Visual bar */}
            <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(artist.plays / maxPlays) * 100}%` }}
                transition={{ delay: index * 0.1 + 0.2, duration: 0.6, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-[#1DB954] to-[#1ed760] rounded-full"
              />
            </div>
          </motion.div>
        ))}
      </div>

      {artists.length === 0 && (
        <div className="text-center py-8">
          <Music2 className="w-12 h-12 text-stone-600 mx-auto mb-3" />
          <p className="text-sm text-stone-500">
            No artist data available yet
          </p>
        </div>
      )}
    </Card>
  );
};
