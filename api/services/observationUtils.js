/**
 * Shared utilities for observation ingestion.
 * Used by observationIngestion.js and all platform fetchers in observationFetchers/.
 */

import crypto from 'crypto';
import { createLogger } from './logger.js';

const log = createLogger('ObservationIngestion');

// Lazy-load to avoid circular dependency
let supabaseAdmin = null;
export async function getSupabase() {
  if (!supabaseAdmin) {
    const mod = await import('./database.js');
    supabaseAdmin = mod.supabaseAdmin;
  }
  return supabaseAdmin;
}

// ====================================================================
// Prompt injection defense
// ====================================================================

/**
 * Sanitize a string from an external (untrusted) API before embedding
 * it in an LLM prompt. Truncates to maxLen chars and strips common
 * prompt injection starters so injected content cannot override instructions.
 *
 * @param {string} str - Raw external API string (channel name, video title, etc.)
 * @param {number} maxLen - Max character length (default 100)
 * @returns {string} Sanitized, truncated string safe for LLM context
 */
export function sanitizeExternal(str, maxLen = 100) {
  if (typeof str !== 'string') return '';
  // Truncate first to avoid processing huge strings
  let s = str.slice(0, maxLen * 2);
  // Strip potential prompt injection markers — characters that could
  // start new instructions: newlines, and common injection prefixes
  s = s.replace(/[\r\n]+/g, ' ');
  // Remove common injection patterns (case-insensitive)
  s = s.replace(/\b(ignore|disregard|forget|override)\s+(previous|prior|above|all)\b/gi, '[filtered]');
  s = s.replace(/\bsystem\s*prompt\b/gi, '[filtered]');
  return s.slice(0, maxLen).trim();
}

// ====================================================================
// De-duplication
// ====================================================================

/**
 * Generate a short hash for de-duplication.
 * We hash platform + first 100 chars of content to catch near-duplicates.
 */
export function contentHash(platform, content) {
  return crypto
    .createHash('sha256')
    .update(`${platform}:${content.substring(0, 100)}`)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Content-type-aware time windows for de-duplication.
 * Different observation types have different natural refresh rates.
 */
export const DEDUP_WINDOWS_MS = {
  current_state: 30 * 60 * 1000,            // 30 min (was 1 hour)
  trend: 2 * 60 * 60 * 1000,               // 2 hours (was 4 hours)
  daily_summary: 24 * 60 * 60 * 1000,      // 24 hours
  weekly_summary: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Long-window cap for the exact-content check. Some "current_state" facts
 * are stable across weeks (e.g. "Member of 16 Discord communities") and
 * should not be re-inserted every cron cycle just because the short window
 * has expired. The 2026-05-08 audit found 1,957 duplicates (8.3 % of test
 * user's platform_data) caused by this gap — top dup repeated 41×.
 */
const EXACT_CONTENT_DEDUP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Check if a similar observation already exists within the appropriate time window.
 *
 * Two-layer check:
 *   1. NEAR-DUPLICATE (content-type window): catches semantically similar rows
 *      written close together — e.g. two "user is listening to indie rock"
 *      observations within the 30-minute current_state window.
 *   2. EXACT CONTENT (14-day window): catches identical strings from stable
 *      facts that the periodic ingestion would otherwise rewrite once per
 *      cycle. When an exact match is found, the existing row's
 *      `last_accessed_at` is refreshed so the recency signal survives.
 *
 * @param {string} userId
 * @param {string} platform
 * @param {string} content
 * @param {string} [contentType] - 'current_state' | 'trend' | 'daily_summary' | 'weekly_summary'
 */
export async function isDuplicate(userId, platform, content, contentType) {
  try {
    const supabase = await getSupabase();
    if (!supabase) return false;

    // Layer 2: exact-content match within the long window (cheaper to query
    // because we filter on the indexed user_id + memory_type + content).
    const longCutoff = new Date(Date.now() - EXACT_CONTENT_DEDUP_WINDOW_MS).toISOString();
    const { data: exactRows } = await supabase
      .from('user_memories')
      .select('id, last_accessed_at')
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .eq('content', content)
      .gte('created_at', longCutoff)
      .limit(1);

    if (exactRows && exactRows.length > 0) {
      // Touch last_accessed_at so retrieval recency reflects "we still see
      // this fact today" without bloating the table with another row.
      const id = exactRows[0].id;
      supabase
        .from('user_memories')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('id', id)
        .then(() => {})
        .catch(err => log.warn('Failed to touch existing memory on dedup hit', { error: err?.message, id }));
      return true;
    }

    // Layer 1: near-duplicate match within the type-specific short window.
    const windowMs = (contentType && DEDUP_WINDOWS_MS[contentType]) || DEDUP_WINDOWS_MS.current_state;
    const cutoff = new Date(Date.now() - windowMs).toISOString();

    const { data, error } = await supabase
      .from('user_memories')
      .select('id, content')
      .eq('user_id', userId)
      .eq('memory_type', 'platform_data')
      .gte('created_at', cutoff)
      .limit(50);

    if (error || !data) return false;

    // Check for exact or near-exact content match
    const newHash = contentHash(platform, content);
    for (const mem of data) {
      const meta = mem.content || '';
      if (contentHash(platform, meta) === newHash) {
        return true;
      }
    }

    return false;
  } catch (err) {
    log.warn('De-dup check failed, proceeding', { error: err });
    return false;
  }
}

/**
 * Check if a user has a Nango-managed connection for a given platform.
 * Used as fallback when platform_connections row is missing.
 */
export async function _hasNangoMapping(supabase, userId, platform) {
  const { data } = await supabase
    .from('nango_connection_mappings')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('status', 'active')
    .single();
  return !!data;
}
