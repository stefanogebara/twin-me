/**
 * PATTERN INSIGHT GENERATION SERVICE
 *
 * Uses Claude AI to generate natural language insights from behavioral patterns.
 * Creates human-readable, actionable suggestions based on detected patterns.
 *
 * INSIGHT TYPES:
 * - Ritual Discovery: "You have a pre-presentation ritual"
 * - Behavior Prediction: "You'll likely do X before Y"
 * - Pattern Suggestions: "Consider this pattern for upcoming event"
 * - Anomaly Detection: "You broke your usual pattern"
 * - Pattern Evolution: "Your pattern is changing"
 * - Optimization Tips: "This pattern seems effective for you"
 *
 * USES CLAUDE 3.5 SONNET FOR:
 * - Natural language generation
 * - Pattern analysis and interpretation
 * - Actionable suggestion creation
 * - Emotional context understanding
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import {
  getUserPatterns,
  getConfidenceLevel,
  getConfidenceDescription
} from './behavioralPatternRecognition.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ====================================================================
// INSIGHT GENERATION WITH CLAUDE AI
// ====================================================================

/**
 * Generate insights for all high-confidence patterns
 *
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Generated insights
 */
export async function generatePatternInsights(userId) {
  try {
    console.log(`🧠 [Insight Generator] Generating insights for user ${userId}`);

    // Get high-confidence patterns (>= 70%)
    const patterns = await getUserPatterns(userId, { minConfidence: 70 });

    if (patterns.length === 0) {
      console.log('⚠️ [Insight Generator] No high-confidence patterns found');
      return [];
    }

    console.log(`🧠 [Insight Generator] Generating insights for ${patterns.length} patterns`);

    // Generate insights for each pattern
    const insights = [];

    for (const pattern of patterns) {
      try {
        const insight = await generateSinglePatternInsight(userId, pattern);
        if (insight) {
          insights.push(insight);
        }
      } catch (error) {
        console.error(`❌ [Insight Generator] Error generating insight for pattern ${pattern.id}:`, error);
      }
    }

    console.log(`✅ [Insight Generator] Generated ${insights.length} insights`);
    return insights;

  } catch (error) {
    console.error('❌ [Insight Generator] Error generating insights:', error);
    throw error;
  }
}

/**
 * Generate insight for a single pattern using Claude AI
 */
