/**
 * Feature Flags Service
 * =====================
 * Per-user feature flags for A/B testing cognitive pipeline features.
 *
 * Flags:
 *   expert_routing     - Enable domain expert memory injection in twin chat
 *   identity_context   - Enable identity context conditioning
 *   emotional_state    - Enable emotional state block injection
 *   ebbinghaus_decay   - Enable time-decay retrieval weighting
 *
 * Default: all flags are ENABLED (true) unless explicitly set to false.
 * An absent row = feature is on.
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('FeatureFlags');

// In-memory cache: userId → { flags, fetchedAt }
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get all feature flags for a user.
 * Returns an object like { expert_routing: true, identity_context: false, ... }
 * Missing flags default to true (enabled).
 */
export async function getFeatureFlags(userId) {
  if (!userId) return {};

  const cached = cache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.flags;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('feature_flags')
      .select('flag_name, enabled')
      .eq('user_id', userId);

    if (error) {
      log.warn('DB error:', error.message);
      return {};
    }

    const flags = {};
    for (const row of (data || [])) {
      flags[row.flag_name] = row.enabled;
    }

    cache.set(userId, { flags, fetchedAt: Date.now() });
    return flags;
  } catch (err) {
    log.warn('Unexpected error:', err.message);
    return {};
  }
}

/**
 * Set a feature flag for a user.
 */
export async function setFeatureFlag(userId, flagName, enabled) {
  const { error } = await supabaseAdmin
    .from('feature_flags')
    .upsert({ user_id: userId, flag_name: flagName, enabled, updated_at: new Date().toISOString() }, {
      onConflict: 'user_id,flag_name',
    });

  if (error) throw new Error(error.message);

  // Bust cache
  cache.delete(userId);
}

/**
 * Get all flags for a user (returns full rows for admin UI).
 */
export async function getAllFlagsForUser(userId) {
  const { data, error } = await supabaseAdmin
    .from('feature_flags')
    .select('*')
    .eq('user_id', userId)
    .order('flag_name');

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Invalidate cache for a user (call after setFeatureFlag if needed externally).
 */
export function invalidateFlagsCache(userId) {
  cache.delete(userId);
}
