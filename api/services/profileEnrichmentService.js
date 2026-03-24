/**
 * Profile Enrichment Service
 *
 * Thin orchestrator that delegates to domain-specific modules:
 * - enrichmentUtils.js     -- Name inference, domain enrichment, URL validation
 * - quickEnrichment.js     -- Free instant lookups (Gravatar + GitHub)
 * - enrichmentProviders.js -- Provider-specific APIs (Brave, PDL, Scrapin, Gemini, etc.)
 * - narrativeGenerator.js  -- AI-powered narrative/summary generation
 * - enrichmentStore.js     -- Database operations (Supabase)
 *
 * Waterfall enrichment strategy for accurate profile discovery:
 *
 * Providers (in order of preference):
 * 1. Scrapin.io - Real-time LinkedIn data, email-to-profile resolution
 * 2. People Data Labs - 3B+ profiles, accurate LinkedIn/company data
 * 3. Gemini 2.0 Flash - General web search for public profiles and info
 *
 * Cost estimate:
 * - Scrapin.io: $30 trial (500 credits), then $0.02/credit
 * - People Data Labs: Free tier 100 req/month, then ~$0.10/lookup
 * - Gemini via OpenRouter: ~$0.10/M input tokens, ~$0.40/M output tokens
 */

// Utility functions
import {
  inferNameFromEmail,
  enrichFromDomain,
  verifyNameMatch,
  validateUrl,
  extractUrl,
} from './enrichment/enrichmentUtils.js';

// Quick (free) enrichment
import {
  quickEnrich,
  lookupGravatar,
  lookupGitHub,
  lookupGitHubByUsername,
  probeSocialProfiles,
} from './enrichment/quickEnrichment.js';

// Provider-specific enrichment
import {
  comprehensivePersonSearch,
  callPeopleDataLabsAPI,
  convertPDLToEnrichment,
  callScrapinAPI,
  fetchScrapinFullProfile,
  callReverseContactAPI,
  findLinkedInUrlViaWebSearch,
  searchWebForCareerHistory,
  searchWebForSocialProfiles,
  searchWebForPerson,
  enrichFromLinkedIn,
  callPerplexityAPI,
  parseEnrichmentResponse,
  combineEnrichmentSources,
  buildSearchQuery,
  searchWithBrave,
  searchWithSonar,
  searchWithGoogleGrounding,
  searchWithOpenRouter,
  parseComprehensiveSearchResult,
  parseWebSearchResponse,
  extractStructuredProfile,
  extractPersonalLife,
  braveWebSearch,
  fetchPageText,
  formatScrapinPositions,
  formatScrapinEducation,
  extractScrapinCompany,
  extractScrapinTitle,
  formatScrapinLocation,
  formatPDLExperience,
  formatPDLEducation,
  formatPDLLocation,
  buildPDLBio,
  extractCompanyFromPerson,
  formatRCLocation,
  parseCareerFromWebSearch,
  parseEducationFromWebSearch,
  parseSocialProfileResponse,
} from './enrichment/enrichmentProviders.js';

// Narrative generation
import {
  generateDetailedNarrative,
  generateRichSummary,
  generateSummary,
  buildFallbackSummary,
  buildFactualSummary,
} from './enrichment/narrativeGenerator.js';

// Database operations
import {
  saveEnrichment,
  getEnrichment,
  confirmEnrichment,
  getEnrichmentStatus,
  resetConfirmation,
} from './enrichment/enrichmentStore.js';

// Identity verification
import { computeIdentityConfidence } from './enrichment/identityVerifier.js';
import { createLogger } from './logger.js';

const log = createLogger('ProfileEnrichment');


class ProfileEnrichmentService {

  // ============================================================
  // Utility delegates
  // ============================================================

  inferNameFromEmail(email) {
    return inferNameFromEmail(email);
  }

  enrichFromDomain(email) {
    return enrichFromDomain(email);
  }

  verifyNameMatch(profileName, searchName) {
    return verifyNameMatch(profileName, searchName);
  }

