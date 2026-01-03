/**
 * API Service Layer
 * Centralized API calls for frontend components
 */

import type {
  PersonalityScores,
  PersonalityScoresInput,
  SoulSignature,
  SoulSignatureInput,
  BehavioralFeature,
  BehavioralFeatureInput,
  UniquePattern,
  UniquePatternInput,
  PrivacySettings,
  PrivacySettingsInput,
  SoulSignatureProfile,
  PersonalityAnalysisResult,
  FeatureExtractionProgress,
  GenerateSoulSignatureRequest,
  UpdatePrivacyRequest,
  ApiResponse
} from '../types/soul-signature';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface AuthHeaders {
  'Content-Type': string;
  'Authorization'?: string;
}

const getAuthHeaders = (): AuthHeaders => {
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  const headers: AuthHeaders = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
};

// ====================================================================
// DASHBOARD API
// ====================================================================

export interface DashboardStats {
  connectedPlatforms: number;
  totalDataPoints: number;
  soulSignatureProgress: number;
  lastSync: string | null;
  trainingStatus: 'idle' | 'training' | 'ready';
}

export interface ActivityItem {
  id: string;
  type: 'connection' | 'analysis' | 'twin_created' | 'training' | 'sync';
  message: string;
  timestamp: string;
  icon?: string;
}

export const dashboardAPI = {
  /**
   * Get dashboard statistics
   */
  getStats: async (userId?: string): Promise<DashboardStats> => {
    const url = userId
      ? `${API_URL}/dashboard/stats?userId=${encodeURIComponent(userId)}`
      : `${API_URL}/dashboard/stats`;

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch dashboard stats: ${response.statusText}`);
    }

    const data = await response.json();
    return data.stats || data;
  },

  /**
   * Get recent activity feed
   */
  getActivity: async (userId?: string, limit: number = 10): Promise<ActivityItem[]> => {
    const url = userId
      ? `${API_URL}/dashboard/activity?userId=${encodeURIComponent(userId)}&limit=${limit}`
      : `${API_URL}/dashboard/activity?limit=${limit}`;

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch activity: ${response.statusText}`);
    }

    const data = await response.json();
    return data.activity || data;
  },
};

// ====================================================================
// TRAINING API
// ====================================================================

export interface TrainingMetrics {
  modelStatus: 'idle' | 'training' | 'ready' | 'error';
  accuracy: number;
  totalSamples: number;
  lastTraining: string | null;
  epochs: number;
  currentEpoch: number;
  connectedPlatforms?: number;
  progress?: number;
}

export interface TrainingStartResponse {
  success: boolean;
  message?: string;
  jobId?: string;
}

