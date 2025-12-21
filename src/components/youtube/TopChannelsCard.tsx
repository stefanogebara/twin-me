import React from 'react';
import { motion } from 'framer-motion';
import { Users, Video, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { TopChannel } from '@/hooks/useYouTubeInsights';

interface TopChannelsCardProps {
  channels: TopChannel[];
  className?: string;
}

export const TopChannelsCard: React.FC<TopChannelsCardProps> = ({
  channels,
  className = ''
}) => {
  // Get max videos watched for scaling bars
  const maxVideos = Math.max(...channels.map(c => c.videosWatched), 1);

  // Format subscriber count
  const formatSubscribers = (subs: string): string => {
    return subs; // Already formatted from backend (e.g., "1.2M", "50K")
  };

  // Format watch time
  const formatWatchTime = (minutes: number): string => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <Card className={`bg-white border border-stone-200 p-6 shadow-md hover:shadow-lg transition-shadow duration-200 ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#FF0000]/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-[#FF0000]" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-medium text-stone-900">
            Top Channels
          </h3>
          <p className="text-xs text-stone-500">
            Your favorite creators
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {channels.slice(0, 5).map((channel, index) => (
          <motion.div
            key={channel.channel}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="group"
          >
            <div className="flex items-start justify-between mb-2 gap-3">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <span className="font-ui text-sm font-medium text-stone-400 flex-shrink-0 mt-0.5">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-ui text-sm font-medium text-stone-900 truncate mb-1">
                    {channel.channel}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    <span className="truncate">
                      {formatSubscribers(channel.subscribers)} subscribers
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <div className="flex items-center gap-1 text-xs text-stone-600">
                  <Video className="w-3 h-3 text-[#FF0000]" />
                  <span className="font-mono">{channel.videosWatched}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-stone-500">
                  <Clock className="w-3 h-3" />
                  <span>{formatWatchTime(channel.avgWatchTime)}</span>
                </div>
              </div>
            </div>

            {/* Visual bar */}
            <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(channel.videosWatched / maxVideos) * 100}%` }}
                transition={{ delay: index * 0.1 + 0.2, duration: 0.6, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-[#FF0000] to-[#FF4444] rounded-full"
              />
            </div>
          </motion.div>
        ))}
      </div>

      {channels.length === 0 && (
        <div className="text-center py-8">
          <Users className="w-12 h-12 text-stone-600 mx-auto mb-3" />
          <p className="text-sm text-stone-500">
            No channel data available yet
          </p>
        </div>
      )}
    </Card>
  );
};
