import React from 'react';
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
    <Card className={`p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#1DB954]/10 flex items-center justify-center">
          <Clock className="w-5 h-5 text-[#1DB954]" />
        </div>
        <div>
          <h3 className="text-lg font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>Recently Played</h3>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Your latest listening activity</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {recentlyPlayed.map((item, index) => (
          <div
            key={`${item.track}-${item.played_at}-${index}`}
            className="relative pl-8"
          >
            {/* Timeline Line */}
            {index < recentlyPlayed.length - 1 && (
              <div className="absolute left-[11px] top-8 bottom-0 w-[2px] bg-white/10" />
            )}

            {/* Timeline Dot */}
            <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-[#1DB954]/10 flex items-center justify-center">
              <Play className="w-3 h-3 text-[#1DB954] fill-[#1DB954]" />
            </div>

            {/* Content */}
            <div className="pb-4">
              <p className="text-sm font-medium mb-0.5" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
                {item.track}
              </p>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.artist}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {formatTimeAgo(item.played_at)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {recentlyPlayed.length === 0 && (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-white/8 flex items-center justify-center mx-auto mb-3">
            <Music2 className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.3)' }} />
          </div>
          <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>No recent activity</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Start listening to see your history</p>
        </div>
      )}
    </Card>
  );
};
