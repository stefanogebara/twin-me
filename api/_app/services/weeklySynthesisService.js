/**
 * Weekly Synthesis Service
 * ========================
 * Generates ONE narrative paragraph (120-180 words) describing the user's
 * last 7 days, as a close friend would read it back. Combines recent
 * platform_data observations with reflections to surface cross-platform
 * stories the twin sees (e.g. "you're grinding through an intense building
 * phase while your body is asking for recovery").
 *
 * Cache strategy:
 *   - One row per (user_id, week_start) in user_weekly_synthesis
 *   - week_start = Monday (UTC) of current ISO week
 *   - If a row exists for the current week, return it directly
 *   - Otherwise generate, upsert, and return
 *
 * Cost: ~1 DeepSeek TIER_ANALYSIS call per user per week (~$0.001-0.003).
 */

import { supabaseAdmin } from './database.js';
import { complete, TIER_ANALYSIS } from './llmGateway.js';
import { createLogger } from './logger.js';

const log = createLogger('WeeklySynthesis');

const MEMORY_LIMIT = 150;
const MIN_MEMORIES = 8; // Don't synthesize from too little signal

/**
 * Return the Monday (UTC) of the ISO week containing `date` as a YYYY-MM-DD string.
 */
function getWeekStart(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = d.getUTCDay(); // 0=Sun..6=Sat
  const daysFromMonday = (dayOfWeek + 6) % 7; // 0 if Mon, 6 if Sun
  d.setUTCDate(d.getUTCDate() - daysFromMonday);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch cached synthesis for the current week.
 * Returns the row or null.
 */
async function fetchCached(userId, weekStart) {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_weekly_synthesis')
      .select('narrative, generated_at, memory_count')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .maybeSingle();
    if (error) {
      log.warn('cache fetch error (non-fatal)', { error: error.message });
      return null;
    }
    return data ?? null;
  } catch (err) {
    log.warn('cache fetch threw (non-fatal)', { error: err.message });
    return null;
  }
}

/**
 * Pull the recent memory pool used as raw material.
 * Last 7 days, only platform_data + reflection types,
 * sorted by importance DESC then created_at DESC, capped at MEMORY_LIMIT.
 */
async function fetchRecentMemories(userId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .select('content, memory_type, importance_score, created_at, metadata')
      .eq('user_id', userId)
      .in('memory_type', ['platform_data', 'observation', 'reflection'])
      .gte('created_at', sevenDaysAgo)
      .order('importance_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(MEMORY_LIMIT);
    if (error) {
      log.warn('memories fetch error', { error: error.message });
      return [];
    }
    return data ?? [];
  } catch (err) {
    log.warn('memories fetch threw', { error: err.message });
    return [];
  }
}

/**
 * Call DeepSeek to produce a single 120-180 word paragraph in second person.
 */
async function synthesizeNarrative(memories) {
  const memoryBlock = memories
    .map(m => {
      const src = m.metadata?.source || m.metadata?.platform || m.memory_type;
      const type = m.memory_type === 'reflection' ? 'insight' : 'signal';
      return `[${type} · ${src}] ${(m.content || '').trim()}`;
    })
    .filter(line => line.length > 20)
    .join('\n');

  const system = `You are the user's digital twin looking back at their last seven days. You read memories as a human would — you notice patterns, tensions, rhythms. You do not list facts; you tell a story.`;

  const user = `Here are the most important signals and insights from this person's last seven days across their connected platforms (calendar, music, recovery data, messages, code, reading, etc.):

${memoryBlock}

Read these as a human would. What story do they tell as a single week? What tension, rhythm, or pattern do you see threading through them? Write ONE paragraph, 120-180 words, in second person addressing the person directly as "you". No meta-commentary. No lists. No bullet points. No emojis. No headings. No preamble like "This week you...". Just the paragraph itself, written like a close friend describing the week back to them — specific, observant, warm but honest about any tension you see.`;

  const result = await complete({
    tier: TIER_ANALYSIS,
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 500,
    temperature: 0.7,
    serviceName: 'weeklySynthesis-generate',
  });

  const text = (result?.content || '').trim();
  // Strip any wrapping quotes or stray headings the model sometimes adds
  return text
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(This week|Your week|Week \d+)[:\-\s]*/i, '')
    .trim();
}

/**
 * Upsert the synthesis row for (user_id, week_start).
 */
async function saveSynthesis(userId, weekStart, narrative, memoryCount) {
  try {
    const { error } = await supabaseAdmin
      .from('user_weekly_synthesis')
      .upsert(
        {
          user_id: userId,
          week_start: weekStart,
          narrative,
          memory_count: memoryCount,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,week_start' }
      );
    if (error) {
      log.warn('save error (non-fatal)', { error: error.message });
    }
  } catch (err) {
    log.warn('save threw (non-fatal)', { error: err.message });
  }
}

/**
 * Public entry: get (or generate) this week's synthesis for a user.
 *
 * Returns:
 *   { available: true, narrative, weekStart, generatedAt }
 *   { available: false, reason: 'insufficient_memories' | 'generation_failed', weekStart }
 */
export async function getWeeklySynthesis(userId) {
  const weekStart = getWeekStart();

  // 1. Cache hit — return immediately
  const cached = await fetchCached(userId, weekStart);
  if (cached && cached.narrative) {
    return {
      available: true,
      narrative: cached.narrative,
      weekStart,
      generatedAt: cached.generated_at,
    };
  }

  // 2. Pull raw material
  const memories = await fetchRecentMemories(userId);
  if (memories.length < MIN_MEMORIES) {
    log.info('insufficient memories for synthesis', { userId, count: memories.length });
    return {
      available: false,
      reason: 'insufficient_memories',
      weekStart,
    };
  }

  // 3. Synthesize
  let narrative = '';
  try {
    narrative = await synthesizeNarrative(memories);
  } catch (err) {
    log.warn('generation failed', { error: err.message });
    return { available: false, reason: 'generation_failed', weekStart };
  }

  if (!narrative || narrative.length < 60) {
    return { available: false, reason: 'generation_failed', weekStart };
  }

  // 4. Persist
  await saveSynthesis(userId, weekStart, narrative, memories.length);

  return {
    available: true,
    narrative,
    weekStart,
    generatedAt: new Date().toISOString(),
  };
}

export default { getWeeklySynthesis };
