/**
 * Pattern Hypothesis Engine
 *
 * Layer 5 of the Pattern Learning System
 * Transforms discovered correlations into natural language hypotheses
 *
 * Key functions:
 * - generateHypotheses(userId) - Transform correlations to natural language
 * - aiGenerateHypothesis(correlation) - Use Claude to explain patterns
 * - calculateConfidence(correlation) - Score based on p-value and sample size
 */

import { supabaseAdmin } from './database.js';
import { generateChatResponse } from './anthropicService.js';
import correlationEngine from './correlationDiscoveryEngine.js';

// Minimum confidence threshold for hypothesis generation
const MIN_CONFIDENCE_THRESHOLD = 0.4;

// Hypothesis categories based on metric combinations
const HYPOTHESIS_CATEGORIES = {
  health_music: {
    metrics: ['recovery', 'hrv', 'strain', 'sleep_hours', 'music_valence', 'music_energy', 'music_tempo'],
    description: 'Relationships between health metrics and music preferences'
  },
  health_productivity: {
    metrics: ['recovery', 'hrv', 'strain', 'sleep_hours', 'meeting_count', 'commits', 'focus_time_hours'],
    description: 'How health affects work patterns'
  },
  music_productivity: {
    metrics: ['music_valence', 'music_energy', 'music_tempo', 'meeting_count', 'commits', 'focus_time_hours'],
    description: 'Music patterns and work output'
  },
  social_health: {
    metrics: ['messages_sent', 'voice_minutes', 'recovery', 'sleep_hours', 'strain'],
    description: 'Social activity and health relationships'
  },
  general: {
    metrics: [],
    description: 'Other discovered patterns'
  }
};

/**
 * Determine hypothesis category from metric pair
 */
function categorizeHypothesis(metricA, metricB) {
  for (const [category, config] of Object.entries(HYPOTHESIS_CATEGORIES)) {
    if (category === 'general') continue;

    const hasA = config.metrics.includes(metricA);
    const hasB = config.metrics.includes(metricB);

    if (hasA && hasB) return category;
  }

  return 'general';
}

/**
 * Calculate confidence score for a hypothesis
 * @param {Object} correlation - Correlation data
 * @returns {number} - Confidence score (0-1)
 */
export function calculateConfidence(correlation) {
  const { p_value, sample_size, correlation_coefficient, validation_count } = correlation;

  // Base confidence from statistical significance
  let confidence = 0;

  // P-value contribution (lower is better)
  if (p_value < 0.001) confidence += 0.3;
  else if (p_value < 0.01) confidence += 0.25;
  else if (p_value < 0.05) confidence += 0.2;
  else confidence += 0.1;

  // Sample size contribution
  if (sample_size >= 90) confidence += 0.25;
  else if (sample_size >= 30) confidence += 0.2;
  else if (sample_size >= 15) confidence += 0.15;
  else confidence += 0.1;

  // Correlation strength contribution
  const absR = Math.abs(correlation_coefficient);
  if (absR >= 0.6) confidence += 0.25;
  else if (absR >= 0.4) confidence += 0.2;
  else if (absR >= 0.3) confidence += 0.15;
  else confidence += 0.1;

  // Validation count bonus
  const validationBonus = Math.min(0.2, (validation_count || 1) * 0.05);
  confidence += validationBonus;

  return Math.min(1, confidence);
}

/**
 * Generate a rule-based hypothesis from a correlation
 * @param {Object} correlation - Correlation data
 * @returns {string} - Hypothesis text
 */
