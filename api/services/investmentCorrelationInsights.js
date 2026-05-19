/**
 * Investment Correlation Insights — Financial-Emotional Twin, Phase 4.3
 * =======================================================================
 * Dedicated, deterministic generator for the moat insight:
 *
 *   "5 of your 7 sells in the last 30 days happened on days when your
 *    Whoop recovery was below 50%."
 *
 * Why dedicated:
 *   - The existing generateProactiveInsights() runs the generic LLM-driven
 *     prompt against ALL recent memories. It can SOMETIMES surface
 *     trade-vs-recovery patterns, but the signal-to-noise is poor — the LLM
 *     gets distracted by 200+ spending memories and other reflections.
 *   - This generator scans ONLY investment events + their emotional_context,
 *     applies statistical heuristics (no LLM), and writes one or two
 *     well-grounded insight rows per run. Higher precision, lower cost,
 *     deterministic phrasing.
 *
 * Insight categories surfaced (each requires >= MIN_TRADES_FOR_PATTERN trades):
 *   1. Sells skewed to low-recovery days
 *   2. Buys skewed to high-stress days
 *   3. Combined trade direction correlated with recovery delta
 *
 * Storage: writes proactive_insights rows with category='trend' and
 * metadata.subcategory='investment_correlation' so they slot into the
 * existing dashboard surface without a new UI route. Frontend can filter
 * on the subcategory later if it wants a dedicated panel.
 *
 * Cooldown: max once per user per 48h (this is a slow-changing pattern;
 * we don't want to repeat the same insight every cron tick).
 */

import { supabaseAdmin } from './database.js';
import { stripEmoji } from '../utils/stripEmoji.js';
import { createLogger } from './logger.js';

const log = createLogger('investment-correlation-insights');

const LOOKBACK_DAYS = 60;
const MIN_TRADES_FOR_PATTERN = 3;           // need >= 3 sells (or buys) to call a pattern
const LOW_RECOVERY_THRESHOLD = 0.50;         // recovery score < 50 = "low" (Whoop convention: 0-100)
const HIGH_STRESS_THRESHOLD = 0.65;          // computed_stress_score >= 0.65 = "high"
const PATTERN_BIAS_THRESHOLD = 0.60;         // >= 60% of trades in the cohort must share the property
const COOLDOWN_HOURS = 48;                   // max one insight per 48h

/**
 * Check whether we've already written an investment_correlation insight
 * for this user in the last COOLDOWN_HOURS. Prevents spam — the patterns
 * change slowly.
 */
async function isOnCooldown(userId) {
  const since = new Date(Date.now() - COOLDOWN_HOURS * 3600_000).toISOString();
  const { data } = await supabaseAdmin
    .from('proactive_insights')
    .select('id, created_at')
    .eq('user_id', userId)
    .filter('metadata->>subcategory', 'eq', 'investment_correlation')
    .gte('created_at', since)
    .limit(1);
  return Boolean(data && data.length > 0);
}

/**
 * Pull the last LOOKBACK_DAYS of investment events for the user, joined
 * with their emotional context. Filters to events that have at least
 * SOMETHING tagged on emotional_context — events with no signals can't
 * support a correlation insight.
 */
async function fetchTaggedInvestmentEvents(userId) {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from('user_transactions')
    .select(`
      id, amount, transaction_date, category, merchant_normalized,
      emotional_context:transaction_emotional_context (
        recovery_score, computed_stress_score, calendar_load, music_valence
      )
    `)
    .eq('user_id', userId)
    .eq('account_type', 'investment')
    .gte('transaction_date', since)
    .order('transaction_date', { ascending: false })
    .limit(500);
  if (error) {
    log.warn(`fetch failed for user ${userId}: ${error.message}`);
    return [];
  }
  return (data || []).filter(r => {
    const ec = r.emotional_context;
    return ec && (ec.recovery_score != null || ec.computed_stress_score != null || ec.calendar_load != null);
  });
}