export const trainingAPI = {
  /**
   * Get current training status and metrics
   */
  getStatus: async (userId?: string): Promise<TrainingMetrics> => {
    const url = userId
      ? `${API_URL}/training/status?userId=${encodeURIComponent(userId)}`
      : `${API_URL}/training/status`;

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch training status: ${response.statusText}`);
    }

    const data = await response.json();
    return data.metrics || data;
  },

  /**
   * Start training the model
   */
  startTraining: async (userId?: string, epochs: number = 10): Promise<TrainingStartResponse> => {
    const response = await fetch(`${API_URL}/training/start`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId, epochs }),
    });

    if (!response.ok) {
      throw new Error(`Failed to start training: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Stop ongoing training
   */
  stopTraining: async (userId?: string): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_URL}/training/stop`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to stop training: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Reset the model
   */
  resetModel: async (userId?: string): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_URL}/training/reset`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to reset model: ${response.statusText}`);
    }

    return response.json();
  },
};

// ====================================================================
// CALENDAR API
// ====================================================================

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  type: 'meeting' | 'presentation' | 'interview' | 'call' | 'deadline' | 'personal' | 'other';
  isImportant: boolean;
  location?: string;
  description?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
}

export interface CalendarEventsResponse {
  events: CalendarEvent[];
  count: number;
  timeRange: {
    start: string;
    end: string;
  };
  fetchedAt: string;
}

export interface CalendarStatus {
  connected: boolean;
  platform: string;
  connectedAt?: string;
  lastSync?: string;
  lastSyncStatus?: string;
  tokenExpired?: boolean;
  expiresAt?: string;
}

export const calendarAPI = {
  /**
   * Get calendar connection status
   */
  getStatus: async (): Promise<CalendarStatus> => {
    const response = await fetch(`${API_URL}/calendar/status`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch calendar status: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || data;
  },

  /**
   * Get calendar events for today and tomorrow
   */
  getEvents: async (): Promise<CalendarEventsResponse> => {
    const response = await fetch(`${API_URL}/calendar/events`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401 && errorData.needsReconnect) {
        throw new Error('Calendar authentication expired. Please reconnect.');
      }
      if (response.status === 404) {
        throw new Error('Calendar not connected. Please connect Google Calendar first.');
      }
      throw new Error(`Failed to fetch calendar events: ${response.statusText}`);
    }

    const data = await response.json();

    // Convert date strings to Date objects
    if (data.data?.events) {
      data.data.events = data.data.events.map((event: CalendarEvent) => ({
        ...event,
        startTime: new Date(event.startTime),
        endTime: new Date(event.endTime),
      }));
    }

    return data.data || data;
  },

  /**
   * Manually sync calendar events
   */
  sync: async (daysAhead: number = 7): Promise<{ syncedEvents: number; syncedAt: string }> => {
    const response = await fetch(`${API_URL}/calendar/sync`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ daysAhead }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401 && errorData.needsReconnect) {
        throw new Error('Calendar authentication expired. Please reconnect.');
      }
      throw new Error(`Failed to sync calendar: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || data;
  },

  /**
   * Connect Google Calendar (returns OAuth URL)
   */
  connect: async (returnUrl?: string): Promise<{ authUrl: string; state: string }> => {
    const url = returnUrl
      ? `${API_URL}/oauth/calendar/connect?returnUrl=${encodeURIComponent(returnUrl)}`
      : `${API_URL}/oauth/calendar/connect`;

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to initiate calendar connection: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || data;
  },

  /**
   * Disconnect Google Calendar
   */
  disconnect: async (): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/calendar/disconnect`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to disconnect calendar: ${response.statusText}`);
    }

    return response.json();
  },
};

// ====================================================================
// SPOTIFY API (Presentation Ritual Feature)
// ====================================================================

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

// ====================================================================
// WHOOP API (Health & Fitness Data)
// ====================================================================

export interface WhoopStatus {
  connected: boolean;
  tokenExpired: boolean;
  lastSync: string | null;
  connectedAt: string | null;
  status?: string;
}

export interface WhoopCurrentState {
  recovery: {
    score: number | null;
    label: string;
    components: {
      hrv: number | null;
      rhr: number | null;
      sleepQuality: number | null;
    };
  };
  sleep: {
    hours: number | null;
    efficiency: number | null;
    quality: string;
  };
  strain: {
    current: number | null;
    max: number;
    label: string;
  };
  recommendations: {
    activityCapacity: string;
    optimalBedtime: string | null;
    recoveryNeeded: boolean;
    message: string;
  };
}

export const whoopAPI = {
  /**
   * Get Whoop connection status
   */
  getStatus: async (): Promise<WhoopStatus> => {
    const response = await fetch(`${API_URL}/health/whoop/status`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Whoop status: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || data;
  },

  /**
   * Get current health state from Whoop
   */
  getCurrentState: async (): Promise<WhoopCurrentState> => {
    const userId = localStorage.getItem('user_id') || '';
    const response = await fetch(`${API_URL}/health/whoop/current-state?userId=${encodeURIComponent(userId)}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401 && errorData.needsReconnect) {
        throw new Error('Whoop authentication expired. Please reconnect.');
      }
      if (response.status === 404) {
        throw new Error('Whoop not connected. Please connect your Whoop account first.');
      }
      throw new Error(`Failed to fetch Whoop current state: ${response.statusText}`);
    }

    const data = await response.json();
    return data.currentState || data;
  },

  /**
   * Get OAuth connection URL
   */
  connect: (returnUrl?: string): string => {
    const userId = localStorage.getItem('user_id') || '';
    const baseUrl = `${API_URL}/health/connect/whoop?userId=${encodeURIComponent(userId)}`;
    return returnUrl ? `${baseUrl}&returnUrl=${encodeURIComponent(returnUrl)}` : baseUrl;
  },

  /**
   * Disconnect Whoop
   */
  disconnect: async (): Promise<void> => {
    const userId = localStorage.getItem('user_id') || '';
    const response = await fetch(`${API_URL}/health/disconnect/whoop`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to disconnect Whoop: ${response.statusText}`);
    }
  },
};

