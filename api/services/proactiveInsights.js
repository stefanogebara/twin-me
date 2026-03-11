/**
 * Proactive Insight Generation Service
 * =====================================
 * TwinMe's equivalent of the Generative Agents "Planning" system.
 * Instead of planning daily schedules, the twin generates proactive insights
 * it can share when the user next chats.
 *
 * Examples:
 *   - "I noticed your recovery has been trending down for 3 days straight"
 *   - "You've been listening to a lot of ambient music lately - usually that means you're in deep focus mode"
 *   - "Your calendar is packed this week but your recovery is only 45% - might want to find some downtime"
 *
 * Architecture:
 *   1. After observation ingestion, generateProactiveInsights() is called
 *   2. It pulls recent memories + reflections from the memory stream
 *   3. An LLM generates 1-3 conversational insights
 *   4. Insights are stored in `proactive_insights` table
 *   5. When twin-chat builds context, undelivered insights are injected
 *   6. After the twin responds, insights are marked as delivered
 */

import { getRecentMemories, retrieveMemories } from './memoryStreamService.js';
import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { sendPushToUser } from './pushNotificationService.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('ProactiveInsights');

const INSIGHT_GENERATION_PROMPT = `You MUST generate exactly 2-3 insights as a JSON array. The FIRST insight MUST have category "nudge" with a nudge_action field.

A "nudge" is a specific, casual micro-action suggestion based on the person's data (e.g., "take a 10-min walk after lunch", "try that album you saved last week", "block 30 min of focus time tomorrow"). It should feel like a friend's offhand suggestion, NOT a prescription.

The remaining 1-2 insights can be any of: trend, anomaly, celebration, concern, goal_progress, goal_suggestion.

Focus on:
- Cross-platform patterns (music + health + schedule connections)
- Trends (things getting better or worse over time)
- Anomalies (unusual behavior compared to their patterns)
- Supportive observations (celebrating wins, flagging burnout)
- Goal progress (celebrate streaks or encourage when falling behind)

TONE RULES — this is critical:
- Write like a close friend texting, NOT a wellness app or doctor
- Max 1-2 short sentences per insight. No bullet points, no headers.
- Zero jargon: no "cortisol", "HRV variability", "cognitive load", "biometrics", "longitudinal patterns"
- Use plain words: "you seem tired" not "recovery metrics indicate fatigue"

Good nudge examples:
  {"insight": "you've been grinding pretty hard — might be worth taking an actual break this weekend", "urgency": "medium", "category": "nudge", "nudge_action": "block 2 hours this Saturday with nothing scheduled"}
  {"insight": "noticed you haven't listened to much music lately — that usually means you're in your head", "urgency": "low", "category": "nudge", "nudge_action": "put on your comfort playlist during lunch today"}

Good non-nudge examples:
  {"insight": "you keep going back to that same playlist when your weeks get busy — comfort music?", "urgency": "low", "category": "trend"}
  {"insight": "your sleep has been all over the place lately, guessing things are hectic?", "urgency": "medium", "category": "concern"}

Recent observations:
{observations}

Known patterns:
{reflections}

Return ONLY a JSON array. First element MUST be a nudge with nudge_action:
[{"insight": "...", "urgency": "low|medium|high", "category": "nudge", "nudge_action": "specific action"}, ...]`;

/**
 * Check if a similar insight was already generated in the last 7 days.
 * Uses 80-char prefix match to catch near-duplicates without embeddings.
 */
async function isInsightDuplicate(userId, insightText) {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabaseAdmin
      .from('proactive_insights')
      .select('insight')
      .eq('user_id', userId)
      .eq('delivered', false)
      .gte('created_at', since)
      .limit(50);
    if (!data?.length) return false;
    const snippet = insightText.substring(0, 80).toLowerCase();
    return data.some(r => (r.insight || '').substring(0, 80).toLowerCase() === snippet);
  } catch (err) {
    log.warn('isInsightDuplicate error', { error: err });
    return false; // fail open
  }
}

/**
 * Generate proactive insights for a user from recent memories and reflections.
 * Called after observation ingestion completes.
 */
