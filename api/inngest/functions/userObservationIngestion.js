/**
 * Inngest Function: Per-User Observation Ingestion
 * ================================================
 * Replaces the old inline "3 users per cron run" cap (audit M2). The ingestion
 * cron now fans out one INGEST_USER_OBSERVATIONS event per eligible user; this
 * function ingests that single user durably, so per-user freshness scales with
 * the queue instead of a 60s Vercel window.
 *
 * Cost: ingestion only does LLM work when a platform returns NEW data, so most
 * runs are cheap. Concurrency is capped (global + 1-per-user) and the
 * llmBudgetGuard daily hard limit is the ultimate backstop.
 */

import { inngest, EVENTS } from '../../services/inngestClient.js';
import { runObservationIngestion } from '../../services/observationIngestion.js';

export const userObservationIngestionFunction = inngest.createFunction(
  {
    id: 'observation-ingestion-user',
    name: 'Per-User Observation Ingestion',
    retries: 1,
    // 1-per-user: never run two ingestions for the same user concurrently.
    // Global limit 6: a large fan-out can't stampede the LLM provider or blow
    // the daily budget (llmBudgetGuard is the hard backstop).
    concurrency: [{ limit: 6 }, { limit: 1, key: 'event.data.userId' }],
  },
  { event: EVENTS.INGEST_USER_OBSERVATIONS },
  async ({ event, step }) => {
    const { userId } = event.data;
    if (!userId) return { skipped: true, reason: 'no_user_id' };

    const result = await step.run('ingest', async () => {
      return runObservationIngestion({ targetUserIds: [userId] });
    });

    const stored = result?.observationsStored || 0;

    // Per-user side effects the cron used to run after inline ingestion — only
    // when something new landed, best-effort (must not fail the ingestion step).
    // Dynamic imports mirror the cron's defensive pattern (avoid circular-dep /
    // Vercel NFT issues from pulling route-adjacent services into this bundle).
    if (stored > 0) {
      await step.run('post-process', async () => {
        const outcomes = await Promise.allSettled([
          import('../../services/twinsBrainService.js').then(m => m.twinsBrainService.createSnapshot(userId, 'automatic')),
          import('../../services/departmentService.js').then(m => m.checkDepartmentHeartbeats(userId)),
        ]);
        return { postProcessed: outcomes.filter(o => o.status === 'fulfilled').length };
      });
    }

    return { userId, observationsStored: stored };
  }
);