// ====================================================================
// SOUL SIGNATURE API
// ====================================================================

export const soulSignatureAPI = {
  /**
   * Get user's complete soul signature profile
   */
  getProfile: async (userId?: string): Promise<SoulSignatureProfile> => {
    const url = userId
      ? `${API_URL}/soul-signature/profile?userId=${encodeURIComponent(userId)}`
      : `${API_URL}/soul-signature/profile`;

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch soul signature profile: ${response.statusText}`);
    }

    const data = await response.json();
    return data.profile || data;
  },

  /**
   * Get user's personality scores (Big Five dimensions)
   */
  getPersonalityScores: async (userId?: string): Promise<PersonalityScores | null> => {
    const url = userId
      ? `${API_URL}/soul-signature/personality-scores?userId=${encodeURIComponent(userId)}`
      : `${API_URL}/soul-signature/personality-scores`;

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (response.status === 404) {
      return null; // No personality scores yet
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch personality scores: ${response.statusText}`);
    }

    const data = await response.json();
    return data.scores || data;
  },

  /**
   * Get user's soul signature archetype
   */
  getSoulSignature: async (userId?: string): Promise<SoulSignature | null> => {
    const url = userId
      ? `${API_URL}/soul-signature/archetype?userId=${encodeURIComponent(userId)}`
      : `${API_URL}/soul-signature/archetype`;

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (response.status === 404) {
      return null; // No soul signature yet
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch soul signature: ${response.statusText}`);
    }

    const data = await response.json();
    return data.signature || data;
  },

  /**
   * Get user's unique behavioral patterns
   */
  getUniquePatterns: async (userId?: string, definingOnly: boolean = false): Promise<UniquePattern[]> => {
    const url = userId
      ? `${API_URL}/soul-signature/patterns?userId=${encodeURIComponent(userId)}&definingOnly=${definingOnly}`
      : `${API_URL}/soul-signature/patterns?definingOnly=${definingOnly}`;

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch unique patterns: ${response.statusText}`);
    }

    const data = await response.json();
    return data.patterns || data;
  },

  /**
   * Get behavioral features extracted from platforms
   */
  getBehavioralFeatures: async (userId?: string, platform?: string): Promise<BehavioralFeature[]> => {
    let url = userId
      ? `${API_URL}/soul-signature/features?userId=${encodeURIComponent(userId)}`
      : `${API_URL}/soul-signature/features`;

    if (platform) {
      url += `&platform=${encodeURIComponent(platform)}`;
    }

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch behavioral features: ${response.statusText}`);
    }

    const data = await response.json();
    return data.features || data;
  },

  /**
   * Get privacy settings
   */
  getPrivacySettings: async (userId?: string): Promise<PrivacySettings> => {
    const url = userId
      ? `${API_URL}/soul-signature/privacy?userId=${encodeURIComponent(userId)}`
      : `${API_URL}/soul-signature/privacy`;

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch privacy settings: ${response.statusText}`);
    }

    const data = await response.json();
    return data.settings || data;
  },

  /**
   * Update privacy settings
   */
  updatePrivacySettings: async (settings: UpdatePrivacyRequest): Promise<PrivacySettings> => {
    const response = await fetch(`${API_URL}/soul-signature/privacy`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      throw new Error(`Failed to update privacy settings: ${response.statusText}`);
    }

    const data = await response.json();
    return data.settings || data;
  },

  /**
   * Generate soul signature from behavioral data
   */
  generateSoulSignature: async (request: GenerateSoulSignatureRequest): Promise<PersonalityAnalysisResult> => {
    const response = await fetch(`${API_URL}/soul-signature/generate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate soul signature: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result || data;
  },

  /**
   * Get feature extraction progress for platforms
   */
  getExtractionProgress: async (userId?: string): Promise<FeatureExtractionProgress[]> => {
    const url = userId
      ? `${API_URL}/soul-signature/extraction-progress?userId=${encodeURIComponent(userId)}`
      : `${API_URL}/soul-signature/extraction-progress`;

    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch extraction progress: ${response.statusText}`);
    }

    const data = await response.json();
    return data.progress || data;
  },

  /**
   * Trigger feature extraction for a specific platform
   */
  extractFeatures: async (userId: string, platform: string): Promise<{ jobId: string }> => {
    const response = await fetch(`${API_URL}/soul-signature/extract-features`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId, platform }),
    });

    if (!response.ok) {
      throw new Error(`Failed to start feature extraction: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get personality dimension label with confidence
   */
  getDimensionLabel: (score: number, confidence: number, dimensionName: string): string => {
    if (confidence < 50) {
      return `${dimensionName}: Uncertain (${score}%)`;
    }
    if (score >= 70) {
      return `High ${dimensionName} (${score}%)`;
    }
    if (score <= 30) {
      return `Low ${dimensionName} (${score}%)`;
    }
    return `Moderate ${dimensionName} (${score}%)`;
  },

  /**
   * Calculate overall soul signature confidence
   */
  calculateConfidence: (scores: PersonalityScores): number => {
    const avgConfidence = (
      scores.openness_confidence +
      scores.conscientiousness_confidence +
      scores.extraversion_confidence +
      scores.agreeableness_confidence +
      scores.neuroticism_confidence
    ) / 5;

    return Math.round(avgConfidence);
  },
};

// ====================================================================
// ONBOARDING QUESTIONNAIRE API
// ====================================================================

export interface OnboardingQuestion {
  id: string;
  category: string;
  question: string;
  options: {
    value: string;
    label: string;
    icon?: string;  // Lucide icon name
  }[];
}

export interface OnboardingAnswers {
  [questionId: string]: string;
}

export interface OnboardingPreferences {
  morning_person?: number;
  peak_hours?: string;
  novelty_seeking?: number;
  music_emotional_strategy?: string;
  stress_coping?: string;
  introversion?: number;
}

export interface OnboardingStatus {
  hasCompleted: boolean;
  completedAt: string | null;
  questionsAnswered: number;
  totalQuestions: number;
  percentComplete: number;
}

export const onboardingAPI = {
  /**
   * Get all onboarding questions
   */
  getQuestions: async (): Promise<{ questions: OnboardingQuestion[]; totalQuestions: number }> => {
    const response = await fetch(`${API_URL}/onboarding/questions`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch questions: ${response.statusText}`);
    }

    const data = await response.json();
    return { questions: data.questions, totalQuestions: data.totalQuestions };
  },

  /**
   * Get user's onboarding status
   */
  getStatus: async (): Promise<OnboardingStatus> => {
    const response = await fetch(`${API_URL}/onboarding/status`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch status: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get user's existing answers
   */
  getAnswers: async (): Promise<{
    hasCompleted: boolean;
    completedAt: string | null;
    answers: OnboardingAnswers;
    preferences: OnboardingPreferences | null;
  }> => {
    const response = await fetch(`${API_URL}/onboarding/answers`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch answers: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Save user's answers
   */
  saveAnswers: async (answers: OnboardingAnswers): Promise<{
    success: boolean;
    message: string;
    preferences: OnboardingPreferences;
  }> => {
    const response = await fetch(`${API_URL}/onboarding/answers`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ answers }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save answers: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Skip the questionnaire
   */
  skip: async (): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/onboarding/skip`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to skip questionnaire: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Reset questionnaire (allow retaking)
   */
  reset: async (): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/onboarding/answers`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to reset questionnaire: ${response.statusText}`);
    }

    return response.json();
  },
};

// ====================================================================
// HELPER FUNCTIONS
// ====================================================================

/**
 * Generic API error handler
 */
export const handleAPIError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
};
