import React from 'react';
import { motion } from 'framer-motion';
import { Music, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSpotifyInsights } from '@/hooks/useSpotifyInsights';
import { TopArtistsCard } from './TopArtistsCard';
import { TopTracksCard } from './TopTracksCard';
import { GenreDistributionChart } from './GenreDistributionChart';
import { ListeningPatternsCard } from './ListeningPatternsCard';
import { AudioFeaturesRadar } from './AudioFeaturesRadar';
import { RecentlyPlayedCard } from './RecentlyPlayedCard';

interface SpotifyMusicInsightsProps {
  userId: string;
  className?: string;
}

export const SpotifyMusicInsights: React.FC<SpotifyMusicInsightsProps> = ({
  userId,
  className = ''
}) => {
  const { data: insights, isLoading, isError, error, refetch } = useSpotifyInsights({ userId });

  // Loading state
  if (isLoading) {
    return (
      <Card className={`bg-white border border-stone-200 p-12 ${className}`}>
        <div className="flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-[#1DB954]/10 flex items-center justify-center mb-4">
            <Loader2 className="w-8 h-8 text-[#1DB954] animate-spin" />
          </div>
          <h3 className="font-heading text-lg font-medium text-stone-900 mb-2">
            Analyzing Your Musical Soul
          </h3>
          <p className="text-sm text-stone-600">
            Extracting insights from your Spotify data...
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
            Unable to Load Spotify Insights
          </h3>
          <p className="text-sm text-stone-600 mb-6 max-w-md">
            {error?.message || 'We couldn\'t retrieve your Spotify data. Please try again.'}
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
  if (!insights || (!insights.topArtists?.length && !insights.genres?.length)) {
    return (
      <Card className={`bg-white border border-stone-200 p-8 ${className}`}>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-[#1DB954]/10 flex items-center justify-center mb-4">
            <Music className="w-8 h-8 text-[#1DB954]" />
          </div>
          <h3 className="font-heading text-lg font-medium text-stone-900 mb-2">
            No Spotify Data Yet
          </h3>
          <p className="text-sm text-stone-600 mb-6 max-w-md">
            Connect your Spotify account to discover your musical soul signature
          </p>
          <Button
            onClick={() => window.location.href = '/get-started'}
            className="gap-2 bg-[#1DB954] hover:bg-[#1ed760] text-white"
          >
            <Music className="w-4 h-4" />
            Connect Spotify
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={className}
    >
      {/* Header Section */}
      <Card className="bg-gradient-to-br from-[#1DB954]/5 to-white border border-[#1DB954]/20 p-8 mb-6 shadow-md">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-[#1DB954] flex items-center justify-center flex-shrink-0">
              <Music className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="font-heading text-2xl font-medium text-stone-900 mb-2">
                Musical Soul Signature
              </h2>
              <p className="text-base font-body text-stone-700 mb-3">
                Your authentic listening personality from Spotify
              </p>
              <div className="flex items-center gap-4 text-xs text-stone-600">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1DB954]" />
                  <span>{insights.topArtists?.length || 0} Artists</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1DB954]" />
                  <span>{insights.topTracks?.length || 0} Tracks</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1DB954]" />
                  <span>{insights.genres?.length || 0} Genres</span>
                </div>
                {insights.listeningPatterns && (
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1DB954]" />
                    <span>{Math.floor(insights.listeningPatterns.totalMinutesListened / 60)}h Listened</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <a
            href="https://open.spotify.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs font-ui text-[#1DB954] hover:text-[#1ed760] transition-colors"
          >
            View on Spotify
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </Card>

      {/* Insights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Top Artists */}
        {insights.topArtists && insights.topArtists.length > 0 && (
          <TopArtistsCard
            artists={insights.topArtists}
            className="md:col-span-1"
          />
        )}

        {/* Top Tracks */}
        {insights.topTracks && insights.topTracks.length > 0 && (
          <TopTracksCard
            tracks={insights.topTracks}
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

        {/* Listening Patterns */}
        {insights.listeningPatterns && (
          <ListeningPatternsCard
            patterns={insights.listeningPatterns}
            className="md:col-span-1"
          />
        )}

        {/* Recently Played */}
        {insights.recentlyPlayed && insights.recentlyPlayed.length > 0 && (
          <RecentlyPlayedCard
            recentlyPlayed={insights.recentlyPlayed}
            className="md:col-span-1"
          />
        )}

        {/* Audio Features - Spans full width */}
        {insights.audioFeatures && (
          <AudioFeaturesRadar
            audioFeatures={insights.audioFeatures}
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
          Data extracted from your Spotify listening history and preferences
        </p>
      </motion.div>
    </motion.div>
  );
};
