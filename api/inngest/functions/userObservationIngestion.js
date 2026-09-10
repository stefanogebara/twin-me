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
import { runUserPostProcess } from '../../services/userPostProcess.js';

export const userObservationIngestionFunction = inngest.createFunction(
  {
    id: 'observation-ingestion-user',
    name: 'Per-User Observation Ingestion',
    retries: 1,
    // 1-per-user: never run two ingestions for the same user concurrently.
    // Global limit 5 = the Inngest PLAN CAP; an over-cap limit does break an
    // app sync, so keep it here and raise it only with a plan upgrade
    // (guarded by tests/goals/inngest-plan-limits.goal.test.js).
    //
    // It was NOT the cause of the 2026-06 -> 2026-07 ingestion outage, though
    // the comment here used to say so. The real cause was the v3
    // createFunction signature against inngest v4 (PR #270): this function had
    // no triggers and no callable handler, so it never ran once until
    // 2026-08-26. The inline starvation fallback was doing all the work.
    concurrency: [{ limit: 5 }, { limit: 1, key: 'event.data.userId' }],
    triggers: [{ event: EVENTS.INGEST_USER_OBSERVATIONS }],
  },
  async ({ event, step }) => {
    const { userId } = event.data;
    if (!userId) return { skipped: true, reason: 'no_user_id' };

    // Step 1: fetch + store ONLY (deferPostProcess). Inngest re-drives each step
    // as its OWN invocation, so the heavy synthesis in step 2 runs in a separate
    // 60s window and never starves this step's event loop (#170 — the residual
    // 504 after #190 was inline synthesis pegging the single-threaded loop so the
    // withDeadline timer couldn't fire).
    const result = await step.run('ingest', async () => {
      return runObservationIngestion({ targetUserIds: [userId], deferPostProcess: true });
    });

    const stored = result?.observationsStored || 0;
    const platforms = result?.platformsByUser?.[userId] || [];

    // Step 2: the deferred synthesis (platform experts, reflections, insights,
    // nudge eval, goals, activity metrics, soul-sig cache warm) plus the per-user
    // snapshot + department heartbeats — only when something new landed,
    // best-effort (must not fail the ingest step). Dynamic imports mirror the
    // cron's defensive pattern (avoid circular-dep / Vercel NFT drop).
    if (stored > 0) {
      await step.run('post-process', async () => {
        const outcomes = await Promise.allSettled([
          runUserPostProcess(userId, { platforms }),
          import('../../services/twinsBrainService.js').then(m => m.twinsBrainService.createSnapshot(userId, 'automatic')),
          import('../../services/departmentService.js').then(m => m.checkDepartmentHeartbeats(userId)),
        ]);
        return { postProcessed: outcomes.filter(o => o.status === 'fulfilled').length };
      });
    }

    return { userId, observationsStored: stored };
  }
);
