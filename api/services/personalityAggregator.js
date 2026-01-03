/**
 * PersonalityAggregator Service
 *
 * Aggregates behavioral features from all connected platforms into
 * Big Five personality scores with confidence intervals.
 *
 * Big Five Dimensions:
 * - Openness (O): Creativity, curiosity, openness to experience
 * - Conscientiousness (C): Organization, discipline, reliability
 * - Extraversion (E): Sociability, assertiveness, energy
 * - Agreeableness (A): Cooperation, trust, empathy
 * - Neuroticism (N): Emotional instability, anxiety, moodiness
 */

import { supabaseAdmin } from './database.js';

// Dimension definitions with expected feature sources
const BIG_FIVE_DIMENSIONS = {
  openness: {
    label: 'Openness',
    description: 'Creativity, curiosity, and openness to new experiences',
    features: ['discovery_rate', 'genre_diversity', 'schedule_flexibility', 'activity_diversity', 'meeting_variety']
  },
  conscientiousness: {
    label: 'Conscientiousness',
    description: 'Organization, discipline, and goal-directed behavior',
    features: ['playlist_organization', 'sleep_consistency', 'workout_regularity', 'recovery_adherence', 'sleep_performance', 'meeting_preparation', 'work_life_balance', 'event_duration_consistency']
  },
  extraversion: {
    label: 'Extraversion',
    description: 'Sociability, assertiveness, and positive emotions',
    features: ['social_sharing', 'energy_preference', 'strain_tolerance', 'workout_frequency', 'social_density']
  },
  agreeableness: {
    label: 'Agreeableness',
    description: 'Cooperation, trust, and concern for others',
    features: ['invitation_response_time', 'collaborative_meetings']
  },
  neuroticism: {
    label: 'Neuroticism',
    description: 'Emotional instability and tendency toward negative emotions',
    features: ['emotional_valence', 'hrv_stability', 'calendar_conflicts', 'repeat_listening']
  }
};

class PersonalityAggregator {
  constructor() {
    this.FRESHNESS_DECAY_DAYS = 30; // Features older than 30 days get reduced confidence
  }

