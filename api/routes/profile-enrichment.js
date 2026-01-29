import express from 'express';
import { profileEnrichmentService } from '../services/profileEnrichmentService.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

/**
 * Profile Enrichment API Routes
 *
 * Handles the enrichment-first onboarding flow:
 * 1. POST /api/enrichment/search - Trigger enrichment search for a user
 * 2. GET /api/enrichment/results/:userId - Get enrichment results
 * 3. POST /api/enrichment/confirm - Confirm/correct discovered data
 * 4. GET /api/enrichment/status/:userId - Check enrichment status
 */

// ============================================================================
// POST /api/enrichment/search - Trigger enrichment search
// ============================================================================
router.post('/search', async (req, res) => {
  try {
    const { userId, email, name } = req.body;

    if (!userId || !email) {
      return res.status(400).json({
        success: false,
        error: 'userId and email are required'
      });
    }

    console.log(`[Enrichment API] Starting search for user ${userId}: ${email}`);

    // Perform enrichment
    const enrichmentResult = await profileEnrichmentService.enrichFromEmail(email, name);

    if (!enrichmentResult.success) {
      console.warn(`[Enrichment API] Enrichment failed for ${email}:`, enrichmentResult.error);
      // Still save partial result for tracking
      await profileEnrichmentService.saveEnrichment(userId, email, {
        email,
        discovered_name: name || null,
        source: 'perplexity_sonar_failed',
        search_query: enrichmentResult.error
      });

      return res.json({
        success: true, // Return success to not break the flow
        message: 'Enrichment search completed with limited results',
        data: {
          email,
          discovered_name: name || null,
          discovered_company: null,
          discovered_title: null,
          discovered_location: null,
          discovered_linkedin_url: null,
          hasResults: false
        }
      });
    }

    // Save enrichment data
    const saveResult = await profileEnrichmentService.saveEnrichment(userId, email, enrichmentResult.data);

    if (!saveResult.success) {
      console.error(`[Enrichment API] Failed to save enrichment:`, saveResult.error);
    }

    // Determine if we found meaningful data
    const hasResults = !!(
      enrichmentResult.data.discovered_company ||
      enrichmentResult.data.discovered_title ||
      enrichmentResult.data.discovered_linkedin_url
    );

    res.json({
      success: true,
      message: hasResults ? 'Profile enrichment complete' : 'Limited information found',
      data: {
        email,
        discovered_name: enrichmentResult.data.discovered_name,
        discovered_company: enrichmentResult.data.discovered_company,
        discovered_title: enrichmentResult.data.discovered_title,
        discovered_location: enrichmentResult.data.discovered_location,
        discovered_linkedin_url: enrichmentResult.data.discovered_linkedin_url,
        discovered_twitter_url: enrichmentResult.data.discovered_twitter_url,
        discovered_github_url: enrichmentResult.data.discovered_github_url,
        discovered_bio: enrichmentResult.data.discovered_bio,
        discovered_summary: enrichmentResult.data.discovered_summary,
        // Career data fields
        career_timeline: enrichmentResult.data.career_timeline,
        education: enrichmentResult.data.education,
        achievements: enrichmentResult.data.achievements,
        skills: enrichmentResult.data.skills,
        source: enrichmentResult.data.source,
        hasResults
      }
    });
  } catch (error) {
    console.error('[Enrichment API] Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform enrichment search',
      details: error.message
    });
  }
});

// ============================================================================
// GET /api/enrichment/results/:userId - Get enrichment results
// ============================================================================
router.get('/results/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const result = await profileEnrichmentService.getEnrichment(userId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch enrichment results',
        details: result.error
      });
    }

    if (!result.data) {
      return res.json({
        success: true,
        message: 'No enrichment data found',
        data: null,
        hasResults: false
      });
    }

    // Format response for frontend
    res.json({
      success: true,
      data: {
        id: result.data.id,
        email: result.data.email,
        discovered_name: result.data.discovered_name,
        discovered_company: result.data.discovered_company,
        discovered_title: result.data.discovered_title,
        discovered_location: result.data.discovered_location,
        discovered_linkedin_url: result.data.discovered_linkedin_url,
        discovered_twitter_url: result.data.discovered_twitter_url,
        discovered_github_url: result.data.discovered_github_url,
        discovered_bio: result.data.discovered_bio,
        discovered_summary: result.data.discovered_summary,
        // Career data fields
        career_timeline: result.data.career_timeline,
        education: result.data.education,
        achievements: result.data.achievements,
        skills: result.data.skills,
        source: result.data.source,
        user_confirmed: result.data.user_confirmed,
        confirmed_data: result.data.confirmed_data,
        corrections: result.data.corrections,
        enriched_at: result.data.enriched_at,
        confirmed_at: result.data.confirmed_at
      },
      hasResults: !!(
        result.data.discovered_company ||
        result.data.discovered_title ||
        result.data.discovered_linkedin_url
      )
    });
  } catch (error) {
    console.error('[Enrichment API] Results fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch enrichment results',
      details: error.message
    });
  }
});

