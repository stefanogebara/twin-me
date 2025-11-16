/**
 * SOUL PATTERN INTEGRATION
 *
 * Integrates behavioral pattern recognition into the soul extraction pipeline.
 * Called after platform data extraction to discover behavioral patterns.
 *
 * USAGE:
 * import { integratePatternRecognition } from './soulPatternIntegration.js';
 *
 * // After soul data extraction
 * const patternData = await integratePatternRecognition(userId);
 */

import {
  detectAndStoreBehavioralPatterns,
  getUserPatterns,
  getHighConfidencePatterns
} from './behavioralPatternRecognition.js';
import {
  generatePatternInsights,
  getUserInsights
} from './patternInsightGenerator.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Integrate pattern recognition into soul extraction pipeline
 *
 * @param {string} userId - User ID
 * @param {Object} options - Integration options
 * @returns {Promise<Object>} Pattern recognition results
 */
export async function integratePatternRecognition(userId, options = {}) {
  try {
    console.log(`🧠 [Soul Pattern Integration] Starting pattern recognition for user ${userId}`);

    // Step 1: Check if user has pattern tracking enabled
    const { data: user } = await supabase
      .from('users')
      .select('pattern_tracking_enabled')
      .eq('id', userId)
      .single();

    if (!user?.pattern_tracking_enabled) {
      console.log('⚠️ [Soul Pattern Integration] Pattern tracking not enabled for user');
      return {
        enabled: false,
        message: 'Pattern tracking not enabled'
      };
    }

    // Step 2: Check if user has sufficient platform data
    const hasSufficientData = await checkDataSufficiency(userId);

    if (!hasSufficientData) {
      console.log('⚠️ [Soul Pattern Integration] Insufficient platform data for pattern detection');
      return {
        enabled: true,
        sufficient_data: false,
        message: 'Insufficient platform data. Connect more platforms or sync more data.'
      };
    }

    // Step 3: Detect behavioral patterns
    const detectionResult = await detectAndStoreBehavioralPatterns(userId, {
      timeWindowDays: options.timeWindowDays || 30,
      minOccurrences: options.minOccurrences || 3,
      minConfidence: options.minConfidence || 50
    });

    console.log(`✅ [Soul Pattern Integration] Detected ${detectionResult.patternsStored} patterns`);

    // Step 4: Generate insights for high-confidence patterns
    let insights = [];
    if (detectionResult.patternsStored > 0) {
      insights = await generatePatternInsights(userId);
      console.log(`✅ [Soul Pattern Integration] Generated ${insights.length} insights`);
    }

    // Step 5: Get pattern summary
    const highConfidencePatterns = await getHighConfidencePatterns(userId);

    // Step 6: Calculate pattern statistics
    const stats = calculatePatternStats(detectionResult.patterns || []);

    return {
      enabled: true,
      sufficient_data: true,
      detection: {
        patternsDetected: detectionResult.patternsDetected,
        patternsStored: detectionResult.patternsStored,
        highConfidenceCount: highConfidencePatterns.length
      },
      insights: {
        generated: insights.length,
        insights: insights.slice(0, 3) // Top 3 insights
      },
      statistics: stats,
      message: `Discovered ${detectionResult.patternsStored} behavioral patterns`
    };

  } catch (error) {
    console.error('❌ [Soul Pattern Integration] Error:', error);
    throw error;
  }
}

/**
 * Check if user has sufficient data for pattern detection
 */
async function checkDataSufficiency(userId) {
  try {
    // Check for calendar events
    const { count: calendarCount } = await supabase
      .from('user_platform_data')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('platform', 'calendar')
      .eq('data_type', 'event');

    // Check for platform activities (Spotify, YouTube, Discord, etc.)
    const { count: activityCount } = await supabase
      .from('user_platform_data')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('platform', ['spotify', 'youtube', 'discord', 'reddit', 'github']);

    // Need at least 5 calendar events and 20 platform activities
    return (calendarCount || 0) >= 5 && (activityCount || 0) >= 20;

  } catch (error) {
    console.error('❌ [Soul Pattern Integration] Error checking data sufficiency:', error);
    return false;
  }
}

