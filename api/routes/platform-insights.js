/**
 * Platform Insights API Routes
 *
 * Provides conversational twin reflections for each connected platform.
 * These are NOT stats dashboards - they're introspective observations
 * from your digital twin about what it has noticed.
 *
 * Endpoints:
 * GET  /api/insights/:platform              - Get reflection + patterns + history
 * POST /api/insights/:platform/refresh      - Force regenerate reflection
 * POST /api/insights/proactive/:id/engage   - Mark a proactive insight as engaged
 * GET  /api/insights/proactive/engagement-stats - Engagement stats (last 30 days)
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import platformReflectionService from '../services/platformReflectionService.js';
import { supabaseAdmin } from '../services/database.js';
import { seedPatternFromInsight } from '../services/twinPatternService.js';
import { get as redisGet, set as redisSet } from '../services/redisClient.js';
import { createLogger } from '../services/logger.js';
import { generateProactiveInsights } from '../services/proactiveInsights.js';

const log = createLogger('PlatformInsights');

const router = express.Router();

// Redis cache key for insights summary
const SUMMARY_CACHE_KEY = (userId) => `insights_summary:${userId}`;
const SUMMARY_CACHE_TTL = 14400; // 4 hours in seconds

// Wrap a promise with a hard timeout — returns a timeout error if it exceeds the deadline
const INSIGHTS_TIMEOUT_MS = 20_000;
function withTimeout(promise, ms = INSIGHTS_TIMEOUT_MS) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Insights request timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// Valid platforms
const VALID_PLATFORMS = ['spotify', 'calendar', 'youtube', 'web', 'discord', 'linkedin'];

// Map URL platform names to database platform names
// Calendar is stored as 'google_calendar' in platform_connections
const PLATFORM_DB_NAMES = {
  'calendar': 'google_calendar',
  'gmail': 'google_gmail',
};

/**
 * GET /api/insights
 * Root handler — API discovery
 */
router.get('/', authenticateUser, async (req, res) => {
  res.json({ success: true, message: 'Insights API. Available endpoints vary by platform.' });
});

/**
 * GET /api/insights/all
 * Get reflections for all connected platforms at once
 * Useful for dashboard preview
 * NOTE: Must be registered BEFORE GET /:platform to avoid being shadowed.
 */
router.get('/all/summary', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  log.info('GET /all/summary', { userId });

  try {
    // 1. Check Redis cache first — instant response
    const cached = await redisGet(SUMMARY_CACHE_KEY(userId));
    if (cached) {
      log.info('Cache HIT for summary', { userId });
      return res.json({
        success: true,
        summary: cached,
        cached: true
      });
    }

    // 2. Cache miss — return "generating" immediately, don't block
    log.info('Cache MISS for summary - generating in background', { userId });
    res.json({
      success: true,
      summary: {
        spotify: { connected: false },
        calendar: { connected: false },
        youtube: { connected: false },
        web: { connected: false }
      },
      generating: true
    });

    // 3. Fire background generation (non-blocking — response already sent)
    generateAndCacheSummary(userId).catch(err =>
      log.error('Background summary generation failed', { userId, error: err })
    );
  } catch (error) {
    log.error('Summary error', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get insights summary',
      message: error.message
    });
  }
});

/**
 * Generate insights summary for all platforms and cache in Redis.
 * Called from the route handler (background) and from cron jobs (pre-warm).
 */
export async function generateAndCacheSummary(userId) {
  const platforms = ['spotify', 'calendar', 'youtube', 'web'];

  const results = await Promise.allSettled(
    platforms.map(p => withTimeout(platformReflectionService.getReflections(userId, p)))
  );

  const makeSummary = (result) =>
    result.status === 'fulfilled' && result.value.success
      ? { connected: true, preview: result.value.reflection?.text?.substring(0, 100) + '...' }
      : { connected: false };

  const summary = Object.fromEntries(
    platforms.map((p, i) => [p, makeSummary(results[i])])
  );

  // Cache result — longer TTL when we have data, shorter for empty to prevent miss storms
  const hasData = Object.values(summary).some(s => s.connected);
  const ttl = hasData ? SUMMARY_CACHE_TTL : 300; // 4h for real data, 5min for empty
  await redisSet(SUMMARY_CACHE_KEY(userId), summary, ttl);
  log.info('Cached summary', { userId, ttl, hasData });

  return summary;
}

/**
 * GET /api/insights/proactive/engagement-stats
 * Returns engagement breakdown by category and urgency for the last 30 days.
 * NOTE: Must be registered BEFORE GET /:platform to avoid being shadowed.
 */
