/**
 * Temporal Comparison Service
 * ===========================
 * Produces a "You then vs you now" two-sentence comparison by sampling
 * reflections + facts from two time windows in the user's memory stream:
 *
 *   - THEN: memories from 45-90 days ago (60-day midpoint)
 *   - NOW:  memories from the last 14 days
 *
 * Both windows require MIN_MEMORIES entries. If either is too thin we return
 * `{ available: false, reason }` so the UI can hide the section.
 *
 * Output is a pair of twin-voice (second-person, no emojis) sentences stored
 * in `user_temporal_comparisons` with a 24-hour TTL.
 *
 * Usage:
 *   import { getTemporalComparison } from './temporalComparisonService.js';
 *   const result = await getTemporalComparison(userId);
 */

import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('TemporalComparison');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_MEMORIES_PER_WINDOW = 8;

const THEN_START_DAYS = 90;
const THEN_END_DAYS = 45;
const NOW_START_DAYS = 14;

const ELIGIBLE_MEMORY_TYPES = ['reflection', 'fact'];
const MAX_MEMORIES_PER_WINDOW = 40;

// In-memory lock to prevent concurrent regenerations for the same user.
const pendingGenerations = new Map();

function daysAgoIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function fetchWindowMemories(userId, startDaysAgo, endDaysAgo) {
  // startDaysAgo > endDaysAgo (e.g., 90 > 45). window = [startDaysAgo .. endDaysAgo].
  const startIso = daysAgoIso(startDaysAgo);
  const endIso = daysAgoIso(endDaysAgo);

  const { data, error } = await supabaseAdmin
    .from('user_memories')
    .select('content, memory_type, importance_score, created_at')
    .eq('user_id', userId)
    .in('memory_type', ELIGIBLE_MEMORY_TYPES)
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .order('importance_score', { ascending: false })
    .limit(MAX_MEMORIES_PER_WINDOW);

  if (error) {
    log.warn('Failed to fetch window memories', { error, startDaysAgo, endDaysAgo });
    return [];
  }
  return data || [];
}

function formatMemoriesForPrompt(memories) {
  return memories
    .map(m => `- [${m.memory_type}] ${(m.content || '').trim()}`)
    .filter(line => line.length > 10)
    .slice(0, 30)
    .join('\n');
}

async function generateComparison(userId) {
  log.info('Generating fresh temporal comparison', { userId });

  // Fetch both windows in parallel
  const [thenMemories, nowMemories] = await Promise.all([
    fetchWindowMemories(userId, THEN_START_DAYS, THEN_END_DAYS),
    fetchWindowMemories(userId, NOW_START_DAYS, 0),
  ]);

  if (thenMemories.length < MIN_MEMORIES_PER_WINDOW) {
    return {
      available: false,
      reason: `Not enough historical data yet (${thenMemories.length}/${MIN_MEMORIES_PER_WINDOW} memories from 45-90 days ago).`,
    };
  }
  if (nowMemories.length < MIN_MEMORIES_PER_WINDOW) {
    return {
      available: false,
      reason: `Not enough recent data yet (${nowMemories.length}/${MIN_MEMORIES_PER_WINDOW} memories from the last 14 days).`,
    };
  }

  // Midpoint month labels for the prompt
  const thenMid = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const nowMid = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long' });
  const thenMonth = monthFmt.format(thenMid);
  const nowMonth = monthFmt.format(nowMid);

  const system = [
    'You are the user\'s AI twin. Compare who this person was ~60 days ago to who they are now.',
    'Write exactly TWO sentences in second person ("you"), one for THEN and one for NOW.',
    'Be specific — use concrete details (times, activities, metrics, patterns) from the evidence.',
    'Contrast the two sentences so the change between THEN and NOW is visible.',
    'Do not use emojis. Do not hedge. Do not add preamble. No markdown.',
    'Output STRICT JSON exactly in this shape:',
    '{"then": "In <month> you were ...", "now": "In <month> you\'re ..."}',
  ].join(' ');

  const user = [
    `THEN WINDOW (${thenMonth}, ~45-90 days ago):`,
    formatMemoriesForPrompt(thenMemories),
    '',
    `NOW WINDOW (${nowMonth}, last 14 days):`,
    formatMemoriesForPrompt(nowMemories),
    '',
    `Write the JSON comparison. Lead each sentence with the month: "In ${thenMonth} you ..." and "In ${nowMonth} you\'re ...".`,
  ].join('\n');

  let thenText = '';
  let nowText = '';

  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: 300,
      temperature: 0.5,
      serviceName: 'temporalComparison',
    });

    const raw = (result.content || '').trim();
    // Extract the JSON block tolerantly
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');
    const parsed = JSON.parse(jsonMatch[0]);
    thenText = (parsed.then || '').trim();
    nowText = (parsed.now || '').trim();
  } catch (err) {
    log.warn('LLM comparison generation failed', { error: err });
    return { available: false, reason: 'Comparison generation failed.' };
  }

  if (!thenText || !nowText) {
    return { available: false, reason: 'Comparison generation returned empty.' };
  }

  // Persist
  const generatedAt = new Date().toISOString();
  const { error: upsertErr } = await supabaseAdmin
    .from('user_temporal_comparisons')
    .upsert(
      {
        user_id: userId,
        then_text: thenText,
        now_text: nowText,
        generated_at: generatedAt,
      },
      { onConflict: 'user_id' },
    );

  if (upsertErr) {
    log.warn('Failed to persist temporal comparison', { error: upsertErr });
  }

  return {
    available: true,
    then: thenText,
    now: nowText,
    generatedAt,
  };
}

/**
 * Get the user's temporal comparison. Returns cache if < 24h old.
 *
 * @param {string} userId
 * @returns {Promise<{ available: boolean, then?: string, now?: string, generatedAt?: string, reason?: string }>}
 */
export async function getTemporalComparison(userId) {
  if (!supabaseAdmin) {
    return { available: false, reason: 'Database unavailable.' };
  }

  try {
    const { data: cached } = await supabaseAdmin
      .from('user_temporal_comparisons')
      .select('then_text, now_text, generated_at')
      .eq('user_id', userId)
      .single();

    if (cached && cached.then_text && cached.now_text && cached.generated_at) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (age < CACHE_TTL_MS) {
        return {
          available: true,
          then: cached.then_text,
          now: cached.now_text,
          generatedAt: cached.generated_at,
        };
      }
    }

    // Join in-progress generation if any
    if (pendingGenerations.has(userId)) {
      return pendingGenerations.get(userId);
    }

    const promise = generateComparison(userId).finally(() => pendingGenerations.delete(userId));
    pendingGenerations.set(userId, promise);
    return await promise;
  } catch (err) {
    pendingGenerations.delete(userId);
    log.warn('getTemporalComparison error', { error: err });
    return { available: false, reason: 'Unexpected error.' };
  }
}

export default { getTemporalComparison };
