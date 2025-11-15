/**
 * Discord Data Extractor
 * Extracts user profile, guilds/servers, and analyzes community involvement patterns
 *
 * IMPORTANT LIMITATIONS:
 * Discord OAuth provides limited data:
 * ✅ User profile (ID, username, discriminator, avatar)
 * ✅ List of servers user is in (name, icon, member count)
 * ❌ Messages/DMs (requires bot token with special permissions)
 * ❌ Channel data (requires bot token)
 * ❌ Detailed member activity (requires bot token)
 *
 * For deeper integration, a Discord bot would be needed (future enhancement).
 */

import { createClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '../tokenRefreshService.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class DiscordExtractor {
  constructor(userId, platform = 'discord') {
    this.userId = userId;
    this.platform = platform;
    this.baseUrl = 'https://discord.com/api/v10';
  }

  /**
   * Main extraction method - extracts all Discord data for a user
   */
  async extractAll(userId, connectorId) {
    console.log(`[Discord] Starting full extraction for user: ${userId}`);

    let job = null;
    try {
      // Create extraction job
      job = await this.createExtractionJob(userId, connectorId);

      let totalItems = 0;

      // Extract different data types
      totalItems += await this.extractProfile(userId);
      totalItems += await this.extractGuilds(userId);

      // Analyze community soul from extracted data
      let analysis = null;
      try {
        console.log(`[Discord] Analyzing community soul...`);
        analysis = await this.analyzeCommunitySoul(userId);
        console.log(`[Discord] Community soul analysis complete`);
      } catch (analysisError) {
        console.error('[Discord] Error analyzing community soul:', analysisError);
        // Don't fail the extraction if analysis fails
      }

      // Complete job
      await this.completeExtractionJob(job.id, totalItems);

      console.log(`[Discord] Extraction complete. Total items: ${totalItems}`);
      return {
        success: true,
        itemsExtracted: totalItems,
        platform: 'discord',
        analysis: analysis
      };
    } catch (error) {
      console.error('[Discord] Extraction error:', error);

      // Mark job as failed if it was created
      if (job && job.id) {
        await this.failExtractionJob(job.id, error.message || 'Unknown error occurred');
      }

      // If 401, throw to trigger reauth flow
      if (error.status === 401 || error.message?.includes('401')) {
        const authError = new Error('Discord authentication failed - please reconnect');
        authError.status = 401;
        throw authError;
      }

      throw error;
    }
  }

  /**
   * Make authenticated request to Discord API with automatic token refresh
   */
  async makeRequest(endpoint, params = {}, retryCount = 0) {
    try {
      // Get fresh access token (automatically refreshes if needed)
      const accessToken = await getValidAccessToken(this.userId, this.platform);

      if (!accessToken) {
        throw new Error('Not authenticated with Discord - please connect your account');
      }

      const url = new URL(`${this.baseUrl}${endpoint}`);
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      // Handle 401 with retry (token might have expired during long extraction)
      if (response.status === 401 && retryCount < 2) {
        console.log(`[Discord] 401 error, retrying with fresh token (attempt ${retryCount + 1}/2)`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        return this.makeRequest(endpoint, params, retryCount + 1);
      }

      // Handle rate limiting (Discord returns 429 with Retry-After header)
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
        console.warn(`[Discord] Rate limited, waiting ${waitMs}ms before retry`);

        if (retryCount < 3) {
          await new Promise(resolve => setTimeout(resolve, waitMs));
          return this.makeRequest(endpoint, params, retryCount + 1);
        } else {
          throw new Error('Discord API rate limit exceeded - please try again later');
        }
      }

      if (!response.ok) {
        const error = await response.text();
        const apiError = new Error(`Discord API error (${response.status}): ${error}`);
        apiError.status = response.status;
        throw apiError;
      }

      return response.json();
    } catch (error) {
      if (error.message.includes('Token refresh failed') || error.message.includes('Not authenticated')) {
        console.error('[Discord] Token refresh failed - marking connection as needs_reauth');
        const authError = new Error('Discord authentication failed - please reconnect');
        authError.status = 401;
        throw authError;
      }
      throw error;
    }
  }

  /**
   * Extract user profile
   */
  async extractUserProfile(userId) {
    console.log(`[Discord] Extracting user profile...`);

    try {
      const response = await fetch(`${this.baseUrl}/users/@me`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status}`);
      }

      const user = await response.json();

      await this.storeRawData(userId, 'discord', 'profile', {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        global_name: user.global_name,
        avatar: user.avatar,
        banner: user.banner,
        accent_color: user.accent_color,
        locale: user.locale,
        verified: user.verified,
        email: user.email,
        flags: user.flags,
        premium_type: user.premium_type,
        public_flags: user.public_flags
      });

      console.log(`[Discord] Extracted profile for ${user.username}`);
      return 1;
    } catch (error) {
      console.error('[Discord] Error extracting profile:', error);
      return 0;
    }
  }

  /**
   * Extract user's guilds (servers)
   */
  async extractGuilds(userId) {
    console.log(`[Discord] Extracting guilds...`);
    let guildCount = 0;

    try {
      const response = await fetch(`${this.baseUrl}/users/@me/guilds`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status}`);
      }

      const guilds = await response.json();

      for (const guild of guilds) {
        await this.storeRawData(userId, 'discord', 'guild', {
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          owner: guild.owner,
          permissions: guild.permissions,
          features: guild.features,
          approximate_member_count: guild.approximate_member_count,
          approximate_presence_count: guild.approximate_presence_count
        });

        guildCount++;
      }

      console.log(`[Discord] Extracted ${guildCount} guilds`);
      return guildCount;
    } catch (error) {
      console.error('[Discord] Error extracting guilds:', error);
      return guildCount;
    }
  }

  /**
   * Extract user connections (linked accounts)
   */
  async extractConnections(userId) {
    console.log(`[Discord] Extracting connections...`);
    let connectionCount = 0;

    try {
      const response = await fetch(`${this.baseUrl}/users/@me/connections`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status}`);
      }

      const connections = await response.json();

      for (const connection of connections) {
        await this.storeRawData(userId, 'discord', 'connection', {
          type: connection.type,
          id: connection.id,
          name: connection.name,
          verified: connection.verified,
          friend_sync: connection.friend_sync,
          show_activity: connection.show_activity,
          visibility: connection.visibility
        });

        connectionCount++;
      }

      console.log(`[Discord] Extracted ${connectionCount} connections`);
      return connectionCount;
    } catch (error) {
      console.error('[Discord] Error extracting connections:', error);
      return connectionCount;
    }
  }

  /**
   * Store raw data in database
   */
  async storeRawData(userId, platform, dataType, rawData) {
    try {
      const { error } = await supabase
        .from('user_platform_data')
        .upsert({
          user_id: userId,
          platform,
          data_type: dataType,
          raw_data: rawData,
          source_url: `discord://${dataType}/${rawData.id}`,
          extracted_at: new Date().toISOString(),
          processed: false
        }, {
          onConflict: 'user_id,platform,data_type,source_url',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('[Discord] Error storing data:', error);
      }
    } catch (error) {
      console.error('[Discord] Exception storing data:', error);
    }
  }

  /**
   * Create extraction job
   */
  async createExtractionJob(userId, connectorId) {
    const { data, error } = await supabase
      .from('data_extraction_jobs')
      .insert({
        user_id: userId,
        connector_id: connectorId,
        platform: 'discord',
        job_type: 'full_sync',
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[Discord] Error creating job:', error);
      throw error;
    }

    return data;
  }

  /**
   * Complete extraction job
   */
  async completeExtractionJob(jobId, totalItems) {
    await supabase
      .from('data_extraction_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_items: totalItems,
        processed_items: totalItems,
        results: { message: 'Extraction completed successfully' }
      })
      .eq('id', jobId);
  }
}

export default DiscordExtractor;
