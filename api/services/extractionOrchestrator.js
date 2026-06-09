/**
 * Extraction Orchestrator
 *
 * Coordinates extraction across all connected platforms and builds soul signatures.
 * Manages extraction jobs, retry logic, and periodic syncing.
 */

import { supabaseAdmin } from './database.js';
import { extractSpotifyData } from './spotifyExtraction.js';
// Discord/GitHub now use observation-based extraction (observationIngestion.js)
// MVP Feature Extractors
// Gmail, Outlook, LinkedIn now use observation-based extraction (observationIngestion.js)
// Pattern Learning Bridge
import patternLearningBridge from './patternLearningBridge.js';

import { addPlatformObservation } from './memoryStreamService.js';
import { createLogger } from './logger.js';
import { logExtractionRun, INGESTION_SOURCE } from './extractionTelemetry.js';
import { getDescriptor, normalizeRawExtractorResult } from './extractionDispatch.js';

const log = createLogger('ExtractionOrchestrator');

/**
 * Store observation array into memory stream. Shared by YouTube/Whoop/etc.
 * @param {string} userId
 * @param {string} platform
 * @param {Array<string|{content:string, contentType?:string}>} observations
 * @returns {number} count stored
 */
async function storeObservationsToMemory(userId, platform, observations) {
  let stored = 0;
  for (const obs of observations) {
    const content = typeof obs === 'string' ? obs : obs.content;
    const contentType = typeof obs === 'string' ? undefined : obs.contentType;
    try {
      const ok = await addPlatformObservation(userId, content, platform, {
        ingestion_source: 'on_demand',
        ingested_at: new Date().toISOString(),
        ...(contentType ? { content_type: contentType } : {}),
      });
      if (ok) stored++;
    } catch (e) {
      log.warn('Failed to store observation', { platform, error: e.message });
    }
  }
  return stored;
}

/**
 * Run an 'observation' descriptor: fetch NL observations -> memory stream, then
 * optionally run the behavioral feature extractor (non-blocking, matching the
 * prior switch). Throws on fetch failure (caught by runPlatformExtraction).
 * @returns {Promise<{success: boolean, itemsExtracted: number}>}
 */
async function extractObservationPlatform(userId, platform, descriptor) {
  const storeAs = descriptor.storeAs || platform;
  const mod = await import(descriptor.module);
  const observations = await mod[descriptor.fn](userId);
  const itemsExtracted = await storeObservationsToMemory(userId, storeAs, observations);
  log.info('Extracted observations', { platform: storeAs, fetched: observations.length, stored: itemsExtracted });

  if (descriptor.feature) {
    // Behavioral feature extraction is best-effort: never fail the run for it.
    try {
      const featureMod = await import(descriptor.feature);
      const features = await featureMod.default.extractFeatures(userId);
      if (features && features.length > 0) {
        await featureMod.default.saveFeatures(features);
        log.info('Extracted behavioral features', { platform: storeAs, count: features.length });
      }
    } catch (featureError) {
      log.warn('Feature extraction error (non-blocking)', { platform: storeAs, error: featureError.message });
    }
  }

  return { success: true, itemsExtracted };
}

/**
 * Run the Spotify descriptor: raw `comprehensive_music_profile` via
 * extractSpotifyData PLUS memory observations (consolidation Phase 1, #93).
 * Preserves extractSpotifyData's success/requiresReauth flags verbatim; the
 * observation fetch is non-blocking. Throws on raw-extract failure (caught by
 * runPlatformExtraction -> job marked failed so retry can pick it up).
 */
async function extractSpotifyAndObservations(userId) {
  const result = await extractSpotifyData(userId);
  let itemsExtracted = result.itemsExtracted || 0;
  try {
    const { fetchSpotifyObservations } = await import('./observationFetchers/spotify.js');
    const spotifyObs = await fetchSpotifyObservations(userId);
    itemsExtracted += await storeObservationsToMemory(userId, 'spotify', spotifyObs);
    log.info('Extracted Spotify observations', { fetched: spotifyObs.length });
  } catch (obsErr) {
    log.warn('Spotify observation fetch error (non-blocking)', { error: obsErr.message });
  }
  // Spread first so the augmented itemsExtracted wins, success/requiresReauth pass through.
  return { ...result, itemsExtracted };
}

/**
 * Run a 'raw_extractor' descriptor: niche extractors/* that write raw
 * user_platform_data via extractAll(userId, connectorId).
 */
