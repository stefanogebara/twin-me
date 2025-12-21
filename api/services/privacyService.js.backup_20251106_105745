/**
 * Privacy Service
 *
 * Core business logic for privacy control system.
 * Handles privacy filtering, cluster-based revelation, and context-aware data access.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Default life clusters with categories and default revelation levels
 */
export const DEFAULT_LIFE_CLUSTERS = {
  personal: [
    { id: 'hobbies-interests', name: 'Hobbies & Interests', privacyLevel: 50, enabled: true },
    { id: 'sports-fitness', name: 'Sports & Fitness', privacyLevel: 50, enabled: true },
    { id: 'spirituality-religion', name: 'Spirituality & Religion', privacyLevel: 50, enabled: true },
    { id: 'entertainment-choices', name: 'Entertainment Choices', privacyLevel: 50, enabled: true },
    { id: 'social-connections', name: 'Social Connections', privacyLevel: 50, enabled: true },
    { id: 'health-wellness', name: 'Health & Wellness', privacyLevel: 50, enabled: true },
    { id: 'travel-experiences', name: 'Travel & Experiences', privacyLevel: 50, enabled: true }
  ],
  professional: [
    { id: 'studies-education', name: 'Studies & Education', privacyLevel: 50, enabled: true },
    { id: 'career-jobs', name: 'Career & Jobs', privacyLevel: 50, enabled: true },
    { id: 'skills-expertise', name: 'Skills & Expertise', privacyLevel: 50, enabled: true },
    { id: 'achievements-recognition', name: 'Achievements & Recognition', privacyLevel: 50, enabled: true },
    { id: 'work-projects', name: 'Work Projects', privacyLevel: 50, enabled: true },
    { id: 'professional-network', name: 'Professional Network', privacyLevel: 50, enabled: true }
  ],
  creative: [
    { id: 'artistic-expression', name: 'Artistic Expression', privacyLevel: 50, enabled: true },
    { id: 'content-creation', name: 'Content Creation', privacyLevel: 50, enabled: true },
    { id: 'musical-identity', name: 'Musical Identity', privacyLevel: 50, enabled: true },
    { id: 'writing-blogging', name: 'Writing & Blogging', privacyLevel: 50, enabled: true },
    { id: 'photography-visual', name: 'Photography & Visual Arts', privacyLevel: 50, enabled: true }
  ]
};

/**
 * Platform-to-cluster mapping
 * Maps each platform to one or more life clusters
 */
export const PLATFORM_CLUSTER_MAPPING = {
  netflix: ['entertainment-choices', 'hobbies-interests'],
  spotify: ['musical-identity', 'entertainment-choices'],
  youtube: ['hobbies-interests', 'studies-education', 'entertainment-choices'],
  'prime-video': ['entertainment-choices'],
  'hbo-max': ['entertainment-choices'],
  'disney-plus': ['entertainment-choices'],
  'apple-music': ['musical-identity'],
  twitch: ['entertainment-choices', 'social-connections'],
  tiktok: ['entertainment-choices', 'content-creation'],
  discord: ['social-connections', 'hobbies-interests'],
  steam: ['hobbies-interests', 'entertainment-choices'],
  reddit: ['social-connections', 'hobbies-interests'],
  goodreads: ['hobbies-interests', 'studies-education'],
  gmail: ['professional-network', 'social-connections'],
  'microsoft-teams': ['professional-network', 'work-projects'],
  calendar: ['career-jobs', 'work-projects'],
  github: ['skills-expertise', 'work-projects'],
  linkedin: ['career-jobs', 'professional-network', 'achievements-recognition'],
  slack: ['professional-network', 'work-projects'],
  'google-workspace': ['work-projects', 'professional-network'],
  instagram: ['social-connections', 'photography-visual'],
  twitter: ['social-connections', 'content-creation'],
  medium: ['writing-blogging', 'content-creation'],
  behance: ['artistic-expression', 'photography-visual'],
  dribbble: ['artistic-expression', 'photography-visual']
};

