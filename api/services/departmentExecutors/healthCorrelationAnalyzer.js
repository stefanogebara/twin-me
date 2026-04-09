/**
 * Health Correlation Analyzer
 * Cross-correlates Whoop health data with calendar/activity patterns
 * to surface actionable lifestyle insights.
 *
 * Cost: TIER_EXTRACTION (cheapest). Cooldown: 24h (enforced by caller).
 */

import { complete, TIER_EXTRACTION } from '../llmGateway.js';
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('HealthCorrelation');

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_OBS = 30;
const LLM_OBS_LIMIT = 15;

/**
 * Analyze correlations between Whoop health data and calendar patterns.
 *
 * @param {string} userId
 * @returns {Promise<{ correlations: Array, insufficient_data: boolean }>}
 */
export async function analyzeHealthPatterns(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const twoWeeksAgo = new Date(Date.now() - TWO_WEEKS_MS).toISOString();

  // 1. Fetch Whoop health observations + calendar observations in parallel
  const [healthResult, calResult] = await Promise.all([
    supabaseAdmin
      .from('user_memories')
      .select('content, created_at')
      .eq('user_id', userId)
      .in('memory_type', ['observation', 'platform_data'])
      .or('content.ilike.%recovery%,content.ilike.%strain%,content.ilike.%sleep%,content.ilike.%hrv%')
      .gte('created_at', twoWeeksAgo)
      .order('created_at', { ascending: false })
      .limit(MAX_OBS),
    supabaseAdmin
      .from('user_memories')
      .select('content, created_at')
      .eq('user_id', userId)
      .in('memory_type', ['observation', 'platform_data'])
      .or('content.ilike.%calendar%,content.ilike.%meeting%,content.ilike.%event%,content.ilike.%schedule%')
      .gte('created_at', twoWeeksAgo)
      .order('created_at', { ascending: false })
      .limit(MAX_OBS),
  ]);

  const healthObs = healthResult.data;
  const calObs = calResult.data;

  if (!healthObs?.length || !calObs?.length) {
    log.debug('Insufficient data for health correlation', {
      userId,
      healthCount: healthObs?.length || 0,
      calCount: calObs?.length || 0,
    });
    return { correlations: [], insufficient_data: true };
  }

  // 2. Build LLM prompt with capped observation counts
  const healthText = healthObs
    .slice(0, LLM_OBS_LIMIT)
    .map(o => `[${new Date(o.created_at).toLocaleDateString()}] ${o.content}`)
    .join('\n');

  const calText = calObs
    .slice(0, LLM_OBS_LIMIT)
    .map(o => `[${new Date(o.created_at).toLocaleDateString()}] ${o.content}`)
    .join('\n');

  const prompt = `Analyze the correlation between this user's health data and calendar/schedule data over the past 2 weeks.

HEALTH DATA (Whoop):
${healthText}

CALENDAR/SCHEDULE DATA:
${calText}

Find 1-3 specific, actionable correlations. Only report patterns with clear evidence (appearing 2+ times in the data). Return JSON:
[
  {
    "pattern": "Brief description of the correlation",
    "evidence": "Specific data points that support it",
    "recommendation": "What the user should do differently",
    "departments": ["health", "scheduling"]
  }
]

If no clear patterns exist, return [].`;

  try {
    const response = await complete({
      messages: [{ role: 'user', content: prompt }],
      tier: TIER_EXTRACTION,
      maxTokens: 400,
      temperature: 0.3,
      userId,
      serviceName: 'health-correlation-analysis',
    });

    const text = response?.content || '';
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) {
      log.debug('No correlations found in LLM response', { userId, textLen: text.length });
      return { correlations: [], insufficient_data: false };
    }

    const cleaned = match[0]
      .replace(/,\s*([}\]])/g, '$1')  // trailing commas
      .replace(/'/g, '"');             // single quotes

    const correlations = JSON.parse(cleaned);

    log.info('Health correlations analyzed', {
      userId,
      count: correlations.length,
      healthObs: healthObs.length,
      calObs: calObs.length,
    });

    return { correlations, insufficient_data: false };
  } catch (err) {
    log.warn('Health correlation analysis failed', { userId, error: err.message });
    return { correlations: [], insufficient_data: false };
  }
}