  validateUrl(url, expectedDomain) {
    return validateUrl(url, expectedDomain);
  }

  extractUrl(text, pattern) {
    return extractUrl(text, pattern);
  }

  // ============================================================
  // Quick enrichment delegates
  // ============================================================

  async quickEnrich(email, name = null) {
    return quickEnrich(email, name);
  }

  async lookupGravatar(email) {
    return lookupGravatar(email);
  }

  async lookupGitHub(email) {
    return lookupGitHub(email);
  }

  async lookupGitHubByUsername(username) {
    return lookupGitHubByUsername(username);
  }

  async probeSocialProfiles(username) {
    return probeSocialProfiles(username);
  }

  // ============================================================
  // Provider delegates
  // ============================================================

  async comprehensivePersonSearch(name, email, existingData = {}) {
    return comprehensivePersonSearch(name, email, existingData);
  }

  async callPeopleDataLabsAPI(email, name, apiKey) {
    return callPeopleDataLabsAPI(email, name, apiKey);
  }

  convertPDLToEnrichment(pdlData) {
    return convertPDLToEnrichment(pdlData);
  }

  async callScrapinAPI(email, name, apiKey) {
    return callScrapinAPI(email, name, apiKey);
  }

  async fetchScrapinFullProfile(linkedInUrl, apiKey) {
    return fetchScrapinFullProfile(linkedInUrl, apiKey);
  }

  async callReverseContactAPI(email, name, apiKey) {
    return callReverseContactAPI(email, name, apiKey);
  }

  async findLinkedInUrlViaWebSearch(email, name) {
    return findLinkedInUrlViaWebSearch(email, name);
  }

  async searchWebForCareerHistory(name, currentCompany = null) {
    return searchWebForCareerHistory(name, currentCompany);
  }

  async searchWebForSocialProfiles(email, name, linkedInData) {
    return searchWebForSocialProfiles(email, name, linkedInData);
  }

  async searchWebForPerson(email, name, linkedInData) {
    return searchWebForPerson(email, name, linkedInData);
  }

  async enrichFromLinkedIn(linkedinUrl, name = null) {
    return enrichFromLinkedIn(linkedinUrl, name);
  }

  async callPerplexityAPI(query) {
    return callPerplexityAPI(query);
  }

  parseEnrichmentResponse(content, email, providedName) {
    return parseEnrichmentResponse(content, email, providedName);
  }

  combineEnrichmentSources(linkedInData, webSearchResult, email, name) {
    return combineEnrichmentSources(linkedInData, webSearchResult, email, name);
  }

  buildSearchQuery(email, name, emailDomain) {
    return buildSearchQuery(email, name, emailDomain);
  }

  async searchWithBrave(name, email) {
    return searchWithBrave(name, email);
  }

  async searchWithSonar(name, email, prompt, apiKey) {
    return searchWithSonar(name, email, prompt, apiKey);
  }

  async searchWithGoogleGrounding(googleAI, name, email, prompt) {
    return searchWithGoogleGrounding(googleAI, name, email, prompt);
  }

  async searchWithOpenRouter(name, email, prompt, apiKey) {
    return searchWithOpenRouter(name, email, prompt, apiKey);
  }

  parseComprehensiveSearchResult(content) {
    return parseComprehensiveSearchResult(content);
  }

  parseWebSearchResponse(content) {
    return parseWebSearchResponse(content);
  }

  async extractStructuredProfile(snippets, name, email) {
    return extractStructuredProfile(snippets, name, email);
  }

  async extractPersonalLife(scrapedContent, name, email = null) {
    return extractPersonalLife(scrapedContent, name, email);
  }

  async braveWebSearch(query, apiKey) {
    return braveWebSearch(query, apiKey);
  }

  async fetchPageText(url, maxChars = 5000) {
    return fetchPageText(url, maxChars);
  }

  formatScrapinPositions(positions) {
    return formatScrapinPositions(positions);
  }

  formatScrapinEducation(schools) {
    return formatScrapinEducation(schools);
  }

  extractScrapinCompany(person) {
    return extractScrapinCompany(person);
  }

