/**
 * Privacy API Client
 *
 * Client-side service for interacting with privacy control APIs.
 * Provides methods for managing privacy settings, clusters, and contexts.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ClusterPrivacy {
  id: string;
  name: string;
  category: 'personal' | 'professional' | 'creative';
  privacyLevel: number;
  enabled: boolean;
}

export interface PrivacyProfile {
  user_id: string;
  global_privacy: number;
  selected_audience_id: string;
  selected_template_id?: string | null;
  clusters: ClusterPrivacy[];
  audience_specific_settings: Record<string, Record<string, number>>;
  created_at: string;
  updated_at: string;
}

export interface PrivacyStats {
  totalClusters: number;
  enabledClusters: number;
  hiddenClusters: number;
  publicClusters: number;
  averageRevelation: number;
  globalPrivacy: number;
  categoryStats: {
    personal: CategoryStats;
    professional: CategoryStats;
    creative: CategoryStats;
  };
}

export interface CategoryStats {
  count: number;
  averageRevelation: number;
  hidden: number;
  public: number;
}

export interface AudienceContext {
  id: string;
  name: string;
  icon: string;
  description: string;
}

/**
 * Get authentication token from localStorage
 */
function getAuthToken(): string | null {
  return localStorage.getItem('token');
}

/**
 * Make authenticated API request
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API request failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get user's privacy profile
 */
export async function getPrivacyProfile(userId: string): Promise<PrivacyProfile> {
  const response = await apiRequest<{ success: boolean; profile: PrivacyProfile }>(
    `/api/privacy-controls/profile/${userId}`
  );
  return response.profile;
}

/**
 * Update global privacy level
 */
export async function updateGlobalPrivacy(
  userId: string,
  globalLevel: number
): Promise<PrivacyProfile> {
  const response = await apiRequest<{ success: boolean; profile: PrivacyProfile }>(
    `/api/privacy-controls/global/${userId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ globalLevel }),
    }
  );
  return response.profile;
}

/**
 * Update single cluster privacy
 */
export async function updateClusterPrivacy(
  userId: string,
  clusterId: string,
  revelationLevel: number,
  enabled: boolean = true
): Promise<PrivacyProfile> {
  const response = await apiRequest<{ success: boolean; profile: PrivacyProfile }>(
    `/api/privacy-controls/cluster/${userId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ clusterId, revelationLevel, enabled }),
    }
  );
  return response.profile;
}

/**
 * Batch update multiple clusters
 */
export async function batchUpdateClusters(
  userId: string,
  clusters: Array<{ clusterId: string; revelationLevel: number; enabled?: boolean }>
): Promise<PrivacyProfile> {
  const response = await apiRequest<{ success: boolean; profile: PrivacyProfile }>(
    `/api/privacy-controls/cluster/batch/${userId}`,
    {
      method: 'POST',
      body: JSON.stringify({ clusters }),
    }
  );
  return response.profile;
}

/**
 * Get context-specific privacy settings
 */
export async function getContextSettings(userId: string): Promise<{
  contexts: Record<string, Record<string, number>>;
  availableContexts: AudienceContext[];
}> {
  const response = await apiRequest<{
    success: boolean;
    contexts: Record<string, Record<string, number>>;
    availableContexts: AudienceContext[];
  }>(`/api/privacy-controls/contexts/${userId}`);

  return {
    contexts: response.contexts,
    availableContexts: response.availableContexts,
  };
}

/**
 * Update context-specific privacy overrides
 */
export async function updateContextPrivacy(
  userId: string,
  contextName: string,
  clusterOverrides: Record<string, number>
): Promise<PrivacyProfile> {
  const response = await apiRequest<{ success: boolean; profile: PrivacyProfile }>(
    `/api/privacy-controls/context/${userId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ contextName, clusterOverrides }),
    }
  );
  return response.profile;
}

/**
 * Reset privacy settings to defaults
 */
export async function resetPrivacySettings(userId: string): Promise<PrivacyProfile> {
  const response = await apiRequest<{ success: boolean; profile: PrivacyProfile }>(
    `/api/privacy-controls/reset/${userId}`,
    {
      method: 'POST',
    }
  );
  return response.profile;
}

/**
 * Get privacy statistics
 */
export async function getPrivacyStats(userId: string): Promise<PrivacyStats> {
  const response = await apiRequest<{ success: boolean; stats: PrivacyStats }>(
    `/api/privacy-controls/summary/${userId}`
  );
  return response.stats;
}

/**
 * Get default life clusters configuration
 */
export async function getLifeClusters(): Promise<{
  clusters: Record<string, ClusterPrivacy[]>;
  platformMapping: Record<string, string[]>;
  categories: Record<string, { name: string; description: string; color: string }>;
}> {
  const response = await apiRequest<{
    success: boolean;
    clusters: Record<string, ClusterPrivacy[]>;
    platformMapping: Record<string, string[]>;
    categories: Record<string, { name: string; description: string; color: string }>;
  }>('/api/privacy-controls/clusters');

  return {
    clusters: response.clusters,
    platformMapping: response.platformMapping,
    categories: response.categories,
  };
}

/**
 * Get effective privacy level for a cluster
 */
export async function getEffectivePrivacyLevel(
  userId: string,
  clusterId: string,
  audienceId: string = 'social'
): Promise<number> {
  const response = await apiRequest<{
    success: boolean;
    effectivePrivacyLevel: number;
  }>(
    `/api/privacy-controls/effective-level?userId=${userId}&clusterId=${clusterId}&audienceId=${audienceId}`
  );
  return response.effectivePrivacyLevel;
}

/**
 * Check if data should be revealed
 */
export async function checkDataRevelation(
  userId: string,
  clusterId: string,
  dataSensitivity: number = 50,
  audienceId: string = 'social'
): Promise<boolean> {
  const response = await apiRequest<{ success: boolean; shouldReveal: boolean }>(
    '/api/privacy-controls/check-revelation',
    {
      method: 'POST',
      body: JSON.stringify({ userId, clusterId, dataSensitivity, audienceId }),
    }
  );
  return response.shouldReveal;
}

/**
 * Debounce function for slider changes
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(later, wait);
  };
}

/**
 * Hook-friendly version of debounced update
 */
export function createDebouncedUpdate(userId: string, delayMs: number = 500) {
  return debounce(async (clusterId: string, value: number) => {
    try {
      await updateClusterPrivacy(userId, clusterId, value);
      console.log(`Updated ${clusterId} to ${value}%`);
    } catch (error) {
      console.error('Error updating cluster:', error);
      throw error;
    }
  }, delayMs);
}

/**
 * Export all privacy API methods
 */
export default {
  getPrivacyProfile,
  updateGlobalPrivacy,
  updateClusterPrivacy,
  batchUpdateClusters,
  getContextSettings,
  updateContextPrivacy,
  resetPrivacySettings,
  getPrivacyStats,
  getLifeClusters,
  getEffectivePrivacyLevel,
  checkDataRevelation,
  debounce,
  createDebouncedUpdate,
};
