/**
 * Unique Pattern Detector Service
 *
 * Identifies distinctive behavioral patterns that make a user unique
 * by comparing their features against population statistics.
 *
 * Detects patterns that fall in the top/bottom 5% of the population,
 * marking them as "defining" characteristics of the user's soul signature.
 *
 * Pattern Types:
 * - Single-platform extremes (e.g., "Top 3% music discovery rate")
 * - Cross-platform correlations (e.g., "Listens to jazz before important meetings")
 * - Temporal patterns (e.g., "Most creative at 2am")
 * - Behavioral combinations (e.g., "High organization + High spontaneity")
 */

import { supabaseAdmin } from './database.js';

class UniquePatternDetector {
  constructor() {
    // Population statistics for behavioral features (hypothetical baseline)
    // In production, these would come from aggregated anonymous data
    this.populationStats = {
      spotify: {
        discovery_rate: { mean: 35, stdDev: 15 },
        genre_diversity: { mean: 45, stdDev: 20 },
        repeat_listening: { mean: 40, stdDev: 18 },
        playlist_organization: { mean: 50, stdDev: 22 },
        social_sharing: { mean: 30, stdDev: 25 },
        energy_preference: { mean: 55, stdDev: 18 },
        emotional_valence: { mean: 52, stdDev: 16 }
      },
      calendar: {
        social_density: { mean: 40, stdDev: 20 },
        meeting_preparation: { mean: 35, stdDev: 18 },
        schedule_flexibility: { mean: 45, stdDev: 22 },
        invitation_response_time: { mean: 50, stdDev: 25 },
        calendar_conflicts: { mean: 15, stdDev: 12 },
        work_life_balance: { mean: 55, stdDev: 18 },
        event_duration_consistency: { mean: 60, stdDev: 20 }
      }
    };

    this.PERCENTILE_THRESHOLD = 5; // Top/bottom 5% considered unique
  }

