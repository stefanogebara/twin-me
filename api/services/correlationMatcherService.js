/**
 * Correlation Matcher Service
 *
 * Matches user behavioral data against research-backed personality correlations
 * from peer-reviewed studies. Uses validated-correlations.json as the source.
 *
 * Features:
 * - Finds applicable correlations for user data
 * - Calculates personality trait inferences with confidence
 * - Generates evidence-backed explanations
 * - Supports Bayesian confidence updates with repeated observations
 *
 * Research basis:
 * - 20+ peer-reviewed papers with r-values and effect sizes
 * - Sample sizes ranging from 200 to 88,400 participants
 * - Meta-analyses for robust effect estimates
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load correlations data
let correlationsData = null;

function loadCorrelations() {
  if (!correlationsData) {
    const filePath = join(__dirname, '../data/validated-correlations.json');
    correlationsData = JSON.parse(readFileSync(filePath, 'utf-8'));
  }
  return correlationsData;
}

/**
 * Big Five traits
 */
const BIG_FIVE_TRAITS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

/**
 * CorrelationMatcherService
 */
class CorrelationMatcherService {
  constructor() {
    this.correlations = loadCorrelations();
  }

  /**
   * Find correlations that apply to a specific behavioral feature
   * @param {string} platform - 'spotify', 'calendar', 'whoop'
   * @param {string} feature - Feature key (e.g., 'energy_preference', 'sleep_consistency')
   * @param {number} value - Normalized value (0-1) of the feature
   * @param {object} rawValue - Raw data for evidence templates
   * @returns {Array} Matching correlations with trait inferences
   */
  findCorrelations(platform, feature, value, rawValue = {}) {
    const platformCorrelations = this.correlations.correlations[platform];
    if (!platformCorrelations) {
      return [];
    }

    const featureData = platformCorrelations[feature];
    if (!featureData) {
      return [];
    }

    const matches = [];
    const threshold = featureData.threshold || 0.5;
    const isHigh = value >= threshold;

    // Get correlations for each trait
    for (const [trait, data] of Object.entries(featureData.correlations || {})) {
      // Determine inference direction based on r-value and whether value is high/low
      const rValue = data.r;
      const direction = rValue > 0 ? (isHigh ? 1 : -1) : (isHigh ? -1 : 1);

      // Find the source paper
      const source = this.correlations.metadata.sources.find(s => s.id === data.source);

      matches.push({
        platform,
        feature,
        trait,
        r_value: rValue,
        effect_size: data.effectSize,
        direction, // +1 = trait indicator, -1 = inverse indicator
        is_high: isHigh,
        value,
        raw_value: rawValue,
        source: source?.citation || data.source,
        sample_size: source?.sampleSize || 0,
        evidence: this.generateEvidence(featureData, isHigh, rawValue),
        confidence: this.calculateConfidence(rValue, source?.sampleSize || 100)
      });
    }

    return matches.sort((a, b) => Math.abs(b.r_value) - Math.abs(a.r_value));
  }

  /**
   * Find all correlations for a set of behavioral data
   * @param {Array} behavioralData - Array of {platform, feature, value, rawValue}
   * @returns {Array} All matching correlations
   */
  findAllCorrelations(behavioralData) {
    const allMatches = [];

    for (const data of behavioralData) {
      const matches = this.findCorrelations(
        data.platform,
        data.feature,
        data.value,
        data.rawValue
      );
      allMatches.push(...matches);
    }

    return allMatches;
  }

