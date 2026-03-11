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
import { createLogger } from '../services/logger.js';

const log = createLogger('CronObservation');

/**
 * Vercel Cron Job Handler
 * Called every 30 minutes by Vercel Cron
 */
export default async function handler(req, res) {
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
    }

    const status = result.errors.length > 0 && result.observationsStored === 0 ? 500 : 200;

    log.info('Observation ingestion completed', { result });

    return res.status(status).json({
      success: status === 200,
      ...result,
      timestamp: new Date().toISOString(),
      cronType: 'observation-ingestion',
    });
  } catch (error) {
    log.error('Observation ingestion failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      cronType: 'observation-ingestion',
    });
  }
}
