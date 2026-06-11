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
 * Mirror sources (replan-2026-06-10 Track C: extension + desktop are
 * first-class). Neither writes a platform_connections row — the browser
 * extension writes user_platform_data platform='web' and the desktop app
 * writes user_memories metadata.source='desktop_*' — so the summary
 * synthesizes breakdown entries from recent data presence instead.
 * A mirror with data in the last MIRROR_WINDOW_DAYS is 'active'; without
 * recent data it simply has no entry. Mirrors NEVER contribute to the
 * expired/stale alarm counts (there is no token to expire).
 */
export const MIRROR_WINDOW_DAYS = 14;

/**
 * Build synthetic breakdown entries for the mirror sources. Pure — callers
 * pass the freshest row timestamps (null/undefined when no recent data).
 *
 * @param {object} input
 * @param {string|null} [input.webLastSeenAt] - freshest user_platform_data
 *   extracted_at for platform='web' within the mirror window
 * @param {number} [input.webObservations7d] - web rows captured in the last
 *   7 days (drives the "N pages observed this week" yield on /connect)
 * @param {string|null} [input.desktopLastSeenAt] - freshest desktop-tagged
 *   user_memories created_at within the mirror window
 * @returns {Array<object>} breakdown entries (same shape as OAuth/Nango
 *   entries, source: 'mirror')
 */
export function buildMirrorEntries({
  webLastSeenAt = null,
  webObservations7d = 0,
  desktopLastSeenAt = null,
} = {}) {
  const entries = [];
  if (webLastSeenAt) {
    entries.push({
      platform: 'web',
      state: 'active',
      connectedAt: null,
      lastSyncAt: webLastSeenAt,
      source: 'mirror',
      observations7d: webObservations7d,
    });
  }
  if (desktopLastSeenAt) {
    entries.push({
      platform: 'desktop',
      state: 'active',
      connectedAt: null,
      lastSyncAt: desktopLastSeenAt,
      source: 'mirror',
    });
  }
  return entries;
}

/**
 * Build the canonical platforms summary for a user.
 *
 * Response shape is backward compatible with the old /connectors/summary
 * route; breakdown entries additionally carry { connectedAt, lastSyncAt,
 * source } (additive, batch-3 step 1). Mirror sources (web/desktop) are
 * appended as synthetic 'active' entries when recent data exists
 * (replan-2026-06-10 Track C) — they count toward total/active but can
 * never be expired or stale.
 *
 * @param {string} userId - public.users id
 * @returns {Promise<{ total: number, active: number, expired: number,
 *   stale: number, breakdown: Array<{ platform: string,
 *   state: 'active'|'expired'|'stale', connectedAt: string|null,
 *   lastSyncAt: string|null, source: 'oauth'|'nango'|'mirror' }> }>}
 */
export async function buildPlatformsSummary(userId) {
  const now = Date.now();
  const mirrorSince = new Date(now - MIRROR_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const weekSince = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [pcResult, nangoResult, webFreshResult, webWeekResult, desktopFreshResult] = await Promise.all([
    supabaseAdmin
      .from('platform_connections')
      .select('platform, status, last_sync_at, last_sync_status, token_expires_at, access_token, connected_at')
      .eq('user_id', userId),
    supabaseAdmin
      .from('nango_connection_mappings')
      .select('platform, status, last_synced_at, updated_at, created_at')
      .eq('user_id', userId)
      .in('status', ['connected', 'active']),
    // Mirror: browser extension — freshest captured row in the mirror window.
    supabaseAdmin
      .from('user_platform_data')
      .select('extracted_at')
      .eq('user_id', userId)
      .eq('platform', 'web')
      .gte('extracted_at', mirrorSince)
      .order('extracted_at', { ascending: false })
      .limit(1),
    // Mirror: extension yield for the last 7 days (count only, no rows).
    supabaseAdmin
      .from('user_platform_data')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('platform', 'web')
      .gte('extracted_at', weekSince),
    // Mirror: desktop app — freshest desktop-tagged memory (desktop_clip /
    // desktop_meeting, see observations-clip.js / observations-meeting.js).
    supabaseAdmin
      .from('user_memories')
      .select('created_at')
      .eq('user_id', userId)
      .like('metadata->>source', 'desktop%')
      .gte('created_at', mirrorSince)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  if (pcResult.error) {
    log.warn('platform_connections query failed for summary', { userId, error: pcResult.error.message });
  }
  if (nangoResult.error) {
    log.warn('nango_connection_mappings query failed for summary', { userId, error: nangoResult.error.message });
  }
  if (webFreshResult.error || webWeekResult.error) {
    log.warn('web mirror query failed for summary', {
      userId,
      error: webFreshResult.error?.message || webWeekResult.error?.message,
    });
  }
  if (desktopFreshResult.error) {
    log.warn('desktop mirror query failed for summary', { userId, error: desktopFreshResult.error.message });
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
    seen.add(n.platform);
  }

  // Mirror sources (replan-2026-06-10 Track C): no OAuth flow ever creates a
  // 'web' or 'desktop' connection row, so synthesize entries from recent data.
  const mirrorEntries = buildMirrorEntries({
    webLastSeenAt: webFreshResult.data?.[0]?.extracted_at ?? null,
    webObservations7d: webWeekResult.count ?? 0,
    desktopLastSeenAt: desktopFreshResult.data?.[0]?.created_at ?? null,
  });
  for (const m of mirrorEntries) {
    if (seen.has(m.platform)) continue; // defensive — should never collide
    breakdown.push(m);
    seen.add(m.platform);
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