// ============================================================================
// POST /api/enrichment/confirm - Confirm/correct discovered data
// ============================================================================
router.post('/confirm', async (req, res) => {
  try {
    const { userId, confirmedData, corrections } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    if (!confirmedData) {
      return res.status(400).json({
        success: false,
        error: 'confirmedData is required'
      });
    }

    console.log(`[Enrichment API] Confirming enrichment for user ${userId}`);

    const result = await profileEnrichmentService.confirmEnrichment(
      userId,
      confirmedData,
      corrections
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to confirm enrichment',
        details: result.error
      });
    }

    res.json({
      success: true,
      message: 'Enrichment confirmed successfully',
      data: {
        id: result.data.id,
        user_confirmed: result.data.user_confirmed,
        confirmed_at: result.data.confirmed_at,
        confirmed_data: result.data.confirmed_data,
        corrections: result.data.corrections
      }
    });
  } catch (error) {
    console.error('[Enrichment API] Confirm error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to confirm enrichment',
      details: error.message
    });
  }
});

// ============================================================================
// GET /api/enrichment/status/:userId - Check enrichment status
// ============================================================================
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const result = await profileEnrichmentService.getEnrichmentStatus(userId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to get enrichment status',
        details: result.error
      });
    }

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Enrichment API] Status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get enrichment status',
      details: error.message
    });
  }
});

// ============================================================================
// DELETE /api/enrichment/clear/:userId - Clear enrichment data for re-search
// ============================================================================
router.delete('/clear/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[Enrichment API] Clearing enrichment for user ${userId}`);

    // Delete the enrichment record
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabase
      .from('enriched_profiles')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('[Enrichment API] Clear error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to clear enrichment',
        details: error.message
      });
    }

    res.json({
      success: true,
      message: 'Enrichment data cleared'
    });
  } catch (error) {
    console.error('[Enrichment API] Clear error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear enrichment',
      details: error.message
    });
  }
});

