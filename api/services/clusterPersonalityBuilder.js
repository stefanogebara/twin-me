/**
 * Cluster Personality Builder
 *
 * Builds separate personality profiles for different life clusters:
 * - Personal: Spotify, Netflix, YouTube, Discord, Reddit (entertainment, social)
 * - Professional: Gmail, Calendar, GitHub, LinkedIn, Slack (work identity)
 * - Health: Whoop, Apple Health, Oura (fitness, wellness)
 * - Creative: Instagram, TikTok, Pinterest (content creation)
 *
 * Key insight: People exhibit different personalities in different contexts.
 * A reserved professional might be outgoing socially, or vice versa.
 *
 * Features:
 * - Cluster-specific Big Five profiles
 * - Divergence analysis between clusters
 * - Research-backed trait inference
 */

import { createClient } from '@supabase/supabase-js';
import { getCorrelationMatcherService } from './correlationMatcherService.js';
import { getMemoryService } from './moltbot/moltbotMemoryService.js';
import config from '../config/moltbotConfig.js';

let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

/**
 * Cluster definitions with their associated platforms
 */
const CLUSTER_DEFINITIONS = {
  personal: {
    name: 'Personal',
    description: 'Entertainment, social, and hobby-related behavior',
    platforms: ['spotify', 'netflix', 'youtube', 'discord', 'reddit', 'twitch', 'steam'],
    traits: ['energy_pattern', 'social_preference', 'content_preference']
  },
  professional: {
    name: 'Professional',
    description: 'Work, career, and professional development',
    platforms: ['gmail', 'calendar', 'github', 'linkedin', 'slack', 'teams', 'outlook'],
    traits: ['communication_style', 'work_pattern', 'collaboration_preference']
  },
  health: {
    name: 'Health & Wellness',
    description: 'Fitness, sleep, and physical well-being',
    platforms: ['whoop', 'apple_health', 'oura', 'fitbit', 'garmin', 'strava'],
    traits: ['activity_level', 'recovery_focus', 'consistency_pattern']
  },
  creative: {
    name: 'Creative',
    description: 'Content creation, artistic expression, and aesthetics',
    platforms: ['instagram', 'tiktok', 'pinterest', 'behance', 'dribbble'],
    traits: ['creation_frequency', 'style_consistency', 'trend_following']
  }
};

/**
 * ClusterPersonalityBuilder
 */
class ClusterPersonalityBuilder {
  constructor(userId) {
    if (!userId) {
      throw new Error('userId is required for ClusterPersonalityBuilder');
    }
    this.userId = userId;
    this.correlationMatcher = getCorrelationMatcherService();
    this.memoryService = getMemoryService(userId);
  }

  /**
   * Classify a platform into its cluster
   */
  classifyPlatform(platform) {
    const platformLower = platform.toLowerCase();

    for (const [clusterId, cluster] of Object.entries(CLUSTER_DEFINITIONS)) {
      if (cluster.platforms.includes(platformLower)) {
        return clusterId;
      }
    }

    return 'personal'; // Default
  }

  /**
   * Build personality profile for a specific cluster
   * @param {string} cluster - Cluster ID
   * @param {Array} platformData - Array of {platform, feature, value, rawValue}
   * @returns {object} Cluster personality profile
   */
  async buildClusterProfile(cluster, platformData) {
    const clusterDef = CLUSTER_DEFINITIONS[cluster];
    if (!clusterDef) {
      throw new Error(`Unknown cluster: ${cluster}`);
    }

    // Filter data to only this cluster's platforms
    const clusterData = platformData.filter(
      d => this.classifyPlatform(d.platform) === cluster
    );

    if (clusterData.length === 0) {
      return {
        cluster,
        name: clusterDef.name,
        personality: null,
        clusterTraits: null,
        dataPoints: 0,
        confidence: 0,
        message: 'No data available for this cluster'
      };
    }

    // Find research correlations
    const correlationMatches = this.correlationMatcher.findAllCorrelations(clusterData);

    // Infer Big Five personality
    const personality = this.correlationMatcher.inferPersonality(correlationMatches);

    // Analyze cluster-specific traits
    const clusterTraits = await this.analyzeClusterTraits(cluster, clusterData);

    // Calculate overall confidence
    const confidence = this.calculateClusterConfidence(
      clusterData.length,
      correlationMatches.length,
      Object.values(personality).reduce((sum, p) => sum + p.confidence, 0) / 5
    );

    // Build result
    const profile = {
      cluster,
      name: clusterDef.name,
      description: clusterDef.description,
      personality: {
        openness: personality.openness.score,
        conscientiousness: personality.conscientiousness.score,
        extraversion: personality.extraversion.score,
        agreeableness: personality.agreeableness.score,
        neuroticism: personality.neuroticism.score
      },
      personalityDetails: personality,
      clusterTraits,
      dataPoints: clusterData.length,
      correlationsUsed: correlationMatches.length,
      confidence,
      topEvidence: this.getTopEvidence(correlationMatches, 5),
      analyzedAt: new Date().toISOString()
    };

    // Store in database
    await this.storeClusterProfile(profile);

    return profile;
  }

