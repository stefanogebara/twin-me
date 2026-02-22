/**
 * Proactive Insight Service
 *
 * Layer 6 of the Pattern Learning System
 * Generates context-aware suggestions from discovered patterns
 *
 * Key functions:
 * - generateInsights(userId) - Match deviations to hypotheses
 * - generateInsightMessage(deviation, hypothesis) - Natural language insight
 * - generateSuggestedAction(deviation, hypothesis) - Context-aware suggestion
 */

import { supabaseAdmin } from './database.js';
import { generateChatResponse } from './anthropicService.js';
import deviationDetector from './deviationDetector.js';
import hypothesisEngine from './patternHypothesisEngine.js';
import baselineEngine from './baselineEngine.js';

// Insight types
const INSIGHT_TYPES = {
  DEVIATION_ALERT: 'deviation_alert',      // Significant deviation detected
  PATTERN_OBSERVATION: 'pattern_observation', // Pattern-based observation
  PREDICTION: 'prediction',                 // Based on lagged correlations
  SUGGESTION: 'suggestion'                  // Actionable suggestion
};

// Minimum confidence for generating insights
const MIN_INSIGHT_CONFIDENCE = 0.5;

// Cooldown between similar insights (hours)
const INSIGHT_COOLDOWN_HOURS = 4;

/**
 * Check if a similar insight was recently shown
 * @param {string} userId - User ID
 * @param {string} insightType - Type of insight
 * @param {string} metricName - Related metric (optional)
 * @returns {boolean} - True if in cooldown
 */
async function isInCooldown(userId, insightType, metricName = null) {
  const cooldownTime = new Date();
  cooldownTime.setHours(cooldownTime.getHours() - INSIGHT_COOLDOWN_HOURS);

  let query = supabaseAdmin
    .from('pl_proactive_insights')
    .select('id')
    .eq('user_id', userId)
    .eq('insight_type', insightType)
    .eq('was_shown', true)
    .gte('shown_at', cooldownTime.toISOString())
    .limit(1);

  // If we have a specific metric, check for that too
  if (metricName) {
    // Note: We'd need to store metric info in the insight to filter here
    // For now, we just check by type
  }

  const { data, error } = await query;
  if (error) {
    console.error('[ProactiveInsight] Error fetching insights:', error.message);
    return [];
  }
  return data && data.length > 0;
}

/**
 * Generate insight message using AI
 * @param {Object} deviation - Deviation data
 * @param {Object} hypothesis - Related hypothesis (optional)
 * @returns {string} - Generated message
 */
async function generateInsightMessageAI(deviation, hypothesis = null) {
  const { metric_name, observed_value, baseline_mean, z_score, direction, significance } = deviation;

  const contextInfo = hypothesis ? `
Related pattern discovered: "${hypothesis.hypothesis_text}"
Pattern confidence: ${Math.round(hypothesis.confidence_score * 100)}%` : '';

  const prompt = `Generate a brief, personalized insight message (1-2 sentences) for someone whose ${metric_name} is ${significance}ly ${direction} their personal average.

Current ${metric_name}: ${observed_value?.toFixed(1) || 'N/A'}
Their usual ${metric_name}: ${baseline_mean?.toFixed(1) || 'N/A'}
Deviation: ${Math.abs(z_score)?.toFixed(1) || 'N/A'} standard deviations ${direction}
${contextInfo}

Be empathetic, specific, and actionable. Don't be alarmist. Reference the pattern if provided.

Output only the insight message, nothing else.`;

  try {
    const response = await generateChatResponse({
      systemPrompt: 'You are a personal AI assistant that provides gentle, insightful observations about behavioral patterns. Be warm but not overly familiar.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 100,
      temperature: 0.7
    });

    return response.content.trim();
  } catch (error) {
    console.error('Error generating AI insight:', error);
    return generateRuleBasedInsightMessage(deviation, hypothesis);
  }
}

/**
 * Generate rule-based insight message (fallback)
 */
