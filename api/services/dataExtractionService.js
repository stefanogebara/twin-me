/**
 * Data Extraction Service
 * Orchestrates data extraction from all connected OAuth platforms
 */

import { supabaseAdmin } from './database.js';
import GitHubExtractor from './extractors/githubExtractor.js';
import DiscordExtractor from './extractors/discordExtractor.js';
import LinkedInExtractor from './extractors/linkedinExtractor.js';
import SpotifyExtractor from './extractors/spotifyExtractor.js';
import RedditExtractor from './extractors/redditExtractor.js';
// Gmail, Teams extractors removed (TIER 1 cleanup) — stub classes so `new XExtractor()` doesn't throw
class GmailExtractor { constructor() {} async extract() { return {}; } }
import SlackExtractor from './extractors/slackExtractor.js';
import CalendarExtractor from './extractors/calendarExtractor.js';
class TeamsExtractor { constructor() {} async extract() { return {}; } }
import TikTokExtractor from './extractors/tiktokExtractor.js';
import { decryptToken } from './encryption.js';
import { getValidAccessToken } from './tokenRefreshService.js';
import {
  notifyExtractionStarted,
  notifyExtractionCompleted,
  notifyExtractionFailed,
  notifyConnectionStatus,
  notifyPlatformSync,
} from './websocketService.js';
import { invalidatePlatformStatusCache } from './redisClient.js';
import { clearStatusMemoryCache } from '../routes/connectors.js';
import { addPlatformMemory } from './mem0Service.js';
import { createLogger } from './logger.js';

const log = createLogger('DataExtraction');


