/**
 * Soul Signature API Module
 */

import { API_URL, getAuthHeaders } from './apiBase';

import type {
  PersonalityScores,
  SoulSignature,
  BehavioralFeature,
  UniquePattern,
  PrivacySettings,
  SoulSignatureProfile,
  PersonalityAnalysisResult,
  FeatureExtractionProgress,
  GenerateSoulSignatureRequest,
  UpdatePrivacyRequest,
} from '../../types/soul-signature';

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
