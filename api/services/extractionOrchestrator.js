/**
 * Extraction Orchestrator
 *
 * Coordinates extraction across all connected platforms and builds soul signatures.
 * Manages extraction jobs, retry logic, and periodic syncing.
 */

import { createClient } from '@supabase/supabase-js';
import { extractSpotifyData } from './spotifyExtraction.js';
import { extractDiscordData } from './discordExtraction.js';
import { extractGitHubData } from './githubExtraction.js';
import soulSignatureBuilder from './soulSignatureBuilder.js';
// MVP Feature Extractors
import spotifyFeatureExtractor from './featureExtractors/spotifyExtractor.js';
import whoopFeatureExtractor from './featureExtractors/whoopExtractor.js';
import calendarFeatureExtractor from './featureExtractors/calendarExtractor.js';
// Gmail, Outlook, LinkedIn extractors removed (TIER 1 cleanup)
const gmailFeatureExtractor = { extractFeatures: async () => ({}), saveFeatures: async () => {} };
const outlookFeatureExtractor = { extractFeatures: async () => ({}), saveFeatures: async () => {} };
const linkedinFeatureExtractor = { extractFeatures: async () => ({}), saveFeatures: async () => {} };
// Pattern Learning Bridge
import patternLearningBridge from './patternLearningBridge.js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    console.log(`🌟 [Orchestrator] Starting extraction for all platforms - User: ${userId}`);

    try {
      // 1. Get all connected platforms
      const { data: connections, error } = await supabase
        .from('platform_connections')
        .select('*')
        .eq('user_id', userId)
        .not('access_token', 'is', null);

      if (error) {
        throw new Error(`Failed to fetch connections: ${error.message}`);
      }

      if (!connections || connections.length === 0) {
        console.log('⚠️ No connected platforms found');
        return {
          success: true,
          message: 'No platforms connected yet',
          platforms: []
        };
      }

      console.log(`   Found ${connections.length} connected platform(s)`);

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

      // 3. Build soul signature after all extractions complete
      console.log('🎭 [Orchestrator] Building soul signature...');
      try {
        await soulSignatureBuilder.buildSoulSignature(userId);
        console.log('✅ [Orchestrator] Soul signature built');
      } catch (soulError) {
        console.error('❌ [Orchestrator] Soul signature building failed:', soulError);
      }

      // 3b. Invalidate stale twin_summaries so a fresh one regenerates on next chat
      const { error: invalidateErr } = await supabase
        .from('twin_summaries')
        .delete()
        .eq('user_id', userId);
      if (invalidateErr) {
        console.warn('[Orchestrator] twin_summaries invalidation failed (non-blocking):', invalidateErr.message);
      } else {
        console.log('🗑️ [Orchestrator] Invalidated twin_summaries for fresh regeneration');
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
      console.error('❌ [Orchestrator] Extraction failed:', error);
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
      console.log(`⏳ [Orchestrator] Job already running for ${platform}`);
      return {
        success: false,
        platform,
        error: 'Extraction already in progress'
      };
    }

    this.runningJobs.set(jobKey, { startedAt: new Date(), status: 'running' });

    try {
      console.log(`📊 [Orchestrator] Extracting ${platform} data for user ${userId}`);

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
              console.log(`   📊 Extracted ${features.length} Spotify behavioral features`);
            }
          } catch (featureError) {
            console.error(`   ⚠️ Spotify feature extraction error: ${featureError.message}`);
          }
          break;

        case 'whoop':
          // Use MVP feature extractor for Whoop
          try {
            const features = await whoopFeatureExtractor.extractFeatures(userId);
            if (features.length > 0) {
              await whoopFeatureExtractor.saveFeatures(features);
              itemsExtracted = features.length;
              result = { success: true, itemsExtracted };
              console.log(`   📊 Extracted ${features.length} Whoop behavioral features`);
            } else {
              result = { success: true, itemsExtracted: 0, message: 'No Whoop data available' };
            }
          } catch (whoopError) {
            console.error(`   ❌ Whoop extraction error: ${whoopError.message}`);
            result = { success: false, error: whoopError.message };
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
              console.log(`   📊 Extracted ${features.length} Calendar behavioral features`);
            } else {
              result = { success: true, itemsExtracted: 0, message: 'No Calendar data available' };
            }
          } catch (calendarError) {
            console.error(`   ❌ Calendar extraction error: ${calendarError.message}`);
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

        case 'youtube':
        case 'twitch': {
          // Use Nango extraction + storage for these platforms
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
              console.log(`   📊 Extracted ${gmailFeatures.length} Gmail behavioral features`);
            } else {
              result = { success: true, itemsExtracted: 0, message: 'No Gmail data available' };
            }
          } catch (gmailError) {
            console.error(`   ❌ Gmail extraction error: ${gmailError.message}`);
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
              console.log(`   📊 Extracted ${outlookFeatures.length} Outlook behavioral features`);
            } else {
              result = { success: true, itemsExtracted: 0, message: 'No Outlook data available' };
            }
          } catch (outlookError) {
            console.error(`   ❌ Outlook extraction error: ${outlookError.message}`);
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
              console.log(`   📊 Extracted ${linkedinFeatures.length} LinkedIn behavioral features`);
            } else {
              result = { success: true, itemsExtracted: 0, message: 'No LinkedIn data available' };
            }
          } catch (linkedinError) {
            console.error(`   ❌ LinkedIn extraction error: ${linkedinError.message}`);
            result = { success: false, error: linkedinError.message };
          }
          break;

        // Platforms not yet implemented
        case 'reddit':
          console.log(`⚠️ [Orchestrator] Extractor for ${platform} not yet implemented`);
          result = { success: false, error: 'Extractor not implemented' };
          break;

        default:
          console.log(`⚠️ [Orchestrator] Unknown platform: ${platform}`);
          result = { success: false, error: 'Unknown platform' };
      }

      // 3. Update job status
      if (result.success) {
        await this.updateExtractionJob(jobId, 'completed', itemsExtracted, null);
        console.log(`✅ [Orchestrator] ${platform} extraction completed - ${itemsExtracted} items`);

        // 4. Push to Pattern Learning System (async, don't wait)
        patternLearningBridge.syncExistingPlatformData(userId, platform, 1).then(syncResult => {
          if (syncResult.synced > 0) {
            console.log(`🧠 [Orchestrator] Pattern Learning: Synced ${syncResult.synced} ${platform} events`);
          }
        }).catch(err => {
          console.error(`⚠️ [Orchestrator] Pattern Learning sync error: ${err.message}`);
        });
      } else {
        await this.updateExtractionJob(jobId, 'failed', 0, result.error || 'Extraction failed');
        console.log(`❌ [Orchestrator] ${platform} extraction failed: ${result.error}`);
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
      console.error(`❌ [Orchestrator] ${platform} extraction error:`, error);
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
      const { data: connections, error: connErr } = await supabase
        .from('platform_connections')
        .select('platform, last_sync_at, last_sync_status, status')
        .eq('user_id', userId);
      if (connErr) {
        throw new Error(`Failed to fetch platform connections: ${connErr.message}`);
      }

      // Get recent extraction jobs
      const { data: jobs } = await supabase
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
      console.error('❌ [Orchestrator] Status check error:', error);
      throw error;
    }
  }

  /**
   * Retry failed extractions
   * @param {string} userId - User ID (optional, retry all if not provided)
   */
  async retryFailedExtractions(userId = null) {
    console.log('🔄 [Orchestrator] Retrying failed extractions...');

    try {
      // Get failed jobs from the last 24 hours
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let query = supabase
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
        console.log('✅ [Orchestrator] No failed jobs to retry');
        return { success: true, retried: 0 };
      }

      console.log(`   Found ${failedJobs.length} failed job(s) to retry`);

      // Retry each failed extraction
      const retryPromises = failedJobs.map(job =>
        this.extractPlatform(job.user_id, job.platform)
      );

      const results = await Promise.all(retryPromises);
      const successful = results.filter(r => r.success).length;

      console.log(`✅ [Orchestrator] Retry complete: ${successful}/${failedJobs.length} successful`);

      return {
        success: true,
        retried: failedJobs.length,
        successful
      };

    } catch (error) {
      console.error('❌ [Orchestrator] Retry failed:', error);
      throw error;
    }
  }

  /**
   * Schedule periodic extraction (every 24 hours)
   * @param {number} intervalHours - Hours between syncs (default 24)
   */
  schedulePeriodicExtraction(intervalHours = 24) {
    if (this.periodicSyncInterval) {
      console.log('⚠️ [Orchestrator] Periodic sync already scheduled');
      return;
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;

    this.periodicSyncInterval = setInterval(async () => {
      console.log('⏰ [Orchestrator] Periodic extraction triggered');

      try {
        // Get all users with connected platforms (bounded to prevent loading entire table)
        const { data: users, error: usersErr } = await supabase
          .from('platform_connections')
          .select('user_id')
          .not('access_token', 'is', null)
          .limit(1000);
        if (usersErr) {
          console.error('[Orchestrator] Failed to fetch users for periodic sync:', usersErr.message);
          return;
        }

        if (!users || users.length === 0) {
          console.log('   No users to sync');
          return;
        }

        // Get unique user IDs
        const uniqueUserIds = [...new Set(users.map(u => u.user_id))];
        console.log(`   Syncing ${uniqueUserIds.length} user(s)`);

        // Extract for each user (sequentially to avoid overwhelming APIs)
        for (const userId of uniqueUserIds) {
          await this.extractAllPlatforms(userId);
          // Wait 5 seconds between users to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        console.log('✅ [Orchestrator] Periodic extraction complete');

      } catch (error) {
        console.error('❌ [Orchestrator] Periodic extraction error:', error);
      }
    }, intervalMs);
    // Allow process to exit gracefully even if this interval is active
    this.periodicSyncInterval.unref();

    console.log(`⏰ [Orchestrator] Periodic extraction scheduled (every ${intervalHours} hours)`);
  }

  /**
   * Stop periodic extraction
   */
  stopPeriodicExtraction() {
    if (this.periodicSyncInterval) {
      clearInterval(this.periodicSyncInterval);
      this.periodicSyncInterval = null;
      console.log('🛑 [Orchestrator] Periodic extraction stopped');
    }
  }

  /**
   * Create extraction job record
   */
  async createExtractionJob(userId, platform) {
    const { data, error } = await supabase
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
      console.error('❌ Failed to create extraction job:', error);
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

    const { error } = await supabase
      .from('data_extraction_jobs')
      .update(updates)
      .eq('id', jobId);

    if (error) {
      console.error(`[Orchestrator] Failed to update job ${jobId} status to ${status}:`, error.message);
    }
  }
}

// Export singleton instance
const extractionOrchestrator = new ExtractionOrchestrator();
export default extractionOrchestrator;
