/**
 * Platform State Service — single source of truth for platform/connection
 * state classification (batch-3 state unification, audit-2026-06-10).
 *
 * Extracted from the GET /connectors/summary route so every consumer (the
 * summary route today; /status replacement and others in later batch-3 steps)
 * derives 'active' | 'expired' | 'stale' from ONE place instead of each
 * surface re-implementing its own semantics.
 *
 * Canonical semantics (post-2026-06-10):
 *   - expired: genuine auth failure only — the USER must act (reconnect).
 *     Routine hourly token lapse (token_expires_at < now) is NOT expired:
 *     getValidAccessToken refreshes automatically on next use.
 *   - stale:   token OK but no successful sync in >= STALE_DAYS days, or the
 *     last sync was partial/errored.
 *   - active:  everything else.
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('PlatformState');

export const STALE_DAYS = 7;
const STALE_THRESHOLD_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Classify a platform_connections row as 'active' | 'expired' | 'stale'.
 *
 * Pure function — logic extracted verbatim from the /connectors/summary route
 * (connectors.js, post-2026-06-10 semantics), plus encryption_key_mismatch
 * which also requires a full reconnect (stored tokens are undecryptable).
 *
 * @param {object} row - platform_connections row with at least
 *   { status, last_sync_status, last_sync_at }
 * @param {number} [nowMs] - injectable clock for tests
 * @returns {'active'|'expired'|'stale'}
 */
export function classifyConnection(row, nowMs = Date.now()) {
  // audit-2026-06-10: "needs reconnection" must mean the USER has to act.
  // Access tokens lapse hourly by design and getValidAccessToken refreshes
  // them automatically on next use, so `token_expires_at < now` is NOT a
  // reconnect signal — counting it flagged healthy platforms ("5 need
  // reconnection" on the chat header while extraction ran fine). Conversely
  // 'auth_failed' (set by observationIngestion when a refresh genuinely
  // fails) was missing from this list, so REAL failures weren't counted.
  const needsReauth =
    row.status === 'expired' ||
    row.status === 'token_expired' ||
    row.status === 'needs_reauth' ||
    row.status === 'requires_reauth' ||
    row.status === 'auth_failed' ||
    row.last_sync_status === 'requires_reauth' ||
    row.last_sync_status === 'auth_failed' ||
    row.last_sync_status === 'encryption_key_mismatch' ||
    (row.status === 'error' && row.last_sync_status === 'auth_error');

  if (needsReauth) return 'expired';

  const lastSync = row.last_sync_at ? new Date(row.last_sync_at).getTime() : null;
  const isStale = lastSync && nowMs - lastSync > STALE_THRESHOLD_MS;
  const isPartial = row.last_sync_status === 'partial' || row.last_sync_status === 'error';
  return isStale || isPartial ? 'stale' : 'active';
}

/**
 * Classify a nango_connection_mappings row (already filtered to
 * status IN ('connected','active')). Nango manages auth refresh itself, so
 * the only degraded state we can observe is staleness.
 */
export function classifyNangoConnection(row, nowMs = Date.now()) {
  const lastSync = row.last_synced_at ? new Date(row.last_synced_at).getTime() : null;
  const isStale = lastSync && nowMs - lastSync > STALE_THRESHOLD_MS;
  return isStale ? 'stale' : 'active';
}

/**
 * Build the canonical platforms summary for a user.
 *
 * Response shape is backward compatible with the old /connectors/summary
 * route; breakdown entries additionally carry { connectedAt, lastSyncAt,
 * source } (additive, batch-3 step 1).
 *
 * @param {string} userId - public.users id
 * @returns {Promise<{ total: number, active: number, expired: number,
 *   stale: number, breakdown: Array<{ platform: string,
 *   state: 'active'|'expired'|'stale', connectedAt: string|null,
 *   lastSyncAt: string|null, source: 'oauth'|'nango' }> }>}
 */
export async function buildPlatformsSummary(userId) {
  const now = Date.now();

  const [pcResult, nangoResult] = await Promise.all([
    supabaseAdmin
      .from('platform_connections')
      .select('platform, status, last_sync_at, last_sync_status, token_expires_at, access_token, connected_at')
      .eq('user_id', userId),
    supabaseAdmin
      .from('nango_connection_mappings')
      .select('platform, status, last_synced_at, updated_at, created_at')
      .eq('user_id', userId)
      .in('status', ['connected', 'active']),
  ]);

  if (pcResult.error) {
    log.warn('platform_connections query failed for summary', { userId, error: pcResult.error.message });
  }
  if (nangoResult.error) {
    log.warn('nango_connection_mappings query failed for summary', { userId, error: nangoResult.error.message });
  }

  const breakdown = [];
  const seen = new Set();

  for (const c of pcResult.data || []) {
    // Only count platforms the user has actually connected (not just empty rows).
    if (!c.connected_at) continue;

    breakdown.push({
      platform: c.platform,
      state: classifyConnection(c, now),
      connectedAt: c.connected_at,
      lastSyncAt: c.last_sync_at || null,
      source: 'oauth',
    });
    seen.add(c.platform);
  }

  for (const n of nangoResult.data || []) {
    if (seen.has(n.platform)) continue;
    breakdown.push({
      platform: n.platform,
      state: classifyNangoConnection(n, now),
      connectedAt: n.created_at || null,
      lastSyncAt: n.last_synced_at || null,
      source: 'nango',
    });
  }

  const counts = breakdown.reduce(
    (acc, b) => {
      acc[b.state]++;
      return acc;
    },
    { active: 0, expired: 0, stale: 0 }
  );

  return {
    total: breakdown.length,
    active: counts.active,
    expired: counts.expired,
    stale: counts.stale,
    breakdown,
  };
}
