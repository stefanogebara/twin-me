/**
 * Whoop learning hooks — bridge the reactive analytics (which only
 * computes when the user explicitly asks) into the persistent layers
 * that shape the twin OVER time: proactive insights and reflection
 * memories.
 *
 * Two hooks today:
 *
 * 1. persistTrendAnomalyInsight(userId, intent, trend)
 *    When a trend analysis surfaces a >2σ anomaly, drop a row into
 *    proactive_insights so the twin spontaneously mentions it on the
 *    next chat turn ("your strain on June 1 was 2.5σ below your
 *    week — what happened?"). Deduped by (date, metric) to avoid
 *    re-prompting the user about the same anomaly across turns.
 *
 * 2. persistWeeklyReflection(userId, weekly)
 *    When a weekly summary computes, write the formatted summary into
 *    user_memories as a reflection memory. Reflections get retrieved
 *    by the identity / lifestyle expert paths, so this turns weekly
 *    Whoop data into long-term context that shapes the twin's voice
 *    instead of being a one-shot answer.
 *
 * Both hooks are fire-and-forget at the call site — the chat handler
 * doesn't wait on them and they don't block the user's reply.
 *
 * The dedup keys are deliberate. Anomaly: source='whoop_anomaly',
 * unique key = `${metric}|${YYYY-MM-DD}`. Weekly: source='whoop_weekly',
 * unique key = ISO week_start.
 */

import { supabaseAdmin } from '../database.js';
import { addReflection } from '../memoryStreamService.js';
import { createLogger } from '../logger.js';

const log = createLogger('WhoopLearningHooks');

const ANOMALY_SOURCE = 'whoop_anomaly';
const WEEKLY_SOURCE = 'whoop_weekly';

// Anomalies below this σ aren't worth surfacing — they pass the
// underlying stats test (>2σ from mean) but in a 7-day window the
// stddev is noisy. 2.0 keeps the headline anomalies, drops the
// borderline ones.
const ANOMALY_SURFACE_MIN_SIGMA = 2.0;

const METRIC_LABELS = {
  recovery: 'recovery score',
  hrv: 'HRV',
  rhr: 'resting heart rate',
  sleep_duration: 'sleep duration',
  sleep_performance: 'sleep performance',
  strain: 'daily strain',
};

function fmtNum(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '?';
  return Number(n).toFixed(digits);
}

/**
 * Compose the human-readable insight text for an anomaly. The twin
 * reads this verbatim in the next chat turn's proactive context, so
 * it's phrased as something the twin would casually bring up.
 */
function buildAnomalyInsight(metric, anomaly) {
  const label = METRIC_LABELS[metric] ?? metric;
  const when = anomaly.date && anomaly.date !== 'unknown' ? anomaly.date.slice(0, 10) : 'recently';
  const sigma = fmtNum(anomaly.deviation_from_mean, 1);
  const value = fmtNum(anomaly.value);
  return `Your ${label} on ${when} hit ${value} — that's ${sigma}σ from your recent average. Worth a check in.`;
}

/**
 * Persist a trend-anomaly as a proactive insight.
 *
 * Dedupes via the `sources` array: each anomaly row encodes its
 * metric+date as a "whoop_anomaly:${metric}:${date}" string. A query
 * against the JSONB sources field returns true if we already wrote
 * one, in which case we skip silently.
 *
 * Non-throwing — the catch logs and swallows so the chat reply is
 * never blocked by an insight write.
 *
 * @param {string} userId
 * @param {{ metric: string }} intent  Output of detectWhoopIntent — must include intent.metric
 * @param {object} trend  Output of analytics/getTrend.js
 */