function generateRuleBasedHypothesis(correlation) {
  const { metric_a, metric_b, direction, strength, time_lag_hours, correlation_coefficient } = correlation;

  const metricNames = {
    recovery: 'recovery score',
    hrv: 'heart rate variability',
    rhr: 'resting heart rate',
    strain: 'daily strain',
    sleep_hours: 'sleep duration',
    sleep_efficiency: 'sleep quality',
    music_valence: 'upbeat music choices',
    music_energy: 'high-energy music',
    music_tempo: 'faster tempo music',
    music_danceability: 'danceable music',
    listening_duration_ms: 'listening session length',
    meeting_count: 'number of meetings',
    meeting_hours: 'time in meetings',
    focus_time_hours: 'focused work time',
    messages_sent: 'messages sent',
    voice_minutes: 'time in voice calls',
    commits: 'code commits',
    code_additions: 'lines of code added'
  };

  const nameA = metricNames[metric_a] || metric_a;
  const nameB = metricNames[metric_b] || metric_b;

  const relationWord = direction === 'positive' ? 'tend to have higher' : 'tend to have lower';
  const strengthWord = strength === 'strong' ? 'strongly' : (strength === 'moderate' ? 'moderately' : 'slightly');

  if (time_lag_hours === 0) {
    return `When your ${nameA} is high, you ${strengthWord} ${relationWord} ${nameB}.`;
  } else if (time_lag_hours < 0) {
    const hours = Math.abs(time_lag_hours);
    const timePhrase = hours === 24 ? 'the next day' : `${hours} hours later`;
    return `Higher ${nameA} is ${strengthWord} associated with ${direction === 'positive' ? 'higher' : 'lower'} ${nameB} ${timePhrase}.`;
  } else {
    return `Your ${nameB} appears to ${direction === 'positive' ? 'increase' : 'decrease'} ${strengthWord} following higher ${nameA}.`;
  }
}

/**
 * Use Claude AI to generate an insightful hypothesis
 * @param {Object} correlation - Correlation data
 * @returns {string} - AI-generated hypothesis
 */
async function aiGenerateHypothesis(correlation) {
  const { metric_a, metric_b, direction, strength, correlation_coefficient, time_lag_hours, sample_size } = correlation;

  const prompt = `You are analyzing a personal behavioral pattern discovered from someone's data.

Correlation found:
- Metric A: ${metric_a} (${correlation.platform_a || 'cross-platform'})
- Metric B: ${metric_b} (${correlation.platform_b || 'cross-platform'})
- Direction: ${direction} (${direction === 'positive' ? 'both increase together' : 'one increases as other decreases'})
- Strength: ${strength} (r = ${correlation_coefficient.toFixed(2)})
- Time lag: ${time_lag_hours} hours (${time_lag_hours === 0 ? 'same time' : time_lag_hours < 0 ? `metric B follows metric A by ${Math.abs(time_lag_hours)}h` : `metric A follows metric B by ${time_lag_hours}h`})
- Based on: ${sample_size} data points

Generate a single sentence hypothesis explaining what this pattern might mean for the person. Be specific, insightful, and avoid generic statements. Focus on the "why" - what might explain this relationship.

Output only the hypothesis sentence, nothing else.`;

  try {
    const response = await generateChatResponse({
      systemPrompt: 'You are a behavioral scientist analyzing personal patterns. Be insightful and specific.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 100,
      temperature: 0.7
    });

    return response.content.trim();
  } catch (error) {
    console.error('Error generating AI hypothesis:', error);
    return generateRuleBasedHypothesis(correlation);
  }
}

/**
 * Generate hypotheses for all significant correlations
 * @param {string} userId - User ID
 * @param {boolean} useAI - Whether to use AI for hypothesis generation (default: true)
 * @returns {Object} - Generation results
 */
