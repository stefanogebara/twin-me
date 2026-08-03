/**
 * Vercel Cron Job Endpoint: Observation Ingestion
 *
 * Called by Vercel Cron (every 30 minutes). In the normal (all-users) path it
 * fans out one Inngest event per eligible user — each user is then ingested
 * durably by the per-user Inngest function (observation-ingestion-user), so
 * throughput scales with the queue instead of the old inline 3-users-per-run
 * cap (audit M2). If Inngest is unavailable, it falls back to the bounded inline
 * path (MAX_USERS_PER_RUN rotation) so ingestion still happens.
 *
 * The targetUserIds path (manual testing) always runs inline + synchronous.
 *
 * Security: Protected by CRON_SECRET environment variable.
 */

import { runObservationIngestion, getEligibleIngestionUserIds, getStarvedIngestionUserIds } from '../services/observationIngestion.js';
import { inngest, EVENTS } from '../services/inngestClient.js';
import { selfHealInngestRegistration } from '../services/inngestSelfHeal.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronObservation');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A user is "starved" if ingestion hasn't ATTEMPTED them in this many minutes
// — the per-poll sync clocks (platform_connections.last_sync_at etc.), NOT
// content recency (see getStarvedIngestionUserIds; keying off extracted_at
// mis-flagged dormant users every tick, fixed 2026-07-17). Lowered 90 -> 40
// (2026-07-15): the Inngest fan-out proved unreliable (registration goes stale
// on deploy; a resync returned modified but consumption still didn't recover),
// so the inline fallback is the path we actually depend on. 40min catches a
// freshly-connected user within ~1 cron tick REGARDLESS of Inngest, while
// staying above the 30min tick so a healthy Inngest run still marks users fresh
// before they qualify.
const STARVATION_STALE_MINUTES = 40;

/**
 * Run ingestion inline and fire the per-user post-processing side effects.
 * Used for manual targetUserIds runs and as the Inngest-unavailable fallback.
 */
async function runInlineIngestion(opts) {
  // Cron inline paths (manual scope, starvation fallback, Inngest-unavailable
  // fallback) all run inside the 60s Vercel window, so they defer the heavy
  // synthesis (#170): raw observations still store here, but experts / soul-sig
  // regen / insights / goals / metrics ride the Inngest fan-out's post-process
  // step when Inngest is healthy, with the daily soul-sig + insights crons and
  // serve-stale as the during-outage baseline. Keeps the cron response well
  // under the kill even when a heavy user lands new data.
  const result = await runObservationIngestion({ ...opts, deferPostProcess: true });

  if (result.observationsStored > 0 && Array.isArray(result.processedUserIds)) {
    // Auto-snapshot users who had new observations stored
    try {
      const { twinsBrainService } = await import('../services/twinsBrainService.js');
      for (const uid of result.processedUserIds) {
        twinsBrainService.createSnapshot(uid, 'automatic').catch(e =>
          log.warn('Auto-snapshot failed', { userId: uid, error: e.message })
        );
      }
    } catch (e) {
      log.warn('Auto-snapshot setup failed', { error: e.message });
    }

    // Pre-warm insights summary cache for processed users
    try {
      const { generateAndCacheSummary } = await import('./platform-insights.js');
      for (const uid of result.processedUserIds) {
        generateAndCacheSummary(uid).catch(e =>
          log.warn('Insights summary pre-warm failed', { userId: uid, error: e.message })
        );
      }
    } catch (e) {
      log.warn('Insights summary pre-warm setup failed', { error: e.message });
    }

    // Check if departments should propose actions (SoulOS heartbeat)
    try {
      const { checkDepartmentHeartbeats } = await import('../services/departmentService.js');
      for (const uid of result.processedUserIds) {
        checkDepartmentHeartbeats(uid).catch(e =>
          log.warn('Department heartbeat check failed (non-fatal)', { userId: uid.slice(0, 8), error: e.message })
        );
      }
    } catch (e) {
      log.warn('Department heartbeat setup failed', { error: e.message });
    }
  }

  return result;
}

/**
 * Vercel Cron Job Handler — called every 30 minutes by Vercel Cron.
 */