async function generateSinglePatternInsight(userId, pattern) {
  try {
    // Check if insight already exists for this pattern (created in last 7 days)
    const { data: existingInsight } = await supabase
      .from('pattern_insights')
      .select('id')
      .eq('pattern_id', pattern.id)
      .eq('user_id', userId)
      .gte('generated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .is('dismissed_at', null)
      .single();

    if (existingInsight) {
      console.log(`⚠️ [Insight Generator] Insight already exists for pattern ${pattern.id}`);
      return null;
    }

    // Determine insight type
    const insightType = determineInsightType(pattern);

    // Generate insight using Claude
    const aiInsight = await generateInsightWithClaude(pattern, insightType);

    // Store insight in database
    const { data: storedInsight, error } = await supabase
      .from('pattern_insights')
      .insert({
        user_id: userId,
        pattern_id: pattern.id,
        insight_type: insightType,
        title: aiInsight.title,
        description: aiInsight.description,
        confidence: pattern.confidence_score,
        insight_data: {
          trigger: aiInsight.trigger,
          behavior: aiInsight.behavior,
          timing: aiInsight.timing,
          frequency: `${pattern.occurrence_count} occurrences`,
          consistency: `${pattern.consistency_rate}% consistency`,
          effectiveness_signal: pattern.confidence_score >= 90 ? 'high' : 'medium'
        },
        suggestions: aiInsight.suggestions,
        privacy_level: 50, // Default privacy level
        shared_with_twin: false
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ [Insight Generator] Created insight for pattern ${pattern.id}`);
    return storedInsight;

  } catch (error) {
    console.error(`❌ [Insight Generator] Error generating single insight:`, error);
    return null;
  }
}

/**
 * Determine insight type from pattern characteristics
 */
function determineInsightType(pattern) {
  if (pattern.pattern_type === 'pre_event_ritual' && pattern.confidence_score >= 80) {
    return 'ritual_discovery';
  }

  if (pattern.occurrence_count >= 5 && pattern.consistency_rate >= 70) {
    return 'behavior_prediction';
  }

  if (pattern.confidence_score >= 70 && pattern.occurrence_count < 5) {
    return 'pattern_suggestion';
  }

  if (pattern.hypothesized_purpose === 'stress_reduction') {
    return 'optimization_tip';
  }

  return 'awareness_nudge';
}

/**
 * Generate insight using Claude AI
 */
async function generateInsightWithClaude(pattern, insightType) {
  const prompt = buildInsightPrompt(pattern, insightType);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 800,
    temperature: 0.7,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  const content = response.content[0].text;

  // Parse Claude's response (expecting JSON)
  try {
    const parsedInsight = JSON.parse(content);
    return parsedInsight;
  } catch (parseError) {
    console.error('❌ [Insight Generator] Error parsing Claude response:', parseError);

    // Fallback to template-based insight
    return generateTemplateInsight(pattern, insightType);
  }
}

/**
 * Build Claude AI prompt for insight generation
 */
function buildInsightPrompt(pattern, insightType) {
  const confidenceDesc = getConfidenceDescription(pattern.confidence_score);
  const activity = formatPatternActivity(pattern);
  const timing = formatPatternTiming(pattern);
  const trigger = formatPatternTrigger(pattern);

  return `You are a behavioral pattern analyst helping users understand their authentic behavioral rituals and coping mechanisms.

PATTERN DETAILS:
- Type: ${pattern.pattern_type}
- Trigger: ${trigger}
- Behavior: ${activity}
- Timing: ${timing}
- Frequency: ${pattern.occurrence_count} occurrences
- Consistency: ${pattern.consistency_rate}%
- Confidence: ${pattern.confidence_score}% (${confidenceDesc})
- Purpose: ${pattern.hypothesized_purpose}
- Emotional state: ${pattern.emotional_state}

INSIGHT TYPE: ${insightType}

Generate a personalized insight in JSON format:

{
  "title": "Short, engaging title (max 60 chars)",
  "description": "Natural language description explaining the pattern in 2-3 sentences. Use second person ('you'). Be specific and empathetic.",
  "trigger": "What triggers this behavior (event type, timing)",
  "behavior": "What the user does (specific activity)",
  "timing": "When this happens relative to the trigger",
  "suggestions": [
    "Actionable suggestion 1 (be specific and practical)",
    "Actionable suggestion 2 (help user leverage or improve pattern)",
    "Actionable suggestion 3 (optional: help track or automate)"
  ]
}

GUIDELINES:
- Be warm and non-judgmental
- Focus on self-discovery, not criticism
- Highlight the authenticity of their behavior
- Make suggestions actionable and specific
- Use natural, conversational language
- Avoid jargon or clinical terms

Return ONLY the JSON object, no additional text.`;
}

/**
 * Format pattern activity for display
 */
function formatPatternActivity(pattern) {
  const type = pattern.response_type;
  const data = pattern.response_data || {};

  if (type === 'music_playlist') {
    if (data.playlist_name) return `listen to "${data.playlist_name}"`;
    if (data.genre) return `listen to ${data.genre} music`;
    if (data.artist_name) return `listen to ${data.artist_name}`;
    return 'listen to music';
  }

  if (type === 'music_genre') {
    return `listen to ${data.genre || 'music'}`;
  }

  if (type === 'video_content') {
    return data.video_title ? `watch "${data.video_title}"` : 'watch videos';
  }

  if (type === 'social_activity') {
    return `engage on ${pattern.response_platform}`;
  }

  if (type === 'coding_session') {
    return 'work on code';
  }

  return `use ${pattern.response_platform}`;
}

/**
 * Format pattern timing
 */
function formatPatternTiming(pattern) {
  const minutes = Math.abs(pattern.time_offset_minutes);
  const direction = pattern.time_offset_minutes < 0 ? 'before' : 'after';

  if (minutes < 60) {
    return `${minutes} minutes ${direction}`;
  }

  const hours = Math.round(minutes / 60 * 10) / 10;
  return `${hours} hours ${direction}`;
}

/**
 * Format pattern trigger
 */
function formatPatternTrigger(pattern) {
  const keywords = pattern.trigger_keywords || [];

  if (keywords.length > 0) {
    return keywords.join(', ');
  }

  const metadata = pattern.trigger_metadata || {};
  if (metadata.eventType) {
    return metadata.eventType.replace('_', ' ');
  }

  return pattern.trigger_type?.replace('_', ' ') || 'events';
}

/**
 * Generate template-based insight (fallback if Claude fails)
 */
function generateTemplateInsight(pattern, insightType) {
  const activity = formatPatternActivity(pattern);
  const timing = formatPatternTiming(pattern);
  const trigger = formatPatternTrigger(pattern);
  const confidenceDesc = getConfidenceDescription(pattern.confidence_score);

  const templates = {
    ritual_discovery: {
      title: `Your Pre-${trigger} Ritual`,
      description: `${confidenceDesc} ${activity} ${timing} ${trigger} events. This appears to be a consistent ritual that helps you prepare mentally and emotionally. You've done this ${pattern.occurrence_count} times with ${pattern.consistency_rate}% consistency.`
    },
    behavior_prediction: {
      title: `Predictable Pattern: ${activity}`,
      description: `When ${trigger} events come up, ${confidenceDesc} ${activity} around ${timing} the event. This pattern has appeared ${pattern.occurrence_count} times and seems to be a reliable part of your routine.`
    },
    pattern_suggestion: {
      title: `Consider: ${activity} for ${trigger}`,
      description: `We've noticed you sometimes ${activity} ${timing} ${trigger} events. While this pattern is still emerging (${pattern.occurrence_count} times), it might be a helpful ritual to develop.`
    },
    optimization_tip: {
      title: `Effective Strategy: ${activity}`,
      description: `${confidenceDesc} ${activity} when dealing with ${trigger}. This seems to be an effective coping mechanism that you've naturally developed. Consider leaning into this pattern intentionally.`
    },
    awareness_nudge: {
      title: `Pattern Spotted: ${activity}`,
      description: `You might not have noticed, but ${confidenceDesc} tend to ${activity} ${timing} ${trigger} events. This could be an unconscious ritual worth being aware of.`
    }
  };

  const template = templates[insightType] || templates.awareness_nudge;

  return {
    title: template.title,
    description: template.description,
    trigger: trigger,
    behavior: activity,
    timing: timing,
    suggestions: generateTemplateSuggestions(pattern, insightType)
  };
}

/**
 * Generate template suggestions
 */
function generateTemplateSuggestions(pattern, insightType) {
  const activity = formatPatternActivity(pattern);
  const timing = formatPatternTiming(pattern);

  return [
    `Set a calendar reminder ${timing} ${pattern.trigger_keywords?.[0] || 'events'} to ${activity}`,
    `Create a dedicated playlist or routine for this ritual`,
    `Track how this pattern affects your performance and mood`
  ];
}

// ====================================================================
// INSIGHT RETRIEVAL
// ====================================================================

/**
 * Get insights for a user
 *
 * @param {string} userId - User ID
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} User insights
 */
export async function getUserInsights(userId, filters = {}) {
  try {
    let query = supabase
      .from('pattern_insights')
      .select('*')
      .eq('user_id', userId)
      .is('dismissed_at', null)
      .order('confidence', { ascending: false });

    if (filters.minConfidence) {
      query = query.gte('confidence', filters.minConfidence);
    }

    if (filters.insightType) {
      query = query.eq('insight_type', filters.insightType);
    }

    // Only non-expired insights
    query = query.or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

    const { data, error } = await query;

    if (error) throw error;

    return data || [];

  } catch (error) {
    console.error('❌ [Insight Generator] Error getting insights:', error);
    throw error;
  }
}

/**
 * Dismiss an insight
 */
export async function dismissInsight(userId, insightId) {
  try {
    const { error } = await supabase
      .from('pattern_insights')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', insightId)
      .eq('user_id', userId);

    if (error) throw error;

    return { success: true };

  } catch (error) {
    console.error('❌ [Insight Generator] Error dismissing insight:', error);
    throw error;
  }
}

/**
 * Rate an insight
 */
export async function rateInsight(userId, insightId, rating, feedback = null) {
  try {
    const { error } = await supabase
      .from('pattern_insights')
      .update({
        user_acknowledged: true,
        user_rating: rating,
        user_feedback: feedback
      })
      .eq('id', insightId)
      .eq('user_id', userId);

    if (error) throw error;

    return { success: true };

  } catch (error) {
    console.error('❌ [Insight Generator] Error rating insight:', error);
    throw error;
  }
}

// ====================================================================
// CROSS-PATTERN INSIGHTS
// Detect relationships between multiple patterns
// ====================================================================

/**
 * Generate cross-pattern correlation insights
 *
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Cross-pattern insights
 */
export async function generateCrossPatternInsights(userId) {
  try {
    const patterns = await getUserPatterns(userId, { minConfidence: 70 });

    if (patterns.length < 2) {
      return [];
    }

    const crossInsights = [];

    // Find patterns that co-occur
    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const pattern1 = patterns[i];
        const pattern2 = patterns[j];

        // Check if patterns often happen together
        const correlation = await checkPatternCorrelation(pattern1, pattern2);

        if (correlation.strength >= 0.7) {
          const insight = await generateCorrelationInsight(userId, pattern1, pattern2, correlation);
          if (insight) {
            crossInsights.push(insight);
          }
        }
      }
    }

    return crossInsights;

  } catch (error) {
    console.error('❌ [Insight Generator] Error generating cross-pattern insights:', error);
    throw error;
  }
}