/**
 * Split events into sells (cash inflow = amount > 0) and buys
 * (cash outflow = amount < 0). Returns null if either bucket is too
 * small for pattern detection.
 */
function partitionByDirection(events) {
  const sells = events.filter(e => Number(e.amount) > 0 && /^investment_sell/.test(e.category || ''));
  const buys = events.filter(e => Number(e.amount) < 0 && /^investment_buy/.test(e.category || ''));
  return { sells, buys };
}

/**
 * Return the fraction of events whose recovery_score is below threshold.
 * Events without a recovery_score are EXCLUDED from both numerator and
 * denominator — they shouldn't dilute the cohort.
 */
function fractionUnderRecovery(events, threshold) {
  const withScore = events.filter(e => e.emotional_context?.recovery_score != null);
  if (withScore.length === 0) return { fraction: 0, n: 0, k: 0 };
  // Whoop API returns recovery as 0-100. Our DB stores it identically.
  const k = withScore.filter(e => Number(e.emotional_context.recovery_score) < threshold * 100).length;
  return { fraction: k / withScore.length, n: withScore.length, k };
}

/**
 * Return the fraction of events whose computed_stress_score is at or
 * above threshold. computed_stress_score is 0-1 in our schema.
 */
function fractionOverStress(events, threshold) {
  const withScore = events.filter(e => e.emotional_context?.computed_stress_score != null);
  if (withScore.length === 0) return { fraction: 0, n: 0, k: 0 };
  const k = withScore.filter(e => Number(e.emotional_context.computed_stress_score) >= threshold).length;
  return { fraction: k / withScore.length, n: withScore.length, k };
}

/**
 * Generate the actual insight rows. Returns array of { insight,
 * urgency, category, department, metadata } objects ready for insert.
 */
function detectPatterns({ sells, buys }) {
  const insights = [];

  // Pattern 1: sells skewed to low-recovery days
  const sellsLowRec = fractionUnderRecovery(sells, LOW_RECOVERY_THRESHOLD);
  if (sellsLowRec.n >= MIN_TRADES_FOR_PATTERN && sellsLowRec.fraction >= PATTERN_BIAS_THRESHOLD) {
    insights.push({
      insight: `${sellsLowRec.k} of your ${sellsLowRec.n} sells in the last ${LOOKBACK_DAYS} days happened on days when your Whoop recovery was below ${Math.round(LOW_RECOVERY_THRESHOLD * 100)}%. Selling under low recovery tends to lock in losses — next time, try sitting on the decision for 24 hours and re-checking when you're sharper.`,
      urgency: 'medium',
      category: 'trend',
      department: 'finance',
      metadata: { subcategory: 'investment_correlation', pattern: 'sells_low_recovery', n: sellsLowRec.n, k: sellsLowRec.k },
    });
  }

  // Pattern 2: buys skewed to high-stress days
  const buysHighStress = fractionOverStress(buys, HIGH_STRESS_THRESHOLD);
  if (buysHighStress.n >= MIN_TRADES_FOR_PATTERN && buysHighStress.fraction >= PATTERN_BIAS_THRESHOLD) {
    insights.push({
      insight: `${buysHighStress.k} of your ${buysHighStress.n} buys in the last ${LOOKBACK_DAYS} days happened on high-stress days (computed stress >= ${Math.round(HIGH_STRESS_THRESHOLD * 100)}%). Even good picks at the wrong moment underperform — worth flagging when you next feel the urge to buy under pressure.`,
      urgency: 'medium',
      category: 'trend',
      department: 'finance',
      metadata: { subcategory: 'investment_correlation', pattern: 'buys_high_stress', n: buysHighStress.n, k: buysHighStress.k },
    });
  }

  // Pattern 3: direction-vs-recovery delta. If buys land on much higher-recovery
  // days than sells (or vice versa), surface the cohort gap. Threshold: >= 15
  // recovery-point gap AND both cohorts have >= MIN_TRADES_FOR_PATTERN.
  const buysWithRec = buys.filter(e => e.emotional_context?.recovery_score != null);
  const sellsWithRec = sells.filter(e => e.emotional_context?.recovery_score != null);
  if (buysWithRec.length >= MIN_TRADES_FOR_PATTERN && sellsWithRec.length >= MIN_TRADES_FOR_PATTERN) {
    const avg = arr => arr.reduce((s, e) => s + Number(e.emotional_context.recovery_score), 0) / arr.length;
    const buyAvg = avg(buysWithRec);
    const sellAvg = avg(sellsWithRec);
    const gap = buyAvg - sellAvg;
    if (Math.abs(gap) >= 15) {
      const direction = gap > 0
        ? `you buy on higher-recovery days (avg ${Math.round(buyAvg)}%) and sell on lower-recovery days (avg ${Math.round(sellAvg)}%)`
        : `you buy on lower-recovery days (avg ${Math.round(buyAvg)}%) and sell on higher-recovery days (avg ${Math.round(sellAvg)}%)`;
      const verdict = gap > 0
        ? 'Classic stress-driven selling pattern. The next time you feel the urge to sell on a low day, the data says wait.'
        : 'Unusual — you sell when sharp and buy when tired. Could be intentional, but worth checking whether the timing is rational.';
      insights.push({
        insight: `Across your last ${buysWithRec.length + sellsWithRec.length} trades with Whoop data, ${direction}. ${verdict}`,
        urgency: 'medium',
        category: 'trend',
        department: 'finance',
        metadata: {
          subcategory: 'investment_correlation',
          pattern: 'recovery_direction_gap',
          buy_avg: Math.round(buyAvg),
          sell_avg: Math.round(sellAvg),
          gap: Math.round(gap),
        },
      });
    }
  }

  return insights;
}

