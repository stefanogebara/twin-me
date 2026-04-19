/**
 * Cron: Twin Summary Refresh
 * ==========================
 * Runs daily at 6am UTC to pre-warm twin summaries for active users before
 * they start chatting. Prevents the first-message latency spike that happens
 * when a user's summary has expired (4h TTL) and must be generated inline.
 *
 * Why this matters:
 *   - twinSummaryService TTL = 4h, stale-serve window = 24h
 *   - Users inactive overnight lose their summary by morning
 *   - Without pre-warming, first chat of the day triggers inline generation
 *     adding ~3-5s to that message
 *
 * Safety limits:
 *   - Only processes users who have memories (active users)
 *   - Only refreshes summaries older than REFRESH_THRESHOLD_HOURS
 *   - Caps at MAX_USERS_PER_RUN to stay well within 60s maxDuration
 *   - Sequential (not parallel) to keep peak DB+LLM load predictable
 *
 * Schedule: 0 6 * * * (daily at 06:00 UTC)
 * Security: protected by CRON_SECRET Bearer token.
 */

import { generateTwinSummary } from '../services/twinSummaryService.js';
import { supabaseAdmin } from '../services/database.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronTwinSummaryRefresh');

// Only pre-warm summaries older than 5 hours (slightly beyond the 4h TTL)
const REFRESH_THRESHOLD_HOURS = 5;
// Hard cap: each generateTwinSummary takes ~3-5s, so 10 users = 30-50s max
const MAX_USERS_PER_RUN = 10;
// Active = had any memory in the last 14 days
const ACTIVE_WINDOW_DAYS = 14;

export default async function handler(req, res) {
  const startTime = Date.now();

  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    return res.status(authResult.status).json({ success: false, error: authResult.error });
  }

  try {
    // Find active users (had memories recently)
    const activeSince = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: activeRows } = await supabaseAdmin
      .from('user_memories')
      .select('user_id')
      .gte('created_at', activeSince)
      .limit(500); // broader net to find stale ones among them

    const activeUserIds = [...new Set((activeRows || []).map(r => r.user_id))];

    if (activeUserIds.length === 0) {
      log.info('No active users — skipping');
      return res.json({ success: true, refreshed: 0, skipped: 0, reason: 'no_active_users' });
    }

    // Find which of those users have stale/missing summaries
    const staleThreshold = new Date(Date.now() - REFRESH_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();

    const { data: summaryRows } = await supabaseAdmin
      .from('twin_summaries')
      .select('user_id, generated_at')
      .in('user_id', activeUserIds);

    const summaryMap = new Map((summaryRows || []).map(r => [r.user_id, r.generated_at]));

    // Users with no summary OR summary older than threshold
    const needsRefresh = activeUserIds.filter(uid => {
      const generatedAt = summaryMap.get(uid);
      if (!generatedAt) return true; // no summary at all
      return new Date(generatedAt) < new Date(staleThreshold);
    });

    if (needsRefresh.length === 0) {
      log.info('All active users have fresh summaries', { checked: activeUserIds.length });
      return res.json({ success: true, refreshed: 0, skipped: activeUserIds.length, reason: 'all_fresh' });
    }

    // Cap to prevent timeout
    const toRefresh = needsRefresh.slice(0, MAX_USERS_PER_RUN);
    const capped = needsRefresh.length > MAX_USERS_PER_RUN;

    log.info('Refreshing stale summaries', {
      needsRefresh: needsRefresh.length,
      processing: toRefresh.length,
      capped,
    });

    // Fetch usernames for better summary quality (single batch query)
    const { data: userRows } = await supabaseAdmin
      .from('users')
      .select('id, full_name, display_name')
      .in('id', toRefresh);
    const userNameMap = new Map((userRows || []).map(u => [u.id, u.display_name || u.full_name || 'This person']));

    // Sequential refresh: predictable load, avoids thundering herd on DeepSeek
    let refreshed = 0;
    const errors = [];

    for (const userId of toRefresh) {
      const userName = userNameMap.get(userId) || 'This person';
      try {
        await generateTwinSummary(userId, userName);
        refreshed++;
        log.info('Summary refreshed', { userId: userId.slice(0, 8) });
      } catch (err) {
        errors.push({ userId: userId.slice(0, 8), error: process.env.NODE_ENV !== 'production' ? err.message : 'refresh failed' });
        log.warn('Summary refresh failed (non-fatal)', { userId: userId.slice(0, 8), error: err.message });
      }
    }

    const durationMs = Date.now() - startTime;
    log.info('Twin summary refresh complete', { refreshed, errors: errors.length, durationMs });

    await logCronExecution('twin-summary-refresh', 'success', durationMs, {
      activeUsers: activeUserIds.length,
      needsRefresh: needsRefresh.length,
      refreshed,
      capped,
      errors: errors.length,
    });

    return res.json({
      success: true,
      activeUsers: activeUserIds.length,
      needsRefresh: needsRefresh.length,
      refreshed,
      capped,
      errors,
      durationMs,
    });

  } catch (err) {
    const durationMs = Date.now() - startTime;
    await logCronExecution('twin-summary-refresh', 'error', durationMs, null, err.message);
    log.error('Twin summary refresh cron failed', { error: err.message });
    return res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal cron error' });
  }
}
