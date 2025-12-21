import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Play, Video } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { RecentlyWatched } from '@/hooks/useYouTubeInsights';
import { formatDistanceToNow } from 'date-fns';

interface RecentlyWatchedCardProps {
  recentlyWatched: RecentlyWatched[];
  className?: string;
}

export const RecentlyWatchedCard: React.FC<RecentlyWatchedCardProps> = ({
  recentlyWatched,
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

  // Format duration
  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <Card className={`bg-white border border-stone-200 p-6 shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#FF0000]/10 flex items-center justify-center">
          <Clock className="w-5 h-5 text-[#FF0000]" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-medium text-stone-900">Recently Watched</h3>
          <p className="text-xs text-stone-600">Your latest viewing activity</p>
        </div>
      </div>

      {/* Timeline Grid - Horizontal layout for better use of space */}
      {recentlyWatched.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {recentlyWatched.map((item, index) => (
            <motion.div
              key={`${item.title}-${item.watched_at}-${index}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="relative group"
            >
              <div className="bg-stone-50 rounded-lg p-4 hover:bg-stone-100 transition-colors border border-stone-200 hover:border-[#FF0000]/30 h-full">
                {/* Video Icon */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-[#FF0000]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Video className="w-4 h-4 text-[#FF0000]" />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-stone-500">
                    <Clock className="w-3 h-3" />
                    <span>{formatDuration(item.duration)}</span>
                  </div>
                </div>

                {/* Content */}
                <div>
                  <p className="font-ui text-sm font-medium text-stone-900 mb-2 line-clamp-2">
                    {item.title}
                  </p>
                  <p className="text-xs text-stone-600 mb-2 truncate">
                    {item.channel}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-stone-500">
                    <Play className="w-3 h-3 text-[#FF0000]" />
                    <span>{formatTimeAgo(item.watched_at)}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3">
            <Video className="w-6 h-6 text-stone-400" />
          </div>
          <p className="text-sm text-stone-600 mb-1">No recent activity</p>
          <p className="text-xs text-stone-500">Start watching to see your history</p>
        </div>
      )}
    </Card>
  );
};