/**
 * Calculate pattern statistics
 */
function calculatePatternStats(patterns) {
  if (!patterns || patterns.length === 0) {
    return {
      total: 0,
      byType: {},
      byPlatform: {},
      averageConfidence: 0
    };
  }

  const byType = {};
  const byPlatform = {};
  let totalConfidence = 0;

  for (const pattern of patterns) {
    // Count by type
    byType[pattern.pattern_type] = (byType[pattern.pattern_type] || 0) + 1;

    // Count by platform
    byPlatform[pattern.response_platform] = (byPlatform[pattern.response_platform] || 0) + 1;

    // Sum confidence
    totalConfidence += pattern.confidence_score || 0;
  }

  return {
    total: patterns.length,
    byType,
    byPlatform,
    averageConfidence: Math.round((totalConfidence / patterns.length) * 100) / 100
  };
}

/**
 * Get pattern data for soul signature
 *
 * Returns formatted pattern data to be included in soul signature
 */
export async function getPatternDataForSoulSignature(userId) {
  try {
    const patterns = await getHighConfidencePatterns(userId);
    const insights = await getUserInsights(userId, { minConfidence: 70 });

    return {
      patterns: patterns.map(pattern => ({
        id: pattern.id,
        name: pattern.pattern_name,
        type: pattern.pattern_type,
        confidence: pattern.confidence_score,
        trigger: pattern.trigger_keywords,
        behavior: {
          platform: pattern.response_platform,
          activity: pattern.response_type
        },
        timing: pattern.time_offset_minutes,
        frequency: pattern.occurrence_count
      })),
      insights: insights.map(insight => ({
        id: insight.id,
        title: insight.title,
        description: insight.description,
        confidence: insight.confidence,
        suggestions: insight.suggestions
      })),
      summary: {
        totalPatterns: patterns.length,
        totalInsights: insights.length,
        topPattern: patterns[0] ? {
          name: patterns[0].pattern_name,
          confidence: patterns[0].confidence_score
        } : null
      }
    };

  } catch (error) {
    console.error('❌ [Soul Pattern Integration] Error getting pattern data:', error);
    return {
      patterns: [],
      insights: [],
      summary: { totalPatterns: 0, totalInsights: 0 }
    };
  }
}

/**
 * Enable pattern tracking for a user
 */
export async function enablePatternTracking(userId) {
  try {
    const { error } = await supabase
      .from('users')
      .update({ pattern_tracking_enabled: true })
      .eq('id', userId);

    if (error) throw error;

    console.log(`✅ [Soul Pattern Integration] Pattern tracking enabled for user ${userId}`);

    // Trigger initial detection
    const initialDetection = await integratePatternRecognition(userId);

    return {
      success: true,
      message: 'Pattern tracking enabled',
      initialDetection
    };

  } catch (error) {
    console.error('❌ [Soul Pattern Integration] Error enabling pattern tracking:', error);
    throw error;
  }
}

/**
 * Disable pattern tracking for a user
 */
export async function disablePatternTracking(userId) {
  try {
    const { error } = await supabase
      .from('users')
      .update({ pattern_tracking_enabled: false })
      .eq('id', userId);

    if (error) throw error;

    console.log(`✅ [Soul Pattern Integration] Pattern tracking disabled for user ${userId}`);

    return {
      success: true,
      message: 'Pattern tracking disabled'
    };

  } catch (error) {
    console.error('❌ [Soul Pattern Integration] Error disabling pattern tracking:', error);
    throw error;
  }
}

export default {
  integratePatternRecognition,
  getPatternDataForSoulSignature,
  enablePatternTracking,
  disablePatternTracking
};