/**
 * Main entry: scan recent investment activity, detect correlation
 * patterns, write up to MAX_INSIGHTS_PER_RUN rows to proactive_insights.
 * Idempotent — skips when on cooldown or when no patterns detected.
 */
const MAX_INSIGHTS_PER_RUN = 2;

export async function generateInvestmentCorrelationInsights(userId) {
  if (!userId) return { stored: 0, reason: 'no_user' };

  if (await isOnCooldown(userId)) {
    return { stored: 0, reason: 'cooldown' };
  }

  const events = await fetchTaggedInvestmentEvents(userId);
  if (events.length < MIN_TRADES_FOR_PATTERN * 2) {
    return { stored: 0, reason: 'insufficient_data', eventCount: events.length };
  }

  const { sells, buys } = partitionByDirection(events);
  const insights = detectPatterns({ sells, buys });
  if (insights.length === 0) {
    return { stored: 0, reason: 'no_pattern' };
  }

  // Write up to MAX_INSIGHTS_PER_RUN. Stripe emoji defensively (mirrors the
  // 2026-05-15 H7 guard pattern from proactiveInsights.js).
  let stored = 0;
  for (const item of insights.slice(0, MAX_INSIGHTS_PER_RUN)) {
    const insertData = {
      user_id: userId,
      insight: stripEmoji(item.insight).substring(0, 500),
      urgency: item.urgency,
      category: item.category,
      department: item.department,
      sources: ['Plaid', 'Whoop'],
      metadata: item.metadata,
    };
    const { error } = await supabaseAdmin.from('proactive_insights').insert(insertData);
    if (!error) stored++;
    else log.warn(`insert failed for user ${userId}: ${error.message}`);
  }

  log.info(`generated ${stored} investment-correlation insights for user ${userId}`);
  return { stored, sellCount: sells.length, buyCount: buys.length };
}

// Re-export internals for direct unit testing — same pattern proactiveInsights.js uses.
export {
  fractionUnderRecovery,
  fractionOverStress,
  partitionByDirection,
  detectPatterns,
};
