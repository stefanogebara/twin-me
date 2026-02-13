/**
 * Outlook Feature Extractor
 *
 * Extracts behavioral features from Microsoft Outlook data stored via Nango
 * that correlate with Big Five personality traits.
 *
 * Key Features Extracted:
 * - Email volume → Extraversion (r=0.30)
 * - Folder organization → Conscientiousness (r=0.40)
 * - Calendar density → Extraversion (r=0.38)
 * - Contact network size → Extraversion (r=0.35)
 * - Work hour adherence → Conscientiousness (r=0.35)
 * - Response consistency → Conscientiousness (r=0.32)
 *
 * Data source: user_platform_data where platform = 'outlook'
 * Nango stores: profile, mailFolders, messages/recentMessages, calendarEvents, calendars, contacts
 */

import { supabaseAdmin } from '../database.js';

class OutlookFeatureExtractor {
  constructor() {
    this.SYSTEM_FOLDERS = [
      'inbox', 'sentitems', 'drafts', 'deleteditems', 'junkemail',
      'archive', 'outbox', 'conversationhistory', 'scheduled'
    ];
  }

  /**
   * Extract all behavioral features from Outlook data
   */
  async extractFeatures(userId) {
    console.log(`📬 [Outlook Extractor] Extracting features for user ${userId}`);

    try {
      const { data: platformData, error } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data, data_type, extracted_at')
        .eq('user_id', userId)
        .eq('platform', 'outlook')
        .order('extracted_at', { ascending: false });

      if (error) throw error;

      if (!platformData || platformData.length === 0) {
        console.log('⚠️ [Outlook Extractor] No Outlook data found in user_platform_data');
        return [];
      }

      console.log(`📊 [Outlook Extractor] Found ${platformData.length} Outlook data records`);

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

      // 2. Folder Organization (Conscientiousness)
      const folderOrg = this.calculateFolderOrganization(dataByType);
      if (folderOrg !== null) {
        features.push(this.createFeature(userId, 'folder_organization', folderOrg, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.40,
          description: 'Use of custom mail folders to organize email',
          evidence: { correlation: 0.40, citation: 'Stachl et al. (2020)' }
        }));
      }

      // 3. Calendar Density (Extraversion)
      const calendarDensity = this.calculateCalendarDensity(dataByType);
      if (calendarDensity !== null) {
        features.push(this.createFeature(userId, 'calendar_density', calendarDensity, {
          contributes_to: 'extraversion',
          contribution_weight: 0.38,
          description: 'Density of calendar events per week',
          evidence: { correlation: 0.38, citation: 'Stachl et al. (2020)' }
        }));
      }

      // 4. Contact Network Size (Extraversion)
      const contactNetwork = this.calculateContactNetworkSize(dataByType);
      if (contactNetwork !== null) {
        features.push(this.createFeature(userId, 'contact_network_size', contactNetwork, {
          contributes_to: 'extraversion',
          contribution_weight: 0.35,
          description: 'Size of contact network',
          evidence: { correlation: 0.35, citation: 'Stachl et al. (2020)' }
        }));
      }

      // 5. Work Hour Adherence (Conscientiousness)
      const workHourAdherence = this.calculateWorkHourAdherence(dataByType);
      if (workHourAdherence !== null) {
        features.push(this.createFeature(userId, 'work_hour_adherence', workHourAdherence, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.35,
          description: 'Percentage of messages during business hours (9-18)',
          evidence: { correlation: 0.35, citation: 'Stachl et al. (2020)' }
        }));
      }