function generateRuleBasedInsightMessage(deviation, hypothesis = null) {
  const { metric_name, z_score, direction, significance } = deviation;

  const metricNames = {
    recovery: 'recovery score',
    hrv: 'HRV',
    strain: 'strain level',
    sleep_hours: 'sleep duration',
    music_valence: 'music mood',
    music_energy: 'music energy',
    meeting_count: 'meeting load'
  };

  const name = metricNames[metric_name] || metric_name;
  const deviationPhrase = Math.abs(z_score) >= 2
    ? 'significantly'
    : 'noticeably';

  let message = `Your ${name} is ${deviationPhrase} ${direction} your usual level today.`;

  if (hypothesis) {
    message += ` Based on your patterns, ${hypothesis.hypothesis_text.toLowerCase()}`;
  }

  return message;
}

/**
 * Generate suggested action using AI
 * @param {Object} deviation - Deviation data
 * @param {Object} hypothesis - Related hypothesis (optional)
 * @returns {Object} - Suggested action
 */
async function generateSuggestedActionAI(deviation, hypothesis = null) {
  const { metric_name, direction, significance, context } = deviation;

  const prompt = `Suggest ONE specific, actionable step for someone whose ${metric_name} is ${significance}ly ${direction} their normal.

Context:
- Time of day: ${context?.time_of_day || 'unknown'}
- Day of week: ${context?.day_of_week || 'unknown'}
${hypothesis ? `- Related pattern: "${hypothesis.hypothesis_text}"` : ''}

Output as JSON: {"type": "category", "suggestion": "brief action", "reason": "why this helps"}
Categories: music, rest, activity, social, work, mindfulness`;

  try {
    const response = await generateChatResponse({
      systemPrompt: 'You are a wellness AI. Give practical, specific suggestions. Output valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 100,
      temperature: 0.6
    });

    // Parse JSON response
    const jsonMatch = response.content.match(/\{[^}]+\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('Error generating AI suggestion:', error);
  }

  // Fallback suggestion
  return generateRuleBasedSuggestion(deviation);
}

/**
 * Generate rule-based suggestion (fallback)
 */
function generateRuleBasedSuggestion(deviation) {
  const { metric_name, direction } = deviation;

  const suggestions = {
    recovery: {
      below: { type: 'rest', suggestion: 'Consider lighter activity today', reason: 'Your body needs recovery' },
      above: { type: 'activity', suggestion: 'Great day for challenging work', reason: 'You\'re well recovered' }
    },
    strain: {
      above: { type: 'rest', suggestion: 'Balance with some downtime', reason: 'High strain needs recovery' },
      below: { type: 'activity', suggestion: 'Good day to push yourself', reason: 'You have capacity for more' }
    },
    sleep_hours: {
      below: { type: 'rest', suggestion: 'Try to rest earlier tonight', reason: 'You\'re running a sleep deficit' },
      above: { type: 'activity', suggestion: 'Use your restedness productively', reason: 'You\'re well-rested' }
    },
    music_valence: {
      below: { type: 'music', suggestion: 'Try some upbeat music if you want a lift', reason: 'Music can shift mood' },
      above: { type: 'mindfulness', suggestion: 'Enjoy your good mood!', reason: 'You\'re in a positive state' }
    }
  };

  const metricSuggestions = suggestions[metric_name];
  if (metricSuggestions) {
    return metricSuggestions[direction] || { type: 'general', suggestion: 'Take a moment to check in with yourself', reason: 'Self-awareness helps' };
  }

  return { type: 'general', suggestion: 'Notice this pattern', reason: 'Awareness is the first step' };
}

/**
 * Generate insights for recent deviations
 * @param {string} userId - User ID
 * @returns {Object} - Generation results
 */
export async function generateInsights(userId) {
  const results = {
    generated: 0,
    skipped: 0,
    insights: []
  };

  // Get recent deviations (last 24 hours)
  const recentDeviations = await deviationDetector.getRecentDeviations(userId, 10, 'significant');

  for (const deviation of recentDeviations) {
    try {
      // Check cooldown
      if (await isInCooldown(userId, INSIGHT_TYPES.DEVIATION_ALERT)) {
        results.skipped++;
        continue;
      }

      // Find relevant hypotheses
      const relevantHypotheses = await hypothesisEngine.getRelevantHypotheses(
        userId,
        deviation.metric_name
      );

      const topHypothesis = relevantHypotheses.length > 0 ? relevantHypotheses[0] : null;

      // Skip if no good hypothesis and deviation isn't extreme
      if (!topHypothesis && deviation.significance !== 'extreme') {
        results.skipped++;
        continue;
      }

      // Generate insight message
      const message = await generateInsightMessageAI(deviation, topHypothesis);

      // Generate suggested action
      const suggestedAction = await generateSuggestedActionAI(deviation, topHypothesis);

      // Calculate confidence
      const confidence = topHypothesis
        ? (topHypothesis.confidence_score + (deviation.significance === 'extreme' ? 0.3 : 0.1)) / 1.3
        : 0.5;

      if (confidence < MIN_INSIGHT_CONFIDENCE) {
        results.skipped++;
        continue;
      }

      // Store insight
      const { data: insight, error } = await supabaseAdmin
        .from('pl_proactive_insights')
        .insert({
          user_id: userId,
          insight_type: INSIGHT_TYPES.DEVIATION_ALERT,
          hypothesis_id: topHypothesis?.id || null,
          deviation_id: deviation.id,
          message,
          suggested_action: suggestedAction,
          confidence_score: confidence,
          relevance_score: deviation.significance === 'extreme' ? 1.0 : 0.7
        })
        .select()
        .single();

      if (!error && insight) {
        results.generated++;
        results.insights.push({
          id: insight.id,
          message,
          action: suggestedAction,
          confidence
        });
      }
    } catch (err) {
      console.error('Error generating insight:', err);
      results.skipped++;
    }
  }

  return results;
}

/**
 * Generate predictive insights from lagged correlations
 * @param {string} userId - User ID
 * @returns {Object} - Generation results
 */
export async function generatePredictiveInsights(userId) {
  const results = { generated: 0, insights: [] };

  // Get baselines with recent deviations in predictive metrics
  const deviations = await deviationDetector.getRecentDeviations(userId, 5);

  for (const deviation of deviations) {
    // Find hypotheses where this metric predicts another
    const hypotheses = await hypothesisEngine.getRelevantHypotheses(userId, deviation.metric_name);

    const predictiveHypotheses = hypotheses.filter(h =>
      h.correlation &&
      h.correlation.time_lag_hours !== 0 &&
      h.correlation.metric_a === deviation.metric_name
    );

    for (const hypothesis of predictiveHypotheses) {
      const { correlation } = hypothesis;
      const lagHours = Math.abs(correlation.time_lag_hours);
      const predictedEffect = correlation.direction === deviation.direction ? 'higher' : 'lower';

      const message = `Based on your current ${deviation.metric_name}, your ${correlation.metric_b} may be ${predictedEffect} in about ${lagHours} hours.`;

      const { data: insight, error } = await supabaseAdmin
        .from('pl_proactive_insights')
        .insert({
          user_id: userId,
          insight_type: INSIGHT_TYPES.PREDICTION,
          hypothesis_id: hypothesis.id,
          deviation_id: deviation.id,
          message,
          confidence_score: hypothesis.confidence_score * 0.8, // Slightly lower for predictions
          relevance_score: 0.8
        })
        .select()
        .single();

      if (!error && insight) {
        results.generated++;
        results.insights.push({ id: insight.id, message });
      }
    }
  }

  return results;
}

/**
 * Get pending insights to show user
 * @param {string} userId - User ID
 * @param {number} limit - Max insights to return
 * @returns {Object[]} - Array of insights
 */
export async function getPendingInsights(userId, limit = 3) {
  const { data, error } = await supabaseAdmin
    .from('pl_proactive_insights')
    .select(`
      *,
      hypothesis:pl_pattern_hypotheses(hypothesis_text, category),
      deviation:pl_behavioral_deviations(metric_name, observed_value, z_score, direction)
    `)
    .eq('user_id', userId)
    .eq('was_shown', false)
    .gte('confidence_score', MIN_INSIGHT_CONFIDENCE)
    .order('relevance_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching insights:', error);
    return [];
  }

  return data || [];
}

