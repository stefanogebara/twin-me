/**
 * Evidence Generator Service
 *
 * Generates human-readable evidence descriptions for personality inferences
 * based on behavioral data and research-backed correlations.
 *
 * Research sources:
 * - Anderson et al. (2021) - Spotify, n=5,808
 * - Stachl et al. (2020) - Smartphone, n=624
 * - Zufferey et al. (2023) - Wearables, n=200+
 * - Sleep Meta-analysis (2024) - n=31,000
 */

import { supabaseAdmin } from '../config/supabase.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load validated correlations
let CORRELATIONS = null;
try {
  const correlationsPath = join(__dirname, '../data/validated-correlations.json');
  CORRELATIONS = JSON.parse(readFileSync(correlationsPath, 'utf-8'));
  console.log('[EvidenceGenerator] Loaded validated correlations');
} catch (error) {
  console.warn('[EvidenceGenerator] Could not load correlations:', error.message);
}

// Use shared Supabase client
const supabase = supabaseAdmin;

/**
 * Derive raw values from normalized feature values
 * Used when raw values aren't stored in the database
 * @param {string} featureName - Feature name
 * @param {number} normalizedValue - Normalized value (0-1)
 * @returns {Object} Raw value object for template interpolation
 */
function deriveRawValue(featureName, normalizedValue) {
  const raw = {};
  const val = parseFloat(normalizedValue) || 0;

  switch (featureName) {
    // Spotify features
    case 'genre_diversity':
      raw.genre_count = Math.round(val * 30); // Max 30 genres
      break;
    case 'discovery_rate':
      raw.new_artists_percent = Math.round(val * 100);
      break;
    case 'energy_preference':
      raw.avg_energy = val.toFixed(2);
      break;
    case 'valence_preference':
      raw.avg_valence = val.toFixed(2);
      break;
    case 'tempo_preference':
      raw.avg_tempo = Math.round(60 + val * 140); // 60-200 BPM range
      break;
    case 'acousticness_preference':
      raw.avg_acousticness = val.toFixed(2);
      break;

    // Calendar features
    case 'meeting_density':
      raw.meetings_per_week = Math.round(val * 35); // Max 35 meetings/week
      break;
    case 'schedule_regularity':
      raw.schedule_std_dev = Math.round((1 - val) * 120); // Lower = more regular
      break;
    case 'morning_activity_ratio':
      raw.morning_percent = Math.round(val * 100);
      break;
    case 'evening_activity_ratio':
      raw.evening_percent = Math.round(val * 100);
      break;

    // Whoop features
    case 'sleep_consistency':
      raw.bedtime_std_dev = Math.round((1 - val) * 90); // Lower = more consistent
      break;
    case 'workout_regularity':
      raw.workouts_per_week = Math.round(val * 7); // Max 7 workouts/week
      break;
    case 'activity_diversity':
      raw.activity_count = Math.round(val * 10); // Max 10 activity types
      break;
    case 'hrv_stability':
      raw.hrv_cv = ((1 - val) * 0.3).toFixed(2); // Lower CV = more stable
      break;
    case 'recovery_consistency':
      raw.recovery_variance = ((1 - val) * 0.5).toFixed(2);
      break;
    case 'strain_tolerance':
      raw.avg_strain = (10 + val * 10).toFixed(1); // 10-20 range
      break;
    case 'deep_sleep_ratio':
      raw.deep_percent = Math.round(val * 100); // Convert to percentage
      break;
    case 'sleep_quality_score':
      raw.avg_quality = Math.round(val * 100); // Convert to percentage
      break;
    case 'hrv_baseline':
      raw.hrv_avg = Math.round(30 + val * 70); // 30-100ms range
      break;
  }

  return raw;
}

/**
 * Generate evidence for a specific feature
 * @param {string} platform - Platform name (spotify, calendar, whoop)
 * @param {string} featureName - Feature name
 * @param {number} featureValue - Normalized feature value (0-1)
 * @param {Object} rawValue - Raw value object for template interpolation
 * @returns {Array} Array of evidence objects for each affected dimension
 */