  /**
   * Build profiles for all clusters
   */
  async buildAllClusterProfiles(platformData) {
    const profiles = {};

    for (const clusterId of Object.keys(CLUSTER_DEFINITIONS)) {
      try {
        profiles[clusterId] = await this.buildClusterProfile(clusterId, platformData);
      } catch (error) {
        console.error(`Error building ${clusterId} profile:`, error.message);
        profiles[clusterId] = {
          cluster: clusterId,
          error: error.message
        };
      }
    }

    // Calculate divergence between clusters
    const divergences = this.calculateAllDivergences(profiles);

    return { profiles, divergences };
  }

  /**
   * Analyze cluster-specific traits
   */
  async analyzeClusterTraits(cluster, clusterData) {
    switch (cluster) {
      case 'personal':
        return this.analyzePersonalTraits(clusterData);
      case 'professional':
        return this.analyzeProfessionalTraits(clusterData);
      case 'health':
        return this.analyzeHealthTraits(clusterData);
      case 'creative':
        return this.analyzeCreativeTraits(clusterData);
      default:
        return {};
    }
  }

  /**
   * Analyze personal cluster traits
   */
  analyzePersonalTraits(data) {
    const traits = {
      energy_pattern: 'variable',
      social_preference: 'mixed',
      content_preference: 'diverse'
    };

    // Analyze energy from music
    const energyData = data.filter(d => d.feature === 'energy_preference');
    if (energyData.length > 0) {
      const avgEnergy = energyData.reduce((sum, d) => sum + d.value, 0) / energyData.length;
      traits.energy_pattern = avgEnergy > 0.6 ? 'high_energy' : avgEnergy < 0.4 ? 'chill' : 'variable';
    }

    // Analyze social preference
    const socialData = data.filter(d =>
      d.feature.includes('social') || d.platform === 'discord'
    );
    if (socialData.length > 0) {
      const socialScore = socialData.reduce((sum, d) => sum + d.value, 0) / socialData.length;
      traits.social_preference = socialScore > 0.6 ? 'social' : socialScore < 0.4 ? 'solo' : 'mixed';
    }

    // Analyze content diversity
    const diversityData = data.filter(d => d.feature.includes('diversity'));
    if (diversityData.length > 0) {
      const avgDiversity = diversityData.reduce((sum, d) => sum + d.value, 0) / diversityData.length;
      traits.content_preference = avgDiversity > 0.6 ? 'diverse' : avgDiversity < 0.4 ? 'focused' : 'balanced';
    }

    return traits;
  }

  /**
   * Analyze professional cluster traits
   */
  analyzeProfessionalTraits(data) {
    const traits = {
      communication_style: 'balanced',
      work_pattern: 'regular',
      collaboration_preference: 'mixed'
    };

    // Analyze communication from calendar meetings
    const meetingData = data.filter(d => d.feature === 'meeting_density');
    if (meetingData.length > 0) {
      const avgMeetings = meetingData.reduce((sum, d) => sum + d.value, 0) / meetingData.length;
      traits.communication_style = avgMeetings > 0.6 ? 'collaborative' : avgMeetings < 0.3 ? 'independent' : 'balanced';
    }

    // Analyze work schedule regularity
    const regularityData = data.filter(d => d.feature.includes('regularity') || d.feature.includes('consistency'));
    if (regularityData.length > 0) {
      const avgRegularity = regularityData.reduce((sum, d) => sum + d.value, 0) / regularityData.length;
      traits.work_pattern = avgRegularity > 0.6 ? 'structured' : avgRegularity < 0.4 ? 'flexible' : 'regular';
    }

    // Analyze social event ratio for collaboration
    const socialEventData = data.filter(d => d.feature === 'social_event_ratio');
    if (socialEventData.length > 0) {
      const avgSocial = socialEventData.reduce((sum, d) => sum + d.value, 0) / socialEventData.length;
      traits.collaboration_preference = avgSocial > 0.4 ? 'collaborative' : avgSocial < 0.2 ? 'solo' : 'mixed';
    }

    return traits;
  }

