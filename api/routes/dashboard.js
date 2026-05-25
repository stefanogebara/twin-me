import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { authenticateUser } from '../middleware/auth.js';
import { get as cacheGet, set as cacheSet } from '../services/redisClient.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('Dashboard');

const router = express.Router();

const DASHBOARD_STATS_TTL = 300; // 5 minutes
const dashboardStatsCacheKey = (userId) => `dashboard_stats:${userId}`;

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics for the user
 * Optimized: parallel DB queries + Redis caching (5-min TTL)
 */
router.get('/stats', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check Redis cache first
    const cached = await cacheGet(dashboardStatsCacheKey(userId));
    if (cached) {
      return res.json({ success: true, stats: cached });
    }

    // Run all 5 DB queries in parallel.
    // Audit 2026-05-22: previously the soul-progress query hit
    // soul_signature_profile, which has had ZERO active writers since
    // 2026-02-10 (101 days stale for the test user). The progress bar
    // was therefore frozen on a 3-month-old number. Swapped to
    // soul_signatures.reveal_level — the LIVE source maintained by
    // the daily soul-signature-regen cron (now 7-day cadence per the
    // 1c57ff5a fix).
    const [platformsResult, dataPointsResult, soulProfileResult, lastSyncResult, modelResult] = await Promise.all([
      // 1. Connected platforms count
      supabaseAdmin
        .from('platform_connections')
        .select('platform', { count: 'exact' })
        .eq('user_id', userId)
        .eq('status', 'connected'),

      // 2. Total data points count (head-only, no row transfer)
      supabaseAdmin
        .from('user_platform_data')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),

      // 3. Soul signature progress — read from soul_signatures (the
      // live archetype/narrative table) rather than soul_signature_profile
      // (dead, 0 active writers since Feb 2026). reveal_level is a 0-100
      // progress metric the regen cron updates with each fresh narrative.
      supabaseAdmin
        .from('soul_signatures')
        .select('reveal_level')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // 4. Last sync time — .maybeSingle() so onboarded-but-not-connected users
      // don't trigger PGRST116 log noise (same M1 fix as digital_twins below).
      supabaseAdmin
        .from('platform_connections')
        .select('last_sync_at')
        .eq('user_id', userId)
        .eq('status', 'connected')
        .order('last_sync_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // 5. Training status (digital twin exists?)
      // audit-2026-05-25 (M1): .single() throws PGRST116 every time a user has
      // no twin yet — every onboarding session generated noisy error logs.
      // .maybeSingle() returns null without an error so logs stay quiet.
      supabaseAdmin
        .from('digital_twins')
        .select('id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle(),
    ]);

    // Process results
    if (platformsResult.error) {
      log.error('Error fetching platforms', { error: platformsResult.error });
    }
    if (dataPointsResult.error) {
      log.error('Error fetching data points', { error: dataPointsResult.error });
    }
    if (soulProfileResult.error && soulProfileResult.error.code !== 'PGRST116') {
      log.error('Error fetching soul signature profile', { error: soulProfileResult.error });
    }
    if (lastSyncResult.error && lastSyncResult.error.code !== 'PGRST116') {
      log.error('Error fetching last sync', { error: lastSyncResult.error });
    }
    if (modelResult.error && modelResult.error.code !== 'PGRST116') {
      log.error('Error fetching model status', { error: modelResult.error });
    }

    const connectedPlatforms = platformsResult.data?.length || 0;
    const totalDataPoints = dataPointsResult.count || 0;
    const soulProfile = soulProfileResult.data;
    const lastSync = lastSyncResult.data?.last_sync_at || new Date().toISOString();
    const trainingStatus = modelResult.data ? 'ready' : 'idle';

    // Calculate soul signature progress. reveal_level is already a
    // 0-100 integer maintained by soul-signature-regen. Fall back to
    // a coarse "1 point per connected platform up to 5" if the user
    // has no signature yet (first-time onboarding state).
    let soulSignatureProgress = 0;
    if (typeof soulProfile?.reveal_level === 'number') {
      soulSignatureProgress = Math.min(100, Math.max(0, soulProfile.reveal_level));
    } else if (connectedPlatforms > 0) {
      soulSignatureProgress = Math.min((connectedPlatforms / 5) * 100, 100);
    }

    const stats = {
      connectedPlatforms,
      totalDataPoints,
      soulSignatureProgress: Math.round(soulSignatureProgress),
      lastSync,
      trainingStatus,
    };

    // Cache in Redis (fire-and-forget, don't block response)
    cacheSet(dashboardStatsCacheKey(userId), stats, DASHBOARD_STATS_TTL).catch(() => {});

    res.json({ success: true, stats });
  } catch (error) {
    log.error('Error fetching dashboard stats', { error });
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// audit-2026-05-26 (M2/M3/L2): removed GET /api/dashboard/activity. The route
// switched on five event_type strings (platform_connected, soul_analysis,
// twin_created, training_started, data_sync) but zero code paths emit any of
// them anywhere in the repo. Frontend defined dashboardAPI.getActivity but
// no component called it. The fallback path filtered on platform_connections
// .is_active = true — a column that does not exist on the table, so the
// PostgREST query silently 400'd and every user always landed in the
// "Ready to connect your first platform" branch regardless of state. End to
// end dead. Removed alongside the corresponding frontend definition.

export default router;