  extractScrapinTitle(person) {
    return extractScrapinTitle(person);
  }

  formatScrapinLocation(location) {
    return formatScrapinLocation(location);
  }

  formatPDLExperience(experience) {
    return formatPDLExperience(experience);
  }

  formatPDLEducation(education) {
    return formatPDLEducation(education);
  }

  formatPDLLocation(person) {
    return formatPDLLocation(person);
  }

  buildPDLBio(person) {
    return buildPDLBio(person);
  }

  extractCompanyFromPerson(person) {
    return extractCompanyFromPerson(person);
  }

  formatRCLocation(location) {
    return formatRCLocation(location);
  }

  parseCareerFromWebSearch(content) {
    return parseCareerFromWebSearch(content);
  }

  parseEducationFromWebSearch(content) {
    return parseEducationFromWebSearch(content);
  }

  parseSocialProfileResponse(content) {
    return parseSocialProfileResponse(content);
  }

  // ============================================================
  // Narrative delegates
  // ============================================================

  async generateDetailedNarrative(data, name) {
    return generateDetailedNarrative(data, name);
  }

  async generateRichSummary(combinedData, webFindings) {
    return generateRichSummary(combinedData, webFindings);
  }

  async generateSummary(profileData) {
    return generateSummary(profileData);
  }

  buildFallbackSummary(data) {
    return buildFallbackSummary(data);
  }

  buildFactualSummary(data) {
    return buildFactualSummary(data);
  }

  // ============================================================
  // Database delegates
  // ============================================================

  async saveEnrichment(userId, email, enrichmentData) {
    return saveEnrichment(userId, email, enrichmentData);
  }

  async getEnrichment(userId) {
    return getEnrichment(userId);
  }

  async confirmEnrichment(userId, confirmedData, corrections = null) {
    return confirmEnrichment(userId, confirmedData, corrections);
  }

  async getEnrichmentStatus(userId) {
    return getEnrichmentStatus(userId);
  }

  async resetConfirmation(userId) {
    return resetConfirmation(userId);
  }

  // ============================================================
  // Main orchestrator: enrichFromEmail
  // ============================================================

