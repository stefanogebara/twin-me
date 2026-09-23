/**
 * Tool Preference Learning Service
 * ==================================
 * Tracks tool success rates per user per skill. Injects preferred tools
 * into the planner's context so it learns which tools work for this user.
 *
 * Data stored in agent_events with event_type 'tool_outcome' (no schema change needed).
 * Aggregated preferences cached in Redis with in-memory fallback.
 */

import { supabaseAdmin } from './database.js';
import { getRedisClient, isRedisAvailable } from './redisClient.js';
import { createLogger } from './logger.js';

const log = createLogger('ToolPreference');

// ---------------------------------------------------------------------------
// In-memory buffer for batching tool outcome writes
// ---------------------------------------------------------------------------
const outcomeBuffer = new Map(); // key: `${userId}:${skillName}:${toolName}` -> { successes, failures, totalMs, count }
const FLUSH_INTERVAL_MS = 30_000; // 30 seconds
const MIN_USES_FOR_PREFERENCE = 3;
const MAX_PREFERRED_TOOLS = 5;
const CACHE_TTL_SECONDS = 3600; // 1 hour

// In-memory preference cache (fallback when Redis unavailable)
const preferenceCache = new Map(); // key: `${userId}:${skillName}` -> { tools: [...], timestamp }
const PREFERENCE_CACHE_TTL_MS = 3600_000; // 1 hour

// ---------------------------------------------------------------------------
// recordToolOutcome
// ---------------------------------------------------------------------------

/**
 * Record a tool execution outcome. Buffers in memory and flushes periodically
 * to agent_events to avoid per-call DB writes.
 *
 * @param {string} userId
 * @param {string} skillName - Skill context (e.g. 'music_mood_match', 'general_task')
 * @param {string} toolName  - Tool that was called
 * @param {boolean} success  - Whether the call succeeded
 * @param {number} elapsedMs - Execution time in milliseconds
 */
export async function recordToolOutcome(userId, skillName, toolName, success, elapsedMs) {
  if (!userId || !toolName) return;

  const effectiveSkill = skillName || 'general_task';
  const key = `${userId}:${effectiveSkill}:${toolName}`;

  const existing = outcomeBuffer.get(key) || {
    userId,
    skillName: effectiveSkill,
    toolName,
    successes: 0,
    failures: 0,
    totalMs: 0,
    count: 0,
  };

  const updated = {
    ...existing,
    successes: existing.successes + (success ? 1 : 0),
    failures: existing.failures + (success ? 0 : 1),
    totalMs: existing.totalMs + (elapsedMs || 0),
    count: existing.count + 1,
  };

  outcomeBuffer.set(key, updated);

  log.debug('Tool outcome recorded', { userId, skillName: effectiveSkill, toolName, success, elapsedMs });
}

/**
 * Flush buffered outcomes to Supabase agent_events.
 * Called on a timer and also exposed for testing / manual trigger.
 */
export async function flushOutcomeBuffer() {
  if (outcomeBuffer.size === 0) return;

  const entries = [...outcomeBuffer.entries()];
  outcomeBuffer.clear();

  const rows = entries.map(([_key, entry]) => ({
    user_id: entry.userId,
    event_type: 'tool_outcome',
    event_data: {
      skill_name: entry.skillName,
      tool_name: entry.toolName,
      successes: entry.successes,
      failures: entry.failures,
      total_ms: entry.totalMs,
      count: entry.count,
    },
    source: 'tool_preference_service',
  }));

  try {
    const { error } = await supabaseAdmin
      .from('agent_events')
      .insert(rows);

    if (error) {
      log.warn('Failed to flush tool outcomes', { error: error.message, count: rows.length });
      // Re-buffer on failure so data is not lost
      for (const [key, entry] of entries) {
        const existing = outcomeBuffer.get(key);
        if (existing) {
          outcomeBuffer.set(key, {
            ...existing,
            successes: existing.successes + entry.successes,
            failures: existing.failures + entry.failures,
            totalMs: existing.totalMs + entry.totalMs,
            count: existing.count + entry.count,
          });
        } else {
          outcomeBuffer.set(key, entry);
        }
      }
    } else {
      log.info('Flushed tool outcomes', { count: rows.length });
    }
  } catch (err) {
    log.error('Tool outcome flush error', { error: err.message });
    // Re-buffer entries
    for (const [key, entry] of entries) {
      outcomeBuffer.set(key, entry);
    }
  }
}

// Periodic flush timer (non-blocking, self-healing)
let flushTimer = null;

function startFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushOutcomeBuffer().catch(err =>
      log.warn('Periodic flush failed', { error: err.message })
    );
  }, FLUSH_INTERVAL_MS);
  // Allow Node to exit even if timer is running
  if (flushTimer.unref) flushTimer.unref();
}

startFlushTimer();

// ---------------------------------------------------------------------------
// getPreferredTools
// ---------------------------------------------------------------------------

/**
 * Get preferred tools for a user+skill combination.
 * Returns top 5 by success rate with a minimum of 3 uses.
 *
 * @param {string} userId
 * @param {string} skillName
 * @returns {Promise<Array<{ toolName: string, successRate: number, uses: number, avgMs: number }>>}
 */
