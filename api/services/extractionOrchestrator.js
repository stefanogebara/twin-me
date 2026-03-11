/**
 * Extraction Orchestrator
 *
 * Coordinates extraction across all connected platforms and builds soul signatures.
 * Manages extraction jobs, retry logic, and periodic syncing.
 */

import { supabaseAdmin } from './database.js';
import { extractSpotifyData } from './spotifyExtraction.js';
import { extractDiscordData } from './discordExtraction.js';
import { extractGitHubData } from './githubExtraction.js';
// MVP Feature Extractors
import spotifyFeatureExtractor from './featureExtractors/spotifyExtractor.js';
import calendarFeatureExtractor from './featureExtractors/calendarExtractor.js';
// Gmail, Outlook, LinkedIn extractors removed (TIER 1 cleanup)
const gmailFeatureExtractor = { extractFeatures: async () => ({}), saveFeatures: async () => {} };
const outlookFeatureExtractor = { extractFeatures: async () => ({}), saveFeatures: async () => {} };
const linkedinFeatureExtractor = { extractFeatures: async () => ({}), saveFeatures: async () => {} };
// Pattern Learning Bridge
import patternLearningBridge from './patternLearningBridge.js';

import { createLogger } from './logger.js';

const log = createLogger('ExtractionOrchestrator');


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
          result = await extractDiscordData(userId);
          itemsExtracted = result.itemsExtracted || 0;
          break;

        case 'github':
          result = await extractGitHubData(userId);
          itemsExtracted = result.itemsExtracted || 0;
          break;

        case 'youtube': {
          // Use Nango extraction + storage for YouTube
          const nangoService = await import('./nangoService.js');
          const extractResult = await nangoService.extractPlatformData(userId, platform);
          if (extractResult.success) {
            await nangoService.storeNangoExtractionData(userId, platform, extractResult);
            itemsExtracted = Object.keys(extractResult.data || {}).length;
            result = { success: true };
          } else {
            result = { success: false, error: extractResult.error || 'Nango extraction failed' };
          }
          break;
        }

        case 'gmail':
        case 'google_gmail':
          // Use feature extractor for Gmail
          try {
            const gmailFeatures = await gmailFeatureExtractor.extractFeatures(userId);
            if (gmailFeatures.length > 0) {
              await gmailFeatureExtractor.saveFeatures(gmailFeatures);
              itemsExtracted = gmailFeatures.length;
              result = { success: true, itemsExtracted };
              log.info('Extracted Gmail behavioral features', { count: gmailFeatures.length });
            } else {
              result = { success: true, itemsExtracted: 0, message: 'No Gmail data available' };
            }
          } catch (gmailError) {
            log.error('Gmail extraction error', { error: gmailError });
            result = { success: false, error: gmailError.message };
          }
          break;

        case 'outlook':
          // Use feature extractor for Outlook
          try {
            const outlookFeatures = await outlookFeatureExtractor.extractFeatures(userId);
            if (outlookFeatures.length > 0) {
              await outlookFeatureExtractor.saveFeatures(outlookFeatures);
              itemsExtracted = outlookFeatures.length;
              result = { success: true, itemsExtracted };
              log.info('Extracted Outlook behavioral features', { count: outlookFeatures.length });
            } else {
              result = { success: true, itemsExtracted: 0, message: 'No Outlook data available' };
            }
          } catch (outlookError) {
            log.error('Outlook extraction error', { error: outlookError });
            result = { success: false, error: outlookError.message };
          }
          break;

        case 'linkedin':
          // Use feature extractor for LinkedIn
          try {
            const linkedinFeatures = await linkedinFeatureExtractor.extractFeatures(userId);
            if (linkedinFeatures.length > 0) {
              await linkedinFeatureExtractor.saveFeatures(linkedinFeatures);
              itemsExtracted = linkedinFeatures.length;
              result = { success: true, itemsExtracted };
              log.info('Extracted LinkedIn behavioral features', { count: linkedinFeatures.length });
            } else {
              result = { success: true, itemsExtracted: 0, message: 'No LinkedIn data available' };
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
            itemsExtracted = observations.length;
            result = { success: true, itemsExtracted };
            log.info('Extracted Whoop observations', { count: itemsExtracted });
          } catch (whoopError) {
            log.error('Whoop extraction error', { error: whoopError });
            result = { success: false, error: whoopError.message };
          }
          break;

        // Platforms not yet implemented
        case 'reddit':
          log.info('Extractor not yet implemented', { platform });
          result = { success: false, error: 'Extractor not implemented' };
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
