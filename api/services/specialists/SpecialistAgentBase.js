/**
 * SpecialistAgentBase - Base class for science-backed specialist agents
 *
 * Extends AgentBase with research citation capabilities.
 * Every personality inference MUST cite peer-reviewed research.
 *
 * Philosophy: "Specialist doctors" not "general practitioners"
 * - Each agent specializes in one domain
 * - All inferences backed by specific studies
 * - Effect sizes and sample sizes always reported
 * - Contextual factors considered
 */

import AgentBase from '../agents/AgentBase.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load validated correlations
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let VALIDATED_CORRELATIONS = null;
let RESEARCH_SOURCES = {};

try {
  const correlationsPath = join(__dirname, '../../data/validated-correlations.json');
  const data = JSON.parse(readFileSync(correlationsPath, 'utf-8'));
  VALIDATED_CORRELATIONS = data.correlations;
  RESEARCH_SOURCES = data.metadata?.sources?.reduce((acc, s) => {
    acc[s.id] = s;
    return acc;
  }, {}) || {};
  console.log('[SpecialistAgentBase] Loaded validated correlations');
} catch (error) {
  console.warn('[SpecialistAgentBase] Could not load validated-correlations.json');
}

/**
 * Base class for all specialist agents
 */
class SpecialistAgentBase extends AgentBase {
  constructor(config) {
    super(config);
    this.domain = config.domain;                    // 'spotify', 'whoop', 'calendar'
    this.domainLabel = config.domainLabel || config.domain;
    this.confidenceThreshold = config.confidenceThreshold || 0.15;
    this.researchSources = RESEARCH_SOURCES;

    // Load domain-specific correlations
    this.correlations = VALIDATED_CORRELATIONS?.[this.domain] || {};
  }

  /**
   * Get correlation data for a feature-dimension pair
   */
  getCorrelation(feature, dimension) {
    const featureData = this.correlations[feature];
    if (!featureData?.correlations?.[dimension]) return null;

    const corr = featureData.correlations[dimension];
    const source = this.researchSources[corr.source];

    return {
      r: corr.r,
      effectSize: corr.effectSize,
      source: corr.source,
      fullCitation: source?.citation || corr.source,
      sampleSize: source?.sampleSize || null
    };
  }

  /**
   * Get evidence template for a feature
   */
  getEvidenceTemplate(feature, level) {
    return this.correlations[feature]?.evidenceTemplates?.[level] || null;
  }

  /**
   * Classify effect size based on correlation coefficient
   */
  classifyEffectSize(r) {
    const abs = Math.abs(r);
    if (abs >= 0.50) return 'large';
    if (abs >= 0.30) return 'medium';
    if (abs >= 0.10) return 'small';
    return 'trivial';
  }

  /**
   * Make a research-backed inference
   * This is the core method that ensures all inferences cite research
   *
   * @param {string} feature - Feature name (e.g., 'genre_diversity')
   * @param {number} value - Normalized feature value (0-1)
   * @param {string} dimension - Personality dimension (e.g., 'openness')
   * @param {Object} rawValues - Raw values for evidence template interpolation
   */
  makeInference(feature, value, dimension, rawValues = {}) {
    const correlation = this.getCorrelation(feature, dimension);
    if (!correlation) return null;

    // Skip trivial effects unless they're the only evidence
    if (Math.abs(correlation.r) < this.confidenceThreshold) {
      return null;
    }

    // Determine direction and level
    const isHigh = value >= (this.correlations[feature]?.threshold || 0.5);
    const direction = correlation.r > 0 ? (isHigh ? 'positive' : 'negative') : (isHigh ? 'negative' : 'positive');

    // Get evidence template
    const level = isHigh ? 'high' : 'low';
    let template = this.getEvidenceTemplate(feature, level);

    // Interpolate template with raw values
    if (template && rawValues) {
      template = this.interpolateTemplate(template, value, rawValues);
    }

    // Calculate score adjustment based on correlation strength and value
    const deviation = isHigh ? value : (1 - value);
    const scoreAdjustment = Math.round(deviation * Math.abs(correlation.r) * 30);

    return {
      feature,
      dimension,
      value,
      direction,
      effect: direction === 'positive' ? 'higher' : 'lower',
      effectSize: correlation.effectSize,
      scoreAdjustment: direction === 'positive' ? scoreAdjustment : -scoreAdjustment,
      confidence: this.calculateConfidence(correlation.effectSize, correlation.sampleSize),
      citation: {
        source: correlation.source,
        r: correlation.r,
        effectSize: correlation.effectSize,
        sampleSize: correlation.sampleSize,
        fullCitation: correlation.fullCitation
      },
      humanReadable: template || `${feature} correlates with ${dimension} (r=${correlation.r})`
    };
  }

