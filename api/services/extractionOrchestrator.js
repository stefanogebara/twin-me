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
import spotifyFeatureExtractor from './featureExtractors/spotifyExtractor.js';
import calendarFeatureExtractor from './featureExtractors/calendarExtractor.js';
// Gmail, Outlook, LinkedIn now use observation-based extraction (observationIngestion.js)
// Pattern Learning Bridge
import patternLearningBridge from './patternLearningBridge.js';

import { addPlatformObservation } from './memoryStreamService.js';
import { createLogger } from './logger.js';

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
      // 1. Get all connected platforms
      const { data: connections, error } = await supabaseAdmin
        .from('platform_connections')
        .select('*')
        .eq('user_id', userId)
        .not('access_token', 'is', null);

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

      // 1. Create extraction job record
      const jobId = await this.createExtractionJob(userId, platform);

      // 2. Call platform-specific extractor
      let result;
      let itemsExtracted = 0;

      switch (platform.toLowerCase()) {
        case 'spotify':
          // Use both data extraction and feature extraction
          result = await extractSpotifyData(userId);
          itemsExtracted = result.itemsExtracted || 0;
          // Also extract behavioral features for personality
          try {
            const features = await spotifyFeatureExtractor.extractFeatures(userId);
            if (features.length > 0) {
              await spotifyFeatureExtractor.saveFeatures(features);
              log.info('Extracted Spotify behavioral features', { count: features.length });
            }
          } catch (featureError) {
            log.error('Spotify feature extraction error', { error: featureError });
          }
          break;

        case 'calendar':
        case 'google_calendar':
          // Use MVP feature extractor for Calendar
          try {
            const features = await calendarFeatureExtractor.extractFeatures(userId);
            if (features.length > 0) {
              await calendarFeatureExtractor.saveFeatures(features);
              itemsExtracted = features.length;
              result = { success: true, itemsExtracted };
              log.info('Extracted Calendar behavioral features', { count: features.length });
            } else {
              result = { success: true, itemsExtracted: 0, message: 'No Calendar data available' };
            }
          } catch (calendarError) {
            log.error('Calendar extraction error', { error: calendarError });
            result = { success: false, error: calendarError.message };
          }
          break;

        case 'discord':
          try {
            const { fetchDiscordObservations } = await import('./observationIngestion.js');
            const discordObs = await fetchDiscordObservations(userId);
            const discordStored = await storeObservationsToMemory(userId, 'discord', discordObs);
            itemsExtracted = discordStored;
            result = { success: true, itemsExtracted };
            log.info('Extracted Discord observations', { fetched: discordObs.length, stored: discordStored });
            // Extract behavioral features for personality
            try {
              const discordExtractor = await import('./featureExtractors/discordExtractor.js');
              const features = await discordExtractor.default.extractFeatures(userId);
              if (features && features.length > 0) {
                await discordExtractor.default.saveFeatures(features);
                log.info('Extracted Discord behavioral features', { count: features.length });
              }
            } catch (featureError) {
              log.warn('Discord feature extraction error (non-blocking)', { error: featureError.message });
            }
          } catch (discordError) {
            log.error('Discord extraction error', { error: discordError });
            result = { success: false, error: discordError.message };
          }
          break;

        case 'github':
          try {
            const { fetchGitHubObservations } = await import('./observationIngestion.js');
            const githubObs = await fetchGitHubObservations(userId);
            const githubStored = await storeObservationsToMemory(userId, 'github', githubObs);
            itemsExtracted = githubStored;
            result = { success: true, itemsExtracted };
            log.info('Extracted GitHub observations', { fetched: githubObs.length, stored: githubStored });
            // Extract behavioral features for personality
            try {
              const githubExtractor = await import('./featureExtractors/githubExtractor.js');
              const features = await githubExtractor.default.extractFeatures(userId);
              if (features && features.length > 0) {
                await githubExtractor.default.saveFeatures(features);
                log.info('Extracted GitHub behavioral features', { count: features.length });
              }
            } catch (featureError) {
              log.warn('GitHub feature extraction error (non-blocking)', { error: featureError.message });
            }
          } catch (githubError) {
            log.error('GitHub extraction error', { error: githubError });
            result = { success: false, error: githubError.message };
          }
          break;

        case 'youtube': {
          try {
            const { fetchYouTubeObservations } = await import('./observationIngestion.js');
            const observations = await fetchYouTubeObservations(userId);
            const stored = await storeObservationsToMemory(userId, 'youtube', observations);
            itemsExtracted = stored;
            result = { success: true, itemsExtracted };
            log.info('Extracted YouTube observations', { fetched: observations.length, stored });
            // Also extract behavioral features for personality
            try {
              const ytExtractor = await import('./featureExtractors/youtubeFeatureExtractor.js');
              const features = await ytExtractor.default.extractFeatures(userId);
              if (features && features.length > 0) {
                await ytExtractor.default.saveFeatures(features);
                log.info('Extracted YouTube behavioral features', { count: features.length });
              }
            } catch (featureError) {
              log.warn('YouTube feature extraction error (non-blocking)', { error: featureError.message });
            }
          } catch (youtubeError) {
            log.error('YouTube extraction error', { error: youtubeError });
            result = { success: false, error: youtubeError.message };
          }
          break;
        }

        case 'gmail':
        case 'google_gmail':
          try {
            const { fetchGmailObservations } = await import('./observationIngestion.js');
            const gmailObs = await fetchGmailObservations(userId);
            const gmailStored = await storeObservationsToMemory(userId, 'google_gmail', gmailObs);
            itemsExtracted = gmailStored;
            result = { success: true, itemsExtracted };
            log.info('Extracted Gmail observations', { fetched: gmailObs.length, stored: gmailStored });
            // Extract behavioral features for personality
            try {
              const gmailExtractor = await import('./featureExtractors/gmailExtractor.js');
              const features = await gmailExtractor.default.extractFeatures(userId);
              if (features && features.length > 0) {
                await gmailExtractor.default.saveFeatures(features);
                log.info('Extracted Gmail behavioral features', { count: features.length });
              }
            } catch (featureError) {
              log.warn('Gmail feature extraction error (non-blocking)', { error: featureError.message });
            }
          } catch (gmailError) {
            log.error('Gmail extraction error', { error: gmailError });
            result = { success: false, error: gmailError.message };
          }
          break;

        case 'outlook':
          try {
            const { fetchOutlookObservations } = await import('./observationIngestion.js');
            const outlookObs = await fetchOutlookObservations(userId);
            const outlookStored = await storeObservationsToMemory(userId, 'outlook', outlookObs);
            itemsExtracted = outlookStored;
            result = { success: true, itemsExtracted };
            log.info('Extracted Outlook observations', { fetched: outlookObs.length, stored: outlookStored });
          } catch (outlookError) {
            log.error('Outlook extraction error', { error: outlookError });
            result = { success: false, error: outlookError.message };
          }
          break;

        case 'linkedin':
          try {
            const { fetchLinkedInObservations } = await import('./observationIngestion.js');
            const linkedinObs = await fetchLinkedInObservations(userId);
            const linkedinStored = await storeObservationsToMemory(userId, 'linkedin', linkedinObs);
            itemsExtracted = linkedinStored;
            result = { success: true, itemsExtracted };
            log.info('Extracted LinkedIn observations', { fetched: linkedinObs.length, stored: linkedinStored });
            // Extract behavioral features for personality
            try {
              const linkedinExtractor = await import('./featureExtractors/linkedinExtractor.js');
              const features = await linkedinExtractor.default.extractFeatures(userId);
              if (features && features.length > 0) {
                await linkedinExtractor.default.saveFeatures(features);
                log.info('Extracted LinkedIn behavioral features', { count: features.length });
              }
            } catch (featureError) {
              log.warn('LinkedIn feature extraction error (non-blocking)', { error: featureError.message });
            }
          } catch (linkedinError) {
            log.error('LinkedIn extraction error', { error: linkedinError });
            result = { success: false, error: linkedinError.message };
          }
          break;

        case 'whoop':
          try {
            const { fetchWhoopObservations } = await import('./observationIngestion.js');
            const observations = await fetchWhoopObservations(userId);
            const whoopStored = await storeObservationsToMemory(userId, 'whoop', observations);
            itemsExtracted = whoopStored;
            result = { success: true, itemsExtracted };
            log.info('Extracted Whoop observations', { fetched: observations.length, stored: whoopStored });
            // Extract behavioral features for personality
            try {
              const whoopExtractor = await import('./featureExtractors/whoopExtractor.js');
              const features = await whoopExtractor.default.extractFeatures(userId);
              if (features && features.length > 0) {
                await whoopExtractor.default.saveFeatures(features);
                log.info('Extracted Whoop behavioral features', { count: features.length });
              }
            } catch (featureError) {
              log.warn('Whoop feature extraction error (non-blocking)', { error: featureError.message });
            }
          } catch (whoopError) {
            log.error('Whoop extraction error', { error: whoopError });
            result = { success: false, error: whoopError.message };
          }
          break;

        case 'twitch':
          try {
            const { fetchTwitchObservations } = await import('./observationIngestion.js');
            const twitchObs = await fetchTwitchObservations(userId);
            const twitchStored = await storeObservationsToMemory(userId, 'twitch', twitchObs);
            itemsExtracted = twitchStored;
            result = { success: true, itemsExtracted };
            log.info('Extracted Twitch observations', { fetched: twitchObs.length, stored: twitchStored });
            // Extract behavioral features for personality
            try {
              const twitchExtractor = await import('./featureExtractors/twitchExtractor.js');
              const features = await twitchExtractor.default.extractFeatures(userId);
              if (features && features.length > 0) {
                await twitchExtractor.default.saveFeatures(features);
                log.info('Extracted Twitch behavioral features', { count: features.length });
              }
            } catch (featureError) {
              log.warn('Twitch feature extraction error (non-blocking)', { error: featureError.message });
            }
          } catch (twitchError) {
            log.error('Twitch extraction error', { error: twitchError });
            result = { success: false, error: twitchError.message };
          }
          break;

        case 'reddit':
          try {
            const { fetchRedditObservations } = await import('./observationIngestion.js');
            const redditObs = await fetchRedditObservations(userId);
            const redditStored = await storeObservationsToMemory(userId, 'reddit', redditObs);
            itemsExtracted = redditStored;
            result = { success: true, itemsExtracted };
            log.info('Extracted Reddit observations', { fetched: redditObs.length, stored: redditStored });
            // Extract behavioral features for personality
            try {
              const redditExtractor = await import('./featureExtractors/redditExtractor.js');
              const features = await redditExtractor.default.extractFeatures(userId);
              if (features && features.length > 0) {
                await redditExtractor.default.saveFeatures(features);
                log.info('Extracted Reddit behavioral features', { count: features.length });
              }
            } catch (featureError) {
              log.warn('Reddit feature extraction error (non-blocking)', { error: featureError.message });
            }
          } catch (redditError) {
            log.error('Reddit extraction error', { error: redditError });
            result = { success: false, error: redditError.message };
          }
          break;

        default:
          log.info('Unknown platform', { platform });
          result = { success: false, error: 'Unknown platform' };
      }

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
   * Retry failed extractions
   * @param {string} userId - User ID (optional, retry all if not provided)
   */
  async retryFailedExtractions(userId = null) {
    log.info('Retrying failed extractions...');

    try {
      // Get failed jobs from the last 24 hours
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let query = supabaseAdmin
        .from('data_extraction_jobs')
        .select('user_id, platform')
        .eq('status', 'failed')
        .gte('started_at', yesterday);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: failedJobs, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch failed jobs: ${error.message}`);
      }

      if (!failedJobs || failedJobs.length === 0) {
        log.info('No failed jobs to retry');
        return { success: true, retried: 0 };
      }

      log.info('Found failed jobs to retry', { count: failedJobs.length });

      // Retry each failed extraction
      const retryPromises = failedJobs.map(job =>
        this.extractPlatform(job.user_id, job.platform)
      );

      const results = await Promise.all(retryPromises);
      const successful = results.filter(r => r.success).length;

      log.info('Retry complete', { successful, total: failedJobs.length });

      return {
        success: true,
        retried: failedJobs.length,
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
