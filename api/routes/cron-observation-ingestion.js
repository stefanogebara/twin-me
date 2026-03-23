/**
 * Vercel Cron Job Endpoint: Observation Ingestion
 *
 * Called by Vercel Cron (every 30 minutes) to pull platform data
 * and store natural-language observations in the memory stream.
 *
 * Security: Protected by CRON_SECRET environment variable
 */

import { runObservationIngestion } from '../services/observationIngestion.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
import { logCronExecution } from '../services/cronLogger.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('CronObservation');

/**
 * Vercel Cron Job Handler
 * Called every 30 minutes by Vercel Cron
 */
export default async function handler(req, res) {
  const startTime = Date.now();
  log.info('Observation ingestion endpoint called');

  // Security: Verify cron secret (timing-safe)
  const authResult = verifyCronSecret(req);
  if (!authResult.authorized) {
    log.error('Unauthorized cron request - invalid secret');
    return res.status(authResult.status).json({
      success: false,
      error: authResult.error,
    });
  }

  try {
    const result = await runObservationIngestion();

    // Auto-snapshot users who had new observations stored
    if (result.observationsStored > 0 && Array.isArray(result.processedUserIds)) {
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

      // Auto-retrain personality oracle if enough new memories accumulated (200+ since last train, 7-day cooldown)
      try {
        const { checkBatchRetrain } = await import('../services/finetuning/autoRetrain.js');
        checkBatchRetrain(result.processedUserIds).then(retrainResult => {
          if (retrainResult.triggered > 0) {
            log.info('Auto-retrain triggered', { checked: retrainResult.checked, triggered: retrainResult.triggered });
          }
        }).catch(e => log.warn('Auto-retrain check failed', { error: e.message }));
      } catch (e) {
        log.warn('Auto-retrain setup failed', { error: e.message });
      }
    }

    const status = result.errors.length > 0 && result.observationsStored === 0 ? 500 : 200;
    const durationMs = Date.now() - startTime;

    await logCronExecution(
      'observation-ingestion',
      status === 200 ? 'success' : 'error',
      durationMs,
      result,
      result.errors?.length > 0 ? result.errors.join('; ') : null
    );

    log.info('Observation ingestion completed', { result });

    return res.status(status).json({
      success: status === 200,
      ...result,
      timestamp: new Date().toISOString(),
      cronType: 'observation-ingestion',
    });
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