function generateFeatureEvidence(platform, featureName, featureValue, rawValue = {}) {
  const evidence = [];

  if (!CORRELATIONS?.correlations?.[platform]?.[featureName]) {
    return evidence;
  }

  const featureConfig = CORRELATIONS.correlations[platform][featureName];
  const { correlations, evidenceTemplates, threshold = 0.5 } = featureConfig;

  // Determine if this is a "high" or "low" value
  const level = featureValue >= threshold ? 'high' : 'low';
  const template = evidenceTemplates?.[level];

  // Skip if no template for this level
  if (!template) return evidence;

  // Generate description from template
  const description = interpolateTemplate(template, { value: featureValue, rawValue });

  // Create evidence for each correlated dimension
  for (const [dimension, correlationData] of Object.entries(correlations)) {
    const { r, effectSize, source } = correlationData;

    // Get source citation
    const sourceInfo = CORRELATIONS.metadata.sources.find(s => s.id === source);
    const citation = sourceInfo
      ? `${source.replace(/(\d+)/, ' $1')} (r=${r}, n=${sourceInfo.sampleSize.toLocaleString()})`
      : `${source} (r=${r})`;

    evidence.push({
      platform,
      feature: featureName,
      dimension: dimension.charAt(0).toUpperCase(), // O, C, E, A, N
      dimensionFull: dimension,
      value: featureValue,
      rawValue,
      correlation: r,
      effectSize,
      description,
      citation,
      source,
      impact: calculateImpact(featureValue, r)
    });
  }

  return evidence;
}

/**
 * Calculate the impact score of a feature on a dimension
 * @param {number} featureValue - Normalized feature value (0-1)
 * @param {number} correlation - Correlation coefficient
 * @returns {number} Impact score (0-1)
 */
function calculateImpact(featureValue, correlation) {
  // Impact = feature strength * correlation strength
  const featureStrength = Math.abs(featureValue - 0.5) * 2; // 0 at 0.5, 1 at extremes
  const correlationStrength = Math.abs(correlation);
  return featureStrength * correlationStrength;
}

/**
 * Interpolate template string with values
 * @param {string} template - Template string with {placeholders}
 * @param {Object} data - Data object for interpolation
 * @returns {string} Interpolated string
 */
function interpolateTemplate(template, data) {
  return template.replace(/\{([^}]+)\}/g, (match, path) => {
    const keys = path.split('.');
    let value = data;
    for (const key of keys) {
      value = value?.[key];
      if (value === undefined) return match;
    }
    // Format numbers nicely
    if (typeof value === 'number') {
      if (value < 1) return value.toFixed(2);
      return Math.round(value).toLocaleString();
    }
    return value;
  });
}

/**
 * Generate all evidence from extracted features
 * @param {Object} platformFeatures - Features by platform { spotify: {...}, calendar: {...}, whoop: {...} }
 * @returns {Object} Evidence grouped by dimension
 */
export function generateAllEvidence(platformFeatures) {
  const allEvidence = {
    openness: [],
    conscientiousness: [],
    extraversion: [],
    agreeableness: [],
    neuroticism: []
  };

  for (const [platform, features] of Object.entries(platformFeatures)) {
    if (!features || typeof features !== 'object') continue;

    // Extract raw values if present
    const rawValues = features._rawValues || {};
    console.log(`🔬 [EvidenceGen] Platform ${platform} _rawValues keys:`, Object.keys(rawValues));

    for (const [featureName, featureValue] of Object.entries(features)) {
      // Skip internal properties
      if (featureName.startsWith('_')) continue;
      if (typeof featureValue !== 'number') continue;

      // Get the specific rawValue for this feature (not the whole _rawValues object)
      const featureRawValue = rawValues[featureName] || {};

      // Debug log for features with templates that need rawValue
      if (['hiit_preference', 'workout_bout_duration', 'physical_activity_level'].includes(featureName)) {
        console.log(`🔬 [EvidenceGen] Feature ${featureName} rawValue:`, JSON.stringify(featureRawValue));
      }

      const evidence = generateFeatureEvidence(
        platform,
        featureName,
        featureValue,
        featureRawValue
      );

      // Group evidence by dimension
      for (const e of evidence) {
        const dim = e.dimensionFull.toLowerCase();
        if (allEvidence[dim]) {
          allEvidence[dim].push(e);
        }
      }
    }
  }

  // Sort each dimension's evidence by impact (highest first)
  for (const dim of Object.keys(allEvidence)) {
    allEvidence[dim].sort((a, b) => b.impact - a.impact);
  }

  return allEvidence;
}

