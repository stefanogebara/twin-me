import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Play, Music2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { SpotifyRecentlyPlayed } from '@/hooks/useSpotifyInsights';
import { formatDistanceToNow } from 'date-fns';

interface RecentlyPlayedCardProps {
  recentlyPlayed: SpotifyRecentlyPlayed[];
  className?: string;
}

export const RecentlyPlayedCard: React.FC<RecentlyPlayedCardProps> = ({
  recentlyPlayed,
  className = ''
}) => {
  // Format the time ago
  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'recently';
    }
  };

  return (
    <Card className={`bg-white border border-stone-200 p-6 shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#1DB954]/10 flex items-center justify-center">
          <Clock className="w-5 h-5 text-[#1DB954]" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-medium text-stone-900">Recently Played</h3>
          <p className="text-xs text-stone-600">Your latest listening activity</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {recentlyPlayed.map((item, index) => (
          <motion.div
            key={`${item.track}-${item.played_at}-${index}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="relative pl-8"
          >
            {/* Timeline Line */}
            {index < recentlyPlayed.length - 1 && (
              <div className="absolute left-[11px] top-8 bottom-0 w-[2px] bg-stone-200" />
            )}

            {/* Timeline Dot */}
            <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-[#1DB954]/10 flex items-center justify-center">
              <Play className="w-3 h-3 text-[#1DB954] fill-[#1DB954]" />
            </div>

            {/* Content */}
            <div className="pb-4">
              <p className="font-ui text-sm font-medium text-stone-900 mb-0.5">
                {item.track}
              </p>
              <p className="text-xs text-stone-600 mb-1">{item.artist}</p>
              <p className="text-xs text-stone-500">
                {formatTimeAgo(item.played_at)}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Empty State */}
      {recentlyPlayed.length === 0 && (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3">
            <Music2 className="w-6 h-6 text-stone-400" />
          </div>
          <p className="text-sm text-stone-600 mb-1">No recent activity</p>
          <p className="text-xs text-stone-500">Start listening to see your history</p>
        </div>
      )}
    </Card>
  );
};