  /**
   * Interpolate template with values
   */
  interpolateTemplate(template, value, rawValues) {
    let result = template;

    // Replace {value} with the normalized value
    result = result.replace(/\{value\}/g, value.toFixed(2));

    // Replace {rawValue.xxx} patterns
    const rawValuePattern = /\{rawValue\.(\w+)\}/g;
    result = result.replace(rawValuePattern, (match, key) => {
      return rawValues[key] !== undefined ? rawValues[key] : match;
    });

    return result;
  }

  /**
   * Calculate confidence based on effect size and sample size
   */
  calculateConfidence(effectSize, sampleSize) {
    // Base confidence from effect size
    let confidence = 0.5;
    if (effectSize === 'large') confidence = 0.9;
    else if (effectSize === 'medium') confidence = 0.75;
    else if (effectSize === 'small') confidence = 0.6;

    // Boost for large sample sizes
    if (sampleSize && sampleSize > 1000) confidence = Math.min(0.95, confidence + 0.1);
    if (sampleSize && sampleSize > 5000) confidence = Math.min(0.95, confidence + 0.05);

    return confidence;
  }

  /**
   * Process all features for a dimension and aggregate inferences
   */
  processAllFeaturesForDimension(features, dimension) {
    const inferences = [];
    const rawValues = features._rawValues || {};

    for (const [featureName, featureValue] of Object.entries(features)) {
      if (featureName === '_rawValues') continue;
      if (typeof featureValue !== 'number') continue;

      const inference = this.makeInference(featureName, featureValue, dimension, rawValues);
      if (inference) {
        inferences.push(inference);
      }
    }

    return inferences;
  }

  /**
   * Aggregate inferences for all dimensions
   */
  aggregateInferences(features) {
    const dimensions = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
    const result = {};

    for (const dimension of dimensions) {
      const inferences = this.processAllFeaturesForDimension(features, dimension);

      if (inferences.length > 0) {
        // Aggregate score adjustments
        const totalAdjustment = inferences.reduce((sum, inf) => sum + inf.scoreAdjustment, 0);

        // Calculate weighted confidence
        const avgConfidence = inferences.reduce((sum, inf) => sum + inf.confidence, 0) / inferences.length;

        // Find strongest effect
        const strongestInference = inferences.reduce((best, inf) =>
          Math.abs(inf.citation.r) > Math.abs(best.citation.r) ? inf : best
        );

        result[dimension] = {
          scoreAdjustment: totalAdjustment,
          confidence: avgConfidence,
          evidenceCount: inferences.length,
          strongestEvidence: strongestInference,
          allEvidence: inferences
        };
      }
    }

    return result;
  }

  /**
   * Generate research-backed analysis output
   */
  async analyze(userId, data) {
    throw new Error('analyze() must be implemented by subclass');
  }

  /**
   * Format citations for display
   */
  formatCitations(inferences) {
    const citations = new Set();

    for (const dimension of Object.values(inferences)) {
      if (dimension.allEvidence) {
        for (const evidence of dimension.allEvidence) {
          citations.add(evidence.citation.fullCitation);
        }
      }
    }

    return Array.from(citations);
  }

  /**
   * Generate methodology notes explaining the analysis
   */
  generateMethodologyNotes(inferences) {
    const notes = [];
    let totalEvidenceCount = 0;
    const effectSizes = { large: 0, medium: 0, small: 0 };

    for (const [dimension, data] of Object.entries(inferences)) {
      totalEvidenceCount += data.evidenceCount || 0;
      for (const evidence of data.allEvidence || []) {
        if (evidence.effectSize in effectSizes) {
          effectSizes[evidence.effectSize]++;
        }
      }
    }

    notes.push(`Analysis based on ${totalEvidenceCount} research-backed correlations`);

    if (effectSizes.large > 0) {
      notes.push(`Found ${effectSizes.large} large effect size correlation(s) (r >= 0.50)`);
    }
    if (effectSizes.medium > 0) {
      notes.push(`Found ${effectSizes.medium} medium effect size correlation(s) (r = 0.30-0.49)`);
    }

    return notes;
  }
}

export default SpecialistAgentBase;
export { VALIDATED_CORRELATIONS, RESEARCH_SOURCES };
