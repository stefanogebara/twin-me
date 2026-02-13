/**
 * Gmail Feature Extractor
 *
 * Extracts behavioral features from Gmail data stored via Nango
 * that correlate with Big Five personality traits.
 *
 * Key Features Extracted:
 * - Email volume → Extraversion (r=0.30)
 * - Label organization → Conscientiousness (r=0.40)
 * - Thread engagement → Agreeableness (r=0.25)
 * - Communication regularity → Conscientiousness (r=0.35)
 * - Inbox management → Conscientiousness (r=0.33)
 *
 * Data source: user_platform_data where platform = 'google_gmail'
 * (stored by Nango via storeNangoExtractionData)
 */

import { supabaseAdmin } from '../database.js';

class GmailFeatureExtractor {
  constructor() {
    this.SYSTEM_LABELS = [
      'INBOX', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'STARRED',
      'IMPORTANT', 'UNREAD', 'CHAT', 'CATEGORY_PERSONAL',
      'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES',
      'CATEGORY_FORUMS'
    ];
  }

  /**
   * Extract all behavioral features from Gmail data
   */
  async extractFeatures(userId) {
    console.log(`📧 [Gmail Extractor] Extracting features for user ${userId}`);

    try {
      const { data: platformData, error } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data, data_type, extracted_at')
        .eq('user_id', userId)
        .eq('platform', 'google_gmail')
        .order('extracted_at', { ascending: false });

      if (error) throw error;

      if (!platformData || platformData.length === 0) {
        console.log('⚠️ [Gmail Extractor] No Gmail data found in user_platform_data');
        return [];
      }

      console.log(`📊 [Gmail Extractor] Found ${platformData.length} Gmail data records`);

      // Organize data by type
      const dataByType = {};
      for (const record of platformData) {
        const type = record.data_type || 'unknown';
        if (!dataByType[type]) dataByType[type] = [];
        dataByType[type].push(record.raw_data);
      }

      const features = [];

      // 1. Email Volume (Extraversion)
      const emailVolume = this.calculateEmailVolume(dataByType);
      if (emailVolume !== null) {
        features.push(this.createFeature(userId, 'email_volume', emailVolume, {
          contributes_to: 'extraversion',
          contribution_weight: 0.30,
          description: 'Volume of email communication activity',
          evidence: { correlation: 0.30, citation: 'Stachl et al. (2020)' }
        }));
      }

      // 2. Label Organization (Conscientiousness)
      const labelOrg = this.calculateLabelOrganization(dataByType);
      if (labelOrg !== null) {
        features.push(this.createFeature(userId, 'label_organization', labelOrg, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.40,
          description: 'Use of custom labels to organize email',
          evidence: { correlation: 0.40, citation: 'Stachl et al. (2020)' }
        }));
      }

      // 3. Thread Engagement (Agreeableness)
      const threadEngagement = this.calculateThreadEngagement(dataByType);
      if (threadEngagement !== null) {
        features.push(this.createFeature(userId, 'thread_engagement', threadEngagement, {
          contributes_to: 'agreeableness',
          contribution_weight: 0.25,
          description: 'Depth of engagement in email threads',
          evidence: { correlation: 0.25, citation: 'Stachl et al. (2020)' }
        }));
      }

      // 4. Communication Regularity (Conscientiousness)
      const commRegularity = this.calculateCommunicationRegularity(dataByType);
      if (commRegularity !== null) {
        features.push(this.createFeature(userId, 'communication_regularity', commRegularity, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.35,
          description: 'Regularity of email communication patterns',
          evidence: { correlation: 0.35, citation: 'Stachl et al. (2020)' }
        }));
      }