export async function generateHypotheses(userId, useAI = true) {
  const results = {
    generated: 0,
    updated: 0,
    skipped: 0,
    hypotheses: []
  };

  // Get active correlations
  const correlations = await correlationEngine.getActiveCorrelations(userId);

  for (const correlation of correlations) {
    try {
      // Calculate confidence
      const confidence = calculateConfidence(correlation);

      if (confidence < MIN_CONFIDENCE_THRESHOLD) {
        results.skipped++;
        continue;
      }

      // Check if hypothesis already exists
      const { data: existing, error: existingErr } = await supabaseAdmin
        .from('pl_pattern_hypotheses')
        .select('id, hypothesis_text')
        .eq('correlation_id', correlation.id)
        .eq('is_active', true)
        .single();
      if (existingErr && existingErr.code !== 'PGRST116') console.warn('[PatternHypothesis] Error checking existing hypothesis:', existingErr.message);

      // Generate hypothesis text
      const hypothesisText = useAI
        ? await aiGenerateHypothesis(correlation)
        : generateRuleBasedHypothesis(correlation);

      const category = categorizeHypothesis(correlation.metric_a, correlation.metric_b);

      if (existing) {
        // Update existing hypothesis if text changed significantly
        if (existing.hypothesis_text !== hypothesisText) {
          const { error: updateHypErr } = await supabaseAdmin
            .from('pl_pattern_hypotheses')
            .update({
              hypothesis_text: hypothesisText,
              confidence_score: confidence,
              evidence_count: correlation.sample_size,
              category
            })
            .eq('id', existing.id);
          if (updateHypErr) console.warn('[PatternHypothesis] Error updating hypothesis:', updateHypErr.message);

          results.updated++;
        }
      } else {
        // Insert new hypothesis
        const { data: newHypothesis, error } = await supabaseAdmin
          .from('pl_pattern_hypotheses')
          .insert({
            user_id: userId,
            correlation_id: correlation.id,
            hypothesis_text: hypothesisText,
            confidence_score: confidence,
            evidence_count: correlation.sample_size,
            category
          })
          .select()
          .single();

        if (!error && newHypothesis) {
          results.generated++;
          results.hypotheses.push({
            id: newHypothesis.id,
            text: hypothesisText,
            confidence,
            category
          });
        }
      }
    } catch (err) {
      console.error('Error generating hypothesis:', err);
      results.skipped++;
    }
  }

  return results;
}

/**
 * Get active hypotheses for a user
 * @param {string} userId - User ID
 * @param {string} category - Filter by category (optional)
 * @param {number} minConfidence - Minimum confidence filter (optional)
 * @returns {Object[]} - Array of hypotheses
 */
export async function getActiveHypotheses(userId, category = null, minConfidence = 0) {
  let query = supabaseAdmin
    .from('pl_pattern_hypotheses')
    .select(`
      *,
      correlation:pl_discovered_correlations(
        metric_a,
        metric_b,
        platform_a,
        platform_b,
        correlation_coefficient,
        strength,
        direction,
        time_lag_hours
      )
    `)
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('confidence_score', minConfidence)
    .order('confidence_score', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching hypotheses:', error);
    return [];
  }

  return data || [];
}

/**
 * Record hypothesis validation (confirmed or refuted)
 * @param {string} hypothesisId - Hypothesis ID
 * @param {boolean} validated - True if confirmed, false if refuted
 * @returns {Object} - Updated hypothesis
 */
export async function recordValidation(hypothesisId, validated) {
  const updateField = validated ? 'validated_count' : 'invalidated_count';

  // Get current counts
  const { data: hypothesis } = await supabaseAdmin
    .from('pl_pattern_hypotheses')
    .select('validated_count, invalidated_count, confidence_score')
    .eq('id', hypothesisId)
    .single();

  if (!hypothesis) return null;

  // Update count
  const newCount = (hypothesis[updateField] || 0) + 1;

  // Recalculate confidence based on validation ratio
  const totalValidations = (hypothesis.validated_count || 0) + (hypothesis.invalidated_count || 0) + 1;
  const validatedRatio = ((hypothesis.validated_count || 0) + (validated ? 1 : 0)) / totalValidations;

  // Adjust confidence: if many validations fail, decrease confidence
  const validationAdjustment = (validatedRatio - 0.5) * 0.2; // +/- 10% max
  const newConfidence = Math.max(0, Math.min(1, hypothesis.confidence_score + validationAdjustment));

  // Check if hypothesis should be deactivated (too many failures)
  const shouldDeactivate = !validated &&
    (hypothesis.invalidated_count || 0) + 1 >= 5 &&
    validatedRatio < 0.3;

  const { data, error } = await supabaseAdmin
    .from('pl_pattern_hypotheses')
    .update({
      [updateField]: newCount,
      confidence_score: newConfidence,
      is_active: !shouldDeactivate,
      deactivated_at: shouldDeactivate ? new Date().toISOString() : null,
      deactivation_reason: shouldDeactivate ? 'low_validation_rate' : null
    })
    .eq('id', hypothesisId)
    .select()
    .single();

  if (error) {
    console.error('Error recording validation:', error);
    return null;
  }

  return data;
}

