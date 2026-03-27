/**
 * Morning Briefing Service
 * ========================
 * Generates a personalized morning briefing for email delivery.
 * Uses TIER_ANALYSIS (DeepSeek) to compose a brief, personal message
 * from recent memories, platform connections, and proactive insights.
 *
 * Returns a structured briefing object suitable for the email template.
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';
import { scoreForInsightSelection } from './inSilicoEngine.js';

const log = createLogger('MorningBriefing');

const MIN_MEMORIES_FOR_FULL_BRIEFING = 5;

/**
 * Generate a personalized morning briefing for a user.
 *
 * @param {string} userId
 * @returns {Promise<{
 *   greeting: string,
 *   highlight: string,
 *   stats: { memoriesLearned: number, platformsConnected: number, insightsReady: number },
 *   cta: string,
 *   isGettingStarted: boolean
 * }>}
 */
export async function generateMorningBriefing(userId) {
  // Fetch all data in parallel to minimize wall time (Vercel cost rule)
  const [
    recentMemories,
    totalMemoryCount,
    platformConnections,
    pendingInsights,
    userName,
  ] = await Promise.all([
    fetchRecentMemories(userId),
    fetchTotalMemoryCount(userId),
    fetchPlatformConnections(userId),
    fetchPendingInsights(userId),
    fetchUserName(userId),
  ]);

  const firstName = userName || 'there';
  const memoriesLearned = totalMemoryCount;
  const platformsConnected = platformConnections.length;
  const insightsReady = pendingInsights.length;

  const stats = { memoriesLearned, platformsConnected, insightsReady };

  // Low-data users get a "getting started" briefing (no LLM call = free)
  if (memoriesLearned < MIN_MEMORIES_FOR_FULL_BRIEFING) {
    return {
      greeting: `Good morning, ${firstName}`,
      highlight: buildGettingStartedHighlight(platformsConnected),
      stats,
      cta: platformsConnected === 0 ? 'Connect a platform' : 'Chat with your twin',
      isGettingStarted: true,
    };
  }

  // Full briefing: use LLM to compose a personal highlight
  const highlight = await composeBriefingHighlight({
    recentMemories,
    platformConnections,
    pendingInsights,
    firstName,
    stats,
    userId,
  });

  return {
    greeting: `Good morning, ${firstName}`,
    highlight,
    stats,
    cta: 'Chat with your twin about what it\'s learning',
    isGettingStarted: false,
  };
}

/**
 * Check if a user has already received a briefing email in the last 20 hours.
 * Uses the proactive_insights table with category 'briefing_email'.
 */
export async function hasRecentBriefingEmail(userId) {
  const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from('proactive_insights')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('category', 'briefing_email')
    .gte('created_at', cutoff);

  return (count || 0) > 0;
}

/**
 * Record that a briefing email was sent (for cooldown tracking).
 */
export async function recordBriefingEmailSent(userId) {
  await supabaseAdmin
    .from('proactive_insights')
    .insert({
      user_id: userId,
      insight: 'Morning briefing email sent',
      urgency: 'low',
      category: 'briefing_email',
      delivered: true,
    });
}

// ── Internal helpers ─────────────────────────────────────────────────

async function fetchRecentMemories(userId) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabaseAdmin
    .from('user_memories')
    .select('content, memory_type, importance_score, metadata')
    .eq('user_id', userId)
    .in('memory_type', ['platform_data', 'reflection', 'observation'])
    .gte('created_at', dayAgo)
    .order('importance_score', { ascending: false })
    .limit(20);

  return data || [];
}

async function fetchTotalMemoryCount(userId) {
  const { count } = await supabaseAdmin
    .from('user_memories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  return count || 0;
}

async function fetchPlatformConnections(userId) {
  const { data } = await supabaseAdmin
    .from('platform_connections')
    .select('platform, status')
    .eq('user_id', userId)
    .eq('status', 'connected');

  return data || [];
}

async function fetchPendingInsights(userId) {
  const { data } = await supabaseAdmin
    .from('proactive_insights')
    .select('id, insight, category')
    .eq('user_id', userId)
    .eq('delivered', false)
    .neq('category', 'briefing_email')
    .limit(10);

  return data || [];
}

async function fetchUserName(userId) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('first_name')
    .eq('id', userId)
    .single();

  return data?.first_name || null;
}

function buildGettingStartedHighlight(platformsConnected) {
  if (platformsConnected === 0) {
    return 'Your twin is still learning about you. Connect Spotify or YouTube to give it something to work with.';
  }
  return 'Your twin is building its first impressions. Chat with it to help it understand you better.';
}

async function composeBriefingHighlight({ recentMemories, platformConnections, pendingInsights, firstName, stats, userId }) {
  // In-silico ranking: select memories that resonate most with personality axes (TRIBE v2)
  let rankedMemories = recentMemories;
  try {
    if (recentMemories.length > 3) {
      const scored = await scoreForInsightSelection(
        userId,
        recentMemories.map(m => m.content.slice(0, 150))
      );
      if (scored.length > 0 && scored[0]?.engagement_score != null) {
        // Reorder memories by predicted engagement
        const scoreMap = new Map(scored.map(s => [s.text, s.engagement_score]));
        rankedMemories = [...recentMemories].sort((a, b) => {
          const sa = scoreMap.get(a.content.slice(0, 150)) ?? 0;
          const sb = scoreMap.get(b.content.slice(0, 150)) ?? 0;
          return sb - sa;
        });
        log.info('In-silico ranked briefing memories', { userId, topScore: scored[0]?.engagement_score?.toFixed(3) });
      }
    }
  } catch (err) {
    log.warn('In-silico ranking skipped for briefing', { error: err.message });
  }

  const memorySnippets = rankedMemories
    .slice(0, 10)
    .map(m => `[${m.memory_type}] ${m.content.slice(0, 150)}`)
    .join('\n');

  const platforms = platformConnections.map(p => p.platform).join(', ');

  const insightSnippets = pendingInsights
    .slice(0, 3)
    .map(i => i.insight.slice(0, 150))
    .join('\n');

  const prompt = `You are composing a one-sentence morning briefing highlight for ${firstName}'s daily email.
You are their digital twin — a perceptive close friend who notices patterns.

RECENT OBSERVATIONS (last 24h):
${memorySnippets || 'No recent observations'}

CONNECTED PLATFORMS: ${platforms || 'None'}

PENDING INSIGHTS:
${insightSnippets || 'None yet'}

STATS: ${stats.memoriesLearned} memories learned, ${stats.platformsConnected} platforms connected, ${stats.insightsReady} insights ready.

Write ONE compelling sentence (max 120 chars) that highlights the most interesting thing you noticed.
Be specific and personal — reference actual data when possible.
Don't start with "I noticed" — be creative. Write as a perceptive friend, not a report.
Return ONLY the sentence, nothing else.`;

  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 80,
      temperature: 0.7,
      serviceName: 'morning-briefing-email',
    });

    const text = (result?.content || '').trim();
    if (text && text.length > 10) return text;
  } catch (err) {
    log.warn('LLM briefing highlight failed, using fallback', { error: err.message });
  }

  // Fallback: no LLM call needed
  if (stats.insightsReady > 0) {
    return `Your twin has ${stats.insightsReady} new insight${stats.insightsReady > 1 ? 's' : ''} ready for you based on recent activity.`;
  }
  return `Your twin has learned ${stats.memoriesLearned} things about you so far. See what it\'s picked up.`;
}