/**
 * Mark insight as shown
 * @param {string} insightId - Insight ID
 * @returns {boolean} - Success
 */
export async function markInsightShown(insightId) {
  const { error } = await supabaseAdmin
    .from('pl_proactive_insights')
    .update({
      was_shown: true,
      shown_at: new Date().toISOString()
    })
    .eq('id', insightId);

  return !error;
}

/**
 * Record user feedback on insight
 * @param {string} insightId - Insight ID
 * @param {string} feedback - 'helpful', 'not_helpful', 'dismiss', 'wrong'
 * @param {string} notes - Optional feedback notes
 * @returns {boolean} - Success
 */
export async function recordInsightFeedback(insightId, feedback, notes = null) {
  // Get insight to find hypothesis
  const { data: insight, error: insightErr } = await supabaseAdmin
    .from('pl_proactive_insights')
    .select('hypothesis_id')
    .eq('id', insightId)
    .single();
  if (insightErr && insightErr.code !== 'PGRST116') {
    console.warn('[ProactiveInsight] Error fetching insight:', insightErr.message);
  }

  // Record feedback
  const { error } = await supabaseAdmin
    .from('pl_proactive_insights')
    .update({
      user_feedback: feedback,
      feedback_at: new Date().toISOString(),
      feedback_notes: notes
    })
    .eq('id', insightId);

  if (error) return false;

  // Update hypothesis validation if applicable
  if (insight?.hypothesis_id) {
    const validated = feedback === 'helpful';
    await hypothesisEngine.recordValidation(insight.hypothesis_id, validated);
  }

  return true;
}