/**
 * Get hypothesis summary for display
 * @param {string} userId - User ID
 * @returns {Object} - Summary statistics
 */
export async function getHypothesisSummary(userId) {
  const hypotheses = await getActiveHypotheses(userId);

  const summary = {
    total: hypotheses.length,
    byCategory: {},
    avgConfidence: 0,
    highConfidence: [], // > 0.7 confidence
    validated: 0,
    refuted: 0
  };

  let totalConfidence = 0;

  for (const h of hypotheses) {
    // By category
    if (!summary.byCategory[h.category]) {
      summary.byCategory[h.category] = 0;
    }
    summary.byCategory[h.category]++;

    // Confidence tracking
    totalConfidence += h.confidence_score;

    if (h.confidence_score >= 0.7) {
      summary.highConfidence.push({
        text: h.hypothesis_text,
        confidence: h.confidence_score,
        category: h.category
      });
    }

    // Validation tracking
    summary.validated += h.validated_count || 0;
    summary.refuted += h.invalidated_count || 0;
  }

  summary.avgConfidence = hypotheses.length > 0
    ? Math.round((totalConfidence / hypotheses.length) * 100) / 100
    : 0;

  return summary;
}

/**
 * Get hypotheses relevant to a specific context (e.g., current deviation)
 * @param {string} userId - User ID
 * @param {string} metricName - Metric that deviated
 * @returns {Object[]} - Relevant hypotheses
 */
export async function getRelevantHypotheses(userId, metricName) {
  const { data, error } = await supabaseAdmin
    .from('pl_pattern_hypotheses')
    .select(`
      *,
      correlation:pl_discovered_correlations(
        metric_a,
        metric_b,
        direction,
        strength,
        time_lag_hours
      )
    `)
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('confidence_score', 0.5)
    .order('confidence_score', { ascending: false });

  if (error || !data) return [];

  // Filter to hypotheses involving this metric
  return data.filter(h =>
    h.correlation &&
    (h.correlation.metric_a === metricName || h.correlation.metric_b === metricName)
  );
}

/**
 * Deactivate hypotheses for invalid correlations
 * @param {string} userId - User ID
 * @returns {number} - Number deactivated
 */
export async function deactivateStaleHypotheses(userId) {
  // Find hypotheses whose correlations are no longer valid
  const { data: staleHypotheses, error } = await supabaseAdmin
    .from('pl_pattern_hypotheses')
    .select(`
      id,
      correlation:pl_discovered_correlations!inner(
        still_valid
      )
    `)
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error || !staleHypotheses) return 0;

  const toDeactivate = staleHypotheses
    .filter(h => h.correlation && !h.correlation.still_valid)
    .map(h => h.id);

  if (toDeactivate.length === 0) return 0;

  const { error: deactivateErr } = await supabaseAdmin
    .from('pl_pattern_hypotheses')
    .update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
      deactivation_reason: 'correlation_invalidated'
    })
    .in('id', toDeactivate);
  if (deactivateErr) console.error('[PatternHypothesis] Error deactivating hypotheses:', deactivateErr.message);

  return toDeactivate.length;
}

export default {
  generateHypotheses,
  getActiveHypotheses,
  recordValidation,
  getHypothesisSummary,
  getRelevantHypotheses,
  deactivateStaleHypotheses,
  calculateConfidence,
  HYPOTHESIS_CATEGORIES
};
