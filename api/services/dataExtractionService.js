/**
 * Data Extraction Service
 * Orchestrates data extraction from all connected OAuth platforms
 */

import { createClient } from '@supabase/supabase-js';
import GitHubExtractor from './extractors/githubExtractor.js';
import DiscordExtractor from './extractors/discordExtractor.js';
import LinkedInExtractor from './extractors/linkedinExtractor.js';
import { decryptToken } from './encryption.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class DataExtractionService {
  /**
   * Extract data from a specific platform
   */
  async extractPlatformData(userId, platform) {
    console.log(`[DataExtraction] Starting extraction for ${platform}...`);

    try {
      // Get connector for this platform
      const { data: connector, error } = await supabase
        .from('data_connectors')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', platform)
        .eq('connected', true)
        .single();

      if (error || !connector) {
        throw new Error(`No connected ${platform} account found for user`);
      }

      // Decrypt access token
      const accessToken = decryptToken(connector.access_token);

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
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      // Run extraction
      const result = await extractor.extractAll(userId, connector.id);

      // Update connector metadata
      await this.updateConnectorMetadata(connector.id, result);

      return result;
    } catch (error) {
      console.error(`[DataExtraction] Error extracting from ${platform}:`, error);
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
        .from('data_connectors')
        .select('provider')
        .eq('user_id', userId)
        .eq('connected', true);

      if (error) {
        throw new Error('Failed to fetch connectors');
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
          const result = await this.extractPlatformData(userId, connector.provider);
          results[connector.provider] = result;
        } catch (error) {
          console.error(`[DataExtraction] Failed to extract from ${connector.provider}:`, error);
          results[connector.provider] = {
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
      const metadata = {
        last_sync: new Date().toISOString(),
        last_sync_status: extractionResult.success ? 'success' : 'failed',
        last_sync_items: extractionResult.itemsExtracted || 0
      };

      await supabase
        .from('data_connectors')
        .update({ metadata })
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
        .from('data_connectors')
        .select('metadata')
        .eq('user_id', userId)
        .eq('provider', platform)
        .single();

    if (connector) {
      const metadata = connector.metadata || {};
      metadata.sync_schedule = {
        enabled: true,
        interval_hours: intervalHours,
        next_sync: new Date(Date.now() + intervalHours * 60 * 60 * 1000).toISOString()
      };

      await supabase
        .from('data_connectors')
        .update({ metadata })
        .eq('user_id', userId)
        .eq('provider', platform);
    }

    return { scheduled: true, intervalHours };
  }
}

export default new DataExtractionService();