/**
 * Calculate confidence scores based on evidence
 * @param {Object} evidence - Evidence grouped by dimension
 * @param {Object} dataSources - Data source info { platform: { days, events } }
 * @returns {Object} Confidence scores by dimension and overall
 */
export function calculateConfidenceScores(evidence, dataSources = {}) {
  const scores = {
    overall: 0,
    by_dimension: {}
  };

  const dimensions = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

  for (const dim of dimensions) {
    const dimEvidence = evidence[dim] || [];
    let confidence = 0;

    // Base confidence from number of features
    const featureCount = dimEvidence.length;
    confidence += Math.min(featureCount / 5, 0.3); // Max 0.3 from feature count

    // Boost from high-correlation features (|r| > 0.35)
    const strongFeatures = dimEvidence.filter(e => Math.abs(e.correlation) > 0.35);
    confidence += Math.min(strongFeatures.length * 0.15, 0.3); // Max 0.3 from strong features

    // Boost from data quality (platforms connected)
    const platforms = new Set(dimEvidence.map(e => e.platform));
    confidence += platforms.size * 0.1; // 0.1 per platform

    // Boost from data span (if available)
    for (const [platform, info] of Object.entries(dataSources)) {
      if (info?.days) {
        confidence += Math.min(info.days / 90, 0.1); // Max 0.1 for 90+ days
      }
    }

    scores.by_dimension[dim] = Math.min(confidence, 0.95);
  }

  // Overall confidence is average of dimensions
  const dimScores = Object.values(scores.by_dimension);
  scores.overall = dimScores.length > 0
    ? dimScores.reduce((a, b) => a + b, 0) / dimScores.length
    : 0;

  return scores;
}

/**
 * Store evidence in database
 * @param {string} userId - User ID
 * @param {Object} evidence - Evidence grouped by dimension
 */
export async function storeEvidence(userId, evidence) {
  try {
    const records = [];

    for (const [dimension, items] of Object.entries(evidence)) {
      for (const item of items) {
        // Debug log for features with templates
        if (['hiit_preference', 'workout_bout_duration', 'physical_activity_level'].includes(item.feature)) {
          console.log(`🔬 [storeEvidence] ${item.feature} rawValue:`, JSON.stringify(item.rawValue));
        }

        records.push({
          user_id: userId,
          platform: item.platform,
          feature_name: item.feature,
          feature_value: item.value,
          raw_value: item.rawValue,
          dimension: item.dimension,
          correlation_strength: Math.abs(item.correlation),
          confidence_score: item.impact,
          evidence_description: item.description,
          research_citation: item.citation
        });
      }
    }

    if (records.length === 0) return;

    // Upsert evidence records
    const { error } = await supabase
      .from('behavioral_evidence')
      .upsert(records, {
        onConflict: 'user_id,platform,feature_name,dimension'
      });

    if (error) {
      console.error('[EvidenceGenerator] Error storing evidence:', error);
      throw error;
    }

    console.log(`[EvidenceGenerator] Stored ${records.length} evidence records for user ${userId}`);

  } catch (error) {
    console.error('[EvidenceGenerator] Error in storeEvidence:', error);
    throw error;
  }
}

/**
 * Get stored evidence for a user
 * @param {string} userId - User ID
 * @returns {Object} Evidence grouped by dimension
 */
