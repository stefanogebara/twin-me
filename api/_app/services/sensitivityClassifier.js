/**
 * Sensitivity Classifier — Privacy Routing for Sensitive Data
 * =============================================================
 * Pure heuristic classifier (<1ms, no LLM) that detects when content
 * contains health, emotional, financial, or personal data. Used to
 * route sensitive extraction/analysis to the cheapest model tier
 * (least data exposure) instead of more powerful cloud models.
 *
 * Inspired by NVIDIA NemoClaw's privacy routing pattern.
 *
 * Usage:
 *   import { classifySensitivity } from './sensitivityClassifier.js';
 *   const { isSensitive, category, recommendedTier } = classifySensitivity(content, { platform: 'whoop' });
 */

import { createLogger } from './logger.js';

const log = createLogger('Sensitivity');

const HEALTH_KEYWORDS = new Set([
  'recovery', 'hrv', 'heart rate', 'resting heart rate', 'sleep score',
  'strain', 'calories burned', 'respiratory rate', 'blood oxygen', 'spo2',
  'body temperature', 'sleep stages', 'rem sleep', 'deep sleep',
  'health', 'medical', 'diagnosis', 'medication', 'therapy', 'treatment',
  'symptoms', 'chronic', 'condition', 'prescription', 'dosage',
  'weight', 'bmi', 'blood pressure', 'cholesterol',
]);

const EMOTIONAL_KEYWORDS = new Set([
  'depression', 'anxiety', 'panic', 'mental health', 'suicidal',
  'self-harm', 'trauma', 'ptsd', 'eating disorder', 'addiction',
  'grief', 'loss', 'breakup', 'divorce', 'abuse',
  'lonely', 'overwhelmed', 'burnout', 'crisis',
]);

const FINANCIAL_KEYWORDS = new Set([
  'salary', 'income', 'debt', 'bank account', 'credit card',
  'loan', 'mortgage', 'tax', 'financial', 'investment',
  'net worth', 'savings', 'bankruptcy', 'overdraft',
]);

const SENSITIVE_PLATFORMS = new Set([
  'whoop', 'fitbit', 'oura', 'garmin', 'apple_health',
  'strava', 'withings',
]);

/**
 * Classify whether content contains sensitive information.
 * Pure function — no DB, no LLM, <1ms.
 *
 * @param {string} content - Text to classify
 * @param {object} metadata - Optional context { platform, memoryType }
 * @returns {{ isSensitive: boolean, category: string|null, recommendedTier: string }}
 */
export function classifySensitivity(content, metadata = {}) {
  const { platform, memoryType } = metadata;
  const lower = (content || '').toLowerCase();

  // Platform-based classification (fast path)
  if (platform && SENSITIVE_PLATFORMS.has(platform)) {
    return { isSensitive: true, category: 'health', recommendedTier: 'EXTRACTION' };
  }

  // Keyword-based classification
  for (const keyword of EMOTIONAL_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { isSensitive: true, category: 'emotional', recommendedTier: 'ANALYSIS' };
    }
  }

  for (const keyword of HEALTH_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { isSensitive: true, category: 'health', recommendedTier: 'EXTRACTION' };
    }
  }

  for (const keyword of FINANCIAL_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { isSensitive: true, category: 'financial', recommendedTier: 'EXTRACTION' };
    }
  }

  return { isSensitive: false, category: null, recommendedTier: null };
}

/**
 * Tag a memory metadata object with sensitivity classification.
 * Returns a new metadata object (immutable).
 */
export function tagSensitivity(content, existingMetadata = {}) {
  const classification = classifySensitivity(content, existingMetadata);
  if (!classification.isSensitive) return existingMetadata;

  return {
    ...existingMetadata,
    sensitivity: classification.category,
    sensitivity_tier: classification.recommendedTier,
  };
}
