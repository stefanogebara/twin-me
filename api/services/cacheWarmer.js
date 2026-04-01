/**
 * Cache Warmer Service
 * ====================
 * Pre-warms user caches after data changes so API endpoints always hit cache.
 * Called fire-and-forget from observation ingestion and reflection engine.
 *
 * Warms: dashboard context, identity context, soul signature layers.
 * Uses in-memory dedup to prevent thundering herd.
 */

import { set as cacheSet, CACHE_TTL, CACHE_KEYS } from './redisClient.js';
import { createLogger } from './logger.js';

const log = createLogger('CacheWarmer');

// Dedup: prevent warming same user within 5 minutes
const _warmingInProgress = new Map();
const WARM_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Pre-warm all slow caches for a user. Fire-and-forget — never throws.
 * @param {string} userId
 * @param {string} trigger - What triggered the warming (for logging)
 */
export async function warmUserCaches(userId, trigger = 'unknown') {
  if (!userId) return;

  // Dedup check
  const lastWarm = _warmingInProgress.get(userId);
  if (lastWarm && Date.now() - lastWarm < WARM_COOLDOWN_MS) {
    return; // Already warmed recently
  }
  _warmingInProgress.set(userId, Date.now());

  // Evict oldest entries if map grows too large
  if (_warmingInProgress.size > 100) {
    const firstKey = _warmingInProgress.keys().next().value;
    _warmingInProgress.delete(firstKey);
  }

  log.info('Warming caches', { userId, trigger });
  const start = Date.now();

  try {
    // Warm all 3 caches in parallel — each is independent
    const results = await Promise.allSettled([
      warmDashboardContext(userId),
      warmIdentityContext(userId),
      warmSoulSignature(userId),
    ]);

    const succeeded = results.filter(r => r.status === 'fulfilled' && r.value).length;
    log.info('Cache warming complete', { userId, succeeded, total: 3, elapsedMs: Date.now() - start });
  } catch (err) {
    log.warn('Cache warming failed', { userId, error: err.message });
  }
}

async function warmDashboardContext(userId) {
  try {
    // Import lazily to avoid circular deps
    const { supabaseAdmin } = await import('./database.js');
    const { getTwinReadinessScore, getMemoryStats } = await import('./memoryStreamService.js');

    // Pre-compute the expensive sub-queries that dashboard uses
    const [readiness, stats] = await Promise.all([
      getTwinReadinessScore(userId),
      getMemoryStats(userId),
    ]);

    // These are now cached in Redis/in-memory by their respective functions
    return !!(readiness && stats);
  } catch (err) {
    log.warn('Dashboard cache warm failed', { userId, error: err.message });
    return false;
  }
}

async function warmIdentityContext(userId) {
  try {
    const { inferIdentityContext } = await import('./identityContextService.js');
    const ctx = await inferIdentityContext(userId);
    return !!ctx;
  } catch (err) {
    log.warn('Identity cache warm failed', { userId, error: err.message });
    return false;
  }
}

async function warmSoulSignature(userId) {
  try {
    const { generateSoulSignature } = await import('./soulSignatureService.js');
    // This checks DB cache first (12h TTL) — only generates if truly stale
    const result = await generateSoulSignature(userId);
    if (result?.layers) {
      // Also warm the Redis layer
      const cacheKey = `soul_layers:${userId}`;
      await cacheSet(cacheKey, { layers: result.layers, generatedAt: result.generatedAt }, 1800);
    }
    return !!result?.layers;
  } catch (err) {
    log.warn('Soul signature cache warm failed', { userId, error: err.message });
    return false;
  }
}
