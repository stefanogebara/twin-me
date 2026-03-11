/**
 * Memory Saliency Replay Service
 * ================================
 * CL1-inspired sleep consolidation: periodically "replays" high-importance
 * memories that haven't been accessed recently. Like neural memory replay
 * during sleep, this prevents important memories from being forgotten due
 * to low recency scores.
 *
 * Process:
 * 1. Find users with stale-but-important memories (importance >= 7, last accessed > 14 days)
 * 2. Refresh last_accessed_at for those memories (restores recency in retrieval)
 * 3. Trigger reflection engine to generate fresh insights connecting stale + recent memories
 *
 * Cost controls:
 * - Max 3 users per cron invocation
 * - Max 20 memories per user
 * - Respects existing reflection cooldown (only refreshes recency if cooldown active)
 *
 * Reference: CL1_LLM_Encoder (Cortical Labs) — neural memory consolidation
 */

import { supabaseAdmin } from './database.js';
import { shouldTriggerReflection, generateReflections } from './reflectionEngine.js';
import { createLogger } from './logger.js';

const log = createLogger('SaliencyReplay');

// Configuration
const MAX_USERS_PER_RUN = 3;
const MAX_MEMORIES_PER_USER = 20;
const STALE_THRESHOLD_DAYS = 14;
const MIN_IMPORTANCE = 7;
const ELIGIBLE_TYPES = ['fact', 'platform_data', 'observation'];

/**
 * Run saliency replay for stale-but-important memories.
 *
 * @param {object} [options] - Override defaults for testing
 * @param {number} [options.maxUsers] - Max users to process
 * @param {number} [options.memoriesPerUser] - Max memories per user
 * @param {number} [options.staleDays] - Days since last access to qualify
 * @returns {Promise<object>} Stats about the replay run
 */
export async function runSaliencyReplay(options = {}) {
  const maxUsers = options.maxUsers ?? MAX_USERS_PER_RUN;
  const memoriesPerUser = options.memoriesPerUser ?? MAX_MEMORIES_PER_USER;
  const staleDays = options.staleDays ?? STALE_THRESHOLD_DAYS;

  const stats = {
    usersProcessed: 0,
    memoriesReplayed: 0,
    reflectionsTriggered: 0,
    reflectionsSkippedCooldown: 0,
    errors: [],
  };

  try {
    const staleCutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();

    // Step A: Find users with qualifying stale memories
    const { data: candidates, error: findErr } = await supabaseAdmin
      .from('user_memories')
      .select('user_id')
      .in('memory_type', ELIGIBLE_TYPES)
      .gte('importance_score', MIN_IMPORTANCE)
      .lt('last_accessed_at', staleCutoff)
      .limit(200);

    if (findErr) {
      stats.errors.push(`find_users: ${findErr.message}`);
      log.warn('Failed to find candidate users:', findErr.message);
      return stats;
    }

    if (!candidates?.length) {
      log.info('No stale memories found — nothing to replay');
      return stats;
    }

    // Deduplicate user IDs, take first maxUsers
    const userIds = [...new Set(candidates.map(r => r.user_id))].slice(0, maxUsers);

    // Step B-F: Process each user
    for (const userId of userIds) {
      try {
        await replayForUser(userId, memoriesPerUser, staleCutoff, stats);
        stats.usersProcessed++;
      } catch (userErr) {
        log.warn(`Error for user ${userId.substring(0, 8)}:`, userErr.message);
        stats.errors.push(`user_${userId.substring(0, 8)}: ${userErr.message}`);
      }
    }

    log.info(
      `[SaliencyReplay] Done: ${stats.usersProcessed} users, ` +
      `${stats.memoriesReplayed} memories replayed, ` +
      `${stats.reflectionsTriggered} reflections triggered, ` +
      `${stats.reflectionsSkippedCooldown} skipped (cooldown)`
    );

    return stats;
  } catch (err) {
    log.error('Unexpected error:', err.message);
    stats.errors.push(`unexpected: ${err.message}`);
    return stats;
  }
}

/**
 * Replay stale memories for a single user.
 */
async function replayForUser(userId, memoriesPerUser, staleCutoff, stats) {
  // Step B: Fetch top stale memories ordered by importance DESC, staleness ASC
  const { data: staleMemories, error: fetchErr } = await supabaseAdmin
    .from('user_memories')
    .select('id, content, memory_type, importance_score, last_accessed_at')
    .eq('user_id', userId)
    .in('memory_type', ELIGIBLE_TYPES)
    .gte('importance_score', MIN_IMPORTANCE)
    .lt('last_accessed_at', staleCutoff)
    .order('importance_score', { ascending: false })
    .order('last_accessed_at', { ascending: true })
    .limit(memoriesPerUser);

  if (fetchErr || !staleMemories?.length) return;

  const memoryIds = staleMemories.map(m => m.id);

  // Step C: Batch-update last_accessed_at to NOW (restores recency score)
  const now = new Date().toISOString();
  const { error: touchErr } = await supabaseAdmin
    .from('user_memories')
    .update({ last_accessed_at: now })
    .in('id', memoryIds);

  if (touchErr) {
    log.warn(`Failed to touch memories for ${userId.substring(0, 8)}:`, touchErr.message);
    // Non-fatal — continue to reflection step
  } else {
    stats.memoriesReplayed += memoryIds.length;
  }

  // Step D-F: Trigger reflection if not on cooldown
  // The reflection engine will naturally pick up the freshly-touched memories
  // because their recency scores are now boosted
  const canReflect = await shouldTriggerReflection(userId);

  if (canReflect) {
    try {
      const reflectionCount = await generateReflections(userId);
      stats.reflectionsTriggered += reflectionCount;
      log.info(
        `[SaliencyReplay] User ${userId.substring(0, 8)}: replayed ${memoryIds.length} memories, ` +
        `${reflectionCount} reflections generated`
      );
    } catch (reflErr) {
      log.warn(`Reflection failed for ${userId.substring(0, 8)}:`, reflErr.message);
      // Non-fatal — recency refresh still provides value
    }
  } else {
    stats.reflectionsSkippedCooldown++;
    log.info(
      `[SaliencyReplay] User ${userId.substring(0, 8)}: replayed ${memoryIds.length} memories ` +
      `(reflections skipped — cooldown active)`
    );
  }
}