async function extractRawPlatform(userId, platform, descriptor) {
  const { extractAll } = await import(descriptor.module);
  const raw = await extractAll(userId, null);
  const normalized = normalizeRawExtractorResult(descriptor, raw);
  log.info('Extracted observations', { platform, stored: normalized.itemsExtracted });
  return normalized;
}

/**
 * Generic per-platform extraction dispatcher (consolidation Phase 3). Replaces
 * the orchestrator's former 430-line switch with a data-driven lookup. Never
 * throws: a platform failure is normalized to { success: false } so the caller's
 * job-status logic runs identically for every kind.
 * @returns {Promise<{success: boolean, itemsExtracted?: number, error?: string, requiresReauth?: boolean}>}
 */
async function runPlatformExtraction(userId, platform) {
  const descriptor = getDescriptor(platform);
  if (!descriptor) {
    log.info('Unknown platform', { platform });
    return { success: false, error: 'Unknown platform', itemsExtracted: 0 };
  }

  try {
    switch (descriptor.kind) {
      case 'spotify':
        return await extractSpotifyAndObservations(userId);
      case 'observation':
        return await extractObservationPlatform(userId, platform, descriptor);
      case 'raw_extractor':
        return await extractRawPlatform(userId, platform, descriptor);
      default:
        log.info('Unknown platform kind', { platform, kind: descriptor.kind });
        return { success: false, error: 'Unknown platform', itemsExtracted: 0 };
    }
  } catch (err) {
    log.error('Platform extraction error', { platform, error: err });
    return { success: false, error: err.message, itemsExtracted: 0 };
  }
}


class ExtractionOrchestrator {
  constructor() {
    this.runningJobs = new Map(); // Track running extraction jobs
    this.periodicSyncInterval = null;
  }

  /**
   * Extract data from all connected platforms for a user
   * @param {string} userId - User ID
   * @returns {Object} Extraction results for all platforms
   */
  async extractAllPlatforms(userId) {
    log.info('Starting extraction for all platforms', { userId });

    try {
      // 1. Get all connected platforms.
      // Most platforms require an access_token; Steam is API-key based (no OAuth)
      // and stores its identifier in metadata.steamId, so we include it explicitly.
      const { data: connections, error } = await supabaseAdmin
        .from('platform_connections')
        .select('*')
        .eq('user_id', userId)
        .or('access_token.not.is.null,platform.eq.steam');

      if (error) {
        throw new Error(`Failed to fetch connections: ${error.message}`);
      }

      if (!connections || connections.length === 0) {
        log.info('No connected platforms found');
        return {
          success: true,
          message: 'No platforms connected yet',
          platforms: []
        };
      }

      log.info('Found connected platforms', { count: connections.length });

      // 2. Extract from each platform in parallel
      const extractionPromises = connections.map(connection =>
        this.extractPlatform(userId, connection.platform)
          .catch(error => ({
            platform: connection.platform,
            success: false,
            error: error.message
          }))
      );

      const results = await Promise.all(extractionPromises);

      // 3b. Invalidate stale twin_summaries so a fresh one regenerates on next chat
      const { error: invalidateErr } = await supabaseAdmin
        .from('twin_summaries')
        .delete()
        .eq('user_id', userId);
      if (invalidateErr) {
        log.warn('twin_summaries invalidation failed (non-blocking)', { error: invalidateErr });
      } else {
        log.info('Invalidated twin_summaries for fresh regeneration');
      }

      // 4. Return summary
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      return {
        success: true,
        total: connections.length,
        successful,
        failed,
        results
      };

    } catch (error) {
      log.error('Extraction failed', { error });
      throw error;
    }
  }