  /**
   * Detect unique patterns for a user
   */
  async detectUniquePatterns(userId) {
    console.log(`🔍 [Pattern Detector] Detecting unique patterns for user ${userId}`);

    try {
      // 1. Fetch user's behavioral features
      const { data: features, error } = await supabaseAdmin
        .from('behavioral_features')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      if (!features || features.length === 0) {
        console.log('⚠️ [Pattern Detector] No behavioral features found');
        return { success: true, patterns: [] };
      }

      console.log(`📊 [Pattern Detector] Analyzing ${features.length} features`);

      const patterns = [];

      // 2. Detect single-feature extremes
      const extremePatterns = this.detectExtremeFeatures(userId, features);
      patterns.push(...extremePatterns);

      // 3. Detect cross-platform patterns
      const crossPlatformPatterns = this.detectCrossPlatformPatterns(userId, features);
      patterns.push(...crossPlatformPatterns);

      // 4. Detect rare combinations
      const combinationPatterns = this.detectRareCombinations(userId, features);
      patterns.push(...combinationPatterns);

      // 5. Mark most distinctive patterns as "defining"
      this.markDefiningPatterns(patterns);

      // 6. Save patterns to database
      if (patterns.length > 0) {
        const { data: saved, error: saveError } = await supabaseAdmin
          .from('unique_patterns')
          .upsert(patterns, {
            onConflict: 'user_id,pattern_type,pattern_name'
          })
          .select();

        if (saveError) throw saveError;

        console.log(`✅ [Pattern Detector] Saved ${saved.length} unique patterns`);

        return {
          success: true,
          patterns: saved,
          definingCount: saved.filter(p => p.is_defining).length
        };
      }

      return { success: true, patterns: [] };

    } catch (error) {
      console.error('❌ [Pattern Detector] Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Detect features that are extreme outliers
   */
  detectExtremeFeatures(userId, features) {
    const patterns = [];

    for (const feature of features) {
      const stats = this.populationStats[feature.platform]?.[feature.feature_type];
      if (!stats) continue;

      const percentile = this.calculatePercentile(feature.feature_value, stats.mean, stats.stdDev);

      // Check if in top or bottom 5%
      if (percentile >= 95 || percentile <= 5) {
        const isHigh = percentile >= 95;
        const extremeLabel = isHigh ? 'exceptionally high' : 'exceptionally low';
        const percentileLabel = isHigh ? `top ${100 - percentile}%` : `bottom ${percentile}%`;

        patterns.push({
          user_id: userId,
          pattern_type: 'extreme_feature',
          pattern_name: `${feature.feature_type}_extreme`,
          description: `Your ${this.formatFeatureName(feature.feature_type)} is ${extremeLabel} - you're in the ${percentileLabel} of users.`,
          user_value: feature.feature_value,
          population_percentile: percentile,
          population_mean: stats.mean,
          population_stddev: stats.stdDev,
          platforms: [feature.platform],
          behavioral_feature_ids: [feature.id],
          uniqueness_score: Math.abs(percentile - 50) * 2, // 0-100 scale
          is_defining: false,
          evidence: {
            feature_type: feature.feature_type,
            platform: feature.platform,
            z_score: (feature.feature_value - stats.mean) / stats.stdDev
          }
        });
      }
    }

    return patterns;
  }

  /**
   * Detect patterns that span multiple platforms
   */
  detectCrossPlatformPatterns(userId, features) {
    const patterns = [];

    // Group features by personality dimension
    const byDimension = {};
    for (const feature of features) {
      const dim = feature.contributes_to;
      if (!dim) continue;
      if (!byDimension[dim]) byDimension[dim] = [];
      byDimension[dim].push(feature);
    }

    // Check for cross-platform consistency
    for (const [dimension, dimFeatures] of Object.entries(byDimension)) {
      const platforms = new Set(dimFeatures.map(f => f.platform));

      if (platforms.size >= 2) {
        // Multiple platforms contribute to same dimension
        const avgValue = dimFeatures.reduce((sum, f) => sum + f.feature_value, 0) / dimFeatures.length;
        const variance = dimFeatures.reduce((sum, f) => sum + Math.pow(f.feature_value - avgValue, 2), 0) / dimFeatures.length;
        const consistency = 100 - Math.sqrt(variance); // Higher = more consistent

        if (consistency >= 80) {
          patterns.push({
            user_id: userId,
            pattern_type: 'cross_platform_consistency',
            pattern_name: `consistent_${dimension}`,
            description: `Your ${dimension} shows remarkable consistency across ${Array.from(platforms).join(' and ')}. This trait is deeply authentic to who you are.`,
            user_value: avgValue,
            population_percentile: null,
            population_mean: null,
            population_stddev: null,
            platforms: Array.from(platforms),
            behavioral_feature_ids: dimFeatures.map(f => f.id),
            uniqueness_score: consistency,
            is_defining: false,
            evidence: {
              dimension,
              consistency,
              platforms: Array.from(platforms),
              feature_values: dimFeatures.map(f => ({ platform: f.platform, value: f.feature_value }))
            }
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Detect rare combinations of traits
   */
  detectRareCombinations(userId, features) {
    const patterns = [];

    // Look for contradictory high scores (rare combinations)
    const rareCombinations = [
      {
        features: ['discovery_rate', 'repeat_listening'],
        name: 'explorer_loyalist',
        description: 'You have the rare combination of loving new discoveries while staying deeply loyal to favorites - a true musical polymath.'
      },
      {
        features: ['social_density', 'schedule_flexibility'],
        name: 'social_free_spirit',
        description: 'Despite a busy social calendar, you maintain remarkable schedule flexibility - you thrive in spontaneous connection.'
      },
      {
        features: ['playlist_organization', 'genre_diversity'],
        name: 'organized_eclectic',
        description: 'You bring meticulous organization to wildly diverse tastes - a curator of beautiful chaos.'
      },
      {
        features: ['energy_preference', 'emotional_valence'],
        condition: (features) => {
          const energy = features.find(f => f.feature_type === 'energy_preference');
          const valence = features.find(f => f.feature_type === 'emotional_valence');
          return energy && valence && energy.feature_value > 70 && valence.feature_value < 40;
        },
        name: 'energetic_melancholic',
        description: 'You gravitate toward high-energy music with melancholic undertones - intensity meets emotional depth.'
      }
    ];

    for (const combo of rareCombinations) {
      if (combo.condition) {
        // Custom condition check
        if (combo.condition(features)) {
          const relevantFeatures = features.filter(f =>
            combo.features?.includes(f.feature_type) ||
            f.feature_type === 'energy_preference' ||
            f.feature_type === 'emotional_valence'
          );

          patterns.push({
            user_id: userId,
            pattern_type: 'rare_combination',
            pattern_name: combo.name,
            description: combo.description,
            user_value: null,
            population_percentile: 3, // Rare combinations are ~3% of population
            population_mean: null,
            population_stddev: null,
            platforms: [...new Set(relevantFeatures.map(f => f.platform))],
            behavioral_feature_ids: relevantFeatures.map(f => f.id),
            uniqueness_score: 90,
            is_defining: false,
            evidence: {
              combination: combo.name,
              features: relevantFeatures.map(f => ({ type: f.feature_type, value: f.feature_value }))
            }
          });
        }
      } else {
        // Standard dual-high check
        const [feat1Name, feat2Name] = combo.features;
        const feat1 = features.find(f => f.feature_type === feat1Name);
        const feat2 = features.find(f => f.feature_type === feat2Name);

        if (feat1 && feat2 && feat1.feature_value > 65 && feat2.feature_value > 65) {
          patterns.push({
            user_id: userId,
            pattern_type: 'rare_combination',
            pattern_name: combo.name,
            description: combo.description,
            user_value: (feat1.feature_value + feat2.feature_value) / 2,
            population_percentile: 5,
            population_mean: null,
            population_stddev: null,
            platforms: [feat1.platform, feat2.platform].filter((v, i, a) => a.indexOf(v) === i),
            behavioral_feature_ids: [feat1.id, feat2.id],
            uniqueness_score: 85,
            is_defining: false,
            evidence: {
              combination: combo.name,
              feature1: { type: feat1Name, value: feat1.feature_value },
              feature2: { type: feat2Name, value: feat2.feature_value }
            }
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Mark the most distinctive patterns as "defining"
   */
  markDefiningPatterns(patterns) {
    // Sort by uniqueness score
    patterns.sort((a, b) => b.uniqueness_score - a.uniqueness_score);

    // Mark top 5 patterns as defining
    for (let i = 0; i < Math.min(5, patterns.length); i++) {
      if (patterns[i].uniqueness_score >= 70) {
        patterns[i].is_defining = true;
      }
    }
  }

  /**
   * Calculate percentile from z-score
   */
  calculatePercentile(value, mean, stdDev) {
    const zScore = (value - mean) / stdDev;

    // Approximate percentile using standard normal distribution
    // Using error function approximation
    const percentile = 50 * (1 + this.erf(zScore / Math.sqrt(2)));

    return Math.round(percentile * 100) / 100;
  }

  /**
   * Error function approximation for z-score to percentile conversion
   */
  erf(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  /**
   * Format feature name for display
   */
  formatFeatureName(featureType) {
    return featureType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

// Export singleton instance
const uniquePatternDetector = new UniquePatternDetector();
export default uniquePatternDetector;
