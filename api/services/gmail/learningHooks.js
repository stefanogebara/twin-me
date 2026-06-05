/**
 * Gmail learning hooks. Two writes:
 *   1. Daily email-behavior reflection — dedup by today's date.
 *      Stamps chronotype + volume + top correspondents into metadata
 *      so future calls can compare against this turn as a baseline.
 *   2. Chronotype-shift insight — fires when the user's send-time
 *      chronotype (night-owl vs early-bird) flips relative to a
 *      baseline reflection >= 7 days old. That's a real "sleep
 *      pattern changed" / "new schedule" signal.
 *
 * The shift hook follows the same baseline-needs-a-week pattern as
 * YouTube's topic drift — no false positives on first-week usage.
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';
import {
  insertDedupedInsight,
  persistDedupedReflection,
  todayUTC,
} from '../platformAnalytics/sharedHooks.js';

const log = createLogger('GmailLearningHooks');

const SOURCE = 'gmail_behavior';
const BASELINE_MIN_AGE_DAYS = 7;
// Need this much chronotype dominance for the "you're a night owl" /
// "you're an early bird" label to apply at all. Below it the user is
// "neutral" and there's no shift to detect.
const CHRONOTYPE_DOMINANCE_PCT = 25;

function chronotypeLabel(chrono) {
  if (!chrono) return null;
  const owl = chrono.night_owl_pct ?? 0;
  const early = chrono.early_bird_pct ?? 0;
  if (owl >= CHRONOTYPE_DOMINANCE_PCT && owl > early) return 'night-owl';
  if (early >= CHRONOTYPE_DOMINANCE_PCT && early > owl) return 'early-bird';
  return 'neutral';
}

async function fetchBaselineReflection(userId) {
  try {
    const cutoffMs = Date.now() - BASELINE_MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
    const { data, error } = await supabaseAdmin
      .from('user_memories')
      .select('metadata, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .eq('metadata->>source', SOURCE)
      .lte('created_at', new Date(cutoffMs).toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return {
      chronotype: data[0].metadata?.gmail_chronotype ?? null,
      date: data[0].metadata?.gmail_date ?? data[0].created_at?.slice(0, 10),
    };
  } catch (err) {
    log.warn('fetchBaselineReflection failed', { error: err?.message ?? String(err) });
    return null;
  }
}

/**
 * @param {string} userId
 * @param {object} behavior  Output of analytics/getEmailBehavior.js
 * @param {string} summary  Output of formatEmailBehavior.
 */
export async function persistGmailLearning(userId, behavior, summary) {
  if (!userId || !behavior || !summary) return;
  const today = todayUTC();
  const currentChronotype = chronotypeLabel(behavior.chronotype);

  await persistDedupedReflection({
    userId,
    content: `My email behavior on ${today}: ${summary}`,
    metadata: {
      source: SOURCE,
      gmail_date: today,
      gmail_sent: behavior.volume?.sent,
      gmail_received: behavior.volume?.received,
      gmail_chronotype: currentChronotype,
      gmail_night_owl_pct: behavior.chronotype?.night_owl_pct ?? 0,
      gmail_early_bird_pct: behavior.chronotype?.early_bird_pct ?? 0,
    },
    dedupMetadataKey: 'gmail_date',
    dedupMetadataValue: today,
  });

  // Chronotype-shift insight — only fires when there's a clean label
  // on BOTH sides and they don't match. Reduces noise on neutral
  // weeks.
  if (!currentChronotype || currentChronotype === 'neutral') return;
  const baseline = await fetchBaselineReflection(userId);
  if (!baseline || !baseline.chronotype || baseline.chronotype === 'neutral') return;
  if (baseline.chronotype === currentChronotype) return;

  await insertDedupedInsight({
    userId,
    insight:
      `Your email send-time pattern flipped — on ${baseline.date} you were ${baseline.chronotype}, ` +
      `now you're ${currentChronotype}. New schedule or just a busy stretch?`,
    dedupKey: `gmail_chronotype_shift:${today}`,
    urgency: 'low',
    category: 'lifestyle',
  });
}
