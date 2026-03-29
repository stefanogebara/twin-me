/**
 * Enrichment Store Functions
 *
 * Database operations for profile enrichment data in Supabase:
 * - Save enrichment data
 * - Retrieve enrichment data
 * - Confirm enrichment with user corrections
 * - Check enrichment status
 * - Reset confirmation (for testing)
 */

import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('Enrichmentstore');

/**
 * Save enrichment data to database
 */
export async function saveEnrichment(userId, email, enrichmentData) {
  log.info(`Saving enrichment for user ${userId}`);

  try {
    const dbFields = {
      user_id: userId,
      email,
      discovered_name: enrichmentData.discovered_name || null,
      discovered_company: enrichmentData.discovered_company || null,
      discovered_title: enrichmentData.discovered_title || null,
      discovered_location: enrichmentData.discovered_location || null,
      discovered_linkedin_url: enrichmentData.discovered_linkedin_url || null,
      discovered_twitter_url: enrichmentData.discovered_twitter_url || null,
      discovered_github_url: enrichmentData.discovered_github_url || null,
      discovered_bio: enrichmentData.discovered_bio || null,
      discovered_photo: enrichmentData.discovered_photo || null,
      discovered_summary: enrichmentData.discovered_summary || null,
      // Career data fields
      career_timeline: enrichmentData.career_timeline || null,
      education: enrichmentData.education || null,
      achievements: enrichmentData.achievements || null,
      skills: enrichmentData.skills || null,
      languages: enrichmentData.languages || null,
      certifications: enrichmentData.certifications || null,
      publications: enrichmentData.publications || null,
      github_repos: enrichmentData.github_repos || null,
      github_followers: enrichmentData.github_followers || null,
      social_links: enrichmentData.social_links || null,
      // Personal life fields
      interests_and_hobbies: enrichmentData.interests_and_hobbies || null,
      causes_and_values: enrichmentData.causes_and_values || null,
      notable_quotes: enrichmentData.notable_quotes || null,
      public_appearances: enrichmentData.public_appearances || null,
      personality_traits: enrichmentData.personality_traits || null,
      life_story: enrichmentData.life_story || null,
      social_media_presence: enrichmentData.social_media_presence || null,
      discovered_instagram_url: enrichmentData.discovered_instagram_url || null,
      discovered_personal_website: enrichmentData.discovered_personal_website || null,
      // Google Gaia enrichment
      google_gaia_id: enrichmentData.google_gaia_id || null,
      google_maps_contributions: enrichmentData.google_maps_contributions || null,
      google_linked_youtube: enrichmentData.google_linked_youtube || null,
      // Email reputation & breach data
      email_reputation: enrichmentData.email_reputation || null,
      email_age_days: enrichmentData.email_age_days || null,
      breach_services: enrichmentData.breach_services || null,
      breach_mapped_integrations: enrichmentData.breach_mapped_integrations || null,
      digital_footprint_score: enrichmentData.digital_footprint_score || 0,
      source: enrichmentData.source || 'unknown',
      raw_search_response: enrichmentData.raw || enrichmentData.raw_search_response || null,
      search_query: enrichmentData.search_query || null,
      identity_confidence: enrichmentData.identity_confidence ?? null,
      onboarding_briefing: enrichmentData.onboarding_briefing || null,
      user_provided_linkedin_url: enrichmentData.user_provided_linkedin_url || null,
      enriched_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('enriched_profiles')
      .upsert(dbFields, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) {
      log.error('Failed to save enrichment:', error);
      throw error;
    }

    log.info(`Enrichment saved successfully:`, data.id);
    return { success: true, data };
  } catch (error) {
    log.error('Save error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get enrichment data for a user
 */
export async function getEnrichment(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('enriched_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }

    return { success: true, data: data || null };
  } catch (error) {
    log.error('Get error:', error);
    return { success: false, error: error.message, data: null };
  }
}

/**
 * Confirm enrichment data with user corrections
 */
export async function confirmEnrichment(userId, confirmedData, corrections = null) {
  log.info(`Confirming enrichment for user ${userId}`);

  try {
    const { data, error } = await supabaseAdmin
      .from('enriched_profiles')
      .update({
        user_confirmed: true,
        confirmed_data: confirmedData,
        corrections: corrections,
        confirmed_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      log.error('Failed to confirm enrichment:', error);
      throw error;
    }

    log.info(`Enrichment confirmed for user ${userId}`);
    return { success: true, data };
  } catch (error) {
    log.error('Confirm error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check enrichment status for a user
 */
export async function getEnrichmentStatus(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('enriched_profiles')
      .select('id, enriched_at, user_confirmed, confirmed_at, discovered_company, discovered_title, identity_confidence')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!data) {
      return {
        success: true,
        status: 'not_started',
        hasEnrichment: false,
        isConfirmed: false
      };
    }

    return {
      success: true,
      status: data.user_confirmed ? 'confirmed' : 'pending_confirmation',
      hasEnrichment: true,
      isConfirmed: data.user_confirmed,
      enrichedAt: data.enriched_at,
      confirmedAt: data.confirmed_at,
      hasCompany: !!data.discovered_company,
      hasTitle: !!data.discovered_title,
      identityConfidence: data.identity_confidence,
    };
  } catch (error) {
    log.error('Status error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Reset confirmation status for testing
 */
export async function resetConfirmation(userId) {
  log.info(`Resetting confirmation for user ${userId}`);

  try {
    const { data, error } = await supabaseAdmin
      .from('enriched_profiles')
      .update({
        user_confirmed: false,
        confirmed_at: null
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      log.error('Reset error:', error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      message: 'Confirmation reset successfully',
      data
    };
  } catch (error) {
    log.error('Reset error:', error);
    return { success: false, error: error.message };
  }
}