/**
 * Check correlation between two patterns
 */
async function checkPatternCorrelation(pattern1, pattern2) {
  // Get observations for both patterns
  const { data: obs1 } = await supabase
    .from('pattern_observations')
    .select('trigger_timestamp')
    .eq('pattern_id', pattern1.id);

  const { data: obs2 } = await supabase
    .from('pattern_observations')
    .select('trigger_timestamp')
    .eq('pattern_id', pattern2.id);

  if (!obs1 || !obs2 || obs1.length === 0 || obs2.length === 0) {
    return { strength: 0 };
  }

  // Count co-occurrences (within 24 hours)
  let coOccurrences = 0;

  for (const o1 of obs1) {
    for (const o2 of obs2) {
      const timeDiff = Math.abs(
        new Date(o1.trigger_timestamp) - new Date(o2.trigger_timestamp)
      );
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      if (hoursDiff <= 24) {
        coOccurrences++;
        break;
      }
    }
  }

  const strength = coOccurrences / Math.min(obs1.length, obs2.length);

  return { strength, coOccurrences };
}

/**
 * Generate insight about pattern correlation
 */
async function generateCorrelationInsight(userId, pattern1, pattern2, correlation) {
  const activity1 = formatPatternActivity(pattern1);
  const activity2 = formatPatternActivity(pattern2);

  const { data, error } = await supabase
    .from('pattern_insights')
    .insert({
      user_id: userId,
      pattern_id: null, // Cross-pattern insight
      insight_type: 'cross_pattern_correlation',
      title: `Linked Rituals: ${activity1} + ${activity2}`,
      description: `You often ${activity1} and ${activity2} around the same time. These patterns co-occur ${correlation.coOccurrences} times, suggesting they're part of a larger ritual or coping mechanism.`,
      confidence: Math.round(correlation.strength * 100),
      insight_data: {
        pattern1: { id: pattern1.id, activity: activity1 },
        pattern2: { id: pattern2.id, activity: activity2 },
        correlation_strength: correlation.strength,
        co_occurrences: correlation.coOccurrences
      },
      suggestions: [
        'Consider these as a unified ritual rather than separate behaviors',
        'Track whether one behavior naturally leads to the other',
        'Experiment with doing them intentionally together'
      ]
    })
    .select()
    .single();

  if (error) {
    console.error('❌ [Insight Generator] Error creating correlation insight:', error);
    return null;
  }

  return data;
}

export default {
  generatePatternInsights,
  getUserInsights,
  dismissInsight,
  rateInsight,
  generateCrossPatternInsights
};