export async function getPreferredTools(userId, skillName) {
  const effectiveSkill = skillName || 'general_task';
  const cacheKey = `tool_prefs:${userId}:${effectiveSkill}`;

  // Check Redis cache first
  try {
    if (isRedisAvailable()) {
      const redis = getRedisClient();
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }
  } catch (err) {
    log.debug('Redis cache miss for tool prefs', { error: err.message });
  }

  // Check in-memory cache
  const memCached = preferenceCache.get(cacheKey);
  if (memCached && Date.now() - memCached.timestamp < PREFERENCE_CACHE_TTL_MS) {
    return memCached.tools;
  }

  // Query agent_events for tool_outcome entries
  try {
    const { data, error } = await supabaseAdmin
      .from('agent_events')
      .select('event_data')
      .eq('user_id', userId)
      .eq('event_type', 'tool_outcome')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      log.warn('Failed to query tool outcomes', { error: error.message });
      return [];
    }

    if (!data || data.length === 0) return [];

    // Aggregate by tool_name for the requested skill
    const aggregated = new Map(); // toolName -> { successes, failures, totalMs, count }

    for (const row of data) {
      const ed = row.event_data;
      if (!ed || ed.skill_name !== effectiveSkill) continue;

      const toolName = ed.tool_name;
      const existing = aggregated.get(toolName) || { successes: 0, failures: 0, totalMs: 0, count: 0 };

      aggregated.set(toolName, {
        successes: existing.successes + (ed.successes || 0),
        failures: existing.failures + (ed.failures || 0),
        totalMs: existing.totalMs + (ed.total_ms || 0),
        count: existing.count + (ed.count || 0),
      });
    }

    // Filter by min uses, calculate success rate, sort, take top N
    const tools = [...aggregated.entries()]
      .filter(([_name, stats]) => stats.count >= MIN_USES_FOR_PREFERENCE)
      .map(([toolName, stats]) => ({
        toolName,
        successRate: stats.count > 0 ? Math.round((stats.successes / stats.count) * 100) : 0,
        uses: stats.count,
        avgMs: stats.count > 0 ? Math.round(stats.totalMs / stats.count) : 0,
      }))
      .sort((a, b) => b.successRate - a.successRate || b.uses - a.uses)
      .slice(0, MAX_PREFERRED_TOOLS);

    // Cache result
    try {
      if (isRedisAvailable()) {
        const redis = getRedisClient();
        await redis.set(cacheKey, JSON.stringify(tools), 'EX', CACHE_TTL_SECONDS);
      }
    } catch (err) {
      log.debug('Failed to cache tool prefs in Redis', { error: err.message });
    }

    preferenceCache.set(cacheKey, { tools, timestamp: Date.now() });

    return tools;
  } catch (err) {
    log.error('getPreferredTools failed', { userId, skillName: effectiveSkill, error: err.message });
    return [];
  }
}

// ---------------------------------------------------------------------------
// buildToolPreferenceBlock
// ---------------------------------------------------------------------------

/**
 * Build a text block describing preferred tools for injection into the planner prompt.
 * Returns empty string if no preferences exist yet.
 *
 * @param {string} userId
 * @param {string} skillName
 * @returns {Promise<string>}
 */
export async function buildToolPreferenceBlock(userId, skillName) {
  try {
    const tools = await getPreferredTools(userId, skillName);
    if (!tools || tools.length === 0) return '';

    const lines = [`PREFERRED TOOLS FOR ${skillName || 'general_task'}:`];
    for (const t of tools) {
      lines.push(`- ${t.toolName} (${t.successRate}% success, ${t.uses} uses, avg ${t.avgMs}ms)`);
    }

    return '\n' + lines.join('\n') + '\n';
  } catch (err) {
    log.warn('buildToolPreferenceBlock failed', { userId, skillName, error: err.message });
    return '';
  }
}

// ---------------------------------------------------------------------------
// refreshToolPreferences
// ---------------------------------------------------------------------------

/**
 * Refresh the tool preference cache for all skills a user has used.
 * Intended to be called from actionReflection after batch analysis.
 *
 * @param {string} userId
 */
export async function refreshToolPreferences(userId) {
  try {
    // Flush any pending outcomes first
    await flushOutcomeBuffer();

    // Get all distinct skill names from this user's tool outcomes
    const { data, error } = await supabaseAdmin
      .from('agent_events')
      .select('event_data')
      .eq('user_id', userId)
      .eq('event_type', 'tool_outcome')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      log.warn('refreshToolPreferences query failed', { error: error.message });
      return;
    }

    if (!data || data.length === 0) return;

    // Extract unique skill names
    const skillNames = new Set();
    for (const row of data) {
      if (row.event_data?.skill_name) {
        skillNames.add(row.event_data.skill_name);
      }
    }

    // Invalidate caches so getPreferredTools re-queries fresh data
    for (const skill of skillNames) {
      const cacheKey = `tool_prefs:${userId}:${skill}`;
      preferenceCache.delete(cacheKey);

      try {
        if (isRedisAvailable()) {
          const redis = getRedisClient();
          await redis.del(cacheKey);
        }
      } catch (err) {
        log.debug('Failed to invalidate Redis cache', { cacheKey, error: err.message });
      }
    }

    // Pre-warm caches by fetching each skill's preferences
    const refreshPromises = [...skillNames].map(skill =>
      getPreferredTools(userId, skill).catch(() => [])
    );
    await Promise.all(refreshPromises);

    log.info('Tool preferences refreshed', { userId, skills: [...skillNames] });
  } catch (err) {
    log.error('refreshToolPreferences failed', { userId, error: err.message });
  }
}
