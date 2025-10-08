/**
 * Slack Data Extractor
 * Extracts messages, channels, reactions, and team communication patterns
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class SlackExtractor {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://slack.com/api';
  }

  /**
   * Main extraction method - extracts all Slack data for a user
   */
  async extractAll(userId, connectorId) {
    console.log(`[Slack] Starting full extraction for user: ${userId}`);

    try {
      // Create extraction job
      const job = await this.createExtractionJob(userId, connectorId);

      let totalItems = 0;

      // Extract different data types
      totalItems += await this.extractUserInfo(userId);
      totalItems += await this.extractChannels(userId);
      totalItems += await this.extractRecentMessages(userId);
      totalItems += await this.extractReactions(userId);

      // Complete job
      await this.completeExtractionJob(job.id, totalItems);

      console.log(`[Slack] Extraction complete. Total items: ${totalItems}`);
      return { success: true, itemsExtracted: totalItems };
    } catch (error) {
      console.error('[Slack] Extraction error:', error);
      throw error;
    }
  }

  /**
   * Make authenticated request to Slack API
   */
  async makeRequest(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Slack API error (${response.status}): ${error}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error || 'Unknown error'}`);
    }

    return data;
  }

  /**
   * Extract user information
   */
  async extractUserInfo(userId) {
    console.log(`[Slack] Extracting user info...`);

    try {
      // Get authenticated user's identity
      const data = await this.makeRequest('users.identity');

      await this.storeRawData(userId, 'slack', 'user_info', {
        slack_user_id: data.user.id,
        slack_user_name: data.user.name,
        slack_email: data.user.email,
        team_id: data.team.id,
        team_name: data.team.name,
        extracted_at: new Date().toISOString()
      });

      console.log(`[Slack] Extracted user info`);
      return 1;
    } catch (error) {
      console.error('[Slack] Error extracting user info:', error);
      return 0;
    }
  }

  /**
   * Extract channels the user is a member of
   */
  async extractChannels(userId) {
    console.log(`[Slack] Extracting channels...`);
    let channelCount = 0;

    try {
      const data = await this.makeRequest('conversations.list', {
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 200
      });

      if (data.channels && data.channels.length > 0) {
        for (const channel of data.channels) {
          // Only store channels the user is a member of
          if (channel.is_member) {
            await this.storeRawData(userId, 'slack', 'channel', {
              channel_id: channel.id,
              channel_name: channel.name,
              is_private: channel.is_private,
              is_member: channel.is_member,
              num_members: channel.num_members,
              topic: channel.topic?.value,
              purpose: channel.purpose?.value,
              created: channel.created,
              is_general: channel.is_general,
              url: `slack://channel?team=${channel.context_team_id}&id=${channel.id}`
            });

            channelCount++;
          }
        }
      }

      console.log(`[Slack] Extracted ${channelCount} channels`);
      return channelCount;
    } catch (error) {
      console.error('[Slack] Error extracting channels:', error);
      return channelCount;
    }
  }

  /**
   * Extract recent messages from the user
   */
  async extractRecentMessages(userId) {
    console.log(`[Slack] Extracting recent messages...`);
    let messageCount = 0;

    try {
      // Search for messages from the user (last 100 messages)
      const data = await this.makeRequest('search.messages', {
        query: 'from:me',
        sort: 'timestamp',
        sort_dir: 'desc',
        count: 100
      });

      if (data.messages && data.messages.matches) {
        for (const message of data.messages.matches) {
          await this.storeRawData(userId, 'slack', 'message', {
            message_ts: message.ts,
            channel_id: message.channel?.id,
            channel_name: message.channel?.name,
            text: message.text,
            timestamp: new Date(parseFloat(message.ts) * 1000).toISOString(),
            permalink: message.permalink,
            reaction_count: message.reactions?.length || 0,
            reactions: message.reactions || []
          });

          messageCount++;
        }
      }

      console.log(`[Slack] Extracted ${messageCount} messages`);
      return messageCount;
    } catch (error) {
      console.error('[Slack] Error extracting messages:', error);
      return messageCount;
    }
  }

  /**
   * Extract reactions given by the user
   */
  async extractReactions(userId) {
    console.log(`[Slack] Extracting reactions...`);
    let reactionCount = 0;

    try {
      const data = await this.makeRequest('reactions.list', {
        limit: 100,
        full: true
      });

      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          // Each item represents a message or file that the user reacted to
          await this.storeRawData(userId, 'slack', 'reaction', {
            item_type: item.type, // message or file
            channel: item.channel,
            message_ts: item.message?.ts,
            message_text: item.message?.text,
            reactions: item.message?.reactions || [],
            timestamp: item.message?.ts
              ? new Date(parseFloat(item.message.ts) * 1000).toISOString()
              : new Date().toISOString()
          });

          reactionCount++;
        }
      }

      console.log(`[Slack] Extracted ${reactionCount} reactions`);
      return reactionCount;
    } catch (error) {
      console.error('[Slack] Error extracting reactions:', error);
      return reactionCount;
    }
  }

  /**
   * Helper: Sleep for rate limiting
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
          source_url: rawData.url || rawData.permalink || null,
          extracted_at: new Date().toISOString(),
          processed: false
        }, {
          onConflict: 'user_id,platform,data_type,source_url',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('[Slack] Error storing data:', error);
      }
    } catch (error) {
      console.error('[Slack] Exception storing data:', error);
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
        platform: 'slack',
        job_type: 'full_sync',
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[Slack] Error creating job:', error);
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

export default SlackExtractor;