async function generateProactiveInsights(userId) {
  try {
    // 0. Cleanup delivered insights older than 30 days to keep the table lean
    supabaseAdmin
      .from('proactive_insights')
      .delete()
      .eq('user_id', userId)
      .eq('delivered', true)
      .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .then(({ error }) => {
        if (error) log.warn('Cleanup error', { error });
      });

    // 1. Fetch 200 memories to find enough platform signals (reflections dominate recent stream ~90%)
    const recentMemories = await getRecentMemories(userId, 200);
    if (recentMemories.length < 3) {
      log.info('Not enough memories for insights', { count: recentMemories.length });
      return 0;
    }

    // 2. Get reflections for context (recent weights: recency dominant for trend detection)
    const reflections = await retrieveMemories(userId, "patterns and trends in recent behavior", 10, 'recent');

    // 3. Format for LLM — explicitly separate signals from reflections
    // GUM Task 4: Filter out low-confidence memories (< 0.30) before LLM call
    const GUM_MIN_INSIGHT_CONFIDENCE = 0.30;

    const signalMemories = recentMemories
      .filter(m => (m.memory_type === 'platform_data' || m.memory_type === 'observation' || m.memory_type === 'fact')
        && (m.confidence ?? 0.7) >= GUM_MIN_INSIGHT_CONFIDENCE);

    const observations = signalMemories
      .slice(0, 30)
      .map(m => {
        const uncertain = (m.confidence ?? 0.7) < 0.50 ? ' [uncertain]' : '';
        return `- ${m.content.substring(0, 200)}${uncertain}`;
      })
      .join('\n');

    const reflectionText = reflections
      .filter(m => m.memory_type === 'reflection' && (m.confidence ?? 0.7) >= GUM_MIN_INSIGHT_CONFIDENCE)
      .slice(0, 5)
      .map(m => {
        const uncertain = (m.confidence ?? 0.7) < 0.50 ? ' [uncertain]' : '';
        return `- ${m.content.substring(0, 200)}${uncertain}`;
      })
      .join('\n') || 'No reflections yet.';

    // 4. Generate insights via LLM
    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{
        role: 'user',
        content: INSIGHT_GENERATION_PROMPT
          .replace('{observations}', observations)
          .replace('{reflections}', reflectionText),
      }],
      maxTokens: 500,
      temperature: 0.6,
      serviceName: 'proactiveInsights-generate',
    });

    const text = (result.content || '').trim();

    // Parse JSON response — robust extraction for various LLM output formats
    let insights;
    try {
      insights = _parseInsightsJSON(text);
    } catch (parseError) {
      log.warn('Failed to parse LLM response', { rawPreview: text.substring(0, 200) });
      return 0;
    }

    if (!Array.isArray(insights) || insights.length === 0) {
      return 0;
    }

    // 4b. Post-parse nudge enforcement: if no nudge category, promote the most actionable insight
    const hasNudge = insights.some(i => i.category === 'nudge');
    if (!hasNudge && insights.length > 0) {
      // Find the most actionable-sounding insight (has nudge_action, or contains action verbs)
      const actionableIdx = insights.findIndex(i => i.nudge_action);
      if (actionableIdx >= 0) {
        insights[actionableIdx] = { ...insights[actionableIdx], category: 'nudge' };
      } else {
        // Promote the first insight to nudge — extract a simple action from the insight text
        const first = insights[0];
        insights[0] = {
          ...first,
          category: 'nudge',
          nudge_action: first.nudge_action || _extractActionFromInsight(first.insight),
        };
      }
      log.info('No nudge from LLM, promoted one insight to nudge category');
    }

    // 5. Store insights (max 3), with dedup against recent undelivered
    let stored = 0;
    for (const item of insights.slice(0, 3)) {
      if (!item.insight || item.insight.length < 10) continue;

      if (await isInsightDuplicate(userId, item.insight)) continue;

      const validCategories = ['trend', 'anomaly', 'celebration', 'concern', 'goal_progress', 'goal_suggestion', 'nudge'];
      const insertData = {
        user_id: userId,
        insight: item.insight.substring(0, 500),
        urgency: ['low', 'medium', 'high'].includes(item.urgency) ? item.urgency : 'low',
        category: validCategories.includes(item.category) ? item.category : null,
      };
      // Populate nudge_action when category is 'nudge'
      if (item.category === 'nudge' && item.nudge_action) {
        insertData.nudge_action = item.nudge_action.substring(0, 300);
      }
      const { error } = await supabaseAdmin
        .from('proactive_insights')
        .insert(insertData);

      if (!error) {
        stored++;
        // Push high-urgency insights immediately — don't wait for next chat open
        if (item.urgency === 'high') {
          sendPushToUser(userId, {
            title: 'Your twin noticed something',
            body: item.insight.substring(0, 120),
            data: { type: 'proactive_insight', category: item.category ?? 'trend' },
          }).catch((err) =>
            log.warn('Push failed', { error: err })
          );
        }
      } else {
        log.warn('Failed to store insight', { error });
      }
    }

    log.info('Generated insights', { stored, userId });

    // Weekly cross-platform correlation insights
    // Only run if no 'trend' category insight exists in the last 7 days
    try {
      const { count: trendCount } = await supabaseAdmin
        .from('proactive_insights')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('category', 'trend')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (!trendCount || trendCount === 0) {
        const correlations = await generateCorrelationInsights(userId);
        if (correlations?.length) {
          for (const item of correlations) {
            if (!item.insight || item.insight.length < 10) continue;
            if (await isInsightDuplicate(userId, item.insight)) continue;
            await supabaseAdmin.from('proactive_insights').insert({
              user_id: userId,
              insight: item.insight.substring(0, 500),
              urgency: 'low',
              category: 'trend',
            });
            log.info('Stored correlation insight', { userId });
          }
        }
      }
    } catch (corrErr) {
      // Non-fatal — don't let correlation errors fail the whole function
      log.warn('Correlation insights error', { error: corrErr });
    }

    return stored;
  } catch (error) {
    log.error('Error generating insights', { error });
    return 0;
  }
}