  /**
   * Analyze health cluster traits
   */
  analyzeHealthTraits(data) {
    const traits = {
      activity_level: 'moderate',
      recovery_focus: 'balanced',
      consistency_pattern: 'variable'
    };

    // Activity level from step count or workout frequency
    const activityData = data.filter(d =>
      d.feature.includes('step') || d.feature.includes('activity') || d.feature.includes('workout')
    );
    if (activityData.length > 0) {
      const avgActivity = activityData.reduce((sum, d) => sum + d.value, 0) / activityData.length;
      traits.activity_level = avgActivity > 0.7 ? 'high' : avgActivity < 0.3 ? 'low' : 'moderate';
    }

    // Recovery focus from HRV and sleep data
    const recoveryData = data.filter(d =>
      d.feature.includes('hrv') || d.feature.includes('recovery') || d.feature.includes('sleep')
    );
    if (recoveryData.length > 0) {
      const avgRecovery = recoveryData.reduce((sum, d) => sum + d.value, 0) / recoveryData.length;
      traits.recovery_focus = avgRecovery > 0.6 ? 'high_focus' : avgRecovery < 0.4 ? 'low_focus' : 'balanced';
    }

    // Consistency from regularity metrics
    const consistencyData = data.filter(d =>
      d.feature.includes('consistency') || d.feature.includes('regularity')
    );
    if (consistencyData.length > 0) {
      const avgConsistency = consistencyData.reduce((sum, d) => sum + d.value, 0) / consistencyData.length;
      traits.consistency_pattern = avgConsistency > 0.6 ? 'consistent' : avgConsistency < 0.4 ? 'variable' : 'moderate';
    }

    return traits;
  }

  /**
   * Analyze creative cluster traits
   */
  analyzeCreativeTraits(data) {
    return {
      creation_frequency: 'occasional',
      style_consistency: 'evolving',
      trend_following: 'balanced'
    };
    // Creative traits would need specific platform data (Instagram, TikTok, etc.)
  }

  /**
   * Calculate divergence between two cluster profiles
   */
  calculateDivergence(profileA, profileB) {
    if (!profileA.personality || !profileB.personality) {
      return null;
    }

    const traits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
    const differences = {};
    let totalDivergence = 0;

    for (const trait of traits) {
      const diff = Math.abs(profileA.personality[trait] - profileB.personality[trait]);
      differences[trait] = {
        difference: diff,
        direction: profileA.personality[trait] > profileB.personality[trait] ? 'higher_in_a' : 'higher_in_b'
      };
      totalDivergence += diff;
    }

    const avgDivergence = totalDivergence / traits.length;

    return {
      cluster_a: profileA.cluster,
      cluster_b: profileB.cluster,
      total_divergence: totalDivergence,
      average_divergence: avgDivergence,
      divergence_level: avgDivergence > 20 ? 'high' : avgDivergence > 10 ? 'moderate' : 'low',
      trait_differences: differences,
      summary: this.generateDivergenceSummary(profileA, profileB, differences, avgDivergence)
    };
  }

  /**
   * Calculate divergences between all cluster pairs
   */
  calculateAllDivergences(profiles) {
    const divergences = [];
    const clusterIds = Object.keys(profiles).filter(c => profiles[c].personality);

    for (let i = 0; i < clusterIds.length; i++) {
      for (let j = i + 1; j < clusterIds.length; j++) {
        const divergence = this.calculateDivergence(
          profiles[clusterIds[i]],
          profiles[clusterIds[j]]
        );
        if (divergence) {
          divergences.push(divergence);
        }
      }
    }

    return divergences.sort((a, b) => b.average_divergence - a.average_divergence);
  }