router.get('/proactive/engagement-stats', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('proactive_insights')
    .select('category, urgency, engaged, delivered')
    .eq('user_id', userId)
    .gte('created_at', since);

  if (error) {
    log.error('engagement-stats error', { error });
    return res.status(500).json({ success: false, error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
  }

  const stats = { total: data?.length || 0, engaged: 0, byCategory: {}, byUrgency: {} };
  for (const row of (data || [])) {
    if (row.engaged) stats.engaged++;

    if (!stats.byCategory[row.category]) {
      stats.byCategory[row.category] = { total: 0, engaged: 0 };
    }
    stats.byCategory[row.category].total++;
    if (row.engaged) stats.byCategory[row.category].engaged++;

    if (!stats.byUrgency[row.urgency]) {
      stats.byUrgency[row.urgency] = { total: 0, engaged: 0 };
    }
    stats.byUrgency[row.urgency].total++;
    if (row.engaged) stats.byUrgency[row.urgency].engaged++;
  }

  res.json({ success: true, data: stats });
});

/**
 * GET /api/insights/proactive
 * Returns proactive insights for the authenticated user.
 * NOTE: Must be registered BEFORE GET /:platform to avoid being shadowed.
 */
router.get('/proactive', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const includeDelivered = req.query.include_delivered === 'true';

    const query = supabaseAdmin
      .from('proactive_insights')
      .select('id, insight, urgency, category, created_at, delivered, engaged, nudge_action, sources, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!includeDelivered) {
      query.eq('delivered', false);
    }

    // Filter out insights the user has already acted on (accepted/dismissed)
    // so they don't reappear in the feed after feedback.
    query.is('nudge_followed', null);

    const { data, error } = await query;

    if (error) {
      log.error('GET /proactive error', { error });
      return res.status(500).json({ success: false, error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
    }

    // Sort by urgency (high > medium > low), then by recency
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    const sorted = (data || []).sort((a, b) => {
      const urgDiff = (urgencyOrder[a.urgency] || 2) - (urgencyOrder[b.urgency] || 2);
      if (urgDiff !== 0) return urgDiff;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    res.json({ success: true, insights: sorted });
  } catch (error) {
    log.error('GET /proactive error', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch proactive insights' });
  }
});

/**
 * POST /api/insights/proactive/generate
 * On-demand proactive insight generation.
 *
 * Called by the onboarding flow immediately after a user connects their first
 * platform. The OAuth callback used to chain this inline, but the LLM call
 * takes ~40s which would blow the 60s Vercel maxDuration when combined with
 * extraction + ingestion. Moving it to a user-initiated request gives the
 * browser a spinner to show and avoids the timeout.
 *
 * Idempotent with a 10-minute window: if fresh insights already exist,
 * returns immediately without re-triggering the LLM. Prevents double-clicks,
 * accidental page refreshes, or retry-on-slow-network from duplicating cost.
 *
 * Must be registered BEFORE GET /:platform to avoid being shadowed.
 */
router.post('/proactive/generate', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  try {
    // Idempotency: skip regeneration if any insight was created in last 10 min.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: existing, error: checkErr } = await supabaseAdmin
      .from('proactive_insights')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', tenMinutesAgo)
      .limit(1);

    if (checkErr) {
      log.warn('Idempotency check failed, proceeding with generation', { error: checkErr.message });
    }

    if (existing && existing.length > 0) {
      log.info('Fresh insights exist, skipping regeneration', { userId });
      return res.json({ success: true, cached: true });
    }

    // ~40s LLM call. Client should show a spinner.
    await generateProactiveInsights(userId);
    log.info('On-demand insight generation complete', { userId });

    res.json({ success: true, cached: false });
  } catch (error) {
    log.error('POST /proactive/generate error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to generate insights' });
  }
});

/**
 * GET /api/insights/inbox
 * Returns the most recent email_triage insight (last 48h) with structured email metadata.
 * Unlike /proactive, this includes already-delivered insights so the in-app view
 * works even after WhatsApp delivery has marked the insight as delivered.
 */
router.get('/inbox', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from('proactive_insights')
      .select('id, insight, urgency, category, created_at, delivered, metadata')
      .eq('user_id', userId)
      .eq('category', 'email_triage')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ success: false, error: 'Failed to fetch inbox brief' });
    }

    return res.json({ success: true, brief: data || null });
  } catch (err) {
    log.error('GET /inbox error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch inbox brief' });
  }
});

/**
 * GET /api/insights/:platform
 * Get conversational reflections for a specific platform
 */
