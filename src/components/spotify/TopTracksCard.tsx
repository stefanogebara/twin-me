import React from 'react';
import { motion } from 'framer-motion';
import { Music2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { SpotifyTrack } from '@/hooks/useSpotifyInsights';

interface TopTracksCardProps {
  tracks: SpotifyTrack[];
  className?: string;
}

export const TopTracksCard: React.FC<TopTracksCardProps> = ({ tracks, className = '' }) => {
  // Take top 5 tracks
  const topTracks = tracks.slice(0, 5);

  // Calculate max plays for progress bar scaling
  const maxPlays = Math.max(...topTracks.map(t => t.plays));

  // Format duration from ms to mm:ss
  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <Card className={`bg-white border border-stone-200 p-6 shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#1DB954]/10 flex items-center justify-center">
          <Music2 className="w-5 h-5 text-[#1DB954]" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-medium text-stone-900">Top Tracks</h3>
          <p className="text-xs text-stone-600">Your most played songs</p>
        </div>
      </div>

      {/* Tracks List */}
      <div className="space-y-4">
        {topTracks.map((track, index) => (
          <motion.div
            key={`${track.name}-${track.artist}-${index}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded flex items-center justify-center bg-stone-100 text-xs font-medium text-stone-600 group-hover:bg-[#1DB954]/10 group-hover:text-[#1DB954] transition-colors">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-ui text-sm font-medium text-stone-900 truncate">
                  {track.name}
                </p>
                <p className="text-xs text-stone-600 truncate">{track.artist}</p>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-stone-900">{track.plays}</div>
                <div className="text-xs text-stone-500">{formatDuration(track.duration_ms)}</div>
              </div>
            </div>
            {/* Progress Bar */}
            <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#1DB954] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(track.plays / maxPlays) * 100}%` }}
                transition={{ delay: index * 0.1 + 0.2, duration: 0.6 }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Footer */}
      {tracks.length > 5 && (
        <div className="mt-4 pt-4 border-t border-stone-200">
          <p className="text-xs text-stone-500 text-center">
            +{tracks.length - 5} more tracks in your library
          </p>
        </div>
      )}
    </Card>
  );
};