      // 6. Response Consistency (Conscientiousness)
      const responseConsistency = this.calculateResponseConsistency(dataByType);
      if (responseConsistency !== null) {
        features.push(this.createFeature(userId, 'response_consistency', responseConsistency, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.32,
          description: 'Consistency of message timing across days',
          evidence: { correlation: 0.32, citation: 'Stachl et al. (2020)' }
        }));
      }

      console.log(`✅ [Outlook Extractor] Extracted ${features.length} features`);
      return features;

    } catch (error) {
      console.error('❌ [Outlook Extractor] Error:', error);
      throw error;
    }
  }

  /**
   * Calculate email volume score
   */
  calculateEmailVolume(dataByType) {
    let messageCount = 0;

    const messagesData = dataByType['messages'] || dataByType['recentMessages'] || [];
    for (const data of messagesData) {
      const items = data?.value || data?.messages || (Array.isArray(data) ? data : []);
      messageCount = Math.max(messageCount, items.length);
    }

    if (messageCount === 0) return null;

    // Normalize: 0-500+ messages to 0-100
    const normalized = Math.min(100, (messageCount / 500) * 100);
    return Math.round(normalized * 100) / 100;
  }

  /**
   * Calculate folder organization score
   * More custom folders = more organized
   */
  calculateFolderOrganization(dataByType) {
    const foldersData = dataByType['mailFolders'] || [];
    if (foldersData.length === 0) return null;

    let allFolders = [];
    for (const data of foldersData) {
      const items = data?.value || data?.items || (Array.isArray(data) ? data : []);
      allFolders.push(...items);
    }

    if (allFolders.length === 0) return null;

    // Count custom folders (exclude system folders)
    const customFolders = allFolders.filter(folder => {
      const folderName = (folder?.displayName || folder?.name || '').toLowerCase().replace(/\s+/g, '');
      return !this.SYSTEM_FOLDERS.includes(folderName);
    });

    const customCount = customFolders.length;

    // Normalize: 0-15+ custom folders to 0-100
    const normalized = Math.min(100, (customCount / 15) * 100);
    return Math.round(normalized * 100) / 100;
  }

  /**
   * Calculate calendar density (events per week)
   */
  calculateCalendarDensity(dataByType) {
    const eventsData = dataByType['calendarEvents'] || dataByType['events'] || [];
    if (eventsData.length === 0) return null;

    let allEvents = [];
    for (const data of eventsData) {
      const items = data?.value || data?.items || (Array.isArray(data) ? data : []);
      allEvents.push(...items);
    }

    if (allEvents.length === 0) return null;

    // Estimate events per week based on data range
    const dates = allEvents
      .map(e => new Date(e.start?.dateTime || e.createdDateTime || e.start))
      .filter(d => !isNaN(d.getTime()));

    if (dates.length < 2) return null;

    dates.sort((a, b) => a - b);
    const rangeDays = Math.max(1, (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24));
    const weeks = Math.max(1, rangeDays / 7);
    const eventsPerWeek = allEvents.length / weeks;

    // Normalize: 0-30+ events per week to 0-100
    const normalized = Math.min(100, (eventsPerWeek / 30) * 100);
    return Math.round(normalized * 100) / 100;
  }

  /**
   * Calculate contact network size
   */
  calculateContactNetworkSize(dataByType) {
    const contactsData = dataByType['contacts'] || [];
    if (contactsData.length === 0) return null;

    let totalContacts = 0;
    for (const data of contactsData) {
      const items = data?.value || data?.items || (Array.isArray(data) ? data : []);
      totalContacts += items.length;
    }

    if (totalContacts === 0) return null;

    // Normalize: 0-500+ contacts to 0-100
    const normalized = Math.min(100, (totalContacts / 500) * 100);
    return Math.round(normalized * 100) / 100;
  }

  /**
   * Calculate work hour adherence
   * % of messages received during business hours (9-18)
   */
  calculateWorkHourAdherence(dataByType) {
    const messagesData = dataByType['messages'] || dataByType['recentMessages'] || [];
    let businessHourCount = 0;
    let totalCount = 0;

    for (const data of messagesData) {
      const items = data?.value || data?.messages || (Array.isArray(data) ? data : []);
      for (const msg of items) {
        const timestamp = msg?.receivedDateTime || msg?.sentDateTime || msg?.createdDateTime;
        if (timestamp) {
          const date = new Date(timestamp);
          if (!isNaN(date.getTime())) {
            totalCount++;
            const hour = date.getHours();
            if (hour >= 9 && hour < 18) {
              businessHourCount++;
            }
          }
        }
      }
    }

    if (totalCount < 5) return null;

    const adherencePercent = (businessHourCount / totalCount) * 100;
    return Math.round(adherencePercent * 100) / 100;
  }

  /**
   * Calculate response consistency
   * Low variance in message timing = high consistency
   */
  calculateResponseConsistency(dataByType) {
    const messagesData = dataByType['messages'] || dataByType['recentMessages'] || [];
    const hourCounts = {};
    let totalMessages = 0;

    for (const data of messagesData) {
      const items = data?.value || data?.messages || (Array.isArray(data) ? data : []);
      for (const msg of items) {
        const timestamp = msg?.receivedDateTime || msg?.sentDateTime || msg?.createdDateTime;
        if (timestamp) {
          const date = new Date(timestamp);
          if (!isNaN(date.getTime())) {
            const hour = date.getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
            totalMessages++;
          }
        }
      }
    }

    if (totalMessages < 5) return null;

    // Calculate variance of hour distribution
    const hours = Object.keys(hourCounts).map(Number);
    const avgHour = hours.reduce((sum, h) => sum + h * hourCounts[h], 0) / totalMessages;
    let variance = 0;
    for (const [hour, count] of Object.entries(hourCounts)) {
      variance += count * Math.pow(parseInt(hour) - avgHour, 2);
    }
    variance /= totalMessages;
    const stdDev = Math.sqrt(variance);

    // Low std dev = more consistent = higher score
    // Max expected std dev ~8 hours
    const consistencyScore = Math.max(0, 100 - (stdDev / 8) * 100);
    return Math.round(consistencyScore * 100) / 100;
  }

  /**
   * Create standardized feature object
   */
  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId,
      platform: 'outlook',
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

    console.log(`💾 [Outlook Extractor] Saving ${features.length} features to database...`);

    try {
      const { data, error } = await supabaseAdmin
        .from('behavioral_features')
        .upsert(features, {
          onConflict: 'user_id,platform,feature_type'
        })
        .select();

      if (error) throw error;

      console.log(`✅ [Outlook Extractor] Saved ${data.length} features successfully`);
      return { success: true, saved: data.length, data };

    } catch (error) {
      console.error('❌ [Outlook Extractor] Error saving features:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const outlookFeatureExtractor = new OutlookFeatureExtractor();
export default outlookFeatureExtractor;
