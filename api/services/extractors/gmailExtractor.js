/**
 * Gmail Data Extractor
 * Extracts email metadata, labels, sent/received patterns, and communication insights
 * Fixed: Now correctly stores data in user_platform_data table
 */

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class GmailExtractor {
  constructor(accessToken) {
    this.accessToken = accessToken;

    // Initialize Google API client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  }

  /**
   * Main extraction method - extracts all Gmail data for a user
   */
  async extractAll(userId, connectorId) {
    console.log(`[Gmail] Starting full extraction for user: ${userId}`);

    try {
      // Create extraction job
      const job = await this.createExtractionJob(userId, connectorId);

      // Get user profile
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      console.log(`[Gmail] Email: ${profile.data.emailAddress}`);

      let totalItems = 0;

      // Extract different data types
      totalItems += await this.extractLabels(userId);
      totalItems += await this.extractEmailMetadata(userId);
      totalItems += await this.extractSentPatterns(userId);
      totalItems += await this.extractCommunicationInsights(userId);

      // Complete job
      await this.completeExtractionJob(job.id, totalItems);

      console.log(`[Gmail] Extraction complete. Total items: ${totalItems}`);
      return { success: true, itemsExtracted: totalItems };
    } catch (error) {
      console.error('[Gmail] Extraction error:', error);
      throw error;
    }
  }

  /**
   * Extract user labels for organization insights
   */
  async extractLabels(userId) {
    console.log(`[Gmail] Extracting labels...`);

    try {
      const response = await this.gmail.users.labels.list({ userId: 'me' });
      const labels = response.data.labels || [];

      console.log(`[Gmail] Found ${labels.length} labels`);

      // Store labels
      for (const label of labels) {
        await supabase
          .from('user_platform_data')
          .upsert({
            user_id: userId,
            platform: 'google_gmail',
            data_type: 'label',
            raw_data: {
              id: label.id,
              name: label.name,
              type: label.type,
              messagesTotal: label.messagesTotal,
              messagesUnread: label.messagesUnread,
              threadsTotal: label.threadsTotal,
              threadsUnread: label.threadsUnread
            },
            extracted_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,platform,data_type'
          });
      }

      return labels.length;
    } catch (error) {
      console.error('[Gmail] Error extracting labels:', error);
      return 0;
    }
  }

  /**
   * Extract email metadata (last 500 messages)
   */
  async extractEmailMetadata(userId) {
    console.log(`[Gmail] Extracting email metadata...`);
    let emailCount = 0;

    try {
      // Get message IDs (last 500)
      const listResponse = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: 500,
        q: '' // Empty query gets all messages
      });

      const messages = listResponse.data.messages || [];
      console.log(`[Gmail] Found ${messages.length} messages`);

      // Process in batches of 50
      for (let i = 0; i < Math.min(messages.length, 100); i++) {
        try {
          const message = await this.gmail.users.messages.get({
            userId: 'me',
            id: messages[i].id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date', 'Cc', 'Bcc']
          });

          const headers = message.data.payload?.headers || [];
          const metadata = {};

          for (const header of headers) {
            metadata[header.name] = header.value;
          }

          // Store email metadata
          await supabase
            .from('user_platform_data')
            .insert({
              user_id: userId,
              platform: 'google_gmail',
              data_type: 'email_metadata',
              raw_data: {
                id: message.data.id,
                threadId: message.data.threadId,
                labelIds: message.data.labelIds,
                snippet: message.data.snippet,
                internalDate: message.data.internalDate,
                metadata
              },
              extracted_at: new Date().toISOString()
            });

          emailCount++;
        } catch (error) {
          console.error(`[Gmail] Error extracting message ${messages[i].id}:`, error.message);
        }
      }

      return emailCount;
    } catch (error) {
      console.error('[Gmail] Error extracting email metadata:', error);
      return 0;
    }
  }

  /**
   * Extract sent email patterns
   */
  async extractSentPatterns(userId) {
    console.log(`[Gmail] Extracting sent patterns...`);

    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: 200,
        q: 'in:sent'
      });

      const sentMessages = response.data.messages || [];
      console.log(`[Gmail] Found ${sentMessages.length} sent messages`);

      // Analyze sending patterns
      const patterns = {
        total_sent: sentMessages.length,
        extracted_at: new Date().toISOString()
      };

      // Store patterns
      await supabase
        .from('user_platform_data')
        .insert({
          user_id: userId,
          platform: 'google_gmail',
          data_type: 'sent_patterns',
          raw_data: patterns,
          extracted_at: new Date().toISOString()
        });

      return 1;
    } catch (error) {
      console.error('[Gmail] Error extracting sent patterns:', error);
      return 0;
    }
  }

  /**
   * Extract communication insights
   */
  async extractCommunicationInsights(userId) {
    console.log(`[Gmail] Extracting communication insights...`);

    try {
      // Get total message count
      const profile = await this.gmail.users.getProfile({ userId: 'me' });

      const insights = {
        total_messages: profile.data.messagesTotal,
        total_threads: profile.data.threadsTotal,
        email_address: profile.data.emailAddress,
        history_id: profile.data.historyId,
        extracted_at: new Date().toISOString()
      };

      // Store insights
      await supabase
        .from('user_platform_data')
        .insert({
          user_id: userId,
          platform: 'google_gmail',
          data_type: 'communication_insights',
          raw_data: insights,
          extracted_at: new Date().toISOString()
        });

      return 1;
    } catch (error) {
      console.error('[Gmail] Error extracting communication insights:', error);
      return 0;
    }
  }

  /**
   * Create extraction job
   */
  async createExtractionJob(userId, connectorId) {
    try {
      const { data, error } = await supabase
        .from('extraction_jobs')
        .insert({
          user_id: userId,
          connector_id: connectorId,
          platform: 'google_gmail',
          status: 'running',
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[Gmail] Error creating extraction job:', error);
      return { id: crypto.randomUUID() }; // Fallback
    }
  }

  /**
   * Complete extraction job
   */
  async completeExtractionJob(jobId, itemsExtracted) {
    try {
      await supabase
        .from('extraction_jobs')
        .update({
          status: 'completed',
          items_extracted: itemsExtracted,
          completed_at: new Date().toISOString()
        })
        .eq('id', jobId);
    } catch (error) {
      console.error('[Gmail] Error completing extraction job:', error);
    }
  }
}

export default GmailExtractor;