// ============================================================================
// POST /api/enrichment/from-linkedin - Enrich from LinkedIn URL
// ============================================================================
router.post('/from-linkedin', async (req, res) => {
  try {
    const { userId, linkedinUrl, name } = req.body;

    if (!userId || !linkedinUrl) {
      return res.status(400).json({
        success: false,
        error: 'userId and linkedinUrl are required'
      });
    }

    // Validate LinkedIn URL format
    const linkedinRegex = /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/i;
    if (!linkedinRegex.test(linkedinUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid LinkedIn URL format. Expected: https://linkedin.com/in/username'
      });
    }

    console.log(`[Enrichment API] Enriching from LinkedIn URL for user ${userId}: ${linkedinUrl}`);

    // First, try to fetch full profile from Scrapin.io (for REAL career data)
    let fullProfileData = null;
    const scrapinKey = process.env.SCRAPIN_API_KEY;

    if (scrapinKey) {
      console.log('[Enrichment API] Fetching full LinkedIn profile from Scrapin.io...');
      const fullProfile = await profileEnrichmentService.fetchScrapinFullProfile(linkedinUrl, scrapinKey);
      if (fullProfile.success && fullProfile.data) {
        console.log('[Enrichment API] Got full profile with positions/education!');
        fullProfileData = fullProfile.data;
      } else {
        console.log('[Enrichment API] Scrapin full profile fetch failed, falling back to web search');
      }
    }

    // Also use the enrichment service for web search (for bio and social links)
    const enrichmentResult = await profileEnrichmentService.enrichFromLinkedIn(linkedinUrl, name);

    if (!enrichmentResult.success && !fullProfileData) {
      console.warn(`[Enrichment API] LinkedIn enrichment failed:`, enrichmentResult.error);
      return res.json({
        success: true,
        message: 'Could not extract information from LinkedIn URL',
        data: {
          discovered_linkedin_url: linkedinUrl,
          discovered_name: name || null,
          hasResults: false
        }
      });
    }

    // Combine Scrapin full profile data with web search results
    // IMPORTANT: Prefer Scrapin data over web search (which might fail)
    // Don't use Perplexity error messages as profile data
    const webSearchData = enrichmentResult.data || {};

    // Debug logging
    console.log('[Enrichment API] DEBUG - webSearchData.discovered_summary:', webSearchData.discovered_summary?.substring(0, 100));
    console.log('[Enrichment API] DEBUG - fullProfileData keys:', fullProfileData ? Object.keys(fullProfileData) : 'null');

    const isPerplexityError = webSearchData.discovered_summary?.includes('unable to retrieve') ||
                              webSearchData.discovered_summary?.includes('could not be accessed') ||
                              webSearchData.discovered_summary?.includes('no matches') ||
                              webSearchData.discovered_summary?.includes('was unable to') ||
                              webSearchData.discovered_summary?.includes('search attempts');

    // If web search failed, don't use its summary
    if (isPerplexityError) {
      delete webSearchData.discovered_summary;
      console.log('[Enrichment API] Web search failed, using only Scrapin data');
    }

    // Extract title and company from Scrapin headline if not already set
    let extractedTitle = fullProfileData?.discovered_title;
    let extractedCompany = fullProfileData?.discovered_company;
    const headline = fullProfileData?.scrapin_headline || '';

    if (!extractedTitle && headline) {
      // Parse "Student at IE University" or "Software Engineer at Google"
      const headlineMatch = headline.match(/^(.+?)\s+at\s+(.+)$/i);
      if (headlineMatch) {
        extractedTitle = headlineMatch[1].trim();
        extractedCompany = headlineMatch[2].trim();
      }
    }

    const combinedData = {
      ...(webSearchData),
      ...(fullProfileData || {}),
      discovered_title: extractedTitle || webSearchData.discovered_title,
      discovered_company: extractedCompany || webSearchData.discovered_company,
      discovered_linkedin_url: linkedinUrl,
      source: fullProfileData ? 'scrapin_full' : 'linkedin_url'
    };

    const saveResult = await profileEnrichmentService.saveEnrichment(
      userId,
      enrichmentResult?.data?.email || 'linkedin@provided.url',
      combinedData
    );

    if (!saveResult.success) {
      console.error(`[Enrichment API] Failed to save LinkedIn enrichment:`, saveResult.error);
    }

    // Check if we have at least basic profile info (for students, headline is enough)
    const hasResults = !!(
      combinedData.discovered_company ||
      combinedData.discovered_title ||
      combinedData.career_timeline ||
      combinedData.scrapin_headline
    );

    // Generate AI narrative for a nice summary
    // ALWAYS generate for students/profiles with limited data
    let discoveredSummary = combinedData.scrapin_summary;

    // Don't use error messages as summaries
    if (discoveredSummary?.includes('unable to retrieve') ||
        discoveredSummary?.includes('could not be accessed')) {
      discoveredSummary = null;
    }

    // Always generate a narrative if we have any profile data
    if (!discoveredSummary && (hasResults || combinedData.discovered_name)) {
      console.log('[Enrichment API] Generating AI narrative for LinkedIn profile...');
      const narrative = await profileEnrichmentService.generateDetailedNarrative(combinedData, name || combinedData.discovered_name);
      if (narrative) {
        discoveredSummary = narrative;
        console.log('[Enrichment API] Generated narrative:', narrative.substring(0, 100) + '...');
      }
    }

    res.json({
      success: true,
      message: hasResults ? 'LinkedIn profile enrichment complete' : 'Limited information extracted',
      data: {
        discovered_name: combinedData.discovered_name || name,
        discovered_company: combinedData.discovered_company,
        discovered_title: combinedData.discovered_title,
        discovered_location: combinedData.discovered_location,
        discovered_linkedin_url: linkedinUrl,
        discovered_bio: combinedData.discovered_bio,
        discovered_summary: discoveredSummary,
        // Career data fields from Scrapin full profile
        career_timeline: combinedData.career_timeline,
        education: combinedData.education,
        skills: combinedData.skills,
        hasResults
      }
    });
  } catch (error) {
    console.error('[Enrichment API] LinkedIn enrichment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enrich from LinkedIn URL',
      details: error.message
    });
  }
});

// ============================================================================
// POST /api/enrichment/skip - Skip enrichment step
// ============================================================================
router.post('/skip', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[Enrichment API] User ${userId} skipped enrichment`);

    // Save a record indicating the user skipped
    const skipResult = await profileEnrichmentService.saveEnrichment(userId, 'skipped@user.action', {
      email: 'skipped@user.action',
      source: 'user_skipped',
      user_confirmed: true,
      confirmed_at: new Date().toISOString(),
      confirmed_data: { skipped: true }
    });

    res.json({
      success: true,
      message: 'Enrichment step skipped',
      skipped: true
    });
  } catch (error) {
    console.error('[Enrichment API] Skip error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to skip enrichment',
      details: error.message
    });
  }
});

// ============================================================================
// POST /api/enrichment/reset - Reset confirmation for testing (DEV ONLY)
// ============================================================================
router.post('/reset', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[Enrichment API] Resetting confirmation for user ${userId}`);

    // Reset the user_confirmed flag
    const result = await profileEnrichmentService.resetConfirmation(userId);

    res.json({
      success: true,
      message: 'Enrichment confirmation reset',
      result
    });
  } catch (error) {
    console.error('[Enrichment API] Reset error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset confirmation',
      details: error.message
    });
  }
});

export default router;