export async function persistTrendAnomalyInsight(userId, intent, trend) {
  try {
    if (!Array.isArray(trend?.anomalies) || trend.anomalies.length === 0) return;
    if (!intent?.metric) return;

    // Surface only the single most extreme anomaly per call — multiple
    // queued at once would spam the user's inbox.
    const top = [...trend.anomalies].sort(
      (a, b) => Math.abs(b.deviation_from_mean) - Math.abs(a.deviation_from_mean),
    )[0];
    if (!top || Math.abs(top.deviation_from_mean) < ANOMALY_SURFACE_MIN_SIGMA) return;

    const dedupKey = `${ANOMALY_SOURCE}:${intent.metric}:${(top.date || 'unknown').slice(0, 10)}`;

    // Dedup check: any existing row with this source key already
    // covers this anomaly.
    const { data: existing } = await supabaseAdmin
      .from('proactive_insights')
      .select('id')
      .eq('user_id', userId)
      .contains('sources', [dedupKey])
      .limit(1);
    if (existing && existing.length > 0) {
      log.debug('Whoop anomaly insight already exists, skipping', { userId, dedupKey });
      return;
    }

    const insight = buildAnomalyInsight(intent.metric, top);
    await supabaseAdmin.from('proactive_insights').insert({
      user_id: userId,
      insight: insight.substring(0, 500),
      urgency: 'medium',
      category: 'health',
      sources: [dedupKey],
    });
    log.info('Persisted Whoop anomaly insight', {
      userId,
      metric: intent.metric,
      sigma: top.deviation_from_mean,
      date: top.date,
    });
  } catch (err) {
    log.warn('persistTrendAnomalyInsight failed', { error: err?.message ?? String(err) });
  }
}

/**
 * Persist a weekly summary as a reflection memory.
 *
 * Reflection memories carry importance 7-9 (via addReflection's default
 * scoring) and get retrieved by the identity / lifestyle expert paths
 * in `retrieveDiverseMemories`. So the twin will remember and reference
 * this week's averages even after the chat turn that triggered the
 * weekly summary is long gone.
 *
 * Deduped by metadata.whoop_week_start so re-running getWeeklySummary
 * for the same week (which the user often does — they ask "how's my
 * week" multiple times) doesn't bloat the memory stream.
 *
 * @param {string} userId
 * @param {object} weekly  Output of analytics/getWeeklySummary.js
 * @param {string} formattedSummary  Output of formatWeekly(weekly)
 */
export async function persistWeeklyReflection(userId, weekly, formattedSummary) {
  try {
    if (!weekly?.week_start || !formattedSummary) return;
    const weekStart = weekly.week_start.slice(0, 10);

    // Dedup — query metadata->>whoop_week_start. Memory stream is
    // append-only normally, but we don't want a week-summary memory
    // per chat turn.
    const { data: existing } = await supabaseAdmin
      .from('user_memories')
      .select('id')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .eq('metadata->>source', WEEKLY_SOURCE)
      .eq('metadata->>whoop_week_start', weekStart)
      .limit(1);
    if (existing && existing.length > 0) {
      log.debug('Whoop weekly reflection already exists, skipping', { userId, weekStart });
      return;
    }

    // Reflection-shaped content — first person, present tense, the
    // way the existing reflection engine writes them. The format
    // matters because retrieveDiverseMemories scores by relevance to
    // the user's message and the prompt builder pulls the raw text in.
    const content = `My Whoop week ${weekStart} (${weekly.recovery?.trend ?? 'stable'}): ${formattedSummary}`;

    await addReflection(
      userId,
      content,
      [], // no specific evidence_memory_ids for this reflection
      {
        source: WEEKLY_SOURCE,
        whoop_week_start: weekStart,
        whoop_recovery_avg: weekly.recovery?.average_score,
        whoop_workout_count: weekly.workouts?.count,
      },
      {
        reasoning: 'Computed from Whoop weekly summary',
      },
    );
    log.info('Persisted Whoop weekly reflection', { userId, weekStart });
  } catch (err) {
    log.warn('persistWeeklyReflection failed', { error: err?.message ?? String(err) });
  }
}