  /**
   * Generate human-readable divergence summary
   */
  generateDivergenceSummary(profileA, profileB, differences, avgDivergence) {
    const nameA = profileA.name;
    const nameB = profileB.name;

    if (avgDivergence < 5) {
      return `Your ${nameA} and ${nameB} personalities are very consistent - you show up authentically across both contexts.`;
    }

    // Find biggest differences
    const sortedDiffs = Object.entries(differences)
      .sort((a, b) => b[1].difference - a[1].difference);

    const biggestDiff = sortedDiffs[0];
    const trait = biggestDiff[0];
    const diff = biggestDiff[1];

    const traitDescriptions = {
      openness: { high: 'more curious and open', low: 'more focused and consistent' },
      conscientiousness: { high: 'more organized and disciplined', low: 'more flexible and spontaneous' },
      extraversion: { high: 'more outgoing and social', low: 'more reserved and introspective' },
      agreeableness: { high: 'more cooperative and trusting', low: 'more competitive and skeptical' },
      neuroticism: { high: 'more emotionally sensitive', low: 'more emotionally stable' }
    };

    const higher = diff.direction === 'higher_in_a' ? nameA : nameB;
    const lower = diff.direction === 'higher_in_a' ? nameB : nameA;
    const desc = traitDescriptions[trait]?.high || 'different';

    return `In your ${higher} life, you're ${desc} compared to your ${lower} context. This ${diff.difference > 15 ? 'significant' : 'moderate'} difference suggests you adapt your personality based on context.`;
  }

  /**
   * Get top evidence pieces
   */
  getTopEvidence(correlationMatches, limit = 5) {
    return correlationMatches
      .sort((a, b) => Math.abs(b.r_value) - Math.abs(a.r_value))
      .slice(0, limit)
      .map(m => ({
        platform: m.platform,
        feature: m.feature,
        trait: m.trait,
        evidence: m.evidence,
        r_value: m.r_value,
        source: m.source
      }));
  }

  /**
   * Calculate cluster confidence
   */
  calculateClusterConfidence(dataPoints, correlationsUsed, avgTraitConfidence) {
    const dataBonus = Math.min(0.3, dataPoints * 0.02);
    const correlationBonus = Math.min(0.2, correlationsUsed * 0.02);
    const baseConfidence = 0.3;

    return Math.min(0.95, baseConfidence + dataBonus + correlationBonus + avgTraitConfidence * 0.3);
  }

  /**
   * Store cluster profile in database
   */
  async storeClusterProfile(profile) {
    const { error } = await getSupabaseClient()
      .from('cluster_personalities')
      .upsert({
        user_id: this.userId,
        cluster: profile.cluster,
        openness: profile.personality?.openness,
        conscientiousness: profile.personality?.conscientiousness,
        extraversion: profile.personality?.extraversion,
        agreeableness: profile.personality?.agreeableness,
        neuroticism: profile.personality?.neuroticism,
        communication_style: profile.clusterTraits?.communication_style,
        energy_pattern: profile.clusterTraits?.energy_pattern,
        social_preference: profile.clusterTraits?.social_preference,
        data_points_count: profile.dataPoints,
        confidence: profile.confidence,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,cluster' });

    if (error) {
      console.error('Error storing cluster profile:', error);
    }
  }

  /**
   * Store divergence analysis
   */
  async storeDivergence(divergence) {
    const { error } = await getSupabaseClient()
      .from('cluster_divergence')
      .insert({
        user_id: this.userId,
        cluster_a: divergence.cluster_a,
        cluster_b: divergence.cluster_b,
        openness_diff: divergence.trait_differences.openness.difference,
        conscientiousness_diff: divergence.trait_differences.conscientiousness.difference,
        extraversion_diff: divergence.trait_differences.extraversion.difference,
        agreeableness_diff: divergence.trait_differences.agreeableness.difference,
        neuroticism_diff: divergence.trait_differences.neuroticism.difference,
        divergence_summary: divergence.summary,
        insights: divergence,
        calculated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error storing divergence:', error);
    }
  }

  /**
   * Get stored cluster profiles
   */
  async getStoredProfiles() {
    try {
      const { data, error } = await getSupabaseClient()
        .from('cluster_personalities')
        .select('*')
        .eq('user_id', this.userId);

      if (error) {
        console.warn('[ClusterPersonality] Failed to fetch profiles:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('[ClusterPersonality] Error fetching profiles:', err.message);
      return [];
    }
  }

  /**
   * Get stored divergences
   */
  async getStoredDivergences() {
    try {
      const { data, error } = await getSupabaseClient()
        .from('cluster_divergence')
        .select('*')
        .eq('user_id', this.userId)
        .order('calculated_at', { ascending: false })
        .limit(10);

      if (error) {
        console.warn('[ClusterPersonality] Failed to fetch divergences:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('[ClusterPersonality] Error fetching divergences:', err.message);
      return [];
    }
  }
}

/**
 * Factory function
 */
export function getClusterPersonalityBuilder(userId) {
  return new ClusterPersonalityBuilder(userId);
}

export { ClusterPersonalityBuilder, CLUSTER_DEFINITIONS };
export default ClusterPersonalityBuilder;