      // 5. Inbox Management (Conscientiousness)
      const inboxMgmt = this.calculateInboxManagement(dataByType);
      if (inboxMgmt !== null) {
        features.push(this.createFeature(userId, 'inbox_management', inboxMgmt, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.33,
          description: 'Effectiveness of inbox management (read vs unread ratio)',
          evidence: { correlation: 0.33, citation: 'Stachl et al. (2020)' }
        }));
      }

      console.log(`✅ [Gmail Extractor] Extracted ${features.length} features`);
      return features;

    } catch (error) {
      console.error('❌ [Gmail Extractor] Error:', error);
      throw error;
    }
  }

  /**
   * Calculate email volume score
   * More messages = higher extraversion signal
   */
  calculateEmailVolume(dataByType) {
    // Look for profile data with messagesTotal or message list data
    let messageCount = 0;

    // From profile data
    const profileData = dataByType['profile'] || [];
    for (const profile of profileData) {
      if (profile?.messagesTotal) {
        messageCount = Math.max(messageCount, profile.messagesTotal);
      }
    }

    // From messages data
    const messagesData = dataByType['messages'] || dataByType['recentMessages'] || [];
    for (const data of messagesData) {
      const items = data?.messages || data?.items || (Array.isArray(data) ? data : []);
      messageCount = Math.max(messageCount, items.length);
    }

    if (messageCount === 0) return null;

    // Normalize: 0-10000+ messages to 0-100
    const normalized = Math.min(100, (messageCount / 10000) * 100);
    return Math.round(normalized * 100) / 100;
  }

  /**
   * Calculate label organization score
   * More custom labels = more organized
   */
  calculateLabelOrganization(dataByType) {
    const labelsData = dataByType['labels'] || [];
    if (labelsData.length === 0) return null;

    let allLabels = [];
    for (const data of labelsData) {
      const items = data?.labels || data?.items || (Array.isArray(data) ? data : []);
      allLabels.push(...items);
    }

    if (allLabels.length === 0) return null;

    // Count custom labels (non-system)
    const customLabels = allLabels.filter(label => {
      const labelId = label?.id || label?.name || '';
      return !this.SYSTEM_LABELS.includes(labelId.toUpperCase());
    });

    const customCount = customLabels.length;

    // Normalize: 0-20+ custom labels to 0-100
    const normalized = Math.min(100, (customCount / 20) * 100);
    return Math.round(normalized * 100) / 100;
  }

  /**
   * Calculate thread engagement depth
   * Higher thread depth = more engaged in conversations
   */
  calculateThreadEngagement(dataByType) {
    const threadsData = dataByType['threads'] || [];
    const messagesData = dataByType['messages'] || dataByType['recentMessages'] || [];

    let totalThreads = 0;
    let totalMessages = 0;

    // From threads data
    for (const data of threadsData) {
      const items = data?.threads || data?.items || (Array.isArray(data) ? data : []);
      totalThreads += items.length;
    }

    // From messages data
    for (const data of messagesData) {
      const items = data?.messages || data?.items || (Array.isArray(data) ? data : []);
      totalMessages += items.length;
    }

    // Also check profile for totals
    const profileData = dataByType['profile'] || [];
    for (const profile of profileData) {
      if (profile?.threadsTotal && totalThreads === 0) {
        totalThreads = profile.threadsTotal;
      }
      if (profile?.messagesTotal && totalMessages === 0) {
        totalMessages = profile.messagesTotal;
      }
    }

    if (totalThreads === 0 || totalMessages === 0) return null;

    // Thread engagement ratio: messages per thread
    // Higher ratio means deeper conversations
    const ratio = totalMessages / totalThreads;

    // Normalize: ratio of 1 = 0, ratio of 5+ = 100
    const normalized = Math.min(100, ((ratio - 1) / 4) * 100);
    return Math.max(0, Math.round(normalized * 100) / 100);
  }

  /**
   * Calculate communication regularity from message timestamps
   * Low entropy in sending hours = high regularity = high conscientiousness
   */
  calculateCommunicationRegularity(dataByType) {
    const messagesData = dataByType['messages'] || dataByType['recentMessages'] || [];
    const hourCounts = {};
    let totalMessages = 0;

    for (const data of messagesData) {
      const items = data?.messages || data?.items || (Array.isArray(data) ? data : []);
      for (const msg of items) {
        // Try to extract timestamp from message headers or internalDate
        const timestamp = msg?.internalDate || msg?.date || msg?.receivedDateTime;
        if (timestamp) {
          const date = new Date(typeof timestamp === 'string' ? timestamp : parseInt(timestamp));
          if (!isNaN(date.getTime())) {
            const hour = date.getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
            totalMessages++;
          }
        }
      }
    }

    if (totalMessages < 5) return null;

    // Calculate Shannon entropy of hour distribution
    let entropy = 0;
    for (const count of Object.values(hourCounts)) {
      const p = count / totalMessages;
      if (p > 0) entropy -= p * Math.log2(p);
    }

    // Max entropy = log2(24) = 4.58
    // Low entropy = regular schedule = high conscientiousness
    // Invert: more regular (lower entropy) = higher score
    const maxEntropy = Math.log2(24);
    const regularityScore = Math.max(0, (1 - entropy / maxEntropy) * 100);

    return Math.round(regularityScore * 100) / 100;
  }

  /**
   * Calculate inbox management score
   * Higher ratio of read vs unread = better management
   */
  calculateInboxManagement(dataByType) {
    const profileData = dataByType['profile'] || [];
    const labelsData = dataByType['labels'] || [];

    let messagesTotal = 0;
    let unreadCount = 0;

    // From profile
    for (const profile of profileData) {
      if (profile?.messagesTotal) {
        messagesTotal = profile.messagesTotal;
      }
    }

    // From labels - look for INBOX or UNREAD label with message counts
    for (const data of labelsData) {
      const items = data?.labels || data?.items || (Array.isArray(data) ? data : []);
      for (const label of items) {
        const labelId = (label?.id || label?.name || '').toUpperCase();
        if (labelId === 'UNREAD' && label?.messagesUnread !== undefined) {
          unreadCount = Math.max(unreadCount, label.messagesUnread);
        }
        if (labelId === 'INBOX') {
          if (label?.messagesUnread !== undefined) {
            unreadCount = Math.max(unreadCount, label.messagesUnread);
          }
          if (label?.messagesTotal !== undefined && messagesTotal === 0) {
            messagesTotal = label.messagesTotal;
          }
        }
      }
    }

    if (messagesTotal === 0) return null;

    // Read ratio: higher = better inbox management
    const readRatio = Math.max(0, 1 - (unreadCount / messagesTotal));

    // Normalize to 0-100
    const score = readRatio * 100;
    return Math.round(score * 100) / 100;
  }

  /**
   * Create standardized feature object
   */
  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId,
      platform: 'gmail',
      feature_type: featureType,
      feature_value: featureValue,
      normalized_value: featureValue / 100,
      confidence_score: 65,
      sample_size: 1,
      contributes_to: metadata.contributes_to || null,
      contribution_weight: metadata.contribution_weight || 0,
      evidence: {
        description: metadata.description,
        correlation: metadata.evidence?.correlation,
        citation: metadata.evidence?.citation,
        note: metadata.evidence?.note,
        raw_value: metadata.raw_value || null
      }
    };
  }

  /**
   * Save features to database
   */
  async saveFeatures(features) {
    if (features.length === 0) return { success: true, saved: 0 };

    console.log(`💾 [Gmail Extractor] Saving ${features.length} features to database...`);

    try {
      const { data, error } = await supabaseAdmin
        .from('behavioral_features')
        .upsert(features, {
          onConflict: 'user_id,platform,feature_type'
        })
        .select();

      if (error) throw error;

      console.log(`✅ [Gmail Extractor] Saved ${data.length} features successfully`);
      return { success: true, saved: data.length, data };

    } catch (error) {
      console.error('❌ [Gmail Extractor] Error saving features:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const gmailFeatureExtractor = new GmailFeatureExtractor();
export default gmailFeatureExtractor;