  /**
   * Enrich a user profile from their email and name.
   * This is the main entry point for full enrichment.
   * @param {string} email - User's email address
   * @param {string} name - User's full name (optional)
   * @returns {Promise<Object>} Enrichment data with discovered fields
   */
  async enrichFromEmail(email, name = null) {
    // If no name provided, or name looks like a raw email prefix, infer from email
    if (!name || !name.includes(' ')) {
      const inferred = inferNameFromEmail(email);
      if (inferred.includes(' ')) {
        log.info(`Inferred full name from email pattern`);
        name = inferred;
      }
    }
    log.info(`Starting enrichment`);
    log.info(`API keys loaded:`, {
      scrapin: !!process.env.SCRAPIN_API_KEY,
      pdl: !!process.env.PDL_API_KEY,
      openrouter: !!process.env.OPENROUTER_API_KEY
    });

    const scrapinKey = process.env.SCRAPIN_API_KEY;
    const pdlKey = process.env.PDL_API_KEY;
    let enrichedData = {};
    let enrichmentSource = 'none';

    // =================================================================
    // STEP 0: INSTANT FREE LOOKUPS (Gravatar + GitHub) - < 1 second
    // =================================================================
    log.info('Step 0: Running free instant lookups (Gravatar + GitHub + Social probing)...');
    const quickResult = await quickEnrich(email, name);
    if (quickResult.success && quickResult.data) {
      const q = quickResult.data;
      enrichedData = {
        discovered_name: q.discovered_name || name,
        discovered_company: q.discovered_company,
        discovered_location: q.discovered_location,
        discovered_bio: q.discovered_bio,
        discovered_github_url: q.discovered_github_url,
        discovered_twitter_url: q.discovered_twitter_url,
        discovered_photo: q.discovered_photo,
        github_repos: q.github_repos,
        github_followers: q.github_followers,
        github_languages: q.github_languages,
        github_top_repos: q.github_top_repos,
        social_links: q.social_links,
        // PDL professional data (from quick enrichment)
        pdl_headline: q.pdl_headline,
        pdl_industry: q.pdl_industry,
        pdl_experience: q.pdl_experience,
        pdl_education: q.pdl_education,
        pdl_skills: q.pdl_skills,
        pdl_interests: q.pdl_interests,
        pdl_linkedin_url: q.pdl_linkedin_url,
        // Holehe discovered platforms
        discovered_platforms: q.discovered_platforms,
      };
      enrichmentSource = q.source;
      if (q.discovered_name && (!name || !name.includes(' '))) {
        name = q.discovered_name;
      }
    }

    // =================================================================
    // STEP 0.5: Domain enrichment (FREE, instant)
    // =================================================================
    const domainData = enrichFromDomain(email);
    if (domainData) {
      enrichedData.discovered_company = enrichedData.discovered_company || domainData.discovered_company;
    }

    // =================================================================
    // STEP 1: Brave Search -> Gemini/Sonar fallback
    // =================================================================
    log.info('Step 1: Running comprehensive search (Brave -> Gemini fallback)...');
    const comprehensiveData = await comprehensivePersonSearch(name, email, {});
    if (comprehensiveData) {
      const isBraveResult = comprehensiveData._source === 'brave';
      log.info(`${isBraveResult ? 'Brave Search' : 'Gemini'} found comprehensive data!`);

      if (isBraveResult) {
        // Verified sources (Gravatar/GitHub) take priority for identity fields.
        // Brave-only fields (title, company, LinkedIn) keep Brave priority.
        enrichedData = {
          ...enrichedData,
          discovered_name: enrichedData.discovered_name || comprehensiveData.discovered_name || name,
          discovered_title: comprehensiveData.discovered_title || enrichedData.discovered_title,
          discovered_company: comprehensiveData.discovered_company || enrichedData.discovered_company,
          discovered_location: enrichedData.discovered_location || comprehensiveData.discovered_location,
          discovered_linkedin_url: comprehensiveData.discovered_linkedin_url || enrichedData.discovered_linkedin_url,
          discovered_twitter_url: enrichedData.discovered_twitter_url || comprehensiveData.discovered_twitter_url,
          discovered_github_url: enrichedData.discovered_github_url || comprehensiveData.discovered_github_url,
          discovered_instagram_url: comprehensiveData.discovered_instagram_url || null,
          discovered_personal_website: comprehensiveData.discovered_personal_website || null,
          discovered_bio: comprehensiveData.discovered_bio || enrichedData.discovered_bio,
          career_timeline: comprehensiveData.career_timeline,
          education: comprehensiveData.education,
          achievements: comprehensiveData.achievements,
          skills: comprehensiveData.skills,
          interests_and_hobbies: comprehensiveData.interests_and_hobbies || null,
          causes_and_values: comprehensiveData.causes_and_values || null,
          notable_quotes: comprehensiveData.notable_quotes || null,
          public_appearances: comprehensiveData.public_appearances || null,
          personality_traits: comprehensiveData.personality_traits || null,
          life_story: comprehensiveData.life_story || null,
          social_media_presence: comprehensiveData.social_media_presence || null,
          comprehensive_source: 'brave'
        };
        enrichmentSource = 'brave';
      } else {
        const raw = comprehensiveData.raw_comprehensive || comprehensiveData.career_timeline || '';
        const fullNameMatch = raw.match(/(?:registered under (?:the name )?|name[:\s]+)[""]?([A-Z\u00C0-\u00DD][A-Z\u00C0-\u00DDa-z\u00E1\u00E0\u00E2\u00E3\u00E9\u00E8\u00EA\u00ED\u00F3\u00F4\u00F5\u00FA\u00E7]+(?:\s+[A-Z\u00C0-\u00DDa-z\u00E1\u00E0\u00E2\u00E3\u00E9\u00E8\u00EA\u00ED\u00F3\u00F4\u00F5\u00FA\u00E7]+){1,4})[""]?/);
        const locationMatch = raw.match(/(?:located in|address[:\s]+|location[:\s]+)\s*([A-Z\u00C0-\u00DDa-z\u00E1\u00E0\u00E2\u00E3\u00E9\u00E8\u00EA\u00ED\u00F3\u00F4\u00F5\u00FA\u00E7]+(?:\s+[A-Z\u00C0-\u00DDa-z\u00E1\u00E0\u00E2\u00E3\u00E9\u00E8\u00EA\u00ED\u00F3\u00F4\u00F5\u00FA\u00E7]+)*,?\s*[A-Z]{2}(?:,?\s*Brazi[l]?)?)/i);
        const toTitleCase = (str) => str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        let extractedName = fullNameMatch ? fullNameMatch[1].trim() : null;
        if (extractedName && (extractedName.split(/\s+/).length > 5 || extractedName.length > 60)) {
          extractedName = null;
        }
        const displayName = extractedName
          ? (extractedName === extractedName.toUpperCase() ? toTitleCase(extractedName) : extractedName)
          : name;
        enrichedData = {
          ...enrichedData,
          discovered_name: displayName || enrichedData.discovered_name,
          discovered_location: locationMatch ? locationMatch[1].trim() : enrichedData.discovered_location,
          career_timeline: comprehensiveData.career_timeline,
          education: comprehensiveData.education,
          achievements: comprehensiveData.achievements,
          skills: comprehensiveData.skills,
          languages: comprehensiveData.languages,
          certifications: comprehensiveData.certifications,
          publications: comprehensiveData.publications,
          comprehensive_source: 'gemini'
        };
        enrichmentSource = 'gemini';
      }
    }

    // =================================================================
    // STEP 2: PDL - Additional database lookup (if configured)
    // =================================================================
    if (pdlKey && !enrichedData.discovered_company) {
      log.info('Step 2: Trying People Data Labs...');
      const pdlResult = await callPeopleDataLabsAPI(email, name, pdlKey);
      if (pdlResult.success && pdlResult.data) {
        log.info('PDL found profile!');
        const pdlData = convertPDLToEnrichment(pdlResult.data);
        enrichedData = {
          ...enrichedData,
          discovered_company: enrichedData.discovered_company || pdlData.discovered_company,
          discovered_title: enrichedData.discovered_title || pdlData.discovered_title,
          discovered_location: enrichedData.discovered_location || pdlData.discovered_location
        };
        enrichmentSource = enrichmentSource !== 'none' ? enrichmentSource + '+pdl' : 'pdl';
      }
    }

    // =================================================================
    // STEP 3: Search for additional social profiles
    // =================================================================
    log.info('Step 3: Searching for additional social profiles...');
    const webSearchResult = await searchWebForSocialProfiles(email, name, enrichedData);

    // Combine all enrichment sources
    const combinedData = combineEnrichmentSources(enrichedData, webSearchResult, email, name);

    // =================================================================
    // STEP 4: Generate narrative summary
    // =================================================================
    log.info('Step 4: Generating narrative summary...');
    const detailedNarrative = await generateDetailedNarrative(combinedData, name);
    const summary = detailedNarrative || buildFactualSummary(combinedData);

    // =================================================================
    // STEP 5: Compute identity confidence score
    // =================================================================
    const confidenceResult = computeIdentityConfidence({
      quickData: quickResult?.data || null,
      braveData: comprehensiveData?._source === 'brave' ? comprehensiveData : null,
      email,
      searchName: name,
    });
    log.info(`Identity confidence: ${confidenceResult.score} | signals: ${JSON.stringify(confidenceResult.signals)} | flags: [${confidenceResult.flags.join(', ')}]`);

    return {
      success: true,
      data: {
        ...combinedData,
        discovered_summary: summary,
        source: enrichmentSource !== 'none' ? enrichmentSource : 'gemini',
        raw_search_response: webSearchResult?.rawContent || null,
        identity_confidence: confidenceResult.score,
      }
    };
  }
}

// Export singleton instance
export const profileEnrichmentService = new ProfileEnrichmentService();
export default profileEnrichmentService;
