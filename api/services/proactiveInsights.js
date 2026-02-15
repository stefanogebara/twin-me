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
import { supabaseAdmin } from './database.js';

const INSIGHT_GENERATION_PROMPT = `Based on these recent observations about a person, generate 1-3 proactive insights their digital twin should mention next time they chat. Focus on:
- Cross-platform patterns (music + health + schedule connections)
- Trends (things getting better or worse over time)
- Anomalies (unusual behavior compared to their patterns)
- Supportive observations (celebrating wins, flagging burnout)

Each insight should be conversational and feel like a friend noticing something, not a report.

Recent observations:
{observations}

Known patterns:
{reflections}

Return as JSON array: [{"insight": "...", "urgency": "low|medium|high", "category": "trend|anomaly|celebration|concern"}]
Only return the JSON array, no other text.`;

/**
 * Generate proactive insights for a user from recent memories and reflections.
 * Called after observation ingestion completes.
 */
async function generateProactiveInsights(userId) {
  try {
    // 1. Get recent memories (last ~50)
    const recentMemories = await getRecentMemories(userId, 50);
    if (recentMemories.length < 3) {
      console.log(`[ProactiveInsights] Not enough memories (${recentMemories.length}) for insights`);
      return 0;
    }

    // 2. Get reflections for context (recent weights: recency dominant for trend detection)
    const reflections = await retrieveMemories(userId, "patterns and trends in recent behavior", 10, 'recent');

    // 3. Format for LLM
    const observations = recentMemories
      .filter(m => m.memory_type !== 'reflection')
      .slice(0, 25)
      .map(m => `- ${m.content.substring(0, 200)}`)
      .join('\n');

    const reflectionText = reflections
      .filter(m => m.memory_type === 'reflection')
      .slice(0, 5)
      .map(m => `- ${m.content.substring(0, 200)}`)
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

    // Parse JSON response
    let insights;
    try {
      // Handle possible markdown code block wrapping
      const jsonStr = text.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
      insights = JSON.parse(jsonStr);
    } catch (parseError) {
      console.warn('[ProactiveInsights] Failed to parse LLM response:', text.substring(0, 100));
      return 0;
    }

    if (!Array.isArray(insights) || insights.length === 0) {
      return 0;
    }

    // 5. Store insights (max 3)
    let stored = 0;
    for (const item of insights.slice(0, 3)) {
      if (!item.insight || item.insight.length < 10) continue;

      const { error } = await supabaseAdmin
        .from('proactive_insights')
        .insert({
          user_id: userId,
          insight: item.insight.substring(0, 500),
          urgency: ['low', 'medium', 'high'].includes(item.urgency) ? item.urgency : 'low',
          category: item.category || null,
        });

      if (!error) {
        stored++;
      } else {
        console.warn('[ProactiveInsights] Failed to store insight:', error.message);
      }
    }

    console.log(`[ProactiveInsights] Generated ${stored} insights for user ${userId}`);
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
async function markInsightsDelivered(insightIds) {
  if (!insightIds || insightIds.length === 0) return;

  try {
    const { error } = await supabaseAdmin
      .from('proactive_insights')
      .update({ delivered: true, delivered_at: new Date().toISOString() })
      .in('id', insightIds);

    if (error) {
      console.warn('[ProactiveInsights] Failed to mark delivered:', error.message);
    }
  } catch (err) {
    console.warn('[ProactiveInsights] markDelivered error:', err.message);
  }
}

export { generateProactiveInsights, getUndeliveredInsights, markInsightsDelivered };