  /**
   * Aggregate all behavioral features into Big Five scores
   */
  async aggregateFeatures(userId) {
    try {
      // Fetch all behavioral features for the user
      const { data: features, error } = await supabaseAdmin
        .from('behavioral_features')
        .select('*')
        .eq('user_id', userId)
        .order('extracted_at', { ascending: false });

      if (error) throw error;

      if (!features || features.length === 0) {
        return {
          success: false,
          error: 'No behavioral features found',
          scores: null
        };
      }

      // Calculate scores for each dimension
      const scores = this.calculateBigFiveScores(features);
      const confidence = this.calculateConfidenceScores(features);
      const platformCoverage = this.calculatePlatformCoverage(features);

      return {
        success: true,
        scores,
        confidence,
        platformCoverage,
        featureCount: features.length,
        calculatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('[PersonalityAggregator] Error aggregating features:', error);
      return {
        success: false,
        error: error.message,
        scores: null
      };
    }
  }

  /**
   * Calculate Big Five scores from features using weighted averaging
   */
  calculateBigFiveScores(features) {
    const scores = {};

    for (const [dimension, config] of Object.entries(BIG_FIVE_DIMENSIONS)) {
      // Get features that contribute to this dimension
      const relevantFeatures = features.filter(f =>
        f.contributes_to === dimension ||
        config.features.includes(f.feature_type)
      );

      if (relevantFeatures.length === 0) {
        scores[dimension] = {
          score: 50, // Default neutral score
          sampleSize: 0,
          contributors: []
        };
        continue;
      }

      // Calculate weighted average
      let weightedSum = 0;
      let totalWeight = 0;
      const contributors = [];

      for (const feature of relevantFeatures) {
        // Get contribution weight (absolute value for calculation)
        const weight = Math.abs(feature.contribution_weight || 0.3);

        // Apply freshness decay
        const freshnessMultiplier = this.calculateFreshnessMultiplier(feature.extracted_at);

        // Adjust value for negative correlations
        let adjustedValue = feature.normalized_value * 100;
        if (feature.contribution_weight < 0) {
          adjustedValue = 100 - adjustedValue; // Invert for negative correlations
        }

        const effectiveWeight = weight * freshnessMultiplier * (feature.confidence_score / 100);
        weightedSum += adjustedValue * effectiveWeight;
        totalWeight += effectiveWeight;

        contributors.push({
          platform: feature.platform,
          feature: feature.feature_type,
          value: feature.feature_value,
          weight: effectiveWeight
        });
      }

      const score = totalWeight > 0 ? weightedSum / totalWeight : 50;

      scores[dimension] = {
        score: Math.round(score * 100) / 100,
        sampleSize: relevantFeatures.length,
        contributors: contributors.sort((a, b) => b.weight - a.weight)
      };
    }

    return scores;
  }

  /**
   * Calculate confidence scores based on data coverage and freshness
   */
  calculateConfidenceScores(features) {
    const confidence = {};

    for (const dimension of Object.keys(BIG_FIVE_DIMENSIONS)) {
      const relevantFeatures = features.filter(f =>
        f.contributes_to === dimension
      );

      if (relevantFeatures.length === 0) {
        confidence[dimension] = {
          level: 'low',
          score: 0,
          reason: 'No data available'
        };
        continue;
      }

      // Calculate confidence based on:
      // 1. Number of contributing features
      // 2. Average confidence score of features
      // 3. Freshness of data
      // 4. Platform diversity

      const featureCount = relevantFeatures.length;
      const avgFeatureConfidence = relevantFeatures.reduce((sum, f) => sum + f.confidence_score, 0) / featureCount;
      const platforms = new Set(relevantFeatures.map(f => f.platform));
      const platformDiversity = platforms.size / 3; // Out of 3 MVP platforms

      // Fresh features (last 7 days)
      const recentFeatures = relevantFeatures.filter(f =>
        new Date(f.extracted_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      );
      const freshnessRatio = recentFeatures.length / featureCount;

      // Composite confidence score
      const compositeScore = (
        (Math.min(featureCount, 5) / 5) * 30 + // Up to 30 points for feature count
        (avgFeatureConfidence / 100) * 30 +    // Up to 30 points for feature quality
        platformDiversity * 20 +                // Up to 20 points for platform diversity
        freshnessRatio * 20                     // Up to 20 points for freshness
      );

      let level = 'low';
      if (compositeScore >= 70) level = 'high';
      else if (compositeScore >= 40) level = 'medium';

      confidence[dimension] = {
        level,
        score: Math.round(compositeScore),
        featureCount,
        platformCount: platforms.size,
        freshDataRatio: Math.round(freshnessRatio * 100)
      };
    }

    return confidence;
  }

  /**
   * Calculate platform coverage statistics
   */
  calculatePlatformCoverage(features) {
    const platforms = {};
    const platformList = ['spotify', 'whoop', 'calendar'];

    for (const platform of platformList) {
      const platformFeatures = features.filter(f => f.platform === platform);
      platforms[platform] = {
        featureCount: platformFeatures.length,
        connected: platformFeatures.length > 0,
        latestExtraction: platformFeatures.length > 0
          ? platformFeatures[0].extracted_at
          : null
      };
    }

    const connectedPlatforms = Object.values(platforms).filter(p => p.connected).length;

    return {
      platforms,
      connectedCount: connectedPlatforms,
      totalPlatforms: platformList.length,
      coveragePercent: Math.round((connectedPlatforms / platformList.length) * 100)
    };
  }

  /**
   * Calculate freshness multiplier (decays over time)
   */
  calculateFreshnessMultiplier(extractedAt) {
    if (!extractedAt) return 0.5;

    const ageInDays = (Date.now() - new Date(extractedAt).getTime()) / (1000 * 60 * 60 * 24);

    if (ageInDays <= 7) return 1.0;          // Last week = full weight
    if (ageInDays <= 30) return 0.8;         // Last month = 80%
    if (ageInDays <= 90) return 0.5;         // Last 3 months = 50%
    return 0.3;                               // Older = 30%
  }

  /**
   * Get complete personality profile for a user
   */
  async getPersonalityProfile(userId) {
    const aggregation = await this.aggregateFeatures(userId);

    if (!aggregation.success) {
      return aggregation;
    }

    // Calculate overall profile strength
    const overallConfidence = Object.values(aggregation.confidence)
      .reduce((sum, c) => sum + c.score, 0) / 5;

    // Determine dominant traits (top 2 with score > 60 or < 40)
    const dominantTraits = Object.entries(aggregation.scores)
      .filter(([_, data]) => data.score > 60 || data.score < 40)
      .sort((a, b) => Math.abs(b[1].score - 50) - Math.abs(a[1].score - 50))
      .slice(0, 2)
      .map(([dimension, data]) => ({
        dimension,
        label: BIG_FIVE_DIMENSIONS[dimension].label,
        score: data.score,
        pole: data.score >= 50 ? 'high' : 'low'
      }));

    return {
      success: true,
      profile: {
        scores: aggregation.scores,
        confidence: aggregation.confidence,
        platformCoverage: aggregation.platformCoverage,
        dominantTraits,
        overallConfidence: Math.round(overallConfidence),
        profileStrength: overallConfidence >= 60 ? 'strong' : overallConfidence >= 40 ? 'moderate' : 'weak',
        featureCount: aggregation.featureCount,
        calculatedAt: aggregation.calculatedAt
      }
    };
  }

  /**
   * Save calculated personality scores to database
   */
  async savePersonalityScores(userId, scores, confidence) {
    try {
      // Get list of analyzed platforms
      const analyzedPlatforms = [...new Set(
        Object.values(scores)
          .flatMap(s => s.contributors?.map(c => c.platform) || [])
      )];

      const scoreData = {
        user_id: userId,
        openness: scores.openness?.score || 50,
        conscientiousness: scores.conscientiousness?.score || 50,
        extraversion: scores.extraversion?.score || 50,
        agreeableness: scores.agreeableness?.score || 50,
        neuroticism: scores.neuroticism?.score || 50,
        openness_confidence: confidence.openness?.score || 0,
        conscientiousness_confidence: confidence.conscientiousness?.score || 0,
        extraversion_confidence: confidence.extraversion?.score || 0,
        agreeableness_confidence: confidence.agreeableness?.score || 0,
        neuroticism_confidence: confidence.neuroticism?.score || 0,
        source_type: 'behavioral',
        sample_size: Object.values(scores).reduce((sum, s) => sum + (s.sampleSize || 0), 0),
        analyzed_platforms: analyzedPlatforms,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabaseAdmin
        .from('personality_scores')
        .upsert(scoreData, {
          onConflict: 'user_id'
        })
        .select();

      if (error) throw error;

      return { success: true, data };

    } catch (error) {
      console.error('[PersonalityAggregator] Error saving scores:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get overall confidence level from individual dimension confidence
   */
  getOverallConfidenceLevel(confidence) {
    const avgScore = Object.values(confidence)
      .reduce((sum, c) => sum + c.score, 0) / Object.keys(confidence).length;

    if (avgScore >= 70) return 'high';
    if (avgScore >= 40) return 'medium';
    return 'low';
  }
}

// Export singleton instance
const personalityAggregator = new PersonalityAggregator();
export default personalityAggregator;
