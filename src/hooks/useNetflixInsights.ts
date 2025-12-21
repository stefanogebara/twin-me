import { useQuery } from '@tanstack/react-query';

// TypeScript Interfaces
export interface NetflixContent {
  title: string;
  type: 'TV Show' | 'Movie';
  watchCount: number;
  runtime_minutes: number;
}

export interface NetflixGenre {
  genre: string;
  percentage: number;
  count: number;
}

export interface BingePatterns {
  peakHours: {
    start: number;
    end: number;
    label: string;
  };
  avgEpisodesPerSession: number;
  longestBinge: {
    hours: number;
    title: string;
  };
  weekdayVsWeekend: {
    weekday: number;
    weekend: number;
  };
}

export interface RecentlyWatched {
  title: string;
  type: 'TV Show' | 'Movie';
  watched_at: string;
}

export interface NetflixInsights {
  topContent: NetflixContent[];
  genres: NetflixGenre[];
  bingePatterns: BingePatterns;
  recentlyWatched: RecentlyWatched[];
  totalHoursWatched: number;
}

interface UseNetflixInsightsParams {
  userId: string;
  enabled?: boolean;
}

/**
 * React Query hook for fetching Netflix insights data
 * @param userId - The user ID to fetch Netflix data for
 * @param enabled - Optional flag to enable/disable the query
 */
export const useNetflixInsights = ({ userId, enabled = true }: UseNetflixInsightsParams) => {
  return useQuery<NetflixInsights>({
    queryKey: ['netflix-insights', userId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/test-extraction/netflix-insights/${userId}`,
        {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch Netflix insights');
      }

      return response.json();
    },
    enabled: enabled && !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
};