export async function getUserEvidence(userId) {
  try {
    const { data, error } = await supabase
      .from('behavioral_evidence')
      .select('*')
      .eq('user_id', userId)
      .order('correlation_strength', { ascending: false });

    if (error) throw error;

    // Group by dimension
    const evidence = {
      openness: [],
      conscientiousness: [],
      extraversion: [],
      agreeableness: [],
      neuroticism: []
    };

    const dimensionMap = {
      'O': 'openness',
      'C': 'conscientiousness',
      'E': 'extraversion',
      'A': 'agreeableness',
      'N': 'neuroticism'
    };

    for (const record of (data || [])) {
      const dim = dimensionMap[record.dimension];
      if (dim) {
        // Calculate effect size from correlation strength
        const absCorr = Math.abs(record.correlation_strength || 0);
        let effect_size = 'small';
        if (absCorr >= 0.5) effect_size = 'large';
        else if (absCorr >= 0.3) effect_size = 'medium';

        // Get or derive raw values for template interpolation
        let rawValue = record.raw_value;
        if (!rawValue || Object.keys(rawValue).length === 0) {
          // Derive raw values from normalized feature value
          rawValue = deriveRawValue(record.feature_name, record.feature_value);
        }

        // Re-interpolate description with raw values (fixes legacy un-interpolated data)
        let description = record.evidence_description;
        if (description && rawValue) {
          description = interpolateTemplate(description, {
            value: record.feature_value,
            rawValue: rawValue
          });
        }

        evidence[dim].push({
          platform: record.platform,
          feature: record.feature_name,
          value: record.feature_value,
          rawValue: rawValue,
          correlation: record.correlation_strength,
          effect_size,
          description,
          citation: record.research_citation,
          createdAt: record.created_at
        });
      }
    }

    return evidence;

  } catch (error) {
    console.error('[EvidenceGenerator] Error getting user evidence:', error);
    throw error;
  }
}

/**
 * Generate evidence summary for a dimension
 * @param {Array} dimensionEvidence - Evidence array for a dimension
 * @returns {Object} Summary with top evidence and confidence
 */
export function generateDimensionSummary(dimensionEvidence) {
  if (!dimensionEvidence || dimensionEvidence.length === 0) {
    return {
      topEvidence: [],
      platformCount: 0,
      strongCorrelations: 0,
      confidence: 0
    };
  }

  // Get top 3 evidence items
  const topEvidence = dimensionEvidence.slice(0, 3);

  // Count unique platforms
  const platforms = new Set(dimensionEvidence.map(e => e.platform));

  // Count strong correlations
  const strongCorrelations = dimensionEvidence.filter(
    e => Math.abs(e.correlation) >= 0.35
  ).length;

  // Calculate confidence for this dimension
  let confidence = 0;
  confidence += Math.min(dimensionEvidence.length / 5, 0.3);
  confidence += Math.min(strongCorrelations * 0.15, 0.3);
  confidence += platforms.size * 0.1;

  return {
    topEvidence,
    platformCount: platforms.size,
    strongCorrelations,
    confidence: Math.min(confidence, 0.95)
  };
}

/**
 * Format evidence for API response
 * @param {Object} evidence - Evidence grouped by dimension
 * @param {Object} personality - Personality scores
 * @param {Object} dataSources - Data source info
 * @returns {Object} Formatted API response
 */
export function formatEvidenceResponse(evidence, personality, dataSources = {}) {
  const confidence = calculateConfidenceScores(evidence, dataSources);

  return {
    success: true,
    personality: {
      openness: Math.round(personality.openness || 50),
      conscientiousness: Math.round(personality.conscientiousness || 50),
      extraversion: Math.round(personality.extraversion || 50),
      agreeableness: Math.round(personality.agreeableness || 50),
      neuroticism: Math.round(personality.neuroticism || 50)
    },
    evidence: {
      openness: evidence.openness.map(formatEvidenceItem),
      conscientiousness: evidence.conscientiousness.map(formatEvidenceItem),
      extraversion: evidence.extraversion.map(formatEvidenceItem),
      agreeableness: evidence.agreeableness.map(formatEvidenceItem),
      neuroticism: evidence.neuroticism.map(formatEvidenceItem)
    },
    confidence,
    data_sources: dataSources
  };
}

/**
 * Format a single evidence item for API response
 */
function formatEvidenceItem(item) {
  return {
    platform: item.platform,
    feature: item.feature,
    value: parseFloat(item.value?.toFixed(3) || 0),
    raw_value: item.rawValue,
    correlation: item.correlation,
    effect_size: item.effectSize || classifyEffectSize(item.correlation),
    description: item.description,
    citation: item.citation
  };
}

/**
 * Classify effect size based on correlation
 */
function classifyEffectSize(r) {
  const absR = Math.abs(r);
  if (absR >= 0.50) return 'large';
  if (absR >= 0.30) return 'medium';
  return 'small';
}

export default {
  generateFeatureEvidence,
  generateAllEvidence,
  calculateConfidenceScores,
  storeEvidence,
  getUserEvidence,
  generateDimensionSummary,
  formatEvidenceResponse
};