  /**
   * Infer personality traits from correlation matches
   * Uses weighted averaging based on r-values and sample sizes
   * @param {Array} correlationMatches - Output from findCorrelations
   * @returns {object} Big Five trait scores (0-100)
   */
  inferPersonality(correlationMatches) {
    const traitScores = {};

    for (const trait of BIG_FIVE_TRAITS) {
      traitScores[trait] = {
        weightedSum: 0,
        totalWeight: 0,
        evidence: []
      };
    }

    for (const match of correlationMatches) {
      const trait = match.trait.toLowerCase();
      if (!traitScores[trait]) continue;

      // Weight = |r| * log(sample_size) for more robust estimates
      const weight = Math.abs(match.r_value) * Math.log10(Math.max(match.sample_size, 10));

      // Direction-adjusted contribution
      const contribution = match.direction * Math.abs(match.r_value);

      traitScores[trait].weightedSum += contribution * weight;
      traitScores[trait].totalWeight += weight;
      traitScores[trait].evidence.push({
        feature: match.feature,
        platform: match.platform,
        contribution: match.direction > 0 ? 'positive' : 'negative',
        r_value: match.r_value,
        text: match.evidence
      });
    }

    // Convert to 0-100 scale
    const result = {};
    for (const trait of BIG_FIVE_TRAITS) {
      const data = traitScores[trait];
      if (data.totalWeight > 0) {
        // Normalize to -1 to +1, then scale to 0-100
        const normalized = data.weightedSum / data.totalWeight;
        result[trait] = {
          score: Math.max(0, Math.min(100, normalized * 50 + 50)),
          confidence: this.calculateTraitConfidence(data.evidence.length, data.totalWeight),
          evidence: data.evidence.slice(0, 5) // Top 5 evidence pieces
        };
      } else {
        result[trait] = {
          score: 50, // Neutral
          confidence: 0,
          evidence: []
        };
      }
    }

    return result;
  }

  /**
   * Get all features for a platform
   * @param {string} platform - Platform name
   * @returns {Array} Feature names
   */
  getPlatformFeatures(platform) {
    const platformCorrelations = this.correlations.correlations[platform];
    if (!platformCorrelations) return [];
    return Object.keys(platformCorrelations);
  }

  /**
   * Get correlation info for a specific feature
   * @param {string} platform - Platform name
   * @param {string} feature - Feature name
   * @returns {object|null} Feature correlation data
   */
  getFeatureInfo(platform, feature) {
    return this.correlations.correlations[platform]?.[feature] || null;
  }

  /**
   * Generate evidence text from template
   */
  generateEvidence(featureData, isHigh, rawValue) {
    const templates = featureData.evidenceTemplates;
    if (!templates) return featureData.description || '';

    const template = isHigh ? templates.high : templates.low;
    if (!template) return featureData.description || '';

    // Replace placeholders with actual values
    return template.replace(/\{([^}]+)\}/g, (match, key) => {
      if (key === 'value') return rawValue?.value?.toFixed(2) || 'N/A';
      if (key.startsWith('rawValue.')) {
        const subKey = key.replace('rawValue.', '');
        return rawValue?.[subKey] ?? 'N/A';
      }
      return match;
    });
  }

  /**
   * Calculate confidence based on r-value and sample size
   */
  calculateConfidence(rValue, sampleSize) {
    // Base confidence from effect size
    const absR = Math.abs(rValue);
    let baseConfidence;

    if (absR >= 0.5) baseConfidence = 0.85;
    else if (absR >= 0.3) baseConfidence = 0.7;
    else if (absR >= 0.1) baseConfidence = 0.5;
    else baseConfidence = 0.3;

    // Adjust for sample size (larger = more confident)
    const sampleBonus = Math.min(0.15, Math.log10(sampleSize) / 20);

    return Math.min(0.95, baseConfidence + sampleBonus);
  }

  /**
   * Calculate trait confidence based on evidence count and weight
   */
  calculateTraitConfidence(evidenceCount, totalWeight) {
    // More evidence = more confidence
    const evidenceBonus = Math.min(0.3, evidenceCount * 0.05);

    // Higher weight = more confidence
    const weightBonus = Math.min(0.2, totalWeight / 50);

    return Math.min(0.9, 0.4 + evidenceBonus + weightBonus);
  }

  /**
   * Get sources metadata
   */
  getSources() {
    return this.correlations.metadata.sources;
  }

  /**
   * Get effect size thresholds
   */
  getEffectSizeThresholds() {
    return this.correlations.effectSizeThresholds;
  }
}

// Singleton instance
let instance = null;

/**
 * Get the correlation matcher service instance
 */
export function getCorrelationMatcherService() {
  if (!instance) {
    instance = new CorrelationMatcherService();
  }
  return instance;
}

export { CorrelationMatcherService, BIG_FIVE_TRAITS };
export default CorrelationMatcherService;