  /**
   * Extract data from a specific platform
   * @param {string} userId - User ID
   * @param {string} platform - Platform name (spotify, discord, github, etc.)
   * @returns {Object} Extraction result
   */
  async extractPlatform(userId, platform) {
    const jobKey = `${userId}-${platform}`;

    // Prevent duplicate jobs
    if (this.runningJobs.has(jobKey)) {
      log.info('Job already running', { platform });
      return {
        success: false,
        platform,
        error: 'Extraction already in progress'
      };
    }

    this.runningJobs.set(jobKey, { startedAt: new Date(), status: 'running' });

    try {
      log.info('Extracting platform data', { platform, userId });
      // Phase 0 telemetry: record that the P2 (on-demand) path fired for this platform.
      logExtractionRun({ source: INGESTION_SOURCE.ON_DEMAND, platform, userId });

      // 1. Create extraction job record
      const jobId = await this.createExtractionJob(userId, platform);

      // 2. Run platform-specific extraction via the unified dispatcher
      const result = await runPlatformExtraction(userId, platform);
      const itemsExtracted = result.itemsExtracted || 0;

      // 3. Update job status
      if (result.success) {
        await this.updateExtractionJob(jobId, 'completed', itemsExtracted, null);
        log.info('Platform extraction completed', { platform, itemsExtracted });

        // 4. Push to Pattern Learning System (async, don't wait)
        patternLearningBridge.syncExistingPlatformData(userId, platform, 1).then(syncResult => {
          if (syncResult.synced > 0) {
            log.info('Pattern Learning synced', { synced: syncResult.synced, platform });
          }
        }).catch(err => {
          log.error('Pattern Learning sync error', { error: err });
        });
      } else {
        await this.updateExtractionJob(jobId, 'failed', 0, result.error || 'Extraction failed');
        log.info('Platform extraction failed', { platform, error: result.error });
      }

      this.runningJobs.delete(jobKey);

      return {
        success: result.success,
        platform,
        itemsExtracted,
        jobId,
        requiresReauth: result.requiresReauth || false
      };

    } catch (error) {
      log.error('Platform extraction error', { platform, error });
      this.runningJobs.delete(jobKey);

      return {
        success: false,
        platform,
        error: error.message
      };
    }
  }

  /**
   * Get extraction status for a user
   * @param {string} userId - User ID
   * @returns {Object} Status for all platforms
   */
  async getExtractionStatus(userId) {
    try {
      // Platform name normalization map (DB name → frontend name)
      const PLATFORM_NORMALIZE = {
        'google_calendar': 'calendar',
        'google_gmail': 'gmail',
        // Add more as needed
      };

      // Get all platform connections
      const { data: connections, error: connErr } = await supabaseAdmin
        .from('platform_connections')
        .select('platform, last_sync_at, last_sync_status, status')
        .eq('user_id', userId);
      if (connErr) {
        throw new Error(`Failed to fetch platform connections: ${connErr.message}`);
      }

      // Get recent extraction jobs
      const { data: jobs } = await supabaseAdmin
        .from('data_extraction_jobs')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(20);

      // Build status for each platform
      const platformStatus = connections?.map(conn => {
        // Normalize platform name for frontend consistency
        const normalizedPlatform = PLATFORM_NORMALIZE[conn.platform] || conn.platform;
        const recentJobs = jobs?.filter(j => j.platform === conn.platform) || [];
        const latestJob = recentJobs[0];

        return {
          platform: normalizedPlatform,
          dbPlatform: conn.platform, // Keep original for debugging
          isConnected: conn.status === 'connected',
          lastSync: conn.last_sync_at,
          lastSyncStatus: conn.last_sync_status,
          latestJob: latestJob ? {
            status: latestJob.status,
            startedAt: latestJob.started_at,
            completedAt: latestJob.completed_at,
            itemsExtracted: latestJob.processed_items || latestJob.total_items,
            error: latestJob.error_message
          } : null
        };
      }) || [];

      return {
        success: true,
        platforms: platformStatus,
        totalConnected: connections?.filter(c => c.status === 'connected').length || 0
      };

    } catch (error) {
      log.error('Status check error', { error });
      throw error;
    }
  }

