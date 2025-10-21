/**
 * Microsoft Teams Data Extractor
 * Extracts chats, channels, messages, and collaboration patterns using Microsoft Graph API
 */

import { createClient } from '@supabase/supabase-js';
import { ensureFreshToken } from '../tokenRefreshService.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class TeamsExtractor {
  constructor(userId, platform = 'teams') {
    this.userId = userId;
    this.platform = platform;
    this.baseUrl = 'https://graph.microsoft.com/v1.0';
  }

  /**
   * Main extraction method - extracts all Teams data for a user
   */
  async extractAll(userId, connectorId) {
    console.log(`[Teams] Starting full extraction for user: ${userId}`);

    try {
      // Create extraction job
      const job = await this.createExtractionJob(userId, connectorId);

      let totalItems = 0;

      // Extract different data types
      totalItems += await this.extractUserInfo(userId);
      totalItems += await this.extractChats(userId);
      totalItems += await this.extractTeams(userId);
      totalItems += await this.extractUserActivity(userId);

      // Complete job
      await this.completeExtractionJob(job.id, totalItems);

      console.log(`[Teams] Extraction complete. Total items: ${totalItems}`);
      return { success: true, itemsExtracted: totalItems };
    } catch (error) {
      console.error('[Teams] Extraction error:', error);
      throw error;
    }
  }

  /**
   * Make authenticated request to Microsoft Graph API
   * Automatically handles token refresh on 401 errors
   */
  async makeRequest(endpoint, params = {}, retries = 2) {
    // Get fresh access token
    const freshToken = await ensureFreshToken(this.userId, this.platform);

    if (!freshToken) {
      throw new Error('[Teams] No valid access token available');
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${freshToken}`,
          'Content-Type': 'application/json'
        }
      });

      // Handle 401 - token expired, retry once with fresh token
      if (response.status === 401 && retries > 0) {
        console.log('[Teams] Token expired, fetching fresh token and retrying...');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        return this.makeRequest(endpoint, params, retries - 1);
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Teams API error (${response.status}): ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[Teams] Request error for ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Extract user information
   */
  async extractUserInfo(userId) {
    console.log(`[Teams] Extracting user info...`);

    try {
      // Get authenticated user's profile
      const data = await this.makeRequest('/me');

      await this.storeRawData(userId, 'teams', 'user_info', {
        teams_user_id: data.id,
        display_name: data.displayName,
        email: data.mail || data.userPrincipalName,
        job_title: data.jobTitle,
        office_location: data.officeLocation,
        extracted_at: new Date().toISOString()
      });

      console.log(`[Teams] Extracted user info`);
      return 1;
    } catch (error) {
      console.error('[Teams] Error extracting user info:', error);
      return 0;
    }
  }

  /**
   * Extract user chats
   */
  async extractChats(userId) {
    console.log(`[Teams] Extracting chats...`);

    try {
      let totalChats = 0;
      let nextLink = '/me/chats';

      // Paginate through all chats
      while (nextLink) {
        const data = nextLink.startsWith('http')
          ? await this.makeRequestFromFullUrl(nextLink)
          : await this.makeRequest(nextLink);

        if (data.value && data.value.length > 0) {
          // Store each chat
          for (const chat of data.value) {
            await this.storeRawData(userId, 'teams', 'chat', {
              chat_id: chat.id,
              chat_type: chat.chatType,
              topic: chat.topic,
              created_date: chat.createdDateTime,
              last_updated: chat.lastUpdatedDateTime,
              members_count: chat.members?.length || 0,
              extracted_at: new Date().toISOString()
            }, `https://teams.microsoft.com/l/chat/${chat.id}`);

            totalChats++;

            // Extract messages for this chat (limited to recent 50)
            await this.extractChatMessages(userId, chat.id);
          }
        }

        nextLink = data['@odata.nextLink']?.replace(this.baseUrl, '') || null;
      }

      console.log(`[Teams] Extracted ${totalChats} chats`);
      return totalChats;
    } catch (error) {
      console.error('[Teams] Error extracting chats:', error);
      return 0;
    }
  }

  /**
   * Extract messages from a specific chat
   */
  async extractChatMessages(userId, chatId) {
    try {
      // Get recent messages from chat (limited to 50 most recent)
      const data = await this.makeRequest(`/chats/${chatId}/messages`, { '$top': 50 });

      if (data.value && data.value.length > 0) {
        let messagesData = data.value.map(msg => ({
          message_id: msg.id,
          from_user: msg.from?.user?.displayName || 'Unknown',
          from_user_id: msg.from?.user?.id,
          content_type: msg.body?.contentType,
          content: msg.body?.content?.substring(0, 500), // Limit content length
          created_date: msg.createdDateTime,
          importance: msg.importance,
          has_attachments: msg.attachments?.length > 0
        }));

        await this.storeRawData(userId, 'teams', 'chat_messages', {
          chat_id: chatId,
          messages_count: messagesData.length,
          messages: messagesData,
          extracted_at: new Date().toISOString()
        }, `https://teams.microsoft.com/l/chat/${chatId}`);
      }
    } catch (error) {
      // Some chats may not have accessible messages (permissions)
      console.log(`[Teams] Could not extract messages for chat ${chatId}:`, error.message);
    }
  }

  /**
   * Extract teams the user is a member of
   */
  async extractTeams(userId) {
    console.log(`[Teams] Extracting teams...`);

    try {
      let totalTeams = 0;
      let nextLink = '/me/joinedTeams';

      while (nextLink) {
        const data = nextLink.startsWith('http')
          ? await this.makeRequestFromFullUrl(nextLink)
          : await this.makeRequest(nextLink);

        if (data.value && data.value.length > 0) {
          for (const team of data.value) {
            await this.storeRawData(userId, 'teams', 'team', {
              team_id: team.id,
              team_name: team.displayName,
              description: team.description,
              is_archived: team.isArchived,
              extracted_at: new Date().toISOString()
            }, `https://teams.microsoft.com/l/team/${team.id}`);

            totalTeams++;

            // Extract channels for this team
            await this.extractTeamChannels(userId, team.id);
          }
        }

        nextLink = data['@odata.nextLink']?.replace(this.baseUrl, '') || null;
      }

      console.log(`[Teams] Extracted ${totalTeams} teams`);
      return totalTeams;
    } catch (error) {
      console.error('[Teams] Error extracting teams:', error);
      return 0;
    }
  }

  /**
   * Extract channels for a team
   */
  async extractTeamChannels(userId, teamId) {
    try {
      const data = await this.makeRequest(`/teams/${teamId}/channels`);

      if (data.value && data.value.length > 0) {
        let channelsData = data.value.map(channel => ({
          channel_id: channel.id,
          channel_name: channel.displayName,
          description: channel.description,
          membership_type: channel.membershipType
        }));

        await this.storeRawData(userId, 'teams', 'team_channels', {
          team_id: teamId,
          channels_count: channelsData.length,
          channels: channelsData,
          extracted_at: new Date().toISOString()
        }, `https://teams.microsoft.com/l/team/${teamId}`);
      }
    } catch (error) {
      console.log(`[Teams] Could not extract channels for team ${teamId}:`, error.message);
    }
  }

  /**
   * Extract user activity reports
   * Note: Requires Reports.Read.All permission (admin consent)
   */
  async extractUserActivity(userId) {
    console.log(`[Teams] Extracting user activity...`);

    try {
      // Get Teams user activity details for last 7 days
      const data = await this.makeRequest('/reports/getTeamsUserActivityUserDetail(period=\'D7\')');

      if (data) {
        await this.storeRawData(userId, 'teams', 'user_activity', {
          activity_data: data,
          extracted_at: new Date().toISOString()
        }, 'teams-activity');

        console.log(`[Teams] Extracted user activity`);
        return 1;
      }
    } catch (error) {
      // Activity reports may require admin consent - gracefully skip
      console.log('[Teams] Could not extract user activity (may require admin consent):', error.message);
      return 0;
    }

    return 0;
  }

  /**
   * Make request from full URL (for pagination)
   */
  async makeRequestFromFullUrl(fullUrl) {
    const freshToken = await ensureFreshToken(this.userId, this.platform);

    if (!freshToken) {
      throw new Error('[Teams] No valid access token available');
    }

    const response = await fetch(fullUrl, {
      headers: {
        'Authorization': `Bearer ${freshToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Teams API error (${response.status}): ${error}`);
    }

    return await response.json();
  }

  /**
   * Store raw data from Teams in Supabase
   */
  async storeRawData(userId, platform, dataType, data, sourceUrl = null) {
    try {
      const { error } = await supabase
        .from('user_platform_data')
        .upsert({
          user_id: userId,
          platform,
          data_type: dataType,
          raw_data: data,
          source_url: sourceUrl,
          extraction_status: 'completed',
          extracted_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,platform,data_type,source_url'
        });

      if (error) {
        console.error(`[Teams] Error storing ${dataType} data:`, error);
        throw error;
      }
    } catch (error) {
      console.error(`[Teams] Error in storeRawData:`, error);
      throw error;
    }
  }

  /**
   * Create extraction job record
   */
  async createExtractionJob(userId, connectorId) {
    const { data, error } = await supabase
      .from('extraction_jobs')
      .insert({
        user_id: userId,
        connector_id: connectorId,
        platform: 'teams',
        status: 'in_progress',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[Teams] Error creating extraction job:', error);
      throw error;
    }

    return data;
  }

  /**
   * Complete extraction job
   */
  async completeExtractionJob(jobId, itemsExtracted) {
    const { error } = await supabase
      .from('extraction_jobs')
      .update({
        status: 'completed',
        items_extracted: itemsExtracted,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (error) {
      console.error('[Teams] Error completing extraction job:', error);
      throw error;
    }
  }
}

export default TeamsExtractor;
