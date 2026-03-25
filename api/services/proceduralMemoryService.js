/**
 * Procedural Memory Service — Learned Action Patterns
 * =====================================================
 * Stores and retrieves reusable procedures the twin has learned from
 * successful actions. Uses Hebbian learning: strengthen on success,
 * weaken on failure, prune at 0.
 *
 * Procedures are stored as user_memories with memory_type='procedure'
 * and structured metadata: { skill, trigger, success_count, attempt_count,
 * personality_alignment, last_used }.
 *
 * Sources:
 *   CoALA procedural memory (arXiv:2309.02427)
 *   Hebbian learning for agent self-improvement
 */

import { supabaseAdmin } from './database.js';
import { generateEmbedding, vectorToString } from './embeddingService.js';
import { createLogger } from './logger.js';

const log = createLogger('ProceduralMemory');

const MIN_ATTEMPTS_FOR_INJECTION = 3;
const PRUNE_THRESHOLD = 0;

/**
 * Store a new procedure or update an existing one for the same skill.
 * Deduplicates by checking for existing procedures with the same skill.
 */
export async function storeProcedure(userId, content, skill, trigger = 'general', options = {}) {
  const { data: existing } = await supabaseAdmin
    .from('user_memories')
    .select('id, metadata')
    .eq('user_id', userId)
    .eq('memory_type', 'procedure')
    .filter('metadata->>skill', 'eq', skill)
    .limit(1);

  if (existing?.length > 0) {
    const meta = existing[0].metadata || {};
    const embedding = await generateEmbedding(content);

    await supabaseAdmin
      .from('user_memories')
      .update({
        content,
        embedding: embedding ? vectorToString(embedding) : undefined,
        metadata: {
          ...meta,
          skill,
          trigger,
          success_count: (meta.success_count || 0) + 1,
          attempt_count: (meta.attempt_count || 0) + 1,
          last_used: new Date().toISOString(),
        },
        last_accessed_at: new Date().toISOString(),
      })
      .eq('id', existing[0].id);

    log.info('Updated existing procedure', { userId, skill, id: existing[0].id });
    return existing[0].id;
  }

  const embedding = await generateEmbedding(content);
  const { data, error } = await supabaseAdmin
    .from('user_memories')
    .insert({
      user_id: userId,
      content,
      memory_type: 'procedure',
      importance_score: options.importance || 8,
      embedding: embedding ? vectorToString(embedding) : null,
      metadata: {
        skill,
        trigger,
        success_count: 1,
        attempt_count: 1,
        personality_alignment: options.personalityAlignment || null,
        last_used: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  if (error) {
    log.error('Failed to store procedure', { userId, skill, error: error.message });
    return null;
  }

  log.info('Stored new procedure', { userId, skill, id: data.id });
  return data.id;
}

/**
 * Get top procedures for a user, optionally filtered by skill.
 * Sorted by success rate with min attempts filter.
 */
export async function getProcedures(userId, skill = null, limit = 5) {
  let query = supabaseAdmin
    .from('user_memories')
    .select('id, content, metadata, importance_score')
    .eq('user_id', userId)
    .eq('memory_type', 'procedure')
    .order('importance_score', { ascending: false })
    .limit(limit * 2);

  if (skill) {
    query = query.filter('metadata->>skill', 'eq', skill);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data
    .filter(p => (p.metadata?.attempt_count || 0) >= MIN_ATTEMPTS_FOR_INJECTION)
    .sort((a, b) => {
      const rateA = (a.metadata?.success_count || 0) / Math.max(1, a.metadata?.attempt_count || 1);
      const rateB = (b.metadata?.success_count || 0) / Math.max(1, b.metadata?.attempt_count || 1);
      return rateB - rateA;
    })
    .slice(0, limit);
}

/**
 * Build a text block of procedures for injection into planner prompts.
 */
export async function buildProcedureBlock(userId, skill = null) {
  const procedures = await getProcedures(userId, skill, 5);
  if (procedures.length === 0) return '';

  const lines = procedures.map(p => {
    const meta = p.metadata || {};
    const rate = Math.round(((meta.success_count || 0) / Math.max(1, meta.attempt_count || 1)) * 100);
    return `- [${meta.skill || 'general'}] ${p.content} (${rate}% success, ${meta.attempt_count || 0} uses)`;
  });

  return `\nLEARNED PROCEDURES (from past outcomes):\n${lines.join('\n')}\n`;
}

/**
 * Hebbian strengthening — call when an action is accepted.
 *
 * NOTE: This uses a SELECT-then-UPDATE pattern which has a theoretical race
 * condition on the metadata JSONB fields. In practice, this is mitigated by
 * Inngest's concurrency limit of 1 per userId (`concurrency: { limit: 1,
 * key: "event.data.userId" }`), which prevents concurrent calls for the same
 * user. If we move away from Inngest or relax concurrency, replace with an
 * RPC-based atomic increment (e.g., `increment_procedure_count`).
 */
export async function strengthenProcedure(userId, skill) {
  const { data } = await supabaseAdmin
    .from('user_memories')
    .select('id, metadata, importance_score')
    .eq('user_id', userId)
    .eq('memory_type', 'procedure')
    .filter('metadata->>skill', 'eq', skill)
    .limit(1);

  if (!data?.length) return;

  const meta = data[0].metadata || {};
  await supabaseAdmin
    .from('user_memories')
    .update({
      metadata: {
        ...meta,
        success_count: (meta.success_count || 0) + 1,
        attempt_count: (meta.attempt_count || 0) + 1,
        last_used: new Date().toISOString(),
      },
      importance_score: Math.min(10, (data[0].importance_score || 8) + 0.2),
      last_accessed_at: new Date().toISOString(),
    })
    .eq('id', data[0].id);

  log.info('Strengthened procedure', { userId, skill, id: data[0].id });
}

/**
 * Hebbian weakening — call when an action is rejected.
 * Prunes procedure if success rate drops too low after enough attempts.
 *
 * NOTE: Same SELECT-then-UPDATE race condition caveat as strengthenProcedure.
 * Mitigated by Inngest concurrency limit of 1 per userId.
 */
export async function weakenProcedure(userId, skill) {
  const { data } = await supabaseAdmin
    .from('user_memories')
    .select('id, metadata, importance_score')
    .eq('user_id', userId)
    .eq('memory_type', 'procedure')
    .filter('metadata->>skill', 'eq', skill)
    .limit(1);

  if (!data?.length) return;

  const meta = data[0].metadata || {};
  const newSuccessCount = Math.max(0, (meta.success_count || 0) - 1);
  const newAttemptCount = (meta.attempt_count || 0) + 1;

  if (newSuccessCount <= PRUNE_THRESHOLD && newAttemptCount >= MIN_ATTEMPTS_FOR_INJECTION) {
    await supabaseAdmin.from('user_memories').delete().eq('id', data[0].id);
    log.info('Pruned failed procedure', { userId, skill, id: data[0].id });
    return;
  }

  await supabaseAdmin
    .from('user_memories')
    .update({
      metadata: {
        ...meta,
        success_count: newSuccessCount,
        attempt_count: newAttemptCount,
        last_used: new Date().toISOString(),
      },
      importance_score: Math.max(3, (data[0].importance_score || 8) - 0.3),
    })
    .eq('id', data[0].id);

  log.info('Weakened procedure', { userId, skill, id: data[0].id });
}

/**
 * Predict outcome success rate for a skill based on past actions.
 * Used by agenticCore before executing a step (Reflexion-style).
 */
export async function predictOutcome(userId, skillName) {
  const { data, error } = await supabaseAdmin
    .from('agent_actions')
    .select('user_response')
    .eq('user_id', userId)
    .eq('skill_name', skillName)
    .not('user_response', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data || data.length < 3) {
    return { predictedSuccessRate: null, sampleSize: data?.length || 0 };
  }

  const accepted = data.filter(a => a.user_response === 'accepted' || a.user_response === 'positive').length;
  const rate = accepted / data.length;

  const result = { predictedSuccessRate: rate, sampleSize: data.length };

  if (rate < 0.3) {
    result.warning = `Low success rate for ${skillName}: ${Math.round(rate * 100)}% (${data.length} past actions). Consider adjusting approach.`;
  }

  return result;
}