export default async function handler(req, res) {
  const startTime = Date.now();
  log.info('Observation ingestion endpoint called');

  // Security: Verify cron secret (timing-safe)
  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    log.error('Unauthorized cron request - invalid secret');
    return res.status(authResult.status).json({ success: false, error: authResult.error });
  }

  try {
    // Allow scoping to specific users via query/body param for manual testing.
    // audit-2026-05-09 S-M4: validate UUID shape before passing downstream —
    // defense-in-depth in case CRON_SECRET is ever compromised.
    const userIdsParam = req.query?.userIds || req.body?.userIds;
    const candidateIds = userIdsParam
      ? (typeof userIdsParam === 'string' ? userIdsParam.split(',').map(s => s.trim()).filter(Boolean) : userIdsParam)
      : null;
    if (Array.isArray(candidateIds) && candidateIds.length > 0) {
      const bad = candidateIds.filter(id => !UUID_RE.test(id));
      if (bad.length > 0) {
        log.warn('Rejecting cron run — userIds contains non-UUID values', { badCount: bad.length });
        return res.status(400).json({ success: false, error: 'userIds must be UUIDs' });
      }
    }
    const targetUserIds = candidateIds;

    // Manual scoping always runs inline + synchronous (for testing/replay).
    if (targetUserIds) {
      const result = await runInlineIngestion({ targetUserIds });
      const status = result.errors.length > 0 && result.observationsStored === 0 ? 500 : 200;
      const durationMs = Date.now() - startTime;
      await logCronExecution('observation-ingestion', status === 200 ? 'success' : 'error', durationMs, { ...result, mode: 'inline-manual' }, result.errors?.length > 0 ? result.errors.join('; ') : null);
      return res.status(status).json({ success: status === 200, ...result, mode: 'inline-manual', timestamp: new Date().toISOString(), cronType: 'observation-ingestion' });
    }

    // All-users path: enumerate eligible users and fan out one Inngest event each.
    const eligibleUserIds = await getEligibleIngestionUserIds();
    if (eligibleUserIds.length === 0) {
      log.info('No connected platform users — skipping run');
      await logCronExecution('observation-ingestion', 'success', Date.now() - startTime, { enqueued: 0, skipped: true });
      return res.json({ success: true, skipped: true, reason: 'no connected platforms', durationMs: Date.now() - startTime });
    }

    try {
      // One durable per-user job each (observation-ingestion-user Inngest fn).
      // Batch send = a single network round-trip for the whole fan-out.
      await inngest.send(eligibleUserIds.map(userId => ({ name: EVENTS.INGEST_USER_OBSERVATIONS, data: { userId } })));

      // Outcome verification: a successful send says NOTHING about consumption.
      // Live incident 2026-06-23 -> 2026-07-13: the app sync was rejected (plan
      // cap), every fan-out "succeeded", zero functions ran, ingestion was dead
      // for three weeks. If eligible users haven't been POLLED within
      // STARVATION_STALE_MINUTES, run the bounded inline path for the most
      // starved (the old pre-fanout budget: 3 users/run) - self-healing against
      // ANY consumer failure. The check itself failing must not break the cron.
      let starved = [];
      try {
        starved = await getStarvedIngestionUserIds(eligibleUserIds, STARVATION_STALE_MINUTES);
      } catch (checkErr) {
        log.warn('Starvation check errored - skipping inline fallback this run', { error: checkErr.message });
      }
      if (starved.length > 0) {
        log.warn('Fan-out succeeded but users are extraction-starved - running bounded inline fallback + Inngest self-heal', {
          starved: starved.length, inline: Math.min(starved.length, 3),
        });
        // Starvation is the signature of a non-consuming Inngest registration
        // (send "succeeds", no function runs). Fire a rate-limited best-effort
        // re-register CONCURRENTLY with the inline fallback so it adds ~0
        // wall-clock (never throws; capped to once/30min). The inline fallback
        // is what guarantees these users' data flows this run regardless.
        const [result] = await Promise.all([
          runInlineIngestion({ targetUserIds: starved.slice(0, 3) }),
          selfHealInngestRegistration(),
        ]);
        const durationMs = Date.now() - startTime;
        await logCronExecution('observation-ingestion', 'success', durationMs, {
          enqueued: eligibleUserIds.length, starved: starved.length, ...result, mode: 'inngest-fanout+starvation-fallback',
        });
        return res.json({ success: true, enqueued: eligibleUserIds.length, starved: starved.length, ...result, mode: 'inngest-fanout+starvation-fallback', durationMs, timestamp: new Date().toISOString(), cronType: 'observation-ingestion' });
      }

      const durationMs = Date.now() - startTime;
      log.info('Observation ingestion fanned out via Inngest', { enqueued: eligibleUserIds.length, durationMs });
      await logCronExecution('observation-ingestion', 'success', durationMs, { enqueued: eligibleUserIds.length, mode: 'inngest-fanout' });
      return res.json({ success: true, enqueued: eligibleUserIds.length, mode: 'inngest-fanout', durationMs, timestamp: new Date().toISOString(), cronType: 'observation-ingestion' });
    } catch (fanoutErr) {
      // Inngest unavailable (e.g. missing keys) — fall back to the bounded inline
      // rotation so ingestion still happens. MAX_USERS_PER_RUN is the fallback,
      // not the throughput governor.
      log.warn('Inngest fan-out failed; falling back to inline ingestion', { error: fanoutErr.message });
      const result = await runInlineIngestion({});
      const status = result.errors.length > 0 && result.observationsStored === 0 ? 500 : 200;
      const durationMs = Date.now() - startTime;
      await logCronExecution('observation-ingestion', status === 200 ? 'success' : 'error', durationMs, { ...result, mode: 'inline-fallback' }, result.errors?.length > 0 ? result.errors.join('; ') : null);
      return res.status(status).json({ success: status === 200, ...result, mode: 'inline-fallback', timestamp: new Date().toISOString(), cronType: 'observation-ingestion' });
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    await logCronExecution('observation-ingestion', 'error', durationMs, null, error.message);
    log.error('Observation ingestion failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      cronType: 'observation-ingestion',
    });
  }
}
