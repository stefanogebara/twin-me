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
 * Check if a similar observation already exists within the appropriate time window.
 * Uses content-type-aware windows when contentType is provided, defaults to 1 hour.
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
