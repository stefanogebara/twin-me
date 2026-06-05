/**
 * Shared learning-hook primitives for all platforms.
 *
 * The Whoop hooks (api/services/whoop/learningHooks.js) prototyped two
 * persistence patterns:
 *   1. proactive_insights row — twin spontaneously raises it next turn
 *   2. reflection memory       — searchable, shapes identity context
 *
 * Each platform's analytics has a different data shape, but the
 * PERSISTENCE path is the same. This module centralises the
 * dedup + insert + swallow-on-error logic so per-platform learn()
 * functions only need to compose the insight prose / reflection
 * content + a dedup key.
 */

import { supabaseAdmin } from '../database.js';
import { addReflection } from '../memoryStreamService.js';
import { createLogger } from '../logger.js';

const log = createLogger('PlatformLearningHooks');

/**
 * Insert a proactive_insights row, deduped by sources-contains key.
 * Returns the inserted row id, or null if dedup hit or insert errored.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.insight       Prose the twin will read next turn (<= 500c).
 * @param {string} opts.dedupKey      "platform:metric:date" — encoded into sources array.
 * @param {string} [opts.urgency]     low | medium | high (default 'medium')
 * @param {string} [opts.category]    Free-text label (default 'platform').
 * @returns {Promise<string|null>}    Inserted row id, or null.
 */
export async function insertDedupedInsight({
  userId,
  insight,
  dedupKey,
  urgency = 'medium',
  category = 'platform',
}) {
  try {
    if (!insight || !dedupKey || !userId) return null;

    const { data: existing } = await supabaseAdmin
      .from('proactive_insights')
      .select('id')
      .eq('user_id', userId)
      .contains('sources', [dedupKey])
      .limit(1);
    if (existing && existing.length > 0) {
      log.debug('Insight already exists, skipping', { userId, dedupKey });
      return null;
    }

    const { data: inserted, error } = await supabaseAdmin
      .from('proactive_insights')
      .insert({
        user_id: userId,
        insight: String(insight).slice(0, 500),
        urgency,
        category,
        sources: [dedupKey],
      })
      .select('id')
      .single();
    if (error) {
      log.warn('insertDedupedInsight failed', { error: error.message, dedupKey });
      return null;
    }
    log.info('Persisted platform insight', { userId, dedupKey, urgency });
    return inserted?.id ?? null;
  } catch (err) {
    log.warn('insertDedupedInsight threw', { error: err?.message ?? String(err) });
    return null;
  }
}

/**
 * Persist a reflection memory deduped by a metadata key the caller
 * controls. Reflection memories surface via identity / lifestyle
 * retrieval paths, so this is what shapes the twin's long-term voice
 * around platform patterns.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.content       Reflection text (first-person; will be embedded).
 * @param {object} opts.metadata      Stamped on the memory; must include `source` + a
 *                                    unique-per-period field for dedup.
 * @param {string} opts.dedupMetadataKey  Which metadata field is the dedup key (e.g.
 *                                        'spotify_week_start').
 * @param {string} opts.dedupMetadataValue
 * @param {string} [opts.source]      Memory source label (default = metadata.source).
 * @returns {Promise<boolean>}        true if a new row was written.
 */
export async function persistDedupedReflection({
  userId,
  content,
  metadata,
  dedupMetadataKey,
  dedupMetadataValue,
  source,
}) {
  try {
    if (!userId || !content || !dedupMetadataKey || !dedupMetadataValue) return false;
    const memSource = source ?? metadata?.source;
    if (!memSource) return false;

    const { data: existing } = await supabaseAdmin
      .from('user_memories')
      .select('id')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .eq('metadata->>source', memSource)
      .eq(`metadata->>${dedupMetadataKey}`, dedupMetadataValue)
      .limit(1);
    if (existing && existing.length > 0) {
      log.debug('Reflection already exists, skipping', { userId, memSource, dedupMetadataValue });
      return false;
    }

    await addReflection(
      userId,
      content,
      [],
      { ...(metadata ?? {}), source: memSource },
      { reasoning: `Computed from ${memSource} analytics` },
    );
    log.info('Persisted platform reflection', { userId, memSource, dedupMetadataValue });
    return true;
  } catch (err) {
    log.warn('persistDedupedReflection threw', { error: err?.message ?? String(err) });
    return false;
  }
}

/**
 * Helper — current week's Monday in UTC, YYYY-MM-DD form. Used as the
 * dedup partition key for "weekly" reflections that get re-triggered
 * by multiple chat turns within the same week.
 */
export function currentWeekStartUTC() {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff),
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * Helper — today's date YYYY-MM-DD in UTC. Used as the dedup partition
 * key for "daily snapshot" reflections (Spotify recent listening,
 * GitHub events list) that re-trigger throughout the day.
 */
export function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}
