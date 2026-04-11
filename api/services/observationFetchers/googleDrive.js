/**
 * Google Drive observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';
import { getSupabase } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Fetch Google Drive data and return natural-language observations.
 * Drive uses the same OAuth token as Calendar/Gmail (bundled Google Workspace scopes).
 */
async function fetchGoogleDriveObservations(userId) {
  const observations = [];

  // Drive uses the same OAuth token as Calendar/Gmail (bundled Google Workspace scopes)
  const tokenResult = await getValidAccessToken(userId, 'google_calendar');
  if (!tokenResult.success || !tokenResult.accessToken) {
    log.warn('Google Drive: no valid token', { userId });
    return observations;
  }

  try {
    const { syncDriveToObservations } = await import('../enrichment/googleDriveProvider.js');

    // Get user name for natural language observations
    const supabase = await getSupabase();
    const { data: userRow } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', userId)
      .single();
    const userName = userRow?.first_name || 'User';

    const driveObs = await syncDriveToObservations(tokenResult.accessToken, userName);

    for (const obs of driveObs) {
      observations.push({
        content: obs.content,
        contentType: 'weekly_summary', // Drive files change slowly
        metadata: obs.metadata,
      });
    }

    log.info('Google Drive observations', { userId, count: observations.length });
  } catch (err) {
    log.warn('Google Drive ingestion failed', { userId, error: err.message });
  }

  return observations;
}

export default fetchGoogleDriveObservations;
export { fetchGoogleDriveObservations };
