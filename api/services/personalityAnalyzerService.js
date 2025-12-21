/**
 * Claude-Powered Personality Analyzer Service
 *
 * Uses Claude AI to analyze behavioral features from multiple platforms
 * and calculate Big Five (OCEAN) personality dimensions with confidence scores.
 *
 * This service:
 * 1. Fetches behavioral features from multiple platforms
 * 2. Uses Claude to analyze patterns and calculate personality scores
 * 3. Generates confidence scores based on data quality and sample size
 * 4. Saves results to personality_scores table
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './database.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

class PersonalityAnalyzerService {
  constructor() {
    this.MODEL = 'claude-sonnet-4-5-20250929';
  }

  /**
   * Analyze user's personality from behavioral features
   */
  async analyzePersonality(userId) {
    console.log(`🧠 [Personality Analyzer] Starting analysis for user ${userId}`);

    try {
      // 1. Fetch all behavioral features for the user
      const { data: features, error: featuresError } = await supabaseAdmin
        .from('behavioral_features')
        .select('*')
        .eq('user_id', userId);

      if (featuresError) throw featuresError;

      if (!features || features.length === 0) {
        console.log('⚠️ [Personality Analyzer] No behavioral features found');
        return {
          success: false,
          error: 'No behavioral data available. Connect platforms first.'
        };
      }

      console.log(`📊 [Personality Analyzer] Found ${features.length} behavioral features`);

      // 2. Group features by platform
      const platformFeatures = this.groupFeaturesByPlatform(features);

      // 3. Calculate initial scores using weighted aggregation
      const initialScores = this.calculateWeightedScores(features);

      // 4. Use Claude to refine and validate scores
      const refinedScores = await this.refineScoresWithClaude(features, platformFeatures, initialScores);

      // 5. Calculate confidence scores
      const confidenceScores = this.calculateConfidenceScores(features, platformFeatures);

      // 6. Prepare final personality scores object
      const personalityScores = {
        user_id: userId,
        openness: refinedScores.openness,
        conscientiousness: refinedScores.conscientiousness,
        extraversion: refinedScores.extraversion,
        agreeableness: refinedScores.agreeableness,
        neuroticism: refinedScores.neuroticism,
        openness_confidence: confidenceScores.openness,
        conscientiousness_confidence: confidenceScores.conscientiousness,
        extraversion_confidence: confidenceScores.extraversion,
        agreeableness_confidence: confidenceScores.agreeableness,
        neuroticism_confidence: confidenceScores.neuroticism,
        source_type: 'behavioral',
        sample_size: features.length,
        analyzed_platforms: Object.keys(platformFeatures)
      };

      // 7. Save to database
      const { data: saved, error: saveError } = await supabaseAdmin
        .from('personality_scores')
        .upsert(personalityScores, {
          onConflict: 'user_id'
        })
        .select()
        .single();

      if (saveError) throw saveError;

      console.log(`✅ [Personality Analyzer] Analysis complete`);
      console.log(`   Openness: ${saved.openness}% (confidence: ${saved.openness_confidence}%)`);
      console.log(`   Conscientiousness: ${saved.conscientiousness}% (confidence: ${saved.conscientiousness_confidence}%)`);
      console.log(`   Extraversion: ${saved.extraversion}% (confidence: ${saved.extraversion_confidence}%)`);
      console.log(`   Agreeableness: ${saved.agreeableness}% (confidence: ${saved.agreeableness_confidence}%)`);
      console.log(`   Neuroticism: ${saved.neuroticism}% (confidence: ${saved.neuroticism_confidence}%)`);

      return {
        success: true,
        personalityScores: saved,
        featuresAnalyzed: features.length,
        platformsAnalyzed: Object.keys(platformFeatures)
      };

    } catch (error) {
      console.error('❌ [Personality Analyzer] Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Group features by platform for analysis
   */
  groupFeaturesByPlatform(features) {
    const grouped = {};

    for (const feature of features) {
      if (!grouped[feature.platform]) {
        grouped[feature.platform] = [];
      }
      grouped[feature.platform].push(feature);
    }

    return grouped;
  }

  /**
   * Calculate weighted scores from features using contribution weights
   */
  calculateWeightedScores(features) {
    const scores = {
      openness: { total: 0, weight: 0 },
      conscientiousness: { total: 0, weight: 0 },
      extraversion: { total: 0, weight: 0 },
      agreeableness: { total: 0, weight: 0 },
      neuroticism: { total: 0, weight: 0 }
    };

    for (const feature of features) {
      const dimension = feature.contributes_to;
      if (!dimension || !scores[dimension]) continue;

      const weight = Math.abs(feature.contribution_weight || 0);
      const value = feature.feature_value;

      // Handle negative correlations (e.g., high repeat listening = LOW conscientiousness)
      const adjustedValue = feature.contribution_weight < 0 ? (100 - value) : value;

      scores[dimension].total += adjustedValue * weight;
      scores[dimension].weight += weight;
    }

    // Calculate weighted averages
    const result = {};
    for (const [dimension, data] of Object.entries(scores)) {
      result[dimension] = data.weight > 0
        ? Math.round((data.total / data.weight) * 100) / 100
        : 50; // Default to neutral if no data
    }

    return result;
  }

  /**
   * Use Claude AI to refine and validate personality scores
   */
  async refineScoresWithClaude(features, platformFeatures, initialScores) {
    console.log(`🤖 [Personality Analyzer] Refining scores with Claude AI...`);

    // Prepare feature summary for Claude
    const featureSummary = features.map(f => ({
      platform: f.platform,
      feature: f.feature_type,
      value: f.feature_value,
      dimension: f.contributes_to,
      weight: f.contribution_weight,
      confidence: f.confidence_score
    }));

    const prompt = `You are a personality psychology expert analyzing behavioral data to calculate Big Five (OCEAN) personality scores.

BEHAVIORAL FEATURES EXTRACTED:
${JSON.stringify(featureSummary, null, 2)}

PLATFORMS ANALYZED: ${Object.keys(platformFeatures).join(', ')}

INITIAL WEIGHTED SCORES:
- Openness: ${initialScores.openness}%
- Conscientiousness: ${initialScores.conscientiousness}%
- Extraversion: ${initialScores.extraversion}%
- Agreeableness: ${initialScores.agreeableness}%
- Neuroticism: ${initialScores.neuroticism}%

YOUR TASK:
Analyze these behavioral features and provide REFINED personality scores (0-100 scale) for each Big Five dimension.

Consider:
1. Feature correlation weights and their academic backing
2. Cross-platform consistency (do Spotify and Calendar features align?)
3. Sample size and confidence scores
4. Known personality research findings
5. Any contradictory signals that might indicate mixed traits

Respond ONLY with a JSON object in this exact format (no markdown, no explanation):
{
  "openness": <number 0-100>,
  "conscientiousness": <number 0-100>,
  "extraversion": <number 0-100>,
  "agreeableness": <number 0-100>,
  "neuroticism": <number 0-100>,
  "reasoning": "<brief 1-2 sentence explanation of key factors>"
}`;

    try {
      const message = await anthropic.messages.create({
        model: this.MODEL,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      let responseText = message.content[0].text.trim();
      console.log(`📝 [Personality Analyzer] Claude response:`, responseText);

      // Strip markdown code blocks if present
      if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      }

      // Parse Claude's response
      const refined = JSON.parse(responseText);

      console.log(`✅ [Personality Analyzer] Claude refinement: ${refined.reasoning}`);

      return {
        openness: Math.round(refined.openness * 100) / 100,
        conscientiousness: Math.round(refined.conscientiousness * 100) / 100,
        extraversion: Math.round(refined.extraversion * 100) / 100,
        agreeableness: Math.round(refined.agreeableness * 100) / 100,
        neuroticism: Math.round(refined.neuroticism * 100) / 100
      };

    } catch (error) {
      console.error('⚠️ [Personality Analyzer] Claude refinement failed, using initial scores:', error);
      // Fallback to initial scores if Claude fails
      return initialScores;
    }
  }

  /**
   * Calculate confidence scores for each personality dimension
   */
  calculateConfidenceScores(features, platformFeatures) {
    const dimensionFeatures = {
      openness: [],
      conscientiousness: [],
      extraversion: [],
      agreeableness: [],
      neuroticism: []
    };

    // Group features by dimension
    for (const feature of features) {
      const dimension = feature.contributes_to;
      if (dimension && dimensionFeatures[dimension]) {
        dimensionFeatures[dimension].push(feature);
      }
    }

    const confidenceScores = {};

    for (const [dimension, dimFeatures] of Object.entries(dimensionFeatures)) {
      if (dimFeatures.length === 0) {
        confidenceScores[dimension] = 0;
        continue;
      }

      // Factors affecting confidence:
      // 1. Number of features (more = better)
      // 2. Feature confidence scores
      // 3. Cross-platform validation (multiple platforms = higher confidence)
      // 4. Contribution weights (higher correlations = more confident)

      const featureCount = dimFeatures.length;
      const avgFeatureConfidence = dimFeatures.reduce((sum, f) => sum + f.confidence_score, 0) / featureCount;
      const platforms = new Set(dimFeatures.map(f => f.platform));
      const crossPlatformBonus = platforms.size > 1 ? 15 : 0;
      const avgWeight = dimFeatures.reduce((sum, f) => sum + Math.abs(f.contribution_weight), 0) / featureCount;

      // Calculate composite confidence
      const baseConfidence = Math.min(100, (
        (Math.min(featureCount, 5) / 5) * 30 +      // Max 30 points for feature count
        (avgFeatureConfidence / 100) * 40 +          // Max 40 points for feature quality
        crossPlatformBonus +                         // 15 points for cross-platform
        (avgWeight / 0.5) * 15                       // Max 15 points for strong correlations
      ));

      confidenceScores[dimension] = Math.round(baseConfidence);
    }

    return confidenceScores;
  }

  /**
   * Get personality label for a score
   */
  getPersonalityLabel(score, dimension) {
    const labels = {
      openness: {
        high: 'Highly Creative & Open-Minded',
        moderate: 'Balanced Openness',
        low: 'Conventional & Practical'
      },
      conscientiousness: {
        high: 'Highly Organized & Disciplined',
        moderate: 'Balanced Conscientiousness',
        low: 'Spontaneous & Flexible'
      },
      extraversion: {
        high: 'Highly Extraverted & Social',
        moderate: 'Ambivert',
        low: 'Introverted & Reserved'
      },
      agreeableness: {
        high: 'Highly Cooperative & Compassionate',
        moderate: 'Balanced Agreeableness',
        low: 'Independent & Analytical'
      },
      neuroticism: {
        high: 'Emotionally Sensitive',
        moderate: 'Emotionally Balanced',
        low: 'Emotionally Stable & Calm'
      }
    };

    const level = score >= 65 ? 'high' : score >= 35 ? 'moderate' : 'low';
    return labels[dimension]?.[level] || 'Unknown';
  }
}

// Export singleton instance
const personalityAnalyzerService = new PersonalityAnalyzerService();
export default personalityAnalyzerService;