/**
 * Get undelivered proactive insights for a user.
 * Called by twin-chat when building context.
 *
 * Note: Supabase doesn't natively sort enums by custom order, so we fetch
 * recent undelivered insights and sort in JS to put 'high' urgency first.
 */
async function getUndeliveredInsights(userId, limit = 3) {
  try {
    const { data, error } = await supabaseAdmin
      .from('proactive_insights')
      .select('id, insight, urgency, category, created_at')
      .eq('user_id', userId)
      .eq('delivered', false)
      .order('created_at', { ascending: false })
      .limit(limit * 2); // Fetch extra so we can re-sort by urgency

    if (error || !data) return [];

    // Sort by urgency (high > medium > low), then by recency
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    const sorted = data.sort((a, b) => {
      const urgDiff = (urgencyOrder[a.urgency] || 2) - (urgencyOrder[b.urgency] || 2);
      if (urgDiff !== 0) return urgDiff;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return sorted.slice(0, limit);
  } catch (err) {
    log.warn('getUndeliveredInsights error', { error: err });
    return [];
  }
}

/**
 * Mark insights as delivered after they've been included in a twin chat response.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function markInsightsDelivered(insightIds) {
  if (!Array.isArray(insightIds) || insightIds.length === 0) return;

  // Validate all IDs are UUIDs before updating to prevent unexpected writes
  const validIds = insightIds.filter(id => typeof id === 'string' && UUID_RE.test(id));
  if (validIds.length === 0) return;
  if (validIds.length !== insightIds.length) {
    log.warn('markInsightsDelivered: invalid IDs filtered out', { filteredCount: insightIds.length - validIds.length });
  }
  const safeIds = validIds;

  const { error: deliveredErr } = await supabaseAdmin
    .from('proactive_insights')
    .update({ delivered: true, delivered_at: new Date().toISOString() })
    .in('id', safeIds);

  if (deliveredErr) {
    log.warn('Failed to mark delivered', { error: deliveredErr });
  }
}

/**
 * Robustly extract a JSON array of insights from LLM output.
 * Handles: markdown code blocks, text before/after JSON, nested objects,
 * trailing commas, and single-object (non-array) responses.
 *
 * @param {string} text - Raw LLM output
 * @returns {Array} Parsed insights array
 * @throws {Error} If no valid JSON array can be extracted
 */
function _parseInsightsJSON(text) {
  // Strategy 1: Direct parse (cleanest case)
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && parsed.insight) return [parsed];
  } catch { /* continue */ }

  // Strategy 2: Strip markdown code block wrappers
  const stripped = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  try {
    const parsed = JSON.parse(stripped);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && parsed.insight) return [parsed];
  } catch { /* continue */ }

  // Strategy 3: Find first [ ... ] bracket pair in the text
  const bracketStart = text.indexOf('[');
  const bracketEnd = text.lastIndexOf(']');
  if (bracketStart !== -1 && bracketEnd > bracketStart) {
    const jsonCandidate = text.substring(bracketStart, bracketEnd + 1);
    try {
      const parsed = JSON.parse(jsonCandidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Strategy 3b: Try fixing trailing commas (common LLM mistake)
      const fixed = jsonCandidate.replace(/,\s*([}\]])/g, '$1');
      try {
        const parsed = JSON.parse(fixed);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* continue */ }
    }
  }

  // Strategy 4: Find first { ... } (single object response)
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    const objCandidate = text.substring(braceStart, braceEnd + 1);
    try {
      const parsed = JSON.parse(objCandidate);
      if (parsed && typeof parsed === 'object' && parsed.insight) return [parsed];
    } catch { /* continue */ }
  }

  throw new Error('No valid JSON insights found in LLM response');
}

