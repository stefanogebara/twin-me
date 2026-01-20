/**
 * Behavioral Evidence Pipeline
 *
 * Orchestrates the full evidence generation pipeline:
 * 1. Extract features from stored platform data
 * 2. Generate evidence using validated correlations
 * 3. Store evidence in database
 * 4. Update personality scores based on behavioral data
 *
 * This service should be called after any platform data sync.
 */

import spotifyFeatureExtractor from './featureExtractors/spotifyExtractor.js';
import calendarFeatureExtractor from './featureExtractors/calendarExtractor.js';
import whoopFeatureExtractor from './featureExtractors/whoopExtractor.js';
import {
  generateAllEvidence,
  calculateConfidenceScores,
  storeEvidence,
  formatEvidenceResponse
} from './evidenceGeneratorService.js';
import { supabaseAdmin } from './database.js';

class BehavioralEvidencePipeline {
  constructor() {
    this.extractors = {
      spotify: spotifyFeatureExtractor,
      google_calendar: calendarFeatureExtractor,
      calendar: calendarFeatureExtractor, // alias
      whoop: whoopFeatureExtractor
    };
  }

  /**
   * Run the full evidence pipeline for a user
   * @param {string} userId - User ID
   * @param {string[]} platforms - Platforms to process (optional, defaults to all)
   * @returns {Object} Generated evidence and confidence scores
   */
  async runPipeline(userId, platforms = null) {
    console.log(`🔬 [Evidence Pipeline] Starting for user ${userId}`);

    try {
      // 1. Determine which platforms to process
      const connectedPlatforms = platforms || await this.getConnectedPlatforms(userId);
      console.log(`🔬 [Evidence Pipeline] Processing platforms: ${connectedPlatforms.join(', ')}`);

      // 2. Extract features from each platform
      const platformFeatures = {};
      const dataSources = {};

      for (const platform of connectedPlatforms) {
        const extractor = this.extractors[platform];
        if (!extractor) {
          console.log(`⚠️ [Evidence Pipeline] No extractor for platform: ${platform}`);
          continue;
        }

        try {
          console.log(`🔬 [Evidence Pipeline] Extracting ${platform} features...`);
          const features = await extractor.extractFeatures(userId);

          if (features && features.length > 0) {
            // Convert feature array to object format expected by generateAllEvidence
            platformFeatures[platform] = this.convertFeaturesToObject(features);
            dataSources[platform] = {
              days: 90, // Default lookback
              events: features.length
            };
            console.log(`✅ [Evidence Pipeline] Extracted ${features.length} features from ${platform}`);
          } else {
            console.log(`⚠️ [Evidence Pipeline] No features extracted from ${platform}`);
          }
        } catch (error) {
          console.error(`❌ [Evidence Pipeline] Error extracting ${platform} features:`, error.message);
        }
      }

      // 3. Check if we have any features
      const totalFeatures = Object.values(platformFeatures).reduce(
        (sum, f) => sum + Object.keys(f).filter(k => !k.startsWith('_')).length,
        0
      );

      if (totalFeatures === 0) {
        console.log(`⚠️ [Evidence Pipeline] No features extracted from any platform`);
        return {
          success: false,
          message: 'No behavioral features could be extracted. Ensure platforms have synced data.'
        };
      }

      console.log(`🔬 [Evidence Pipeline] Total features extracted: ${totalFeatures}`);

      // 4. Generate evidence from features
      const evidence = generateAllEvidence(platformFeatures);

      // Count evidence items
      const evidenceCount = Object.values(evidence).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`🔬 [Evidence Pipeline] Generated ${evidenceCount} evidence items`);

      // 5. Calculate confidence scores
      const confidence = calculateConfidenceScores(evidence, dataSources);

      // 6. Store evidence in database
      try {
        await storeEvidence(userId, evidence);
        console.log(`✅ [Evidence Pipeline] Evidence stored in database`);
      } catch (storeError) {
        console.warn(`⚠️ [Evidence Pipeline] Could not store evidence:`, storeError.message);
      }

      // 7. Update personality scores based on behavioral evidence
      await this.updateBehavioralPersonality(userId, evidence, confidence);

      return {
        success: true,
        evidence,
        confidence,
        dataSources,
        platformsProcessed: Object.keys(platformFeatures),
        featuresExtracted: totalFeatures,
        evidenceGenerated: evidenceCount
      };

    } catch (error) {
      console.error(`❌ [Evidence Pipeline] Error:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get connected platforms for a user
   */
  async getConnectedPlatforms(userId) {
    const { data: connections } = await supabaseAdmin
      .from('platform_connections')
      .select('platform')
      .eq('user_id', userId)
      .in('status', ['connected', 'token_refreshed', 'pending']);

    if (!connections || connections.length === 0) {
      return [];
    }

    // Map to extractor names and filter to supported platforms
    const supported = Object.keys(this.extractors);
    return connections
      .map(c => c.platform)
      .filter(p => supported.includes(p));
  }

  /**
   * Convert feature array to object format
   * Features come as: [{ feature_name: 'discovery_rate', feature_value: 0.7, ... }, ...]
   * Or: [{ feature_type: 'discovery_rate', feature_value: 0.7, ... }, ...]
   * We need: { discovery_rate: 0.7, genre_diversity: 0.5, ... }
   */
  convertFeaturesToObject(features) {
    const obj = { _rawValues: {} };

    for (const f of features) {
      // Support both feature_name and feature_type formats
      const featureName = f.feature_name || f.feature_type;
      const featureValue = f.feature_value ?? f.normalized_value;

      if (featureName && featureValue !== undefined) {
        // Normalize value to 0-1 range if it's a percentage (0-100)
        obj[featureName] = featureValue > 1 ? featureValue / 100 : featureValue;

        // Store raw values for template interpolation
        if (f.metadata?.raw_value || f.evidence?.raw_value) {
          obj._rawValues[featureName] = f.metadata?.raw_value || f.evidence?.raw_value;
          console.log(`🔬 [Evidence Pipeline] Found raw_value for ${featureName}:`, obj._rawValues[featureName]);
        }
      }
    }

    console.log(`[Evidence Pipeline] Converted ${Object.keys(obj).filter(k => !k.startsWith('_')).length} features to object format`);
    console.log(`🔬 [Evidence Pipeline] _rawValues keys:`, Object.keys(obj._rawValues));
    return obj;
  }

  /**
   * Update personality scores based on behavioral evidence
   */
  async updateBehavioralPersonality(userId, evidence, confidence) {
    try {
      // Calculate dimension scores from evidence
      const scores = {};
      const dimensions = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

      for (const dim of dimensions) {
        const dimEvidence = evidence[dim] || [];
        if (dimEvidence.length === 0) {
          scores[dim] = 50; // Neutral default
          continue;
        }

        // Weighted average based on correlation strength and feature value
        let weightedSum = 0;
        let totalWeight = 0;

        for (const e of dimEvidence) {
          const weight = Math.abs(e.correlation);
          // Feature value is 0-1, correlation can be positive or negative
          // Positive correlation: high feature = high dimension
          // Negative correlation: high feature = low dimension
          const contribution = e.correlation > 0 ? e.value : (1 - e.value);
          weightedSum += contribution * weight;
          totalWeight += weight;
        }

        // Convert to 0-100 scale
        scores[dim] = totalWeight > 0
          ? Math.round((weightedSum / totalWeight) * 100)
          : 50;
      }

      // Upsert personality scores
      const { error } = await supabaseAdmin
        .from('personality_scores')
        .upsert({
          user_id: userId,
          openness: scores.openness,
          conscientiousness: scores.conscientiousness,
          extraversion: scores.extraversion,
          agreeableness: scores.agreeableness,
          neuroticism: scores.neuroticism,
          openness_confidence: Math.round(confidence.by_dimension.openness * 100),
          conscientiousness_confidence: Math.round(confidence.by_dimension.conscientiousness * 100),
          extraversion_confidence: Math.round(confidence.by_dimension.extraversion * 100),
          agreeableness_confidence: Math.round(confidence.by_dimension.agreeableness * 100),
          neuroticism_confidence: Math.round(confidence.by_dimension.neuroticism * 100),
          source: 'behavioral',
          source_type: 'behavioral',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.warn(`⚠️ [Evidence Pipeline] Could not update personality_scores:`, error.message);
      } else {
        console.log(`✅ [Evidence Pipeline] Updated behavioral personality scores:`, scores);
      }

    } catch (error) {
      console.error(`❌ [Evidence Pipeline] Error updating personality:`, error);
    }
  }

  /**
   * Run pipeline for a specific platform only
   */
  async runPlatformPipeline(userId, platform) {
    return this.runPipeline(userId, [platform]);
  }
}

// Singleton instance
const behavioralEvidencePipeline = new BehavioralEvidencePipeline();

export default behavioralEvidencePipeline;
export { BehavioralEvidencePipeline };
