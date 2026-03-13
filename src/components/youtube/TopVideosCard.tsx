import React from 'react';
import { Video, Eye, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { YouTubeVideo } from '@/hooks/useYouTubeInsights';

interface TopVideosCardProps {
  videos: YouTubeVideo[];
  className?: string;
}

export const TopVideosCard: React.FC<TopVideosCardProps> = ({ videos, className = '' }) => {
  // Get max views for scaling bars
  const maxViews = Math.max(...videos.map(v => v.views), 1);

  // Format duration
  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <Card className={`p-6 ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#FF0000]/10 flex items-center justify-center">
          <Video className="w-5 h-5 text-[#FF0000]" />
        </div>
        <div>
          <h3 className="text-lg font-medium" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
            Top Videos
          </h3>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Your most watched content
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {videos.slice(0, 5).map((video, index) => (
          <div
            key={`${video.title}-${index}`}
            className="group"
          >
            <div className="flex items-start justify-between mb-2 gap-3">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <span className="text-sm font-medium flex-shrink-0 mt-0.5" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.3)' }}>
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium line-clamp-2 mb-1" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
                    {video.title}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {video.channel}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <div className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  <Eye className="w-3 h-3 text-[#FF0000]" />
                  <span className="font-mono">{video.views.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  <Clock className="w-3 h-3" />
                  <span>{formatDuration(video.duration_minutes)}</span>
                </div>
              </div>
            </div>

            {/* Visual bar */}
            <div className="w-full h-1.5 bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#FF0000] to-[#FF4444] rounded-full transition-all duration-600"
                style={{ width: `${(video.views / maxViews) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {videos.length === 0 && (
        <div className="text-center py-8">
          <Video className="w-12 h-12 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
            No video data available yet
          </p>
        </div>
      )}
    </Card>
  );
};
