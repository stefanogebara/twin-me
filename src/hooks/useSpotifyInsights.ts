import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface SpotifyArtist {
  name: string;
  plays: number;
  genre: string;
  popularity: number;
}

export interface SpotifyTrack {
  name: string;
  artist: string;
  plays: number;
  duration_ms: number;
}

export interface SpotifyGenre {
  genre: string;
  percentage: number;
  count: number;
}

export interface SpotifyListeningPatterns {
  peakHours: {
    start: number;
    end: number;
    label: string;
  };
  weekdayVsWeekend: {
    weekday: number;
    weekend: number;
  };
  averageSessionLength: number;
  skipRate: number;
  totalMinutesListened: number;
}

export interface SpotifyAudioFeatures {
  averageEnergy: number;
  averageValence: number;
  averageDanceability: number;
  averageAcousticness: number;
  averageInstrumentalness: number;
}

export interface SpotifyRecentlyPlayed {
  track: string;
  artist: string;
  played_at: string;
}

export interface SpotifyInsights {
  topArtists: SpotifyArtist[];
  topTracks: SpotifyTrack[];
  genres: SpotifyGenre[];
  listeningPatterns: SpotifyListeningPatterns;
  audioFeatures: SpotifyAudioFeatures;
  recentlyPlayed: SpotifyRecentlyPlayed[];
}

interface UseSpotifyInsightsOptions {
  userId?: string;
  enabled?: boolean;
}

export const useSpotifyInsights = ({ userId, enabled = true }: UseSpotifyInsightsOptions = {}) => {
  return useQuery<SpotifyInsights>({
    queryKey: ['spotify-insights', userId],
    queryFn: async () => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const response = await axios.get<{ success: boolean; insights: SpotifyInsights }>(
        `${API_URL}/test-extraction/spotify-insights/${userId}`
      );

      // Extract insights from API response wrapper
      return response.data.insights;
    },
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
};