router.get('/:platform', authenticateUser, async (req, res) => {
  const { platform } = req.params;
  const userId = req.user.id;

  log.info('GET platform insights', { platform, userId });

  // Validate platform
  if (!VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({
      success: false,
      error: `Invalid platform: ${platform}. Valid platforms: ${VALID_PLATFORMS.join(', ')}`
    });
  }

  try {
    // Pre-check: verify platform is actually connected before calling reflection service
    // Map URL platform name to DB name (e.g. 'calendar' -> 'google_calendar')
    const dbPlatformName = PLATFORM_DB_NAMES[platform] || platform;

    const { data: connection, error: connErr } = await supabaseAdmin
      .from('platform_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', dbPlatformName)
      .single();
    if (connErr && connErr.code !== 'PGRST116') log.error('Connection fetch error', { error: connErr });

    if (!connection) {
      return res.json({
        success: true,
        platform,
        reflection: `You haven't connected ${platform} yet. Connect it to get personalized insights!`,
        notConnected: true
      });
    }

    const result = await withTimeout(platformReflectionService.getReflections(userId, platform));

    if (!result.success) {
      // Return a graceful response instead of 400 for downstream failures
      return res.json({
        success: true,
        platform,
        reflection: result.error || `Unable to generate ${platform} insights right now. Try again later.`,
        fallback: true
      });
    }

    res.json(result);
  } catch (error) {
    log.error('Platform insights error', { platform, error });
    const isTimeout = error.message?.includes('timed out');
    res.json({
      success: true,
      platform,
      reflection: isTimeout
        ? `Your ${platform} insights are taking longer than expected. Try refreshing in a moment.`
        : `Unable to generate ${platform} insights right now. Try again later.`,
      fallback: true
    });
  }
});

/**
 * POST /api/insights/:platform/refresh
 * Force regenerate a reflection (ignore cache)
 */
router.post('/:platform/refresh', authenticateUser, async (req, res) => {
  const { platform } = req.params;
  const userId = req.user.id;

  log.info('POST platform refresh', { platform, userId });

  // Validate platform
  if (!VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({
      success: false,
      error: `Invalid platform: ${platform}. Valid platforms: ${VALID_PLATFORMS.join(', ')}`
    });
  }

  try {
    const result = await withTimeout(platformReflectionService.refreshReflection(userId, platform));

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    log.error('Refresh error', { platform, error });
    const isTimeout = error.message?.includes('timed out');
    res.status(isTimeout ? 504 : 500).json({
      success: false,
      error: isTimeout ? 'Reflection generation timed out' : 'Failed to refresh reflection',
      message: error.message
    });
  }
});

/**
 * POST /api/insights/proactive/:id/engage
 * Mark a proactive insight as engaged (user tapped/expanded it).
 * Only the owning user can mark their own insight.
 */
router.post('/proactive/:id/engage', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const { error } = await supabaseAdmin
    .from('proactive_insights')
    .update({ engaged: true, engaged_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId); // security: user can only engage their own insights

  if (error) {
    log.error('Engage error', { id, error });
    return res.status(500).json({ success: false, error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
  }

  res.json({ success: true });

  // Non-blocking: seed an EWC++ topic_affinity pattern from the engaged insight
  // so the twin learns which topics the user finds interesting over time
  supabaseAdmin
    .from('proactive_insights')
    .select('content, category')
    .eq('id', id)
    .single()
    .then(({ data }) => {
      if (!data?.content) return;
      const patternName = data.category || 'engaged_insight';
      seedPatternFromInsight(userId, patternName, data.content)
        .catch(err => log.warn('Pattern seed failed', { error: err }));
    })
    .catch(() => {});
});

/**
 * POST /api/insights/:id/nudge-feedback
 * Records user feedback on a proactive insight/nudge.
 * Body: { followed: boolean, note?: string }
 *
 * Sets nudge_followed, nudge_outcome, and nudge_checked_at so the twin learns
 * from user reactions and so the card stays archived on subsequent reloads.
 * User can only update their own insights (enforced by .eq('user_id', userId)).
 */
router.post('/:id/nudge-feedback', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { followed, note } = req.body || {};

  if (typeof followed !== 'boolean') {
    return res.status(400).json({ success: false, error: 'followed must be boolean' });
  }

  const outcome = typeof note === 'string' && note.trim()
    ? `user_feedback: ${note.trim().slice(0, 480)}`
    : followed
      ? 'user_feedback: followed'
      : 'user_feedback: not_for_me';

  const { data, error } = await supabaseAdmin
    .from('proactive_insights')
    .update({
      nudge_followed: followed,
      nudge_outcome: outcome,
      nudge_checked_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId) // security: prevent cross-user writes
    .select('id')
    .maybeSingle();

  if (error) {
    log.error('Nudge feedback error', { id, error: error.message });
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }

  if (!data) {
    return res.status(404).json({ success: false, error: 'Insight not found' });
  }

  res.json({ success: true, followed });
});

export default router;