class DataExtractionService {
  /**
   * Extract data from a specific platform
   */
  async extractPlatformData(userId, platform) {
    log.info(`Starting extraction for ${platform}...`);

    // Create extraction job record
    let jobId = null;

    try {
      // Get connector for this platform
      const { data: connector, error } = await supabaseAdmin
        .from('platform_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', platform)
        .single();

      if (error || !connector) {
        throw new Error(`No connected ${platform} account found for user`);
      }

      // Create job record with 'pending' status
      const { data: job, error: jobError } = await supabaseAdmin
        .from('data_extraction_jobs')
        .insert({
          user_id: userId,
          connector_id: connector.id,
          platform: platform,
          job_type: 'full_sync',
          status: 'pending',
          total_items: null,
          processed_items: 0,
          failed_items: 0,
          started_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (jobError) {
        log.error(`Failed to create job record:`, jobError);
      } else {
        jobId = job.id;
        log.info(`Created job ${jobId} for ${platform}`);
      }

      // Update job to 'running' status
      if (jobId) {
        const { error: runningErr } = await supabaseAdmin
          .from('data_extraction_jobs')
          .update({ status: 'running' })
          .eq('id', jobId);
        if (runningErr) log.warn('Failed to update job to running:', runningErr.message);

        // Notify user via WebSocket that extraction has started
        notifyExtractionStarted(userId, jobId, platform);
      }

      // --- Nango-managed platforms (no local token needed, return early) ---
      if (platform === 'youtube') {
        const { extractPlatformData: extractYT, storeNangoExtractionData: storeYT } = await import('./nangoService.js');
        const ytResult = await extractYT(userId, 'youtube');
        if (ytResult.success) {
          await storeYT(userId, 'youtube', ytResult);
          const ytItems = Object.keys(ytResult.data || {}).length;
          if (jobId) {
            const { error: ytCompleteErr } = await supabaseAdmin
              .from('data_extraction_jobs')
              .update({ status: 'completed', items_extracted: ytItems, completed_at: new Date().toISOString() })
              .eq('id', jobId);
            if (ytCompleteErr) log.warn('Failed to mark YouTube job completed:', ytCompleteErr.message);
          }
          return { success: true, platform, message: 'YouTube data extracted via Nango', itemsExtracted: ytItems, skipped: false };
        }
        if (jobId) {
          const { error: ytFailErr } = await supabaseAdmin
            .from('data_extraction_jobs')
            .update({ status: 'failed', error_message: ytResult.error || 'Nango extraction failed', completed_at: new Date().toISOString() })
            .eq('id', jobId);
          if (ytFailErr) log.warn('Failed to mark YouTube job failed:', ytFailErr.message);
        }
        return { success: false, platform, message: ytResult.error || 'YouTube extraction failed', itemsExtracted: 0, skipped: false };
      }

      if (platform === 'twitch') {
        const { extractPlatformData, storeNangoExtractionData } = await import('./nangoService.js');
        const twitchResult = await extractPlatformData(userId, 'twitch');
        if (twitchResult.success) {
          await storeNangoExtractionData(userId, 'twitch', twitchResult);
          const twitchItems = Object.keys(twitchResult.data || {}).length;
          if (jobId) {
            const { error: twitchCompleteErr } = await supabaseAdmin
              .from('data_extraction_jobs')
              .update({ status: 'completed', items_extracted: twitchItems, completed_at: new Date().toISOString() })
              .eq('id', jobId);
            if (twitchCompleteErr) log.warn('Failed to mark Twitch job completed:', twitchCompleteErr.message);
          }
          return { success: true, platform, message: 'Twitch data extracted via Nango', itemsExtracted: twitchItems, skipped: false };
        }
        if (jobId) {
          const { error: twitchFailErr } = await supabaseAdmin
            .from('data_extraction_jobs')
            .update({ status: 'failed', error_message: twitchResult.error || 'Nango extraction failed', completed_at: new Date().toISOString() })
            .eq('id', jobId);
          if (twitchFailErr) log.warn('Failed to mark Twitch job failed:', twitchFailErr.message);
        }
        return { success: false, platform, message: twitchResult.error || 'Twitch extraction failed', itemsExtracted: 0, skipped: false };
      }

      if (platform === 'whoop') {
        log.info(`Whoop uses direct API extraction via featureExtractor - skipping raw data storage`);
        if (jobId) {
          const { error: whoopErr } = await supabaseAdmin
            .from('data_extraction_jobs')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', jobId);
          if (whoopErr) log.warn('Failed to mark Whoop job completed:', whoopErr.message);
        }
        return { success: true, platform, message: 'Whoop data will be extracted during soul signature generation', itemsExtracted: 0, skipped: false };
      }

      // --- Legacy platforms: get valid access token (auto-refresh if expired) ---
      log.info(`Getting valid access token for ${platform}...`);
      const tokenResult = await getValidAccessToken(userId, platform);

      if (!tokenResult.success) {
        log.warn(`Failed to get valid token for ${platform}: ${tokenResult.error}`);

        if (jobId) {
          const { error: tokenFailErr } = await supabaseAdmin
            .from('data_extraction_jobs')
            .update({
              status: 'failed',
              error_message: tokenResult.error || 'Token refresh failed',
              completed_at: new Date().toISOString()
            })
            .eq('id', jobId);
          if (tokenFailErr) log.warn(`Error marking job ${jobId} as failed (token):`, tokenFailErr.message);

          notifyExtractionFailed(userId, jobId, platform, new Error(tokenResult.error || 'Token refresh failed'));
          notifyConnectionStatus(userId, platform, 'needs_reauth', 'Please reconnect your account');
        }

        return {
          success: false,
          platform,
          error: 'TOKEN_REFRESH_FAILED',
          message: `${tokenResult.error} Please reconnect your account.`,
          itemsExtracted: 0,
          requiresReauth: true
        };
      }

      const accessToken = tokenResult.accessToken;
      log.info(`[OK] Valid access token obtained for ${platform}`);

      // Create appropriate extractor for legacy platforms
      let extractor;
      switch (platform) {
        case 'github':
          extractor = new GitHubExtractor(accessToken);
          break;
        case 'discord':
          extractor = new DiscordExtractor(accessToken);
          break;
        case 'linkedin':
          extractor = new LinkedInExtractor(accessToken);
          break;
        case 'spotify':
          extractor = new SpotifyExtractor(userId, 'spotify');
          break;
        case 'reddit':
          extractor = new RedditExtractor(accessToken);
          break;
        case 'google_gmail':
          extractor = new GmailExtractor(accessToken);
          break;
        case 'google_calendar':
          extractor = new CalendarExtractor(accessToken);
          break;
        case 'slack':
          extractor = new SlackExtractor(accessToken);
          break;
        case 'teams':
        case 'microsoft_teams':
          extractor = new TeamsExtractor(userId, 'teams');
          break;
        case 'tiktok':
          extractor = new TikTokExtractor(userId, 'tiktok');
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      // Run extraction
      const result = await extractor.extractAll(userId, connector.id);

      // Update job with completion status
      if (jobId) {
        const { error: jobUpdateErr } = await supabaseAdmin
          .from('data_extraction_jobs')
          .update({
            status: result.success ? 'completed' : 'failed',
            total_items: result.itemsExtracted || 0,
            processed_items: result.itemsExtracted || 0,
            failed_items: result.success ? 0 : (result.itemsExtracted || 0),
            completed_at: new Date().toISOString(),
            error_message: result.success ? null : (result.error || result.message),
            results: {
              success: result.success,
              itemsExtracted: result.itemsExtracted,
              platform: platform
            }
          })
          .eq('id', jobId);
        if (jobUpdateErr) log.warn(`Error updating job ${jobId} status:`, jobUpdateErr.message);

        log.info(`Updated job ${jobId} to ${result.success ? 'completed' : 'failed'}`);

        // Notify user via WebSocket
        if (result.success) {
          notifyExtractionCompleted(userId, jobId, platform, result.itemsExtracted || 0);
          notifyPlatformSync(userId, platform, result);

          // Store extraction summary in Mem0 for long-term memory
          addPlatformMemory(userId, platform, 'extraction_summary', {
            itemsExtracted: result.itemsExtracted || 0,
            extractedAt: new Date().toISOString(),
            jobId,
            dataTypes: result.dataTypes || ['default']
          }).catch(err => log.warn(`Failed to store in Mem0:`, err.message));
        } else {
          notifyExtractionFailed(userId, jobId, platform, new Error(result.error || result.message || 'Extraction failed'));
        }

        // Invalidate cached platform status (last_sync_status changed, both Redis and in-memory)
        await invalidatePlatformStatusCache(userId);
        clearStatusMemoryCache(userId);
      }

      // Update connector metadata
      await this.updateConnectorMetadata(connector.id, result);

      return result;
    } catch (error) {
      log.error(`Error extracting from ${platform}:`, error);

      // Mark job as failed
      if (jobId) {
        const { error: catchJobErr } = await supabaseAdmin
          .from('data_extraction_jobs')
          .update({
            status: 'failed',
            error_message: error.message || 'Unknown error',
            completed_at: new Date().toISOString()
          })
          .eq('id', jobId);
        if (catchJobErr) log.warn(`Error marking job ${jobId} as failed:`, catchJobErr.message);

        // Notify user via WebSocket that extraction failed
        notifyExtractionFailed(userId, jobId, platform, error);
      }

      // Handle specific error types
      if (error.status === 401 || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        log.warn(`401 Unauthorized for ${platform} - token likely expired or revoked`);

        // Mark connector as disconnected
        const { error: connStatusErr } = await supabaseAdmin
          .from('platform_connections')
          .update({
            metadata: {
              auth_error: true,
              last_error: '401 Unauthorized - Token expired or revoked',
              error_timestamp: new Date().toISOString()
            }
          })
          .eq('user_id', userId)
          .eq('platform', platform);
        if (connStatusErr) {
          log.error(`Failed to update connector status:`, connStatusErr.message);
        }

        // Notify user via WebSocket about connection status
        notifyConnectionStatus(userId, platform, 'unauthorized', 'Authentication failed. Please reconnect your account.');

        return {
          success: false,
          platform,
          error: 'UNAUTHORIZED',
          message: `Authentication failed for ${platform}. Please reconnect your account.`,
          itemsExtracted: 0,
          requiresReauth: true
        };
      }

      throw error;
    }
  }

  /**
   * Extract data from all connected platforms
   */
  async extractAllPlatforms(userId) {
    log.info(`Starting extraction for all platforms...`);

    try {
      // Get all connected platforms
      const { data: connectors, error } = await supabaseAdmin
        .from('platform_connections')
        .select('platform')
        .eq('user_id', userId);

      if (error) {
        log.error('Supabase error fetching connectors:', error);
        throw new Error(`Failed to fetch connectors: ${error.message || JSON.stringify(error)}`);
      }

      if (!connectors || connectors.length === 0) {
        return {
          success: false,
          message: 'No connected platforms found'
        };
      }

      const results = {};

      // Extract from each platform
      for (const connector of connectors) {
        try {
          const result = await this.extractPlatformData(userId, connector.platform);
          results[connector.platform] = result;
        } catch (error) {
          log.error(`Failed to extract from ${connector.platform}:`, error);
          results[connector.platform] = {
            success: false,
            error: error.message
          };
        }
      }

      // Trigger processing pipeline
      await this.triggerProcessing(userId);

      return {
        success: true,
        platforms: results,
        totalPlatforms: connectors.length,
        successfulPlatforms: Object.values(results).filter(r => r.success).length
      };
    } catch (error) {
      log.error('Error in extractAllPlatforms:', error);
      throw error;
    }
  }

  /**
   * Update connector metadata after extraction
   */
  async updateConnectorMetadata(connectorId, extractionResult) {
    try {
      const now = new Date().toISOString();
      const metadata = {
        last_sync: now,
        last_sync_status: extractionResult.success ? 'success' : 'failed',
        last_sync_items: extractionResult.itemsExtracted || 0
      };

      const { error: metaErr } = await supabaseAdmin
        .from('platform_connections')
        .update({
          last_sync_at: now,
          last_sync_status: extractionResult.success ? 'success' : 'failed'
        })
        .eq('id', connectorId);
      if (metaErr) log.warn('Error updating connector metadata:', metaErr.message);
    } catch (error) {
      log.error('Error updating metadata:', error);
    }
  }

  /**
   * Trigger processing pipeline for extracted data
   */
  async triggerProcessing(userId) {
    log.info(`Triggering processing pipeline for user ${userId}...`);

    try {
      // Get all unprocessed data
      const { data: unprocessedData, error } = await supabaseAdmin
        .from('user_platform_data')
        .select('id, platform, data_type')
        .eq('user_id', userId)
        .eq('processed', false)
        .limit(100);

      if (error) {
        throw new Error('Failed to fetch unprocessed data');
      }

      log.info(`Found ${unprocessedData?.length || 0} unprocessed items`);

      // Processing will be handled by ETL pipeline (next step)
      // For now, just log
      return {
        unprocessedCount: unprocessedData?.length || 0
      };
    } catch (error) {
      log.error('Error triggering processing:', error);
    }
  }

  /**
   * Get extraction status for a user
   */
  async getExtractionStatus(userId) {
    try {
      // Get recent extraction jobs
      const { data: jobs, error } = await supabaseAdmin
        .from('data_extraction_jobs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        throw new Error('Failed to fetch extraction jobs');
      }

      // Get data statistics
      const { data: stats, error: statsError } = await supabaseAdmin
        .rpc('get_platform_stats', { target_user_id: userId });

      return {
        recentJobs: jobs || [],
        statistics: stats || {},
        lastSync: jobs?.[0]?.completed_at || null
      };
    } catch (error) {
      log.error('Error getting status:', error);
      throw error;
    }
  }

  /**
   * Schedule incremental sync (for future implementation)
   */
  async scheduleIncrementalSync(userId, platform, intervalHours = 24) {
    // NOTE: Platform syncing is handled by cron routes (cron-platform-polling, cron-observation-ingestion).
    // This method stores schedule metadata only; actual polling runs via Vercel cron.
    log.info(`Scheduling ${platform} sync every ${intervalHours} hours`);

    // For now, store schedule in connector metadata
    const { data: connector } = await supabaseAdmin
        .from('platform_connections')
        .select('metadata')
        .eq('user_id', userId)
        .eq('platform', platform)
        .single();

    if (connector) {
      const metadata = connector.metadata || {};
      metadata.sync_schedule = {
        enabled: true,
        interval_hours: intervalHours,
        next_sync: new Date(Date.now() + intervalHours * 60 * 60 * 1000).toISOString()
      };

      const { error: scheduleErr } = await supabaseAdmin
        .from('platform_connections')
        .update({ metadata })
        .eq('user_id', userId)
        .eq('platform', platform);
      if (scheduleErr) log.warn('Error updating sync schedule:', scheduleErr.message);
    }

    return { scheduled: true, intervalHours };
  }
}

export default new DataExtractionService();
