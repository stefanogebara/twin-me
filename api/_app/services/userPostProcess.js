/**
 * User Post-Process — the synthesis half of observation ingestion.
 * ================================================================
 * Ingestion has two halves: (1) fetch platform data + store observations — cheap,
 * essential, must finish inside the cron/Inngest request; and (2) synthesis —
 * platform-expert reflections, the reflection engine, proactive insights, nudge
 * evaluation, goal tracking, activity metrics/anomalies, and the soul-signature
 * cache warm. Half (2) is CPU/LLM-heavy: run inline it starves Node's single
 * event loop under Fluid concurrency, so even the withDeadline guard added in
 * #190 can't fire its timer and the function hits Vercel's 60s kill → 504.
 *
 * This module is half (2), extracted so it runs OFF the ingestion request path.
 * The Inngest per-user function calls it from a dedicated `post-process` step,
 * which Inngest re-drives as a SEPARATE invocation with its own fresh budget —
 * so synthesis never competes with fetch+store for the same 60s window.
 *
 * Contract: everything here is best-effort. Every task is isolated with
 * Promise.allSettled so one failure never sinks the rest, and the function
 * never throws (raw ingestion has already succeeded by the time we run).
 */
import { shouldTriggerReflection, generateReflections } from './reflectionEngine.js';
import { runPlatformExpert } from './platformExperts.js';
import { generateProactiveInsights, evaluateNudgeOutcomes } from './proactiveInsights.js';
import { trackGoalProgress, generateGoalSuggestions } from './goalTrackingService.js';
import { calculateAllActivityMetrics, detectActivityAnomaly } from './activityMetricsService.js';
import { getSupabase } from './observationUtils.js';
import { createLogger } from './logger.js';

const log = createLogger('UserPostProcess');

/**
 * Update activity metrics, then scan each connected platform for an activity
 * anomaly and store any as a proactive insight. Extracted verbatim from the old
 * inline backgroundJobs gather in observationIngestion.js.
 */
async function runActivityMetricsAndAnomaly(userId) {
  await calculateAllActivityMetrics(userId);
  const sb = await getSupabase();
  if (!sb) return;
  const { data: conns } = await sb
    .from('platform_connections')
    .select('platform, content_volume')
    .eq('user_id', userId)
    .in('status', ['connected', 'pending']);
  for (const conn of conns || []) {
    const anomaly = await detectActivityAnomaly(userId, conn.platform, conn.content_volume || 0);
    if (anomaly?.anomaly) {
      const { error } = await sb.from('proactive_insights').insert({
        user_id: userId,
        category: 'activity_anomaly',
        content: anomaly.message,
        urgency: 'medium',
        metadata: { platform: conn.platform, zScore: anomaly.zScore, direction: anomaly.direction },
      });
      if (error) log.warn('Anomaly insight insert failed', { userId, platform: conn.platform, error: error.message });
    }
  }
}

/**
 * Run all post-ingestion synthesis for a single user. Best-effort, never throws.
 *
 * @param {string} userId
 * @param {{ platforms?: string[] }} [opts] platforms that had NEW observations
 *        this run — one expert reflection is run per platform (skip the rest to
 *        avoid re-analysing unchanged platforms).
 * @returns {Promise<{ userId: string, tasks: number, succeeded: number, failed: number }>}
 */
export async function runUserPostProcess(userId, { platforms = [] } = {}) {
  if (!userId) return { userId, tasks: 0, succeeded: 0, failed: 0 };

  /** @type {Array<[string, () => Promise<unknown>]>} */
  const tasks = [
    ['reflections', async () => {
      if (await shouldTriggerReflection(userId)) await generateReflections(userId);
    }],
    ...platforms.map(p => [`expert:${p}`, () => runPlatformExpert(userId, p)]),
    ['proactive-insights', () => generateProactiveInsights(userId)],
    ['nudge-eval', () => evaluateNudgeOutcomes(userId)],
    ['goal-progress', () => trackGoalProgress(userId, null)],
    ['goal-suggestions', () => generateGoalSuggestions(userId)],
    ['activity-metrics', () => runActivityMetricsAndAnomaly(userId)],
    ['cache-warm', async () => {
      const { warmUserCaches } = await import('./cacheWarmer.js');
      return warmUserCaches(userId, 'observation-ingestion');
    }],
  ];

  const settled = await Promise.allSettled(tasks.map(([, fn]) => fn()));

  let failed = 0;
  settled.forEach((r, i) => {
    if (r.status === 'rejected') {
      failed++;
      log.warn('Post-process task failed (non-fatal)', {
        userId, task: tasks[i][0], error: r.reason?.message || String(r.reason),
      });
    }
  });

  const succeeded = tasks.length - failed;
  log.info('Post-process complete', { userId, tasks: tasks.length, succeeded, failed, platforms: platforms.length });
  return { userId, tasks: tasks.length, succeeded, failed };
}

export default runUserPostProcess;
