/**
 * Data Extraction Service
 * Orchestrates data extraction from all connected OAuth platforms
 */

import { createClient } from '@supabase/supabase-js';
import GitHubExtractor from './extractors/githubExtractor.js';
import DiscordExtractor from './extractors/discordExtractor.js';
import LinkedInExtractor from './extractors/linkedinExtractor.js';
import SpotifyExtractor from './extractors/spotifyExtractor.js';
import RedditExtractor from './extractors/redditExtractor.js';
import YouTubeExtractor from './extractors/youtubeExtractor.js';
import GmailExtractor from './extractors/gmailExtractor.js';
import SlackExtractor from './extractors/slackExtractor.js';
import CalendarExtractor from './extractors/calendarExtractor.js';
import TeamsExtractor from './extractors/teamsExtractor.js';
import TikTokExtractor from './extractors/tiktokExtractor.js';
import { decryptToken } from './encryption.js';
import { getValidAccessToken } from './tokenRefresh.js';

// Use SUPABASE_URL (backend) - fallback to VITE_ prefix for compatibility
// Lazy initialization to avoid crashes if env vars not loaded yet
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

class DataExtractionService {
  /**
   * Extract data from a specific platform
   */
  async extractPlatformData(userId, platform) {
    console.log(`[DataExtraction] Starting extraction for ${platform}...`);

    // Create extraction job record
    let jobId = null;

    try {
      // Get connector for this platform
      const { data: connector, error } = await supabase
        .from('platform_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', platform)
        .single();

      if (error || !connector) {
        throw new Error(`No connected ${platform} account found for user`);
      }

      // Create job record with 'pending' status
      const { data: job, error: jobError } = await supabase
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
        console.error(`[DataExtraction] Failed to create job record:`, jobError);
      } else {
        jobId = job.id;
        console.log(`[DataExtraction] Created job ${jobId} for ${platform}`);
      }

      // Update job to 'running' status
      if (jobId) {
        await supabase
          .from('data_extraction_jobs')
          .update({ status: 'running' })
          .eq('id', jobId);
      }

      // Get valid access token (auto-refresh if expired)
      console.log(`[DataExtraction] Getting valid access token for ${platform}...`);
      const tokenResult = await getValidAccessToken(userId, platform);

      if (!tokenResult.success) {
        console.warn(`[DataExtraction] Failed to get valid token for ${platform}: ${tokenResult.error}`);

        // Mark job as failed
        if (jobId) {
          await supabase
            .from('data_extraction_jobs')
            .update({
              status: 'failed',
              error_message: tokenResult.error || 'Token refresh failed',
              completed_at: new Date().toISOString()
            })
            .eq('id', jobId);
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
      console.log(`[DataExtraction] [OK] Valid access token obtained for ${platform}`);

      // Create appropriate extractor
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
        case 'youtube':
          extractor = new YouTubeExtractor(userId, 'youtube');
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
        case 'twitch':
          // This platform is defined but extractor not yet implemented
          console.warn(`[DataExtraction] Extractor for ${platform} not yet implemented - skipping`);

          // Mark job as failed
          if (jobId) {
            await supabase
              .from('data_extraction_jobs')
              .update({
                status: 'failed',
                error_message: 'Extractor not yet implemented',
                completed_at: new Date().toISOString()
              })
              .eq('id', jobId);
          }

          return {
            success: false,
            platform,
            message: `Extractor for ${platform} is not yet implemented`,
            itemsExtracted: 0,
            skipped: true
          };
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      // Run extraction
      const result = await extractor.extractAll(userId, connector.id);

      // Update job with completion status
      if (jobId) {
        await supabase
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

        console.log(`[DataExtraction] Updated job ${jobId} to ${result.success ? 'completed' : 'failed'}`);
      }

      // Update connector metadata
      await this.updateConnectorMetadata(connector.id, result);

      return result;
    } catch (error) {
      console.error(`[DataExtraction] Error extracting from ${platform}:`, error);

      // Mark job as failed
      if (jobId) {
        await supabase
          .from('data_extraction_jobs')
          .update({
            status: 'failed',
            error_message: error.message || 'Unknown error',
            completed_at: new Date().toISOString()
          })
          .eq('id', jobId);
      }

      // Handle specific error types
      if (error.status === 401 || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        console.warn(`[DataExtraction] 401 Unauthorized for ${platform} - token likely expired or revoked`);

        // Mark connector as disconnected
        try {
          await supabase
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
        } catch (updateError) {
          console.error(`[DataExtraction] Failed to update connector status:`, updateError);
        }

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
    console.log(`[DataExtraction] Starting extraction for all platforms...`);

    try {
      // Get all connected platforms
      const { data: connectors, error } = await supabase
        .from('platform_connections')
        .select('platform')
        .eq('user_id', userId);

      if (error) {
        console.error('[DataExtraction] Supabase error fetching connectors:', error);
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
          console.error(`[DataExtraction] Failed to extract from ${connector.platform}:`, error);
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
      console.error('[DataExtraction] Error in extractAllPlatforms:', error);
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

      await supabase
        .from('platform_connections')
        .update({
          last_synced_at: now,
          last_sync_status: extractionResult.success ? 'success' : 'failed'
        })
        .eq('id', connectorId);
    } catch (error) {
      console.error('[DataExtraction] Error updating metadata:', error);
    }
  }

  /**
   * Trigger processing pipeline for extracted data
   */
  async triggerProcessing(userId) {
    console.log(`[DataExtraction] Triggering processing pipeline for user ${userId}...`);

    try {
      // Get all unprocessed data
      const { data: unprocessedData, error } = await supabase
        .from('user_platform_data')
        .select('id, platform, data_type')
        .eq('user_id', userId)
        .eq('processed', false)
        .limit(100);

      if (error) {
        throw new Error('Failed to fetch unprocessed data');
      }

      console.log(`[DataExtraction] Found ${unprocessedData?.length || 0} unprocessed items`);

      // Processing will be handled by ETL pipeline (next step)
      // For now, just log
      return {
        unprocessedCount: unprocessedData?.length || 0
      };
    } catch (error) {
      console.error('[DataExtraction] Error triggering processing:', error);
    }
  }

  /**
   * Get extraction status for a user
   */
  async getExtractionStatus(userId) {
    try {
      // Get recent extraction jobs
      const { data: jobs, error } = await supabase
        .from('data_extraction_jobs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        throw new Error('Failed to fetch extraction jobs');
      }

      // Get data statistics
      const { data: stats, error: statsError } = await supabase
        .rpc('get_platform_stats', { target_user_id: userId });

      return {
        recentJobs: jobs || [],
        statistics: stats || {},
        lastSync: jobs?.[0]?.completed_at || null
      };
    } catch (error) {
      console.error('[DataExtraction] Error getting status:', error);
      throw error;
    }
  }

  /**
   * Schedule incremental sync (for future implementation)
   */
  async scheduleIncrementalSync(userId, platform, intervalHours = 24) {
    // TODO: Implement cron job or background task scheduling
    console.log(`[DataExtraction] Scheduling ${platform} sync every ${intervalHours} hours`);

    // For now, store schedule in connector metadata
    const { data: connector } = await supabase
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

      await supabase
        .from('platform_connections')
        .update({ metadata })
        .eq('user_id', userId)
        .eq('platform', platform);
    }

    return { scheduled: true, intervalHours };
  }
}

export default new DataExtractionService();