/**
 * Get insight history for user
 * @param {string} userId - User ID
 * @param {number} days - Days of history
 * @returns {Object[]} - Array of past insights
 */
export async function getInsightHistory(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabaseAdmin
    .from('pl_proactive_insights')
    .select('*')
    .eq('user_id', userId)
    .eq('was_shown', true)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false });

  if (error) return [];
  return data || [];
}

/**
 * Get insight statistics
 * @param {string} userId - User ID
 * @returns {Object} - Statistics
 */
export async function getInsightStats(userId) {
  const history = await getInsightHistory(userId, 30);

  const stats = {
    total: history.length,
    byType: {},
    byFeedback: { helpful: 0, not_helpful: 0, dismiss: 0, wrong: 0, no_feedback: 0 },
    avgConfidence: 0,
    showRate: 0
  };

  let totalConfidence = 0;
  let shown = 0;

  for (const insight of history) {
    // By type
    if (!stats.byType[insight.insight_type]) {
      stats.byType[insight.insight_type] = 0;
    }
    stats.byType[insight.insight_type]++;

    // By feedback
    if (insight.user_feedback) {
      stats.byFeedback[insight.user_feedback]++;
    } else {
      stats.byFeedback.no_feedback++;
    }

    // Confidence
    totalConfidence += insight.confidence_score || 0;

    // Show rate
    if (insight.was_shown) shown++;
  }

  stats.avgConfidence = history.length > 0
    ? Math.round((totalConfidence / history.length) * 100) / 100
    : 0;
  stats.showRate = history.length > 0
    ? Math.round((shown / history.length) * 100)
    : 0;

  return stats;
}

/**
 * Clean up old insights
 * @returns {number} - Number deleted
 */
export async function cleanupOldInsights() {
  // Delete unshown insights older than 7 days
  const { data, error } = await supabaseAdmin
    .from('pl_proactive_insights')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    console.error('Error cleaning up insights:', error);
    return 0;
  }

  return data?.length || 0;
}

export default {
  generateInsights,
  generatePredictiveInsights,
  getPendingInsights,
  markInsightShown,
  recordInsightFeedback,
  getInsightHistory,
  getInsightStats,
  cleanupOldInsights,
  INSIGHT_TYPES
};