  /**
   * Retry failed extractions (max 3 retries per job)
   * @param {string} userId - User ID (optional, retry all if not provided)
   */
  async retryFailedExtractions(userId = null) {
    const MAX_RETRIES = 3;
    log.info('Retrying failed extractions...');

    try {
      // Get failed jobs from the last 7 days that haven't exceeded max retries
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      let query = supabaseAdmin
        .from('data_extraction_jobs')
        .select('id, user_id, platform, retry_count')
        .eq('status', 'failed')
        .gte('started_at', weekAgo)
        .lt('retry_count', MAX_RETRIES);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      // De-duplicate: only retry the most recent failed job per user+platform
      query = query.order('started_at', { ascending: false });

      const { data: failedJobs, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch failed jobs: ${error.message}`);
      }

      if (!failedJobs || failedJobs.length === 0) {
        log.info('No failed jobs to retry (all either succeeded or exhausted retries)');
        return { success: true, retried: 0, skippedMaxRetries: 0 };
      }

      // De-duplicate by user_id+platform (keep only the most recent per combo)
      const seen = new Set();
      const uniqueJobs = failedJobs.filter(job => {
        const key = `${job.user_id}-${job.platform}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      log.info('Found failed jobs to retry', {
        total: failedJobs.length,
        unique: uniqueJobs.length
      });

      // Increment retry_count on the original failed job before retrying
      const retryResults = [];
      for (const job of uniqueJobs) {
        const newRetryCount = (job.retry_count || 0) + 1;
        log.info(`Retrying ${job.platform} (attempt ${newRetryCount}/${MAX_RETRIES})`, {
          userId: job.user_id,
          originalJobId: job.id
        });

        // Mark the old job's retry_count so it won't be picked up again
        await supabaseAdmin
          .from('data_extraction_jobs')
          .update({ retry_count: newRetryCount })
          .eq('id', job.id);

        const result = await this.extractPlatform(job.user_id, job.platform);

        // If the new job was created, carry forward the retry_count
        if (result.jobId) {
          await supabaseAdmin
            .from('data_extraction_jobs')
            .update({ retry_count: newRetryCount })
            .eq('id', result.jobId);
        }

        retryResults.push(result);
      }

      const successful = retryResults.filter(r => r.success).length;

      log.info('Retry complete', { successful, total: uniqueJobs.length });

      return {
        success: true,
        retried: uniqueJobs.length,
        successful
      };

    } catch (error) {
      log.error('Retry failed', { error });
      throw error;
    }
  }

  /**
   * Schedule periodic extraction (every 24 hours)
   * @param {number} intervalHours - Hours between syncs (default 24)
   */
  schedulePeriodicExtraction(intervalHours = 24) {
    if (this.periodicSyncInterval) {
      log.info('Periodic sync already scheduled');
      return;
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;

    this.periodicSyncInterval = setInterval(async () => {
      log.info('Periodic extraction triggered');

      try {
        // Get all users with connected platforms (bounded to prevent loading entire table)
        const { data: users, error: usersErr } = await supabaseAdmin
          .from('platform_connections')
          .select('user_id')
          .not('access_token', 'is', null)
          .limit(1000);
        if (usersErr) {
          log.error('Failed to fetch users for periodic sync', { error: usersErr });
          return;
        }

        if (!users || users.length === 0) {
          log.info('No users to sync');
          return;
        }

        // Get unique user IDs
        const uniqueUserIds = [...new Set(users.map(u => u.user_id))];
        log.info('Syncing users', { count: uniqueUserIds.length });

        // Extract for each user (sequentially to avoid overwhelming APIs)
        for (const userId of uniqueUserIds) {
          await this.extractAllPlatforms(userId);
          // Wait 5 seconds between users to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        log.info('Periodic extraction complete');

      } catch (error) {
        log.error('Periodic extraction error', { error });
      }
    }, intervalMs);
    // Allow process to exit gracefully even if this interval is active
    this.periodicSyncInterval.unref();

    log.info('Periodic extraction scheduled', { intervalHours });
  }

  /**
   * Stop periodic extraction
   */
  stopPeriodicExtraction() {
    if (this.periodicSyncInterval) {
      clearInterval(this.periodicSyncInterval);
      this.periodicSyncInterval = null;
      log.info('Periodic extraction stopped');
    }
  }

  /**
   * Create extraction job record
   */
  async createExtractionJob(userId, platform) {
    const { data, error } = await supabaseAdmin
      .from('data_extraction_jobs')
      .insert({
        user_id: userId,
        platform,
        job_type: 'extraction',
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      log.error('Failed to create extraction job', { error });
      return null;
    }

    return data.id;
  }

  /**
   * Update extraction job status
   */
  async updateExtractionJob(jobId, status, itemsExtracted, errorMessage) {
    if (!jobId) return;

    const updates = {
      status,
      completed_at: status === 'completed' || status === 'failed' ? new Date().toISOString() : null
    };

    if (itemsExtracted !== null && itemsExtracted !== undefined) {
      updates.total_items = itemsExtracted;
      updates.processed_items = itemsExtracted;
    }

    if (errorMessage) {
      updates.error_message = errorMessage;
    }

    const { error } = await supabaseAdmin
      .from('data_extraction_jobs')
      .update(updates)
      .eq('id', jobId);

    if (error) {
      log.error('Failed to update job status', { jobId, status, error });
    }
  }
}

// Export singleton instance
const extractionOrchestrator = new ExtractionOrchestrator();
export default extractionOrchestrator;
