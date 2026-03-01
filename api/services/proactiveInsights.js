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

const INSIGHT_GENERATION_PROMPT = `Based on these recent observations about a person, generate 1-3 proactive insights their digital twin should mention next time they chat. Focus on:
- Cross-platform patterns (music + health + schedule connections)
- Trends (things getting better or worse over time)
- Anomalies (unusual behavior compared to their patterns)
- Supportive observations (celebrating wins, flagging burnout)
- Goal progress (if active goals exist, celebrate streaks or encourage when falling behind)
- Goal suggestions (if patterns suggest a achievable goal the person could try)

Each insight should be conversational and feel like a friend noticing something, not a report.

Recent observations:
{observations}

Known patterns:
{reflections}

Return as JSON array: [{"insight": "...", "urgency": "low|medium|high", "category": "trend|anomaly|celebration|concern|goal_progress|goal_suggestion"}]
Only return the JSON array, no other text.`;

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
    console.warn('[ProactiveInsights] isInsightDuplicate error:', err.message);
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
        if (error) console.warn('[ProactiveInsights] Cleanup error:', error.message);
      });

    // 1. Fetch 200 memories to find enough platform signals (reflections dominate recent stream ~90%)
    const recentMemories = await getRecentMemories(userId, 200);
    if (recentMemories.length < 3) {
      console.log(`[ProactiveInsights] Not enough memories (${recentMemories.length}) for insights`);
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
      console.warn('[ProactiveInsights] Failed to parse LLM response:', text.substring(0, 200));
      return 0;
    }

    if (!Array.isArray(insights) || insights.length === 0) {
      return 0;
    }

    // 5. Store insights (max 3), with dedup against recent undelivered
    let stored = 0;
    for (const item of insights.slice(0, 3)) {
      if (!item.insight || item.insight.length < 10) continue;

      if (await isInsightDuplicate(userId, item.insight)) continue;

      const { error } = await supabaseAdmin
        .from('proactive_insights')
        .insert({
          user_id: userId,
          insight: item.insight.substring(0, 500),
          urgency: ['low', 'medium', 'high'].includes(item.urgency) ? item.urgency : 'low',
          category: ['trend', 'anomaly', 'celebration', 'concern', 'goal_progress', 'goal_suggestion'].includes(item.category) ? item.category : null,
        });

      if (!error) {
        stored++;
        // Push high-urgency insights immediately — don't wait for next chat open
        if (item.urgency === 'high') {
          sendPushToUser(userId, {
            title: 'Your twin noticed something',
            body: item.insight.substring(0, 120),
            data: { type: 'proactive_insight', category: item.category ?? 'trend' },
          }).catch((err) =>
            console.warn('[ProactiveInsights] Push failed:', err.message)
          );
        }
      } else {
        console.warn('[ProactiveInsights] Failed to store insight:', error.message);
      }
    }

    console.log(`[ProactiveInsights] Generated ${stored} insights for user ${userId}`);

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
            console.log(`[ProactiveInsights] Stored correlation insight for user ${userId}`);
          }
        }
      }
    } catch (corrErr) {
      // Non-fatal — don't let correlation errors fail the whole function
      console.warn('[ProactiveInsights] Correlation insights error:', corrErr.message);
    }

    return stored;
  } catch (error) {
    console.error('[ProactiveInsights] Error:', error.message);
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
    console.warn('[ProactiveInsights] getUndeliveredInsights error:', err.message);
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
    console.warn(`[ProactiveInsights] markInsightsDelivered: ${insightIds.length - validIds.length} invalid IDs filtered out`);
  }
  const safeIds = validIds;

  const { error: deliveredErr } = await supabaseAdmin
    .from('proactive_insights')
    .update({ delivered: true, delivered_at: new Date().toISOString() })
    .in('id', safeIds);

  if (deliveredErr) {
    console.warn('[ProactiveInsights] Failed to mark delivered:', deliveredErr.message);
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
    console.warn('[ProactiveInsights] generateCorrelationInsights error:', err.message);
    return null;
  }
}

export { generateProactiveInsights, getUndeliveredInsights, markInsightsDelivered };
