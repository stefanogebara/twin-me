/**
 * LinkedIn Data Extractor
 * Extracts profile, posts, and connections from LinkedIn
 * Using OpenID Connect scopes
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class LinkedInExtractor {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://api.linkedin.com/v2';
  }

  /**
   * Main extraction method
   */
  async extractAll(userId, connectorId) {
    console.log(`[LinkedIn] Starting extraction for user: ${userId}`);

    try {
      const job = await this.createExtractionJob(userId, connectorId);
      let totalItems = 0;

      // Extract user profile
      totalItems += await this.extractUserProfile(userId);

      // Extract email address
      totalItems += await this.extractEmailAddress(userId);

      // Note: LinkedIn API is very restrictive
      // Additional data requires special permissions and app review

      await this.completeExtractionJob(job.id, totalItems);

      console.log(`[LinkedIn] Extraction complete. Total items: ${totalItems}`);
      return { success: true, itemsExtracted: totalItems };
    } catch (error) {
      console.error('[LinkedIn] Extraction error:', error);
      throw error;
    }
  }

  /**
   * Extract user profile
   */
  async extractUserProfile(userId) {
    console.log(`[LinkedIn] Extracting user profile...`);

    try {
      // Get basic profile using OpenID Connect
      const response = await fetch(`${this.baseUrl}/userinfo`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`LinkedIn API error: ${response.status}`);
      }

      const profile = await response.json();

      await this.storeRawData(userId, 'linkedin', 'profile', {
        sub: profile.sub,
        name: profile.name,
        given_name: profile.given_name,
        family_name: profile.family_name,
        picture: profile.picture,
        email: profile.email,
        email_verified: profile.email_verified,
        locale: profile.locale
      });

      console.log(`[LinkedIn] Extracted profile for ${profile.name}`);
      return 1;
    } catch (error) {
      console.error('[LinkedIn] Error extracting profile:', error);
      return 0;
    }
  }

  /**
   * Extract email address
   */
  async extractEmailAddress(userId) {
    console.log(`[LinkedIn] Extracting email...`);

    try {
      const response = await fetch(`${this.baseUrl}/emailAddress?q=members&projection=(elements*(handle~))`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        // Email might already be in profile
        return 0;
      }

      const emailData = await response.json();

      if (emailData.elements && emailData.elements.length > 0) {
        await this.storeRawData(userId, 'linkedin', 'email', {
          email: emailData.elements[0]['handle~'].emailAddress
        });

        return 1;
      }

      return 0;
    } catch (error) {
      console.error('[LinkedIn] Error extracting email:', error);
      return 0;
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
          source_url: `linkedin://${dataType}/${rawData.sub || rawData.email}`,
          extracted_at: new Date().toISOString(),
          processed: false
        }, {
          onConflict: 'user_id,platform,data_type,source_url',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('[LinkedIn] Error storing data:', error);
      }
    } catch (error) {
      console.error('[LinkedIn] Exception storing data:', error);
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
        platform: 'linkedin',
        job_type: 'full_sync',
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[LinkedIn] Error creating job:', error);
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
        results: {
          message: 'Extraction completed successfully',
          note: 'LinkedIn API is restrictive - only basic profile available with current permissions'
        }
      })
      .eq('id', jobId);
  }
}

module.exports = LinkedInExtractor;
