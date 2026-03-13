import React from 'react';
import { Youtube, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useYouTubeInsights } from '@/hooks/useYouTubeInsights';
import { TopVideosCard } from './TopVideosCard';
import { CategoryDistributionChart } from './CategoryDistributionChart';
import { WatchPatternsCard } from './WatchPatternsCard';
import { TopChannelsCard } from './TopChannelsCard';
import { RecentlyWatchedCard } from './RecentlyWatchedCard';

interface YouTubeInsightsProps {
  userId: string;
  className?: string;
}

export const YouTubeInsights: React.FC<YouTubeInsightsProps> = ({
  userId,
  className = ''
}) => {
  const { data: insights, isLoading, isError, error, refetch } = useYouTubeInsights({ userId });

  // Loading state
  if (isLoading) {
    return (
      <Card className={`p-12 ${className}`}>
        <div className="flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-[#FF0000]/10 flex items-center justify-center mb-4">
            <Loader2 className="w-8 h-8 text-[#FF0000] animate-spin" />
          </div>
          <h3 className="text-lg font-medium mb-2" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
            Analyzing Your Learning Journey
          </h3>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Extracting insights from your YouTube data...
          </p>
        </div>
      </Card>
    );
  }

  // Error state
  if (isError) {
    return (
      <Card className={`p-8 ${className}`}>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-red-900/20 flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-lg font-medium mb-2" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
            Unable to Load YouTube Insights
          </h3>
          <p className="text-sm mb-6 max-w-md" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {error?.message || 'We couldn\'t retrieve your YouTube data. Please try again.'}
          </p>
          <Button
            onClick={() => refetch()}
            variant="outline"
            className="gap-2"
          >
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  // Empty state
  if (!insights || (!insights.topVideos?.length && !insights.categories?.length)) {
    return (
      <Card className={`p-8 ${className}`}>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-[#FF0000]/10 flex items-center justify-center mb-4">
            <Youtube className="w-8 h-8 text-[#FF0000]" />
          </div>
          <h3 className="text-lg font-medium mb-2" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
            No YouTube Data Yet
          </h3>
          <p className="text-sm mb-6 max-w-md" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Connect your YouTube account to discover your learning and discovery patterns
          </p>
          <Button
            onClick={() => window.location.href = '/get-started'}
            className="gap-2 bg-[#FF0000] hover:bg-[#CC0000] text-white"
          >
            <Youtube className="w-4 h-4" />
            Connect YouTube
          </Button>
        </div>
      </Card>
    );
  }

  // Calculate totals
  const totalVideos = insights.totalVideosWatched || 0;
  const totalCategories = insights.categories?.length || 0;
  const totalHours = Math.floor(insights.totalHoursWatched || 0);

  return (
    <div className={className}>
      {/* Header Section */}
      <div
        className="rounded-lg p-8 mb-6"
        style={{
          background: 'linear-gradient(to bottom right, rgba(255,0,0,0.05), rgba(255,255,255,0.02))',
          border: '1px solid rgba(255,0,0,0.2)',
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-[#FF0000] flex items-center justify-center flex-shrink-0">
              <Youtube className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-medium mb-2" style={{ fontFamily: "'Inter', sans-serif", color: 'var(--foreground)' }}>
                Learning & Discovery Journey
              </h2>
              <p className="text-base mb-3" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(255,255,255,0.3)' }}>
                Your authentic curiosity patterns from YouTube
              </p>
              <div className="flex items-center gap-4 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#FF0000]" />
                  <span>{totalVideos} Videos</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#FF0000]" />
                  <span>{totalCategories} Categories</span>
                </div>
                {totalHours > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#FF0000]" />
                    <span>{totalHours}h Watched</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <a
            href="https://www.youtube.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-[#FF0000] hover:text-[#CC0000] transition-colors"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            View on YouTube
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Insights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Top Videos */}
        {insights.topVideos && insights.topVideos.length > 0 && (
          <TopVideosCard
            videos={insights.topVideos}
            className="md:col-span-1"
          />
        )}

        {/* Category Distribution */}
        {insights.categories && insights.categories.length > 0 && (
          <CategoryDistributionChart
            categories={insights.categories}
            className="md:col-span-1"
          />
        )}

        {/* Watch Patterns */}
        {insights.watchPatterns && (
          <WatchPatternsCard
            patterns={insights.watchPatterns}
            className="md:col-span-1"
          />
        )}

        {/* Top Channels */}
        {insights.topChannels && insights.topChannels.length > 0 && (
          <TopChannelsCard
            channels={insights.topChannels}
            className="md:col-span-1"
          />
        )}

        {/* Recently Watched - Spans full width */}
        {insights.recentlyWatched && insights.recentlyWatched.length > 0 && (
          <RecentlyWatchedCard
            recentlyWatched={insights.recentlyWatched}
            className="md:col-span-2 lg:col-span-3"
          />
        )}
      </div>

      {/* Footer Note */}
      <div className="mt-6 text-center">
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Data extracted from your YouTube watch history and preferences
        </p>
      </div>
    </div>
  );
};
