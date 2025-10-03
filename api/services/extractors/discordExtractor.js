/**
 * Discord Data Extractor
 * Extracts guild membership, user profile, and connections from Discord
 * Note: Discord OAuth doesn't provide message history access
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class DiscordExtractor {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://discord.com/api/v10';
  }

  /**
   * Main extraction method
   */
  async extractAll(userId, connectorId) {
    console.log(`[Discord] Starting extraction for user: ${userId}`);

    try {
      const job = await this.createExtractionJob(userId, connectorId);
      let totalItems = 0;

      // Extract user profile
      totalItems += await this.extractUserProfile(userId);

      // Extract guilds (servers)
      totalItems += await this.extractGuilds(userId);

      // Extract connections (linked accounts)
      totalItems += await this.extractConnections(userId);

      await this.completeExtractionJob(job.id, totalItems);

      console.log(`[Discord] Extraction complete. Total items: ${totalItems}`);
      return { success: true, itemsExtracted: totalItems };
    } catch (error) {
      console.error('[Discord] Extraction error:', error);
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

module.exports = DiscordExtractor;
