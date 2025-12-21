/**
 * Soul API Service
 * Centralized API calls for soul signature, insights, and twin chat data
 * Replaces all demo/mock data with real backend API integrations
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001/api';

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

/**
 * Enhanced fetch with retry mechanism
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);

      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }

      // Retry on server errors (5xx) and rate limits (429)
      if (!response.ok && i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, i)));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, i)));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error('Failed to fetch after retries');
}

// ====================================================================
// SOUL SIGNATURE API
// ====================================================================

export interface SoulSignatureResponse {
  soulSignature: {
    user_id: string;
    data_completeness: number; // 0-1 (multiply by 100 for percentage)
    music?: {
      music_diversity: number;
      top_genres: string[];
      listening_patterns: any;
    };
    communication?: {
      engagement_level: number;
      response_patterns: any;
    };
    coding?: {
      expertise_level: number;
      languages: string[];
      contribution_patterns: any;
    };
    personality_traits?: any;
    interests?: any;
    created_at: string;
    updated_at: string;
  };
}

export interface SoulStatusResponse {
  extraction: {
    platforms: Array<{
      platform: string;
      connected: boolean;
      lastSyncStatus: 'success' | 'error' | 'pending' | 'idle';
      latestJob?: {
        itemsExtracted: number;
        completed_at: string;
      };
    }>;
  };
  soulSignature: {
    data_completeness: number;
  };
}

export interface SoulInsightsResponse {
  insights: Array<{
    type: string;
    title: string;
    description: string;
    confidence: number; // 0-1
    category: 'behavioral' | 'cognitive' | 'interest' | 'professional' | 'creative';
  }>;
}

export const soulApi = {
  /**
   * Get soul signature for a user
   */
  getSoulSignature: async (userId: string): Promise<SoulSignatureResponse> => {
    const response = await fetchWithRetry(`${API_URL}/soul/signature/${userId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch soul signature: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get soul status (platforms and extraction progress)
   */
  getSoulStatus: async (userId: string): Promise<SoulStatusResponse> => {
    const response = await fetchWithRetry(`${API_URL}/soul/status/${userId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch soul status: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get soul insights (Claude-generated personality patterns)
   */
  getSoulInsights: async (userId: string): Promise<SoulInsightsResponse> => {
    const response = await fetchWithRetry(`${API_URL}/soul/insights/${userId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch soul insights: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Trigger soul extraction for a user
   */
  triggerExtraction: async (userId: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetchWithRetry(`${API_URL}/soul/extract/${userId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to trigger extraction: ${response.statusText}`);
    }

    return response.json();
  },
};

// ====================================================================
// TWIN CHAT API
// ====================================================================

export interface TwinConversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface TwinMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface TwinStatsResponse {
  completion_percentage: number;
  total_conversations: number;
  total_messages: number;
  last_interaction: string | null;
  connected_platforms: number;
}

export interface ConversationSuggestion {
  text: string;
  category: string;
  icon: string;
}

export const twinApi = {
  /**
   * Get contextual conversation suggestions
   */
  getSuggestions: async (options?: {
    conversationId?: string;
    mode?: 'twin' | 'tutor' | 'analyst';
    twinType?: 'personal' | 'professional';
  }): Promise<ConversationSuggestion[]> => {
    const params = new URLSearchParams();
    if (options?.conversationId) params.append('conversationId', options.conversationId);
    if (options?.mode) params.append('mode', options.mode);
    if (options?.twinType) params.append('twinType', options.twinType);

    const response = await fetchWithRetry(
      `${API_URL}/twin/suggestions${params.toString() ? `?${params.toString()}` : ''}`,
      { headers: getAuthHeaders() }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch suggestions: ${response.statusText}`);
    }

    const data = await response.json();
    return data.suggestions || [];
  },

  /**
   * Get all conversations for a user
   */
  getConversations: async (userId: string): Promise<TwinConversation[]> => {
    const response = await fetchWithRetry(`${API_URL}/twin/conversations/${userId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch conversations: ${response.statusText}`);
    }

    const data = await response.json();
    return data.conversations || [];
  },

  /**
   * Get messages for a conversation
   */
  getConversationMessages: async (conversationId: string): Promise<TwinMessage[]> => {
    const response = await fetchWithRetry(`${API_URL}/twin/conversations/${conversationId}/messages`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch messages: ${response.statusText}`);
    }

    const data = await response.json();
    return data.messages || [];
  },

  /**
   * Get twin statistics
   * DEMO MODE SUPPORT: Returns demo data when in demo mode
   */
  getTwinStats: async (userId: string): Promise<any> => {
    // DEMO MODE: Return demo twin statistics
    const isDemoMode = localStorage.getItem('demo_mode') === 'true';
    if (isDemoMode) {
      console.log('[soulApi.getTwinStats] 🎭 Demo mode active - returning demo twin stats');
      const { DEMO_TWIN_STATS } = await import('@/services/demoDataService');
      return DEMO_TWIN_STATS;
    }

    const response = await fetchWithRetry(`${API_URL}/twin/statistics/${userId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch twin stats: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Send a message to the twin with streaming support
   */
  sendMessage: async (
    conversationId: string | null,
    message: string,
    options?: {
      twinType?: 'personal' | 'professional';
      context?: string;
      onChunk?: (chunk: string) => void;
    }
  ): Promise<{
    conversationId: string;
    response: string;
    usage: { total_tokens: number };
    cost: number;
  }> => {
    const payload: any = {
      message,
      mode: 'twin',
      twinType: options?.twinType || 'personal',
      context: options?.context || 'casual',
      stream: true,
    };

    // Only include conversationId if it's not null
    if (conversationId) {
      payload.conversationId = conversationId;
    }

    const response = await fetch(`${API_URL}/twin/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }

    // Handle streaming response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let conversationIdFromStream = conversationId;
    let usage = { total_tokens: 0 };
    let cost = 0;

    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);

                if (parsed.type === 'chunk') {
                  fullResponse += parsed.content;
                  if (options?.onChunk) {
                    options.onChunk(parsed.content);
                  }
                } else if (parsed.type === 'complete') {
                  conversationIdFromStream = parsed.conversationId;
                  usage = parsed.usage;
                  cost = parsed.cost;
                }
              } catch (e) {
                // Ignore JSON parse errors for incomplete chunks
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    return {
      conversationId: conversationIdFromStream || '',
      response: fullResponse,
      usage,
      cost
    };
  },
};

// ====================================================================
// PLATFORM API
// ====================================================================

export interface PlatformConnectionStatus {
  platform: string;
  connected: boolean;
  last_sync: string | null;
  sync_status: 'success' | 'error' | 'pending' | 'idle';
  data_points: number;
}

export const platformApi = {
  /**
   * Get platform connection status
   */
  getStatus: async (userId?: string): Promise<{ platforms: PlatformConnectionStatus[] }> => {
    const url = userId
      ? `${API_URL}/platforms/status?userId=${encodeURIComponent(userId)}`
      : `${API_URL}/platforms/status`;

    const response = await fetchWithRetry(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch platform status: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Trigger sync for a specific platform
   */
  syncPlatform: async (platform: string): Promise<{ success: boolean }> => {
    const response = await fetchWithRetry(`${API_URL}/platforms/sync/${platform}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to sync platform: ${response.statusText}`);
    }

    return response.json();
  },
};

// ====================================================================
// SPOTIFY INSIGHTS API
// ====================================================================

export interface SpotifyMusicPersonality {
  type: string;
  description: string;
  icon: string;
}

export interface SpotifyMoodProfile {
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  tempo: number;
}

export interface SpotifyInsightsResponse {
  analysis: {
    topGenres: string[];
    moodProfile: SpotifyMoodProfile;
    musicPersonality: SpotifyMusicPersonality;
    discoveryBehavior: {
      rate: number;
      level: string;
      description: string;
    };
    playlistCuration: {
      style: string;
      count: number;
      collaborative: number;
      publicSharing: number;
      sharingTendency: number;
    };
    diversityScore: number;
    energyLevel: {
      level: string;
      description: string;
    };
    emotionalValence: {
      mood: string;
      description: string;
    };
    listeningIntensity: {
      level: string;
      description: string;
    };
    artistLoyalty: {
      rate: number;
      level: string;
      description: string;
    };
    summary: string;
  };
}

export const spotifyApi = {
  /**
   * Get Spotify musical soul insights for a user
   */
  getInsights: async (userId: string): Promise<SpotifyInsightsResponse> => {
    const response = await fetchWithRetry(`${API_URL}/soul-data/spotify/insights/${userId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Spotify insights: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Trigger Spotify soul analysis for a user
   */
  analyzeMusicalSoul: async (userId: string): Promise<SpotifyInsightsResponse> => {
    const response = await fetchWithRetry(`${API_URL}/soul-data/spotify/analyze/${userId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to analyze Spotify data: ${response.statusText}`);
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

/**
 * Check if user is in demo mode
 */
export const isDemoMode = (): boolean => {
  return localStorage.getItem('demo_mode') === 'true';
};
