import React from 'react';
import { motion } from 'framer-motion';
import { Film, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNetflixInsights } from '@/hooks/useNetflixInsights';
import { TopContentCard } from './TopContentCard';
import { GenreDistributionChart } from './GenreDistributionChart';
import { BingePatternsCard } from './BingePatternsCard';
import { RecentlyWatchedCard } from './RecentlyWatchedCard';

interface NetflixInsightsProps {
  userId: string;
  className?: string;
}

export const NetflixInsights: React.FC<NetflixInsightsProps> = ({
  userId,
  className = ''
}) => {
  const { data: insights, isLoading, isError, error, refetch } = useNetflixInsights({ userId });

  // Loading state
  if (isLoading) {
    return (
      <Card className={`bg-white border border-stone-200 p-12 ${className}`}>
        <div className="flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-[#E50914]/10 flex items-center justify-center mb-4">
            <Loader2 className="w-8 h-8 text-[#E50914] animate-spin" />
          </div>
          <h3 className="font-heading text-lg font-medium text-stone-900 mb-2">
            Analyzing Your Viewing Soul
          </h3>
          <p className="text-sm text-stone-600">
            Extracting insights from your Netflix data...
          </p>
        </div>
      </Card>
    );
  }

  // Error state
  if (isError) {
    return (
      <Card className={`bg-white border border-red-200 p-8 ${className}`}>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="font-heading text-lg font-medium text-stone-900 mb-2">
            Unable to Load Netflix Insights
          </h3>
          <p className="text-sm text-stone-600 mb-6 max-w-md">
            {error?.message || 'We couldn\'t retrieve your Netflix data. Please try again.'}
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
  if (!insights || (!insights.topContent?.length && !insights.genres?.length)) {
    return (
      <Card className={`bg-white border border-stone-200 p-8 ${className}`}>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-[#E50914]/10 flex items-center justify-center mb-4">
            <Film className="w-8 h-8 text-[#E50914]" />
          </div>
          <h3 className="font-heading text-lg font-medium text-stone-900 mb-2">
            No Netflix Data Yet
          </h3>
          <p className="text-sm text-stone-600 mb-6 max-w-md">
            Connect your Netflix account to discover your viewing soul signature
          </p>
          <Button
            onClick={() => window.location.href = '/get-started'}
            className="gap-2 bg-[#E50914] hover:bg-[#B20710] text-white"
          >
            <Film className="w-4 h-4" />
            Connect Netflix
          </Button>
        </div>
      </Card>
    );
  }

  // Calculate total shows/movies count
  const totalContent = insights.topContent?.length || 0;
  const totalGenres = insights.genres?.length || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={className}
    >
      {/* Header Section */}
      <Card className="bg-gradient-to-br from-[#E50914]/5 to-white border border-[#E50914]/20 p-8 mb-6 shadow-md">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-[#E50914] flex items-center justify-center flex-shrink-0">
              <Film className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="font-heading text-2xl font-medium text-stone-900 mb-2">
                Viewing Soul Signature
              </h2>
              <p className="text-base font-body text-stone-700 mb-3">
                Your authentic narrative preferences from Netflix
              </p>
              <div className="flex items-center gap-4 text-xs text-stone-600">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#E50914]" />
                  <span>{totalContent} Shows/Movies</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#E50914]" />
                  <span>{totalGenres} Genres</span>
                </div>
                {insights.totalHoursWatched > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#E50914]" />
                    <span>{Math.floor(insights.totalHoursWatched)}h Watched</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <a
            href="https://www.netflix.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs font-ui text-[#E50914] hover:text-[#B20710] transition-colors"
          >
            View on Netflix
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </Card>

      {/* Insights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Top Content */}
        {insights.topContent && insights.topContent.length > 0 && (
          <TopContentCard
            content={insights.topContent}
            className="md:col-span-1"
          />
        )}

        {/* Genre Distribution */}
        {insights.genres && insights.genres.length > 0 && (
          <GenreDistributionChart
            genres={insights.genres}
            className="md:col-span-1"
          />
        )}

        {/* Binge Patterns */}
        {insights.bingePatterns && (
          <BingePatternsCard
            patterns={insights.bingePatterns}
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-6 text-center"
      >
        <p className="text-xs text-stone-500">
          Data extracted from your Netflix viewing history and preferences
        </p>
      </motion.div>
    </motion.div>
  );
};
