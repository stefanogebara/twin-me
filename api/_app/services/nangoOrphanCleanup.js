/**
 * Nango Orphan Cleanup (2026-06-15)
 * ==================================
 * When a platform is RETIRED (replan Track C: twitch/reddit/linkedin/… and the
 * earlier wearables), it's removed from PLATFORM_CONFIGS — which means its
 * existing Nango connections can NEVER be freed through the normal delete path
 * (deleteConnection() returns "Unknown platform"). Those orphaned connections
 * pile up and silently fill the GLOBAL Nango connection cap, eventually blocking
 * EVERY new connection and reconnect account-wide with `resource_capped`
 * (the bug that blocked the Whoop reconnect).
 *
 * This reconciles them: for every nango_connection_mappings row whose platform
 * is retired, delete the connection directly via its stored provider_config_key
 * + nango_connection_id, then drop our bookkeeping rows. Idempotent and
 * tolerant — a per-connection failure is logged and the rest continue.
 */
import { supabaseAdmin } from './database.js';
import { deleteNangoConnectionRaw } from './nangoService.js';
import { createLogger } from './logger.js';

const log = createLogger('NangoOrphanCleanup');

// Mirror of src/lib/retiredPlatforms.ts RETIRED_PLATFORMS. Frontend TS can't be
// imported into api/ JS, so this is kept in sync BY HAND — when you retire a
// platform, add it in BOTH places (this list is what frees its Nango slots).
export const RETIRED_PLATFORMS = [
  'strava', 'oura', 'fitbit', 'garmin', 'notion', 'pinterest', 'soundcloud',
  'slack', 'steam', 'tiktok', 'apple_music', 'google_drive', 'reddit',
  'linkedin', 'twitch',
];

/**
 * Delete orphaned Nango connections for retired platforms across ALL users.
 * @param {{ dryRun?: boolean, limit?: number }} opts
 * @returns {Promise<{scanned, deleted, failed, dryRun, byPlatform, error?}>}
 */
export async function cleanupOrphanedNangoConnections({ dryRun = false, limit = 1000 } = {}) {
  const { data: rows, error } = await supabaseAdmin
    .from('nango_connection_mappings')
    .select('id, user_id, platform, provider_config_key, nango_connection_id')
    .in('platform', RETIRED_PLATFORMS)
    .limit(limit);

  if (error) {
    log.error('cleanup query failed', { error: error.message });
    return { scanned: 0, deleted: 0, failed: 0, dryRun, byPlatform: {}, error: error.message };
  }

  const summary = { scanned: rows?.length || 0, deleted: 0, failed: 0, dryRun, byPlatform: {} };

  for (const row of rows || []) {
    summary.byPlatform[row.platform] = (summary.byPlatform[row.platform] || 0) + 1;
    if (dryRun) continue;

    const res = await deleteNangoConnectionRaw(row.provider_config_key || row.platform, row.nango_connection_id);
    if (res.success) {
      // Connection freed in Nango (or already gone) — drop our bookkeeping so
      // the retired platform is fully cleared.
      await supabaseAdmin.from('nango_connection_mappings').delete().eq('id', row.id);
      await supabaseAdmin.from('platform_connections').delete()
        .eq('user_id', row.user_id).eq('platform', row.platform);
      summary.deleted++;
    } else {
      log.warn('orphan delete failed (will retry next run)', {
        platform: row.platform, userId: row.user_id, error: res.error, status: res.status,
      });
      summary.failed++;
    }
  }

  log.info('orphan cleanup done', summary);
  return summary;
}
