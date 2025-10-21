/**
 * Soul Matching Service
 * API client for finding compatible soul signatures
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface MatchBreakdown {
  personality: number;
  interests: number;
  communication: number;
  values: number;
}

export interface SoulMatch {
  userId: string;
  userName: string;
  avatar?: string;
  compatibility: number;
  breakdown: MatchBreakdown;
  sharedInterests: string[];
  matchReason: string;
}

export interface FindMatchesResponse {
  success: boolean;
  matches: SoulMatch[];
  totalCandidates: number;
  matchesFound: number;
}

export interface MatchStatsResponse {
  success: boolean;
  stats: {
    hasProfile: boolean;
    canMatch: boolean;
    totalUsers: number;
    profileCompleteness?: number;
    message?: string;
  };
}

export interface CompatibilityResponse {
  success: boolean;
  compatibility: {
    userId: string;
    userName: string;
    avatar?: string;
    score: number;
    breakdown: MatchBreakdown;
    sharedInterests: string[];
    matchReason: string;
  };
}

export interface MatchPreferences {
  allowSoulMatching: boolean;
  minCompatibility: number;
  includeOpposites: boolean;
  visibleToOthers: boolean;
}

class SoulMatchingService {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('authToken');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  }

  /**
   * Find compatible soul signature matches
   */
  async findMatches(options?: {
    limit?: number;
    minCompatibility?: number;
    includeOpposites?: boolean;
    privacyLevel?: 'respect' | 'medium' | 'full';
  }): Promise<FindMatchesResponse> {
    const params = new URLSearchParams();

    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.minCompatibility) params.append('minCompatibility', options.minCompatibility.toString());
    if (options?.includeOpposites) params.append('includeOpposites', 'true');
    if (options?.privacyLevel) params.append('privacyLevel', options.privacyLevel);

    const response = await fetch(`${API_URL}/soul-matching/find-matches?${params}`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to find matches');
    }

    return await response.json();
  }

  /**
   * Calculate compatibility with a specific user
   */
  async calculateCompatibility(targetUserId: string, includeOpposites: boolean = false): Promise<CompatibilityResponse> {
    const response = await fetch(`${API_URL}/soul-matching/calculate-compatibility`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ targetUserId, includeOpposites }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to calculate compatibility');
    }

    return await response.json();
  }

  /**
   * Get matching statistics
   */
  async getStats(): Promise<MatchStatsResponse> {
    const response = await fetch(`${API_URL}/soul-matching/stats`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get match statistics');
    }

    return await response.json();
  }

  /**
   * Update matching preferences
   */
  async updatePreferences(preferences: Partial<MatchPreferences>): Promise<{ success: boolean; preferences: MatchPreferences }> {
    const response = await fetch(`${API_URL}/soul-matching/preferences`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(preferences),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update preferences');
    }

    return await response.json();
  }
}

export default new SoulMatchingService();
