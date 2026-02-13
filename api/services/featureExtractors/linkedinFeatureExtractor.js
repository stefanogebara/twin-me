/**
 * LinkedIn Feature Extractor
 *
 * Extracts behavioral features from LinkedIn data stored via Nango
 * that correlate with Big Five personality traits.
 *
 * Note: LinkedIn's API via Nango only provides /v2/userinfo (OpenID Connect),
 * so we have very limited data: name, picture, email, locale.
 * Features are minimal but still better than default 50s.
 *
 * Key Features Extracted:
 * - Profile completeness → Conscientiousness (r=0.30)
 * - Professional presence → Extraversion (r=0.25)
 *
 * Data source: user_platform_data where platform = 'linkedin'
 */

import { supabaseAdmin } from '../database.js';

class LinkedInFeatureExtractor {
  constructor() {
    this.PROFILE_FIELDS = ['name', 'given_name', 'family_name', 'picture', 'email', 'email_verified', 'locale'];
  }

  /**
   * Extract all behavioral features from LinkedIn data
   */
  async extractFeatures(userId) {
    console.log(`💼 [LinkedIn Extractor] Extracting features for user ${userId}`);

    try {
      const { data: platformData, error } = await supabaseAdmin
        .from('user_platform_data')
        .select('raw_data, data_type, extracted_at')
        .eq('user_id', userId)
        .eq('platform', 'linkedin')
        .order('extracted_at', { ascending: false });

      if (error) throw error;

      if (!platformData || platformData.length === 0) {
        console.log('⚠️ [LinkedIn Extractor] No LinkedIn data found in user_platform_data');
        return [];
      }

      console.log(`📊 [LinkedIn Extractor] Found ${platformData.length} LinkedIn data records`);

      // Collect all profile data
      let profileInfo = {};
      for (const record of platformData) {
        const raw = record.raw_data || {};
        // Merge all data - later records may have more fields
        profileInfo = { ...profileInfo, ...raw };
      }

      const features = [];

      // 1. Profile Completeness (Conscientiousness)
      const profileCompleteness = this.calculateProfileCompleteness(profileInfo);
      if (profileCompleteness !== null) {
        features.push(this.createFeature(userId, 'profile_completeness', profileCompleteness, {
          contributes_to: 'conscientiousness',
          contribution_weight: 0.30,
          description: 'Completeness of LinkedIn profile information',
          evidence: { correlation: 0.30, citation: 'Stachl et al. (2020)' }
        }));
      }

      // 2. Professional Presence (Extraversion)
      const professionalPresence = this.calculateProfessionalPresence(profileInfo);
      if (professionalPresence !== null) {
        features.push(this.createFeature(userId, 'professional_presence', professionalPresence, {
          contributes_to: 'extraversion',
          contribution_weight: 0.25,
          description: 'Professional presence indicators (profile picture, verified email)',
          evidence: { correlation: 0.25, citation: 'Stachl et al. (2020)' }
        }));
      }

      console.log(`✅ [LinkedIn Extractor] Extracted ${features.length} features`);
      return features;

    } catch (error) {
      console.error('❌ [LinkedIn Extractor] Error:', error);
      throw error;
    }
  }

  /**
   * Calculate profile completeness
   * Count non-null fields / total expected fields
   */
  calculateProfileCompleteness(profileInfo) {
    if (!profileInfo || Object.keys(profileInfo).length === 0) return null;

    let filledFields = 0;
    const totalFields = this.PROFILE_FIELDS.length;

    for (const field of this.PROFILE_FIELDS) {
      const value = profileInfo[field];
      if (value !== null && value !== undefined && value !== '') {
        filledFields++;
      }
    }

    // Convert to 0-100 score
    const completeness = (filledFields / totalFields) * 100;
    return Math.round(completeness * 100) / 100;
  }

  /**
   * Calculate professional presence score
   * Has picture + verified email = strong professional presence
   */
  calculateProfessionalPresence(profileInfo) {
    if (!profileInfo || Object.keys(profileInfo).length === 0) return null;

    let score = 0;

    // Has profile picture (40 points)
    if (profileInfo.picture) {
      score += 40;
    }

    // Has verified email (30 points)
    if (profileInfo.email_verified === true) {
      score += 30;
    } else if (profileInfo.email) {
      score += 15; // Has email but unverified
    }

    // Has full name (15 points)
    if (profileInfo.name || (profileInfo.given_name && profileInfo.family_name)) {
      score += 15;
    }

    // Has locale set (15 points - shows attention to profile detail)
    if (profileInfo.locale) {
      score += 15;
    }

    return Math.round(score * 100) / 100;
  }

  /**
   * Create standardized feature object
   */
  createFeature(userId, featureType, featureValue, metadata = {}) {
    return {
      user_id: userId,
      platform: 'linkedin',
      feature_type: featureType,
      feature_value: featureValue,
      normalized_value: featureValue / 100,
      confidence_score: 40,
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

    console.log(`💾 [LinkedIn Extractor] Saving ${features.length} features to database...`);

    try {
      const { data, error } = await supabaseAdmin
        .from('behavioral_features')
        .upsert(features, {
          onConflict: 'user_id,platform,feature_type'
        })
        .select();

      if (error) throw error;

      console.log(`✅ [LinkedIn Extractor] Saved ${data.length} features successfully`);
      return { success: true, saved: data.length, data };

    } catch (error) {
      console.error('❌ [LinkedIn Extractor] Error saving features:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const linkedinFeatureExtractor = new LinkedInFeatureExtractor();
export default linkedinFeatureExtractor;