/**
 * Generate cross-platform behavioral correlation insights.
 * Looks for non-obvious patterns that span multiple data sources
 * (e.g. "packed calendar days → Spotify shifts to lo-fi → Whoop recovery drops").
 * Called weekly from generateProactiveInsights to avoid over-generating.
 *
 * @param {string} userId
 * @returns {Promise<Array<{insight: string, urgency: string, category: string}> | null>}
 */
async function generateCorrelationInsights(userId) {
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: platformMemories } = await supabaseAdmin
      .from('user_memories')
      .select('content, metadata, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(60);

    if (!platformMemories || platformMemories.length < 5) return null;

    // Group memories by their originating platform source
    const bySource = {};
    for (const m of platformMemories) {
      const src = m.metadata?.source || 'unknown';
      if (!bySource[src]) bySource[src] = [];
      bySource[src].push(m.content);
    }

    const sources = Object.keys(bySource);
    if (sources.length < 2) return null;

    const sourceText = sources
      .map((s) => `[${s.toUpperCase()}]\n${bySource[s].slice(0, 5).join('\n')}`)
      .join('\n\n');

    const result = await complete({
      tier: TIER_ANALYSIS,
      system: `You analyze cross-platform behavioral correlations for a personal AI twin.
Look for genuine patterns that span multiple data sources.
Surface specific, non-obvious connections. Be concrete with observed data.
Example: "When your calendar shows 3+ back-to-back meetings, your Spotify shifts to ambient/lo-fi within the same day."
Output ONLY a JSON array of 1-2 correlation insights: [{"insight": "...", "urgency": "low", "category": "trend"}]
No other text.`,
      messages: [{ role: 'user', content: `Find cross-platform patterns in this behavioral data:\n\n${sourceText}` }],
      maxTokens: 300,
      temperature: 0.4,
      serviceName: 'correlationInsights-generate',
    });

    const text = (result.content || '').trim();
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']') + 1;
    if (start === -1 || end <= start) return null;

    const parsed = JSON.parse(text.slice(start, end));
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    log.warn('generateCorrelationInsights error', { error: err });
    return null;
  }
}

// ── Embodied Feedback Loop: Nudge Evaluation ────────────────────────────────

/**
 * Evaluate delivered nudges by scanning recent platform_data memories for evidence.
 * Finds nudges delivered 12-48h ago with null nudge_followed, checks if recent
 * platform data contains keywords from the nudge_action.
 *
 * Called fire-and-forget from observationIngestion after platform data ingest.
 *
 * @param {string} userId
 * @returns {Promise<number>} Number of nudges evaluated
 */
async function evaluateNudgeOutcomes(userId) {
  try {
    const now = Date.now();
    const twelveHoursAgo = new Date(now - 12 * 60 * 60 * 1000).toISOString();
    const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000).toISOString();

    // Find delivered nudges in the 12-48h window that haven't been evaluated
    const { data: pendingNudges, error: fetchErr } = await supabaseAdmin
      .from('proactive_insights')
      .select('id, nudge_action, delivered_at, insight')
      .eq('user_id', userId)
      .eq('category', 'nudge')
      .eq('delivered', true)
      .is('nudge_followed', null)
      .gte('delivered_at', fortyEightHoursAgo)
      .lte('delivered_at', twelveHoursAgo)
      .limit(10);

    if (fetchErr || !pendingNudges?.length) return 0;

    // Fetch recent platform_data memories (last 48h) to scan for evidence
    const { data: recentData } = await supabaseAdmin
      .from('user_memories')
      .select('content')
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .gte('created_at', fortyEightHoursAgo)
      .order('created_at', { ascending: false })
      .limit(50);

    const recentText = (recentData || []).map(m => m.content.toLowerCase()).join(' ');

    let evaluated = 0;
    for (const nudge of pendingNudges) {
      if (!nudge.nudge_action) {
        // No action to evaluate — mark as checked but unknown
        await supabaseAdmin
          .from('proactive_insights')
          .update({ nudge_checked_at: new Date().toISOString() })
          .eq('id', nudge.id);
        evaluated++;
        continue;
      }

      // Extract keywords from the nudge action for evidence matching
      const actionWords = nudge.nudge_action.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3) // skip short words
        .filter(w => !['take', 'try', 'your', 'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'been', 'will', 'could', 'should', 'would', 'might'].includes(w));

      // Count keyword overlap between nudge action and recent platform data
      const matchCount = actionWords.filter(w => recentText.includes(w)).length;
      const matchRatio = actionWords.length > 0 ? matchCount / actionWords.length : 0;

      // If >= 40% of action keywords appear in recent data, consider it followed
      const followed = matchRatio >= 0.4;
      const outcome = followed
        ? `Evidence found: ${matchCount}/${actionWords.length} keywords matched in recent activity`
        : `No clear evidence: ${matchCount}/${actionWords.length} keywords matched`;

      await supabaseAdmin
        .from('proactive_insights')
        .update({
          nudge_followed: followed,
          nudge_outcome: outcome.substring(0, 500),
          nudge_checked_at: new Date().toISOString(),
        })
        .eq('id', nudge.id);

      evaluated++;
    }

    if (evaluated > 0) {
      log.info('Evaluated nudge outcomes', { evaluated, userId });
    }
    return evaluated;
  } catch (err) {
    log.warn('evaluateNudgeOutcomes error', { error: err });
    return 0;
  }
}

