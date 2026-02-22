/**
 * Vercel Cron Job Endpoint: Observation Ingestion
 *
 * Called by Vercel Cron (every 30 minutes) to pull platform data
 * and store natural-language observations in the memory stream.
 *
 * Security: Protected by CRON_SECRET environment variable
 */

import { runObservationIngestion } from '../services/observationIngestion.js';

/**
 * Vercel Cron Job Handler
 * Called every 30 minutes by Vercel Cron
 */
export default async function handler(req, res) {
  console.log('[CRON] Observation ingestion endpoint called');

  // Security: Verify cron secret
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (!isDevelopment) {
    if (!cronSecret) {
      console.error('[CRON] CRON_SECRET not configured in production');
      return res.status(500).json({
        success: false,
        error: 'Configuration Error',
        message: 'CRON_SECRET must be configured in production',
      });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('[CRON] Unauthorized cron request - invalid secret');
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid CRON_SECRET',
      });
    }
  }

  try {
    const result = await runObservationIngestion();

    const status = result.errors.length > 0 && result.observationsStored === 0 ? 500 : 200;

    console.log('[CRON] Observation ingestion completed:', result);

    return res.status(status).json({
      success: status === 200,
      ...result,
      timestamp: new Date().toISOString(),
      cronType: 'observation-ingestion',
    });
  } catch (error) {
    console.error('[CRON] Observation ingestion failed:', error.message);
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      cronType: 'observation-ingestion',
    });
  }
}