/**
 * Get or create privacy profile for user with default clusters
 */
export async function getOrCreatePrivacyProfile(userId) {
  try {
    // Try to get existing profile
    const { data: existing, error: fetchError } = await supabase
      .from('privacy_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (existing) {
      return { success: true, profile: existing };
    }

    // Create default profile with all clusters
    const allClusters = [];
    Object.entries(DEFAULT_LIFE_CLUSTERS).forEach(([category, clusters]) => {
      clusters.forEach(cluster => {
        allClusters.push({
          ...cluster,
          category
        });
      });
    });

    const defaultProfile = {
      user_id: userId,
      global_privacy: 50,
      selected_audience_id: 'social',
      clusters: allClusters,
      audience_specific_settings: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: created, error: createError } = await supabase
      .from('privacy_settings')
      .insert(defaultProfile)
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    return { success: true, profile: created };
  } catch (error) {
    console.error('Error getting/creating privacy profile:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update global privacy level
 */
export async function updateGlobalPrivacyLevel(userId, globalLevel) {
  try {
    if (globalLevel < 0 || globalLevel > 100) {
      throw new Error('Global privacy level must be between 0 and 100');
    }

    const { data, error } = await supabase
      .from('privacy_settings')
      .update({
        global_privacy: globalLevel,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return { success: true, profile: data };
  } catch (error) {
    console.error('Error updating global privacy level:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update single cluster privacy level
 */
export async function updateClusterPrivacy(userId, clusterId, revelationLevel, isEnabled = true) {
  try {
    if (revelationLevel < 0 || revelationLevel > 100) {
      throw new Error('Revelation level must be between 0 and 100');
    }

    // Get current settings
    const { data: settings, error: fetchError } = await supabase
      .from('privacy_settings')
      .select('clusters')
      .eq('user_id', userId)
      .single();

    if (fetchError) throw fetchError;

    // Update the specific cluster
    let clusters = settings.clusters || [];
    const clusterIndex = clusters.findIndex(c => c.id === clusterId);

    if (clusterIndex >= 0) {
      clusters[clusterIndex] = {
        ...clusters[clusterIndex],
        privacyLevel: revelationLevel,
        enabled: isEnabled
      };
    } else {
      // Cluster doesn't exist, add it
      const category = findClusterCategory(clusterId);
      if (category) {
        clusters.push({
          id: clusterId,
          name: findClusterName(clusterId),
          category,
          privacyLevel: revelationLevel,
          enabled: isEnabled
        });
      }
    }

    // Save updated clusters
    const { data, error } = await supabase
      .from('privacy_settings')
      .update({
        clusters,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return { success: true, profile: data };
  } catch (error) {
    console.error('Error updating cluster privacy:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Batch update multiple clusters
 */
export async function batchUpdateClusters(userId, clusterUpdates) {
  try {
    // Get current settings
    const { data: settings, error: fetchError } = await supabase
      .from('privacy_settings')
      .select('clusters')
      .eq('user_id', userId)
      .single();

    if (fetchError) throw fetchError;

    let clusters = settings.clusters || [];

    // Apply each update
    clusterUpdates.forEach(update => {
      const clusterIndex = clusters.findIndex(c => c.id === update.clusterId);
      if (clusterIndex >= 0) {
        clusters[clusterIndex] = {
          ...clusters[clusterIndex],
          privacyLevel: update.revelationLevel,
          enabled: update.enabled !== undefined ? update.enabled : clusters[clusterIndex].enabled
        };
      }
    });

    // Save updated clusters
    const { data, error } = await supabase
      .from('privacy_settings')
      .update({
        clusters,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return { success: true, profile: data };
  } catch (error) {
    console.error('Error batch updating clusters:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get effective privacy level for a cluster considering audience context
 */
export async function getEffectivePrivacyLevel(userId, clusterId, audienceId = 'social') {
  try {
    const { data: settings, error } = await supabase
      .from('privacy_settings')
      .select('clusters, audience_specific_settings')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    // Check for audience-specific override
    const audienceSettings = settings.audience_specific_settings || {};
    if (audienceSettings[audienceId] && audienceSettings[audienceId][clusterId] !== undefined) {
      return audienceSettings[audienceId][clusterId];
    }

    // Return base cluster level
    const cluster = (settings.clusters || []).find(c => c.id === clusterId);
    return cluster ? cluster.privacyLevel : 50;
  } catch (error) {
    console.error('Error getting effective privacy level:', error);
    return 50; // Default fallback
  }
}

/**
 * Filter data based on privacy settings
 * This is the core filtering function used throughout the app
 */
export async function filterDataByPrivacy(userId, data, platformName, audienceId = 'social') {
  try {
    // Get user's privacy settings
    const { data: settings, error } = await supabase
      .from('privacy_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.warn('No privacy settings found, returning full data');
      return data;
    }

    // Get clusters associated with this platform
    const relatedClusters = PLATFORM_CLUSTER_MAPPING[platformName] || [];
    if (relatedClusters.length === 0) {
      // No cluster mapping, return full data
      return data;
    }

    // Calculate average privacy level across related clusters
    let totalPrivacy = 0;
    let clusterCount = 0;

    for (const clusterId of relatedClusters) {
      const privacyLevel = await getEffectivePrivacyLevel(userId, clusterId, audienceId);
      totalPrivacy += privacyLevel;
      clusterCount++;
    }

    const averagePrivacy = clusterCount > 0 ? totalPrivacy / clusterCount : 50;

    // If privacy is 0, return empty/minimal data
    if (averagePrivacy === 0) {
      return filterToMinimal(data);
    }

    // If privacy is 100, return all data
    if (averagePrivacy === 100) {
      return data;
    }

    // Apply percentage-based filtering
    return applyPercentageFilter(data, averagePrivacy);
  } catch (error) {
    console.error('Error filtering data by privacy:', error);
    return data; // Return unfiltered on error
  }
}

/**
 * Apply percentage-based filtering to data
 */
function applyPercentageFilter(data, percentage) {
  if (!data) return data;

  // For arrays, return percentage of items
  if (Array.isArray(data)) {
    const itemsToReturn = Math.ceil((data.length * percentage) / 100);
    return data.slice(0, itemsToReturn);
  }

  // For objects with arrays, filter each array
  if (typeof data === 'object') {
    const filtered = { ...data };
    Object.keys(filtered).forEach(key => {
      if (Array.isArray(filtered[key])) {
        const itemsToReturn = Math.ceil((filtered[key].length * percentage) / 100);
        filtered[key] = filtered[key].slice(0, itemsToReturn);
      }
    });
    return filtered;
  }

  return data;
}

/**
 * Filter data to minimal representation (for 0% privacy)
 */
function filterToMinimal(data) {
  if (Array.isArray(data)) {
    return [];
  }

  if (typeof data === 'object') {
    return {
      restricted: true,
      message: 'This information is private'
    };
  }

  return null;
}

/**
 * Get privacy statistics for user
 */
export async function getPrivacyStats(userId) {
  try {
    const { data: settings, error } = await supabase
      .from('privacy_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    const clusters = settings.clusters || [];
    const totalClusters = clusters.length;
    const enabledClusters = clusters.filter(c => c.enabled).length;
    const hiddenClusters = clusters.filter(c => c.privacyLevel === 0).length;
    const publicClusters = clusters.filter(c => c.privacyLevel === 100).length;

    // Calculate average revelation
    const totalRevelation = clusters.reduce((sum, c) => sum + (c.enabled ? c.privacyLevel : 0), 0);
    const averageRevelation = totalClusters > 0 ? Math.round(totalRevelation / totalClusters) : 50;

    // Get category breakdowns
    const categoryStats = {
      personal: calculateCategoryStats(clusters, 'personal'),
      professional: calculateCategoryStats(clusters, 'professional'),
      creative: calculateCategoryStats(clusters, 'creative')
    };

    return {
      success: true,
      stats: {
        totalClusters,
        enabledClusters,
        hiddenClusters,
        publicClusters,
        averageRevelation,
        globalPrivacy: settings.global_privacy,
        categoryStats
      }
    };
  } catch (error) {
    console.error('Error getting privacy stats:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate statistics for a category
 */
function calculateCategoryStats(clusters, category) {
  const categoryClusters = clusters.filter(c => c.category === category);
  const totalRevelation = categoryClusters.reduce((sum, c) => sum + c.privacyLevel, 0);

  return {
    count: categoryClusters.length,
    averageRevelation: categoryClusters.length > 0
      ? Math.round(totalRevelation / categoryClusters.length)
      : 50,
    hidden: categoryClusters.filter(c => c.privacyLevel === 0).length,
    public: categoryClusters.filter(c => c.privacyLevel === 100).length
  };
}

/**
 * Reset privacy settings to defaults
 */
export async function resetPrivacySettings(userId) {
  try {
    const allClusters = [];
    Object.entries(DEFAULT_LIFE_CLUSTERS).forEach(([category, clusters]) => {
      clusters.forEach(cluster => {
        allClusters.push({
          ...cluster,
          category
        });
      });
    });

    const defaultProfile = {
      global_privacy: 50,
      selected_audience_id: 'social',
      clusters: allClusters,
      audience_specific_settings: {},
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('privacy_settings')
      .update(defaultProfile)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    // Log reset action
    await supabase.from('privacy_audit_log').insert({
      user_id: userId,
      action: 'reset_to_defaults',
      changed_at: new Date().toISOString()
    });

    return { success: true, profile: data };
  } catch (error) {
    console.error('Error resetting privacy settings:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update context-specific privacy overrides
 */
export async function updateContextPrivacy(userId, contextName, clusterOverrides) {
  try {
    const { data: settings, error: fetchError } = await supabase
      .from('privacy_settings')
      .select('audience_specific_settings')
      .eq('user_id', userId)
      .single();

    if (fetchError) throw fetchError;

    const audienceSettings = settings.audience_specific_settings || {};
    audienceSettings[contextName] = clusterOverrides;

    const { data, error } = await supabase
      .from('privacy_settings')
      .update({
        audience_specific_settings: audienceSettings,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return { success: true, profile: data };
  } catch (error) {
    console.error('Error updating context privacy:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Helper: Find cluster category by ID
 */
function findClusterCategory(clusterId) {
  for (const [category, clusters] of Object.entries(DEFAULT_LIFE_CLUSTERS)) {
    if (clusters.some(c => c.id === clusterId)) {
      return category;
    }
  }
  return null;
}

/**
 * Helper: Find cluster name by ID
 */
function findClusterName(clusterId) {
  for (const clusters of Object.values(DEFAULT_LIFE_CLUSTERS)) {
    const cluster = clusters.find(c => c.id === clusterId);
    if (cluster) return cluster.name;
  }
  return clusterId;
}

/**
 * Check if specific data should be revealed based on sensitivity
 */
export async function shouldRevealData(userId, clusterId, dataSensitivity = 50, audienceId = 'social') {
  try {
    const privacyLevel = await getEffectivePrivacyLevel(userId, clusterId, audienceId);
    return privacyLevel >= dataSensitivity;
  } catch (error) {
    console.error('Error checking data revelation:', error);
    return true; // Default to revealing on error
  }
}

export default {
  getOrCreatePrivacyProfile,
  updateGlobalPrivacyLevel,
  updateClusterPrivacy,
  batchUpdateClusters,
  getEffectivePrivacyLevel,
  filterDataByPrivacy,
  getPrivacyStats,
  resetPrivacySettings,
  updateContextPrivacy,
  shouldRevealData,
  DEFAULT_LIFE_CLUSTERS,
  PLATFORM_CLUSTER_MAPPING
};