/**
 * Get recent evaluated nudge history for chat context injection.
 * Returns nudges with their outcomes so the twin can reference past suggestions.
 *
 * @param {string} userId
 * @param {number} [limit=5]
 * @returns {Promise<Array<{insight: string, nudge_action: string, nudge_followed: boolean, nudge_outcome: string, delivered_at: string}>>}
 */
async function getNudgeHistory(userId, limit = 5) {
  try {
    const { data, error } = await supabaseAdmin
      .from('proactive_insights')
      .select('insight, nudge_action, nudge_followed, nudge_outcome, delivered_at')
      .eq('user_id', userId)
      .eq('category', 'nudge')
      .eq('delivered', true)
      .not('nudge_checked_at', 'is', null)
      .order('delivered_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data;
  } catch (err) {
    log.warn('getNudgeHistory error', { error: err });
    return [];
  }
}

/**
 * Calculate nudge effectiveness score: ratio of followed nudges to total evaluated.
 * Returns a score between 0 and 1, or null if insufficient data.
 *
 * @param {string} userId
 * @returns {Promise<{score: number|null, followed: number, total: number}>}
 */
async function getNudgeEffectivenessScore(userId) {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('proactive_insights')
      .select('nudge_followed')
      .eq('user_id', userId)
      .eq('category', 'nudge')
      .not('nudge_checked_at', 'is', null)
      .gte('delivered_at', thirtyDaysAgo);

    if (error || !data?.length) return { score: null, followed: 0, total: 0 };

    const total = data.length;
    const followed = data.filter(d => d.nudge_followed === true).length;
    const score = total >= 3 ? Math.round((followed / total) * 100) / 100 : null; // Need 3+ for meaningful ratio

    return { score, followed, total };
  } catch (err) {
    log.warn('getNudgeEffectivenessScore error', { error: err });
    return { score: null, followed: 0, total: 0 };
  }
}

/**
 * Best-effort extraction of an actionable suggestion from an insight string.
 * Used as fallback when the LLM fails to provide a nudge_action field.
 *
 * @param {string} insight
 * @returns {string} A simple action suggestion derived from the insight
 */
function _extractActionFromInsight(insight) {
  if (!insight) return 'take a short break today';
  const lower = insight.toLowerCase();
  if (lower.includes('sleep') || lower.includes('tired') || lower.includes('rest')) {
    return 'try getting to bed 30 minutes earlier tonight';
  }
  if (lower.includes('busy') || lower.includes('meeting') || lower.includes('packed')) {
    return 'block 30 min of free time on your calendar tomorrow';
  }
  if (lower.includes('music') || lower.includes('playlist') || lower.includes('listen')) {
    return 'put on your favorite playlist during your next break';
  }
  if (lower.includes('exercise') || lower.includes('move') || lower.includes('walk')) {
    return 'take a 10-minute walk after your next meal';
  }
  if (lower.includes('stress') || lower.includes('overwhelm') || lower.includes('anxious')) {
    return 'take 5 deep breaths right now — seriously, it helps';
  }
  return 'take a short break and do something you enjoy today';
}

export {
  generateProactiveInsights,
  getUndeliveredInsights,
  markInsightsDelivered,
  evaluateNudgeOutcomes,
  getNudgeHistory,
  getNudgeEffectivenessScore,
};
