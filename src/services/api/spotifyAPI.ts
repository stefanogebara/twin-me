/**
 * Spotify API Module (Presentation Ritual Feature)
 */

import { API_URL, getAuthHeaders } from './apiBase';

export interface SpotifyPlaylist {
  id: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
  owner: string;
  isPublic: boolean;
}

export interface SpotifyRecommendation {
  type: 'track';
  id: string;
  name: string;
  artist: string;
  imageUrl: string | null;
  previewUrl: string | null;
  spotifyUrl: string;
  duration: number;
  matchReason: string;
}

export interface FilteredPlaylistsResponse {
  playlists: SpotifyPlaylist[];
  recommendations: SpotifyRecommendation[];
  total: number;
  energyLevel: string;
  upcomingEvent?: {
    title: string;
    type: string;
    minutesUntil: number;
    isImportant: boolean;
  };
  suggestedMood?: string;
  learnedPattern?: {
    genre: string;
    confidence: number;
    description: string;
    isEventSpecific: boolean;
  };
}

export interface SpotifyStatus {
  connected: boolean;
  tokenExpired: boolean;
  lastSync: string | null;
  connectedAt: string | null;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  imageUrl: string | null;
  durationMs: number;
  progressMs: number;
}

export interface SpotifyPlaybackState {
  isPlaying: boolean;
  noActiveDevice: boolean;
  track: SpotifyTrack | null;
  context: {
    type: string;
    uri: string;
  } | null;
  device: {
    id: string;
    name: string;
    type: string;
    volume: number;
  } | null;
}

export interface MusicSession {
  id: string;
  user_id: string;
  ritual_id: string | null;
  spotify_playlist_id: string;
  spotify_playlist_name: string;
  tracks_played: Array<{ id: string; name: string; artist: string }>;
  duration_minutes: number;
  energy_level: 'calm' | 'focused' | 'energizing' | 'power';
  effectiveness_rating: number | null;
  created_at: string;
}

export const spotifyAPI = {
  /**
   * Get Spotify connection status
   */
  getStatus: async (): Promise<SpotifyStatus> => {
    const response = await fetch(`${API_URL}/spotify/status`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Spotify status: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || data;
  },

  /**
   * Get user's playlists for ritual selection
   */
  getPlaylists: async (): Promise<SpotifyPlaylist[]> => {
    const response = await fetch(`${API_URL}/spotify/playlists`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401 && errorData.needsReconnect) {
        throw new Error('Spotify authentication expired. Please reconnect.');
      }
      if (response.status === 404) {
        throw new Error('Spotify not connected. Please connect your Spotify account first.');
      }
      throw new Error(`Failed to fetch playlists: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data?.playlists || [];
  },

  /**
   * Get user's playlists filtered by energy level with audio features
   */
  getFilteredPlaylists: async (energyLevel?: 'calm' | 'focused' | 'energizing' | 'power'): Promise<FilteredPlaylistsResponse> => {
    const url = energyLevel
      ? `${API_URL}/spotify/playlists/filtered?energyLevel=${energyLevel}`
      : `${API_URL}/spotify/playlists/filtered`;

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401 && errorData.needsReconnect) {
        throw new Error('Spotify authentication expired. Please reconnect.');
      }
      if (response.status === 404) {
        throw new Error('Spotify not connected. Please connect your Spotify account first.');
      }
      throw new Error(`Failed to fetch filtered playlists: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || { playlists: [], recommendations: [], total: 0, energyLevel: energyLevel || 'all' };
  },

  /**
   * Get current playback state
   */
  getPlaybackState: async (): Promise<SpotifyPlaybackState> => {
    const response = await fetch(`${API_URL}/spotify/playback`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401 && errorData.needsReconnect) {
        throw new Error('Spotify authentication expired. Please reconnect.');
      }
      throw new Error(`Failed to get playback state: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || data;
  },

  /**
   * Start playing a playlist
   */
  play: async (playlistId: string, deviceId?: string): Promise<void> => {
    const response = await fetch(`${API_URL}/spotify/play`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ playlistId, deviceId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401 && errorData.needsReconnect) {
        throw new Error('Spotify authentication expired. Please reconnect.');
      }
      if (response.status === 404) {
        throw new Error('No active Spotify device found. Please open Spotify on a device first.');
      }
      throw new Error(errorData.error || `Failed to start playback: ${response.statusText}`);
    }
  },

  /**
   * Pause playback
   */
  pause: async (): Promise<void> => {
    const response = await fetch(`${API_URL}/spotify/pause`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401 && errorData.needsReconnect) {
        throw new Error('Spotify authentication expired. Please reconnect.');
      }
      if (response.status === 404) {
        throw new Error('No active Spotify device found.');
      }
      throw new Error(`Failed to pause playback: ${response.statusText}`);
    }
  },

  /**
   * Get OAuth connection URL
   */
  connect: (returnUrl?: string): string => {
    const baseUrl = `${API_URL}/oauth/spotify/connect`;
    return returnUrl ? `${baseUrl}?returnUrl=${encodeURIComponent(returnUrl)}` : baseUrl;
  },

  /**
   * Disconnect Spotify
   */
  disconnect: async (): Promise<void> => {
    const response = await fetch(`${API_URL}/spotify/disconnect`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to disconnect Spotify: ${response.statusText}`);
    }
  },

  /**
   * Log a music session for a ritual
   */
  logMusicSession: async (sessionData: {
    ritualId?: string;
    spotifyPlaylistId: string;
    spotifyPlaylistName: string;
    tracksPlayed?: Array<{ id: string; name: string; artist: string }>;
    durationMinutes: number;
    energyLevel: 'calm' | 'focused' | 'energizing' | 'power';
    effectivenessRating?: number;
  }): Promise<MusicSession> => {
    const response = await fetch(`${API_URL}/spotify/music-session`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(sessionData),
    });

    if (!response.ok) {
      throw new Error(`Failed to log music session: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  },
};
