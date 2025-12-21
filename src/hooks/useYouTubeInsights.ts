import { useQuery } from '@tanstack/react-query';

// TypeScript Interfaces
export interface YouTubeVideo {
  title: string;
  channel: string;
  views: number;
  duration_minutes: number;
  category: string;
}

export interface YouTubeCategory {
  category: string;
  percentage: number;
  count: number;
  watchTime: number;
}

export interface WatchPatterns {
  peakHours: {
    start: number;
    end: number;
    label: string;
  };
  avgVideosPerSession: number;
  avgWatchDuration: number;
  completionRate: number;
  weekdayVsWeekend: {
    weekday: number;
    weekend: number;
  };
}

export interface TopChannel {
  channel: string;
  subscribers: string;
  videosWatched: number;
  avgWatchTime: number;
}

export interface RecentlyWatched {
  title: string;
  channel: string;
  watched_at: string;
  duration: number;
}

export interface YouTubeInsights {
  topVideos: YouTubeVideo[];
  categories: YouTubeCategory[];
  watchPatterns: WatchPatterns;
  topChannels: TopChannel[];
  recentlyWatched: RecentlyWatched[];
  totalHoursWatched: number;
  totalVideosWatched: number;
}

interface UseYouTubeInsightsParams {
  userId: string;
  enabled?: boolean;
}

/**
 * React Query hook for fetching YouTube insights data
 * @param userId - The user ID to fetch YouTube data for
 * @param enabled - Optional flag to enable/disable the query
 */
export const useYouTubeInsights = ({ userId, enabled = true }: UseYouTubeInsightsParams) => {
  return useQuery<YouTubeInsights>({
    queryKey: ['youtube-insights', userId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/test-extraction/youtube-insights/${userId}`,
        {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch YouTube insights');
      }

      return response.json();
    },
    enabled: enabled && !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
};
