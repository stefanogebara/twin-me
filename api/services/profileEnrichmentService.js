import { createClient } from '@supabase/supabase-js';
import { complete, TIER_EXTRACTION, TIER_ANALYSIS } from './llmGateway.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Google AI with grounding capability (new SDK)
// Dynamic import to prevent server crash if @google/genai is unavailable
const getGoogleAI = async () => {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    console.warn('[ProfileEnrichment] @google/genai not available:', err.message);
    return null;
  }
};

/**
 * Profile Enrichment Service
 *
 * Waterfall enrichment strategy for accurate profile discovery:
 *
 * Providers (in order of preference):
 * 1. Scrapin.io - Real-time LinkedIn data, email-to-profile resolution
 * 2. People Data Labs - 3B+ profiles, accurate LinkedIn/company data
 * 3. Gemini 2.0 Flash - General web search for public profiles and info
 *
 * Why Gemini over Perplexity:
 * - Better person disambiguation (tested: correctly identified tennis player vs tech exec with same name)
 * - Uses Google's knowledge graph for more accurate results
 * - Accessed via OpenRouter for unified API access
 *
 * Cost estimate:
 * - Scrapin.io: $30 trial (500 credits), then $0.02/credit
 * - People Data Labs: Free tier 100 req/month, then ~$0.10/lookup
 * - Gemini via OpenRouter: ~$0.10/M input tokens, ~$0.40/M output tokens
 */
class ProfileEnrichmentService {

  /**
   * Infer a full name from an email address.
   * Handles many real-world patterns:
   *   "stefanogebara@gmail.com"     → "Stefano Gebara"
   *   "john.doe@company.com"        → "John Doe"
   *   "jane_smith123@mail.com"      → "Jane Smith"
   *   "j.doe@work.com"              → "J Doe"
   *   "mr.john.doe@mail.com"        → "John Doe"
   *   "JohnDoe@gmail.com"           → "John Doe"
   *   "john.doe.jr@gmail.com"       → "John Doe Jr"
   *   "info@acme-corp.com"          → "Acme Corp" (generic → domain)
   *   "jean-pierre.dupont@mail.com" → "Jean-Pierre Dupont"
   */
  inferNameFromEmail(email) {
    const [local, domain] = email.split('@');

    // Generic/role prefixes — fall back to domain name
    const genericPrefixes = new Set([
      'info', 'admin', 'hello', 'contact', 'support', 'noreply', 'no-reply',
      'sales', 'team', 'office', 'mail', 'webmaster', 'postmaster', 'help',
      'billing', 'accounts', 'enquiries', 'service', 'marketing', 'press',
    ]);
    if (genericPrefixes.has(local.toLowerCase())) {
      const domainName = (domain || '').split('.')[0];
      return domainName
        .replace(/[_-]/g, ' ')
        .split(/\s+/)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
    }

    const honorifics = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sir', 'rev']);
    const nameSuffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'esq']);

    // Detect separators
    const hasSeparators = /[._]/.test(local);
    let tokens;

    if (hasSeparators) {
      // "john.doe", "jane_smith", "jean-pierre.dupont" → split on dots/underscores, preserve hyphens
      tokens = local.split(/[._]/).filter(t => t.length > 0);
    } else {
      // No separators: camelCase split
      let expanded = local
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
      tokens = expanded.split(/\s+/).filter(t => t.length > 0);
    }

    // Clean tokens — strip numbers
    tokens = tokens
      .map(t => t.replace(/^\d+|\d+$/g, ''))
      .map(t => t.replace(/\d+/g, ''))
      .filter(t => t.length > 0);

    // Strip honorific prefixes
    if (tokens.length > 1 && honorifics.has(tokens[0].toLowerCase())) {
      tokens = tokens.slice(1);
    }

    // Capitalize properly
    const capitalize = (s) => {
      return s.split('-').map(part =>
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      ).join('-');
    };

    const result = tokens.map((t) => {
      const lower = t.toLowerCase();
      if (nameSuffixes.has(lower)) {
        if (lower === 'ii' || lower === 'iii' || lower === 'iv') return t.toUpperCase();
        return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
      }
      if (t.length === 1) return t.toUpperCase();
      return capitalize(t);
    });

    if (result.length === 0) {
      return local.charAt(0).toUpperCase() + local.slice(1);
    }

    return result.join(' ');
  }

  // =================================================================
  // INSTANT ENRICHMENT (FREE APIs - < 1 second)
  // Gravatar + GitHub = photo, name, bio, company, social links
  // =================================================================

  /**
   * Domain enrichment: extract company name from corporate email domains.
   * FREE, instant, zero API calls. Returns null for free email providers.
   */
  enrichFromDomain(email) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return null;

    const freeProviders = new Set([
      'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com',
      'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
      'protonmail.com', 'proton.me', 'aol.com', 'zoho.com', 'mail.com',
      'gmx.com', 'gmx.net', 'fastmail.com', 'tutanota.com', 'hey.com',
    ]);

    if (freeProviders.has(domain)) return null;

    const companyName = domain.split('.')[0]
      .replace(/[-_]/g, ' ')
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    return { discovered_company: companyName, company_domain: domain };
  }

  /**
   * Quick enrichment using only free, instant APIs.
   * Returns in < 1 second with basic profile data.
   * Used for the "wow moment" during onboarding.
   */
  async quickEnrich(email, name = null) {
    console.log(`[ProfileEnrichment] Quick enrichment for: ${email}`);
    const startTime = Date.now();

    // Run Gravatar + GitHub in parallel (both are free and fast)
    const [gravatarResult, githubResult] = await Promise.allSettled([
      this.lookupGravatar(email),
      this.lookupGitHub(email),
    ]);

    const gravatar = gravatarResult.status === 'fulfilled' ? gravatarResult.value : null;
    const github = githubResult.status === 'fulfilled' ? githubResult.value : null;

    // Merge results (GitHub is richer, Gravatar has photo fallback)
    const data = {
      discovered_name: github?.name || gravatar?.name || name,
      discovered_photo: github?.avatar || gravatar?.photo || null,
      discovered_company: github?.company || null,
      discovered_location: github?.location || gravatar?.location || null,
      discovered_bio: github?.bio || null,
      discovered_github_url: github?.profileUrl || null,
      discovered_twitter_url: github?.twitter ? `https://twitter.com/${github.twitter}` : null,
      github_repos: github?.publicRepos || null,
      github_followers: github?.followers || null,
      source: [gravatar ? 'gravatar' : null, github ? 'github' : null].filter(Boolean).join('+') || 'none',
      social_links: [
        ...(gravatar?.socialLinks || []),
        github?.profileUrl ? { platform: 'github', url: github.profileUrl } : null,
      ].filter(Boolean),
    };

    const elapsed = Date.now() - startTime;
    console.log(`[ProfileEnrichment] Quick enrichment done in ${elapsed}ms:`, {
      hasPhoto: !!data.discovered_photo,
      hasName: !!data.discovered_name,
      hasBio: !!data.discovered_bio,
      hasCompany: !!data.discovered_company,
      source: data.source,
    });

    return { success: true, data, elapsed };
  }

  /**
   * Lookup Gravatar profile by email hash.
   * FREE, no API key needed, returns in ~200ms.
   * Provides: photo URL, display name, location, social links.
   */
  async lookupGravatar(email) {
    try {
      const { createHash } = await import('crypto');
      const hash = createHash('md5').update(email.trim().toLowerCase()).digest('hex');
      const url = `https://en.gravatar.com/${hash}.json`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) return null; // 404 = no Gravatar profile

      const json = await response.json();
      const entry = json?.entry?.[0];
      if (!entry) return null;

      // Extract social links from verified accounts
      const socialLinks = (entry.accounts || []).map(a => ({
        platform: a.shortname || a.domain,
        url: a.url,
        username: a.display,
      }));

      return {
        photo: entry.thumbnailUrl ? entry.thumbnailUrl.replace('s=80', 's=400') : null,
        name: entry.displayName || entry.name?.formatted || null,
        location: entry.currentLocation || null,
        aboutMe: entry.aboutMe || null,
        socialLinks,
      };
    } catch (err) {
      console.log('[ProfileEnrichment] Gravatar lookup failed:', err.message);
      return null;
    }
  }

  /**
   * Lookup GitHub profile by searching for email.
   * FREE (5000 req/hr with token, 60 req/hr without).
   * Provides: name, bio, company, location, avatar, repos, twitter.
   */
  async lookupGitHub(email) {
    try {
      // Search GitHub users by email
      const headers = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'TwinMe-App' };
      // Use GitHub token if available for higher rate limits
      const ghToken = process.env.GITHUB_TOKEN || process.env.GITHUB_CLIENT_ID;
      if (ghToken && !ghToken.startsWith('your_')) {
        headers['Authorization'] = `token ${ghToken}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const searchUrl = `https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email&per_page=1`;
      const searchResponse = await fetch(searchUrl, { headers, signal: controller.signal });
      clearTimeout(timeout);

      if (!searchResponse.ok) return null;
      const searchData = await searchResponse.json();
      if (!searchData.items?.length) return null;

      // Fetch full profile for the matched user
      const userUrl = searchData.items[0].url;
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 3000);

      const userResponse = await fetch(userUrl, { headers, signal: controller2.signal });
      clearTimeout(timeout2);

      if (!userResponse.ok) return null;
      const user = await userResponse.json();

      return {
        name: user.name || null,
        bio: user.bio || null,
        company: user.company?.replace(/^@/, '') || null,
        location: user.location || null,
        avatar: user.avatar_url || null,
        profileUrl: user.html_url || null,
        publicRepos: user.public_repos || 0,
        followers: user.followers || 0,
        twitter: user.twitter_username || null,
        blog: user.blog || null,
      };
    } catch (err) {
      console.log('[ProfileEnrichment] GitHub lookup failed:', err.message);
      return null;
    }
  }

  /**
   * Enrich a user profile from their email and name
   * @param {string} email - User's email address
   * @param {string} name - User's full name (optional)
   * @returns {Promise<Object>} Enrichment data with discovered fields
   */
  async enrichFromEmail(email, name = null) {
    // If no name provided, or name looks like a raw email prefix (no spaces), infer from email
    if (!name || !name.includes(' ')) {
      const inferred = this.inferNameFromEmail(email);
      if (inferred.includes(' ')) {
        console.log(`[ProfileEnrichment] Inferred full name from email: "${inferred}" (was: "${name || 'null'}")`);
        name = inferred;
      }
    }
    console.log(`[ProfileEnrichment] Starting enrichment for: ${email}`);
    console.log(`[ProfileEnrichment] API keys loaded:`, {
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
    // This provides photo, name, bio, company before slow AI searches
    // =================================================================
    console.log('[ProfileEnrichment] Step 0: Running free instant lookups...');
    const quickResult = await this.quickEnrich(email, name);
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
        social_links: q.social_links,
      };
      enrichmentSource = q.source;
      // Only update name from free sources if we didn't have a real name already
      // (e.g. Google OAuth provides ground-truth name; don't overwrite with Gravatar guess)
      if (q.discovered_name && (!name || !name.includes(' '))) {
        name = q.discovered_name;
      }
    }

    // =================================================================
    // STEP 0.5: Domain enrichment (FREE, instant)
    // For corporate emails, the domain IS the company
    // =================================================================
    const domainData = this.enrichFromDomain(email);
    if (domainData) {
      enrichedData.discovered_company = enrichedData.discovered_company || domainData.discovered_company;
    }

    // =================================================================
    // STEP 1: Brave Search → Gemini/Sonar fallback
    // Brave: real search results + LLM extraction (most reliable)
    // Gemini/Sonar: LLM-based web search (fallback)
    // =================================================================
    console.log('[ProfileEnrichment] Step 1: Running comprehensive search (Brave → Gemini fallback)...');
    const comprehensiveData = await this.comprehensivePersonSearch(name, email, {});
    if (comprehensiveData) {
      // Determine source based on explicit _source flag from comprehensivePersonSearch
      const isBraveResult = comprehensiveData._source === 'brave';
      console.log(`[ProfileEnrichment] ${isBraveResult ? 'Brave Search' : 'Gemini'} found comprehensive data!`);

      if (isBraveResult) {
        // Brave Search returned structured fields — use them directly
        enrichedData = {
          ...enrichedData,
          discovered_name: comprehensiveData.discovered_name || enrichedData.discovered_name || name,
          discovered_title: comprehensiveData.discovered_title || enrichedData.discovered_title,
          discovered_company: comprehensiveData.discovered_company || enrichedData.discovered_company,
          discovered_location: comprehensiveData.discovered_location || enrichedData.discovered_location,
          discovered_linkedin_url: comprehensiveData.discovered_linkedin_url || enrichedData.discovered_linkedin_url,
          discovered_twitter_url: comprehensiveData.discovered_twitter_url || enrichedData.discovered_twitter_url,
          discovered_github_url: comprehensiveData.discovered_github_url || enrichedData.discovered_github_url,
          discovered_instagram_url: comprehensiveData.discovered_instagram_url || null,
          discovered_personal_website: comprehensiveData.discovered_personal_website || null,
          discovered_bio: comprehensiveData.discovered_bio || enrichedData.discovered_bio,
          career_timeline: comprehensiveData.career_timeline,
          education: comprehensiveData.education,
          achievements: comprehensiveData.achievements,
          skills: comprehensiveData.skills,
          // Personal life fields
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
        // Gemini/Sonar fallback — extract from raw prose
        const raw = comprehensiveData.raw_comprehensive || comprehensiveData.career_timeline || '';
        const fullNameMatch = raw.match(/(?:registered under (?:the name )?|name[:\s]+)[""]?([A-ZÀ-Ý][A-ZÀ-Ýa-záàâãéèêíóôõúç]+(?:\s+[A-ZÀ-Ýa-záàâãéèêíóôõúç]+){1,4})[""]?/);
        const locationMatch = raw.match(/(?:located in|address[:\s]+|location[:\s]+)\s*([A-ZÀ-Ýa-záàâãéèêíóôõúç]+(?:\s+[A-ZÀ-Ýa-záàâãéèêíóôõúç]+)*,?\s*[A-Z]{2}(?:,?\s*Brazi[l]?)?)/i);
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
      console.log('[ProfileEnrichment] Step 2: Trying People Data Labs...');
      const pdlResult = await this.callPeopleDataLabsAPI(email, name, pdlKey);
      if (pdlResult.success && pdlResult.data) {
        console.log('[ProfileEnrichment] PDL found profile!');
        const pdlData = this.convertPDLToEnrichment(pdlResult.data);
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
    // STEP 3: Search for additional social profiles (Twitter, GitHub, etc.)
    // =================================================================
    console.log('[ProfileEnrichment] Step 3: Searching for additional social profiles...');
    const webSearchResult = await this.searchWebForSocialProfiles(email, name, enrichedData);

    // Combine all enrichment sources
    const combinedData = this.combineEnrichmentSources(enrichedData, webSearchResult, email, name);

    // =================================================================
    // STEP 4: Generate narrative summary
    // =================================================================
    console.log('[ProfileEnrichment] Step 4: Generating narrative summary...');
    const detailedNarrative = await this.generateDetailedNarrative(combinedData, name);
    const summary = detailedNarrative || this.buildFactualSummary(combinedData);

    return {
      success: true,
      data: {
        ...combinedData,
        discovered_summary: summary,
        source: enrichmentSource !== 'none' ? enrichmentSource : 'gemini',
        raw_search_response: webSearchResult?.rawContent || null
      }
    };
  }

  /**
   * Generate a detailed cofounder.co-style narrative using AI
   * This creates a comprehensive paragraph covering career history, education, achievements, etc.
   */
  async generateDetailedNarrative(data, name) {
    console.error('[ProfileEnrichment] === generateDetailedNarrative CALLED ===');
    console.error('[ProfileEnrichment] Name:', name);
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[ProfileEnrichment] No API key for narrative generation');
      return null;
    }

    // Collect all available data points
    const dataPoints = [];

    if (data.discovered_name) dataPoints.push(`Full name: ${data.discovered_name}`);
    if (data.discovered_title) dataPoints.push(`Current role: ${data.discovered_title}`);
    if (data.discovered_company) dataPoints.push(`Current company/institution: ${data.discovered_company}`);
    if (data.discovered_location) dataPoints.push(`Location: ${data.discovered_location}`);
    // Don't include LinkedIn URL in narrative data
    if (data.discovered_bio) dataPoints.push(`Bio: ${data.discovered_bio}`);
    if (data.scrapin_industry) dataPoints.push(`Industry: ${data.scrapin_industry}`);
    if (data.scrapin_summary) dataPoints.push(`Professional summary: ${data.scrapin_summary}`);
    if (data.scrapin_headline) dataPoints.push(`Professional headline: ${data.scrapin_headline}`);
    if (data.career_timeline) dataPoints.push(`Career history: ${data.career_timeline}`);
    if (data.education) dataPoints.push(`Education: ${data.education}`);
    if (data.achievements) dataPoints.push(`Achievements: ${data.achievements}`);
    if (data.skills) dataPoints.push(`Skills: ${data.skills}`);
    if (data.languages) dataPoints.push(`Languages: ${data.languages}`);
    if (data.certifications) dataPoints.push(`Certifications: ${data.certifications}`);
    if (data.publications) dataPoints.push(`Publications: ${data.publications}`);
    // Use "professional connections" instead of "LinkedIn connections"
    if (data.scrapin_connection_count) dataPoints.push(`Professional network connections: ${data.scrapin_connection_count}`);
    if (data.scrapin_follower_count) dataPoints.push(`Professional followers: ${data.scrapin_follower_count}`);

    // If we have raw comprehensive search data, include it (CLEANED)
    if (data.raw_comprehensive && data.raw_comprehensive.length > 200) {
      let cleanRaw = data.raw_comprehensive
        .replace(/\*\*/g, '')                           // Remove bold markers
        .replace(/^#+\s+.*$/gm, '')                     // Remove markdown headers
        .replace(/^[•\-*]\s*/gm, '')                    // Remove bullet markers
        .replace(/\[[\d,\s]+\]/g, '')                   // Remove citation markers [1][2]
        .replace(/^(Note|Disclaimer|Important|Caveat|Further Research|I hope this helps)[:\s].*$/gim, '') // Remove AI commentary lines
        .replace(/\n{3,}/g, '\n\n')                     // Collapse excess newlines
        .trim();
      if (cleanRaw.length > 100) {
        dataPoints.push(`\nAdditional research findings:\n${cleanRaw}`);
      }
    }

    // Check if we have ACTUAL career data (job titles with dates, $amounts, degrees with years)
    // Must have specific patterns like "2019-2022" or "$125M" or "MBA from" to count as rich data
    const rawData = (data.raw_comprehensive || '') + ' ' + (data.career_timeline || '');
    console.error('[ProfileEnrichment] Data fields for check:', JSON.stringify({
      hasRawComprehensive: !!data.raw_comprehensive,
      rawComprehensiveLength: data.raw_comprehensive?.length || 0,
      hasCareerTimeline: !!data.career_timeline,
      careerTimelineLength: data.career_timeline?.length || 0
    }));
    const hasJobDates = /\b(19|20)\d{2}\s*[-–-]\s*(19|20)\d{2}\b/.test(rawData); // e.g., "2019-2022" or "1979-1981"
    const hasMoneyAmounts = /\$[\d,.]+[KMB]?|\$[\d,.]+ million|\d+ million|\d+ billion/i.test(rawData);
    const hasDegreeDetails = /\b(MBA|PhD|Master|Bachelor|MS|BS|BA|degree)\s+(from|in|at)\b/i.test(rawData);
    const hasCompanyPositions = /\b(CEO|CTO|CFO|COO|VP|Vice President|Director|President|Chairman|Founder|Co-founder)\b/i.test(rawData);

    const hasRichData = hasJobDates || hasMoneyAmounts || hasDegreeDetails || hasCompanyPositions;
    console.error('[ProfileEnrichment] Rich data check:', JSON.stringify({ hasJobDates, hasMoneyAmounts, hasDegreeDetails, hasCompanyPositions, hasRichData }));

    // Check if we have at least basic profile data worth narrating
    const hasBasicProfile = data.discovered_name && (data.discovered_title || data.discovered_company || data.discovered_location);

    // If we have very little data (not even basic profile), don't bother
    if (!hasBasicProfile && dataPoints.length < 2) {
      console.log('[ProfileEnrichment] Not enough data for any narrative');
      return null;
    }

    // Build comprehensive narrative prompt - cofounder.co style
    // Filter out LinkedIn URL data points, but keep career data that mentions LinkedIn
    const filteredDataPoints = dataPoints.map(dp => {
      // For career_timeline and other rich data, just remove LinkedIn references
      if (dp.startsWith('Career history:') || dp.startsWith('Additional research findings:')) {
        return dp
          .replace(/No LinkedIn profile[^.]*\./gi, '')
          .replace(/LinkedIn profile[^.]*\./gi, '')
          .replace(/LinkedIn[^.]*appeared in results[^.]*\./gi, '')
          .replace(/\bLinkedIn\b/gi, 'professional network')
          .replace(/\s+/g, ' ')
          .trim();
      }
      return dp;
    }).filter(dp => {
      // Only filter out pure LinkedIn URL data points
      const dpLower = dp.toLowerCase();
      return !dpLower.startsWith('linkedin url:') &&
             !dpLower.startsWith('professional network:') &&
             !(dpLower.includes('linkedin.com/in/') && dpLower.length < 100);
    });

    // Debug: Log what's being passed to the AI
    console.log('[ProfileEnrichment] === DEBUG: Prompt Data ===');
    console.log('[ProfileEnrichment] Total dataPoints:', dataPoints.length);
    console.log('[ProfileEnrichment] Filtered dataPoints:', filteredDataPoints.length);
    console.log('[ProfileEnrichment] Data keys:', Object.keys(data).filter(k => data[k] != null));
    console.log('[ProfileEnrichment] Has career_timeline:', !!data.career_timeline);
    if (data.career_timeline) {
      console.log('[ProfileEnrichment] career_timeline length:', data.career_timeline.length);
    }
    // Log filtered dataPoints (first 500 chars of each)
    console.log('[ProfileEnrichment] Filtered data points:');
    filteredDataPoints.forEach((dp, i) => {
      console.log(`  [${i}]: ${dp.substring(0, 300)}${dp.length > 300 ? '...' : ''}`);
    });

    const prompt = `Write a SHORT biography (3-4 sentences max) covering only verified facts.

DATA:
${filteredDataPoints.join('\n')}

FORMAT: One short paragraph. Cover ONLY:
- Current role and company (if known)
- Education (degree, school, if known)
- Location
- One notable fact or area of expertise

EXAMPLE: "Sebastián Izurieta is a finance professional currently serving as Principal Financial Analyst at NextEra Energy Resources. He holds an MBA from University of Virginia Darden School of Business and a Bachelor's from ITAM. Based in Madrid, Spain, he specializes in private investments and complex financial modeling."

RULES:
- Maximum 3-4 sentences. Be concise.
- Only use information explicitly provided in the DATA section above
- Do NOT invent, extrapolate, or assume any facts not in the data
- If data is limited, write 1-2 sentences with just what you know
- Output ONLY the biography - no meta-commentary, no caveats
- NEVER mention "LinkedIn" - use "professional network" instead
- NEVER refuse - always write something with available data

Write the biography:`;

    try {
      console.log('[ProfileEnrichment] Generating detailed narrative with AI...');
      console.log('[ProfileEnrichment] Data points:', dataPoints.length);

      // Use OpenRouter with Claude for best narrative quality
      const useOpenRouter = !!process.env.OPENROUTER_API_KEY;
      const endpoint = useOpenRouter
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.anthropic.com/v1/messages';

      const headers = useOpenRouter
        ? {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://twinme.app'
          }
        : {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          };

      const body = useOpenRouter
        ? {
            model: 'anthropic/claude-3.5-sonnet',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.4,
            max_tokens: 2000
          }
        : {
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }]
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        console.log('[ProfileEnrichment] AI narrative generation failed:', response.status);
        return null;
      }

      const result = await response.json();
      const narrative = useOpenRouter
        ? result.choices?.[0]?.message?.content
        : result.content?.[0]?.text;

      if (narrative) {
        // Clean up AI meta-commentary
        let cleanNarrative = narrative.trim();

        // Remove wrapping quotes (AI often returns the bio in "quotes" because the prompt example has them)
        if ((cleanNarrative.startsWith('"') && cleanNarrative.endsWith('"')) ||
            (cleanNarrative.startsWith("'") && cleanNarrative.endsWith("'"))) {
          cleanNarrative = cleanNarrative.slice(1, -1).trim();
        }

        // Remove "Note:" sections and anything after
        cleanNarrative = cleanNarrative.split(/\n\s*Note:/i)[0].trim();
        cleanNarrative = cleanNarrative.split(/\n\s*\(Note:/i)[0].trim();

        // Remove any lines that are clearly meta-commentary or refusals
        const lines = cleanNarrative.split('\n');
        const cleanLines = lines.filter(line => {
          const lower = line.toLowerCase();
          return !lower.startsWith('note:') &&
                 !lower.startsWith('i\'ve kept') &&
                 !lower.startsWith('following the') &&
                 !lower.startsWith('based on the provided data, i cannot') &&
                 !lower.startsWith('based on the limited') &&
                 !lower.includes('the provided data only') &&
                 !lower.includes('i cannot provide') &&
                 !lower.includes('i cannot write') &&
                 !lower.includes('no verified information') &&
                 !lower.includes('no verifiable information') &&
                 !lower.includes('insufficient data') &&
                 !lower.includes('would violate the strict guidelines') &&
                 !lower.includes('creating a biography with unverified');
        });
        cleanNarrative = cleanLines.join(' ').replace(/\s+/g, ' ').trim();

        // If the entire narrative was a refusal, return null so fallback kicks in
        if (cleanNarrative.length < 30) {
          console.log('[ProfileEnrichment] Narrative was a refusal, falling back to factual summary');
          return null;
        }

        // Remove markdown formatting that slipped through
        cleanNarrative = cleanNarrative
          .replace(/\*\*/g, '')                     // Bold markers
          .replace(/\*([^*]+)\*/g, '$1')            // Italic markers
          .replace(/^[•\-*]\s*/gm, '')              // Bullet points
          .replace(/^#+\s+/gm, '')                  // Headers
          .replace(/\[[\d,\s]+\]/g, '');            // Citation markers

        // Remove common AI filler patterns
        const fillerPatterns = [
          /I hope this helps[.!]?\s*/gi,
          /Let me know if you need[^.]*\.\s*/gi,
          /Further Research Suggestions[:\s].*$/gim,
          /Important Considerations[:\s].*$/gim,
          /Please note that[^.]*\.\s*/gi,
          /It'?s important to note[^.]*\.\s*/gi,
          /Based on (?:the |my )(?:available |)(?:information|research|data)[,\s]*/gi,
        ];
        fillerPatterns.forEach(p => { cleanNarrative = cleanNarrative.replace(p, ''); });
        cleanNarrative = cleanNarrative.replace(/\s+/g, ' ').trim();

        // ANTI-FABRICATION VALIDATION
        // Check if the AI fabricated student content when we have professional data
        const lowerNarrative = cleanNarrative.toLowerCase();

        // Use regex for more flexible matching
        const hasStudentClaims =
          /pursuing\s+\w*\s*studies/.test(lowerNarrative) ||  // "pursuing his studies", "pursuing studies"
          /currently\s+\w*\s*studying/.test(lowerNarrative) ||  // "currently studying"
          /\bas\s+a\s+student\b/.test(lowerNarrative) ||  // "as a student"
          /\bis\s+a\s+student\b/.test(lowerNarrative) ||  // "is a student at"
          /\bstudies\s+at\b/.test(lowerNarrative) ||  // "studies at"
          /\bstudent\s+at\b/.test(lowerNarrative) ||  // "student at IE University"
          /\bie\s+university\b/.test(lowerNarrative);  // Specific common hallucination

        // Check if we have clear professional data (Co-founder, Professor, CEO, etc.)
        const rawDataLower = filteredDataPoints.join(' ').toLowerCase();
        const hasProfessionalData = rawDataLower.includes('co-founder') ||
                                     rawDataLower.includes('founder') ||
                                     rawDataLower.includes('professor') ||
                                     rawDataLower.includes('ceo') ||
                                     rawDataLower.includes('director') ||
                                     rawDataLower.includes('partner') ||
                                     rawDataLower.includes('president') ||
                                     rawDataLower.includes('vp ') ||
                                     rawDataLower.includes('vice president');

        // If AI wrote student content but data shows professional, reject and use fallback
        if (hasStudentClaims && hasProfessionalData) {
          console.log('[ProfileEnrichment] REJECTED: AI fabricated student content for a professional');
          return this.buildFactualSummary(data);
        }

        // Detect filler narratives — AI produced a paragraph but it says "no info"
        const fillerNarrativePatterns = [
          'details and achievements remain private',
          'career details remain private',
          'remain private at this time',
          'whose career details',
          'whose professional details',
          'information is not publicly available',
          'not publicly available',
          'limited public presence',
          'minimal public presence',
          'no widely recognized public',
          'does not appear to have a significant public',
          'maintains a private professional profile',
          'keeps a low public profile',
          'specific details about',
          'details about their career are not',
          'a professional whose',
        ];
        const isFillerNarrative = fillerNarrativePatterns.some(p => lowerNarrative.includes(p));
        if (isFillerNarrative) {
          console.log('[ProfileEnrichment] REJECTED: AI generated filler "no info" narrative');
          return null;
        }

        console.log('[ProfileEnrichment] Generated detailed narrative:', cleanNarrative.substring(0, 200) + '...');
        return cleanNarrative;
      }

      return null;
    } catch (error) {
      console.error('[ProfileEnrichment] AI narrative generation error:', error);
      return null;
    }
  }

  /**
   * Single Brave Search API call. Returns array of web results.
   */
  async braveWebSearch(query, apiKey) {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '5');
    url.searchParams.set('extra_snippets', 'true');

    const response = await fetch(url.toString(), {
      headers: { 'X-Subscription-Token': apiKey }
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.web?.results || [];
  }

  /**
   * Run 3-5 targeted Brave queries in parallel and collect all snippets.
   */
  /**
   * Fetch and extract text content from a URL (for deep scraping top results).
   * Returns cleaned text, truncated to maxChars.
   */
  async fetchPageText(url, maxChars = 5000) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TwinMe/1.0; +https://twinme.app)',
          'Accept': 'text/html',
        },
        redirect: 'follow',
      });
      clearTimeout(timeout);

      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return null;

      const html = await response.text();

      // Strip HTML to plain text
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return text.length > 50 ? text.substring(0, maxChars) : null;
    } catch {
      return null;
    }
  }

  async searchWithBrave(name, email) {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) return null;

    const emailUsername = email.split('@')[0];
    const emailDomain = email.split('@')[1] || '';
    const isGenericEmail = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'protonmail.com', 'aol.com', 'live.com'].includes(emailDomain.toLowerCase());

    // For corporate emails, the domain is a strong disambiguator
    const domainName = !isGenericEmail ? emailDomain.split('.')[0] : null;
    const nameQuery = domainName ? `"${name}" "${domainName}"` : `"${name}"`;

    const queries = [
      // Query 1: name + company (best disambiguator)
      nameQuery,
      // Query 2: username on social/professional platforms
      `"${emailUsername}" site:github.com OR site:linkedin.com OR site:twitter.com OR site:instagram.com`,
      // Query 3: LinkedIn profile
      `"${name}" site:linkedin.com/in`,
      // Query 4: personal life — interviews, podcasts, personal content
      `${nameQuery} (interview OR podcast OR TEDx OR personal OR profile OR biography)`,
      // Query 5: social media and personal presence
      `"${name}" site:twitter.com OR site:instagram.com OR site:facebook.com OR site:medium.com`,
    ];

    const results = await Promise.allSettled(
      queries.map(q => this.braveWebSearch(q, apiKey))
    );

    // Deduplicate by URL
    const seen = new Set();
    const uniqueResults = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .flatMap(r => r.value)
      .filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });

    console.log(`[ProfileEnrichment] Brave: ${uniqueResults.length} unique results from ${queries.length} queries`);

    // Build snippet text from search results
    const allSnippets = uniqueResults
      .map(r => `[${r.title}] ${r.description}${r.extra_snippets ? ' ' + r.extra_snippets.join(' ') : ''}`)
      .join('\n');

    if (allSnippets.length < 10) return null;

    // Deep scrape: fetch actual page content from the most promising results
    // Score results to prioritize personal/interview content over corporate boilerplate
    const blockedDomains = ['linkedin.com', 'facebook.com', 'instagram.com']; // require auth
    const corporateBoilerplate = ['sec.gov', 'bloomberg.com', 'reuters.com', 'marketwatch.com', 'finance.yahoo.com', 'crunchbase.com', 'dnb.com', 'zoominfo.com', 'opencorporates.com'];
    const personalGoldmine = ['medium.com', 'substack.com', 'wordpress.com', 'blogspot.com', 'ted.com', 'youtube.com', 'github.com', 'twitter.com', 'x.com', 'about.me', 'behance.net', 'dribbble.com'];
    const interviewKeywords = ['interview', 'podcast', 'profile', 'meet', 'conversation', 'about', 'story', 'journey', 'speaker', 'bio', 'who is'];

    const scoredResults = uniqueResults
      .filter(r => !blockedDomains.some(d => r.url.includes(d)))
      .map(r => {
        let score = 0;
        const urlLower = r.url.toLowerCase();
        const titleLower = (r.title || '').toLowerCase();
        const descLower = (r.description || '').toLowerCase();
        // Penalize corporate boilerplate
        if (corporateBoilerplate.some(d => urlLower.includes(d))) score -= 3;
        // Boost personal/media pages
        if (personalGoldmine.some(d => urlLower.includes(d))) score += 3;
        // Boost pages with interview/personal keywords in title or description
        interviewKeywords.forEach(kw => {
          if (titleLower.includes(kw)) score += 2;
          if (descLower.includes(kw)) score += 1;
        });
        return { ...r, _score: score };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);

    const scrapeTargets = scoredResults;

    console.log(`[ProfileEnrichment] Deep scraping ${scrapeTargets.length} pages (scored, personal-first):`);
    scrapeTargets.forEach(r => console.log(`  [score:${r._score}] ${r.title} — ${r.url}`));
    const pageContents = await Promise.allSettled(
      scrapeTargets.map(r => this.fetchPageText(r.url))
    );

    // Only keep pages that actually mention the person's name (filter false positives)
    const nameParts = name.toLowerCase().split(' ').filter(p => p.length > 2);
    const scrapedPages = pageContents
      .map((r, i) => ({ result: r, target: scrapeTargets[i] }))
      .filter(({ result }) => result.status === 'fulfilled' && result.value)
      .filter(({ result }) => {
        const text = result.value.toLowerCase();
        // Page must mention at least the last name
        return nameParts.some(part => text.includes(part));
      });

    const scrapedText = scrapedPages
      .map(({ result, target }) => `--- PAGE: ${target.title} (${target.url}) ---\n${result.value}`)
      .join('\n\n');

    console.log(`[ProfileEnrichment] Scraped ${scrapedPages.length} relevant pages out of ${pageContents.filter(r => r.status === 'fulfilled' && r.value).length} fetched (${scrapedText.length} chars)`);

    // Return both snippets and scraped content separately
    // so we can do targeted extraction on each
    const combined = `=== SEARCH SNIPPETS ===\n${allSnippets}\n\n=== FULL PAGE CONTENT ===\n${scrapedText}`;
    return { combined, snippetsOnly: allSnippets, scrapedOnly: scrapedText };
  }

  /**
   * Second-pass extraction: focus ONLY on personal life details
   * from scraped page content. Uses a prompt that ignores career/title
   * and looks specifically for personal details.
   */
  async extractPersonalLife(scrapedContent, name) {
    if (!scrapedContent || scrapedContent.length < 50) return null;

    const prompt = `You are analyzing web content about "${name}" to understand them as a PERSON, not as an employee.
IGNORE job titles, companies, and career history — that's already captured separately.

Focus ONLY on personal, human details. Look for ANY of these:
- Hobbies, sports, personal interests
- Causes they care about, philanthropy, volunteering
- How they speak, their personality, communication style
- Personal anecdotes or stories they've shared
- Opinions they've expressed (not business strategy — personal views)
- Family background, origin story, where they grew up
- Books, music, travel, food preferences mentioned anywhere
- Awards or recognition for non-work things
- Social media behavior — what they post about beyond work
- Languages they speak
- Direct quotes from interviews that reveal personality

WEB CONTENT:
${scrapedContent.substring(0, 12000)}

Return ONLY a JSON object. Set fields to null if NO evidence found:
{
  "interests_and_hobbies": "any hobbies, sports, personal interests mentioned",
  "causes_and_values": "causes, philanthropy, values they advocate for",
  "personality_traits": "how they communicate, lead, what others say about them",
  "personal_bio": "2-3 sentences about who they are as a PERSON (not resume)",
  "notable_quotes": ["any direct quote that reveals personality"],
  "public_appearances": "non-corporate: podcasts, interviews, talks, panels",
  "life_story": "origin, formative experiences, personal journey",
  "social_media_presence": "what platforms, what they post about, their voice/tone"
}`;

    try {
      const result = await complete({
        tier: TIER_ANALYSIS,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 1024,
        temperature: 0.3,
        serviceName: 'brave-personal-extraction',
      });

      const text = result.content.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(text);
      const fields = Object.keys(parsed).filter(k => parsed[k] && parsed[k] !== null && parsed[k] !== 'null');
      console.log(`[ProfileEnrichment] Personal life extraction: ${fields.length} fields found: [${fields.join(', ')}]`);
      return parsed;
    } catch (err) {
      console.error('[ProfileEnrichment] Personal life extraction failed:', err.message);
      return null;
    }
  }

  /**
   * Use ANALYSIS tier (DeepSeek) to extract structured profile JSON from
   * Brave Search snippets + scraped page content. Needs a smarter model
   * to extract personal details from noisy web content.
   */
  async extractStructuredProfile(snippets, name, email) {
    const prompt = `You are extracting a COMPLETE profile of "${name}" (${email}) to build their digital twin.
A digital twin needs the WHOLE person — not just their job title. Look for personality, interests, values, opinions, life story.

Return ONLY a JSON object. Only include fields where you found real evidence. Do not guess or invent.

SOURCE MATERIAL:
${snippets.substring(0, 8000)}

Return JSON:
{
  "name": "full name",
  "title": "current job title",
  "company": "current company or organization",
  "location": "city, country",
  "education": [{"degree": "...", "school": "...", "year": ...}],
  "career_summary": "2-3 sentence career trajectory from real facts",
  "linkedin_url": "linkedin profile URL if found",
  "twitter_url": "twitter/X profile URL if found",
  "github_url": "github profile URL if found",
  "instagram_url": "instagram profile URL if found",
  "personal_website": "personal blog or website URL if found",
  "skills": ["skill1", "skill2"],
  "interests_and_hobbies": "personal interests, hobbies, sports, passions — anything beyond work",
  "causes_and_values": "social causes, philanthropy, values, beliefs they advocate for",
  "personality_traits": "communication style, leadership approach, how others describe them",
  "personal_bio": "3-4 sentence bio covering BOTH professional AND personal life — who they are as a human being",
  "notable_quotes": ["direct quote 1", "direct quote 2"],
  "public_appearances": "talks, podcasts, TEDx, conferences, media interviews, panels",
  "life_story": "key life events, origin story, formative experiences, transitions — what shaped them as a person",
  "social_media_presence": "what platforms they are active on, what they post about, their online voice"
}

RULES:
- Only use facts from the source material above. If a field has no evidence, set it to null.
- We are building a digital twin — a person is MORE than their resume.
- Look for: opinions expressed in interviews, personal anecdotes, hobbies mentioned in bios, causes they support, how they describe themselves.
- Even small personal details matter: favorite books, sports they play, cities they love, languages they speak.`;

    const result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2048,
      temperature: 0.2,
      serviceName: 'brave-profile-extraction',
    });

    try {
      const text = result.content.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(text);
      // Log personal fields extraction results
      const personalFields = ['interests_and_hobbies', 'causes_and_values', 'personality_traits', 'personal_bio', 'notable_quotes', 'public_appearances', 'life_story', 'social_media_presence'];
      const found = personalFields.filter(f => parsed[f] && parsed[f] !== null && parsed[f] !== 'null');
      console.log(`[ProfileEnrichment] Extraction: ${found.length}/${personalFields.length} personal fields populated: [${found.join(', ')}]`);
      if (found.length === 0) console.log(`[ProfileEnrichment] Raw extraction keys: ${Object.keys(parsed).filter(k => parsed[k] !== null).join(', ')}`);
      return parsed;
    } catch (parseError) {
      console.error('[ProfileEnrichment] Failed to parse Brave extraction JSON:', parseError.message);
      console.error('[ProfileEnrichment] Raw LLM output:', result.content?.substring(0, 500));
      return null;
    }
  }

  /**
   * Comprehensive person search using web-search-capable models via OpenRouter.
   *
   * Strategy:
   *   0. Brave Search API (most reliable — real search results + LLM extraction)
   *   1. Perplexity Sonar (has built-in web search) — best for real-time lookup
   *   2. Google Gemini with Search Grounding — good fallback
   *   3. Gemini via OpenRouter — last resort (no grounding)
   *
   * Uses a natural, conversational prompt that gets much better results than
   * rigid structured prompts. The raw response is stored as-is and the
   * narrative generation step handles cleanup.
   */
  async comprehensivePersonSearch(name, email, existingData = {}) {
    if (!name) {
      console.log('[ProfileEnrichment] Cannot do comprehensive search - no name provided');
      return null;
    }

    // Tier 0: Brave Search API (most reliable — real search results)
    if (process.env.BRAVE_SEARCH_API_KEY) {
      console.log('[ProfileEnrichment] Trying Brave Search API for:', { name, email });
      try {
        const braveResult = await this.searchWithBrave(name, email);
        if (braveResult) {
          // Run Pass 1 (career) and Pass 2 (personal) in PARALLEL
          const hasScrapedContent = braveResult.scrapedOnly && braveResult.scrapedOnly.length > 100;
          console.log(`[ProfileEnrichment] Running extraction: Pass 1 (career) + ${hasScrapedContent ? 'Pass 2 (personal)' : 'no Pass 2 (no scraped content)'}`);

          const [pass1Result, pass2Result] = await Promise.allSettled([
            // Pass 1 uses snippets only (fast, reliable — career data lives in search snippets)
            // Pass 2 handles deep scraped content separately for personal fields
            this.extractStructuredProfile(braveResult.snippetsOnly, name, email),
            hasScrapedContent
              ? this.extractPersonalLife(braveResult.scrapedOnly, name)
              : Promise.resolve(null),
          ]);

          const extracted = pass1Result.status === 'fulfilled' ? pass1Result.value : null;
          const personal = pass2Result.status === 'fulfilled' ? pass2Result.value : null;

          if (pass1Result.status === 'rejected') {
            console.error('[ProfileEnrichment] Pass 1 (career extraction) failed:', pass1Result.reason?.message);
          }
          if (pass2Result.status === 'rejected') {
            console.error('[ProfileEnrichment] Pass 2 (personal extraction) failed:', pass2Result.reason?.message);
          }

          // Return results if EITHER pass succeeded
          if (extracted || personal) {
            return {
              career_timeline: extracted?.career_summary || null,
              education: extracted?.education || null,
              achievements: null,
              skills: extracted?.skills || null,
              discovered_title: extracted?.title || null,
              discovered_company: extracted?.company || null,
              discovered_location: extracted?.location || null,
              discovered_linkedin_url: extracted?.linkedin_url || null,
              discovered_twitter_url: extracted?.twitter_url || null,
              discovered_github_url: extracted?.github_url || null,
              discovered_name: extracted?.name || name || null,
              discovered_bio: personal?.personal_bio || extracted?.personal_bio || null,
              interests_and_hobbies: personal?.interests_and_hobbies || extracted?.interests_and_hobbies || null,
              causes_and_values: personal?.causes_and_values || extracted?.causes_and_values || null,
              notable_quotes: personal?.notable_quotes || extracted?.notable_quotes || null,
              public_appearances: personal?.public_appearances || extracted?.public_appearances || null,
              personality_traits: personal?.personality_traits || extracted?.personality_traits || null,
              life_story: personal?.life_story || extracted?.life_story || null,
              social_media_presence: personal?.social_media_presence || extracted?.social_media_presence || null,
              discovered_instagram_url: extracted?.instagram_url || null,
              discovered_personal_website: extracted?.personal_website || null,
              raw_comprehensive: braveResult.combined,
              _source: 'brave',
            };
          }
        }
      } catch (error) {
        console.error('[ProfileEnrichment] Brave Search failed:', error.message);
      }

      // If Brave Search is configured, don't fall through to Gemini/Sonar
      // (they hallucinate garbage for non-famous people)
      console.log('[ProfileEnrichment] Brave returned no usable results, skipping LLM-based search (produces garbage for non-famous people)');
      return null;
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY;

    // Build a natural research prompt
    const inferredName = this.inferNameFromEmail(email);
    const searchName = (name && name.includes(' ')) ? name : inferredName;
    const emailDomain = email.split('@')[1] || '';

    const isGenericEmail = ['gmail', 'hotmail', 'yahoo', 'outlook', 'icloud', 'protonmail', 'aol'].some(d => emailDomain.includes(d));

    let prompt;
    if (!isGenericEmail) {
      // Corporate email — search by email, use domain as company identifier
      prompt = `Search for "${email}" and find everything publicly associated with this email address.
The email domain "${emailDomain}" is likely their company or organization.

Look for this email on LinkedIn, Twitter/X, GitHub, personal websites, company pages, forums, conference talks, and any other public sources. Report everything connected to this specific email:
- Current job title and company
- Career history (previous roles, companies, dates)
- Education (degrees, schools, years)
- Location (city, country)
- Notable achievements, projects, or interests
- Social media profiles or personal website

RULES:
1. Use "${email}" as your primary search query.
2. Report what you find connected to this email. Even partial info is valuable.
3. Do NOT fabricate information — only report what appears in search results.
4. Write in plain text — no markdown, no bullet points, no headers, no bold/italic.
5. Write as concise flowing prose. State facts directly. Do NOT write disclaimers or "I could not find" statements — just state what you DID find.`;
    } else {
      // Generic email (gmail, etc.) — username is a strong signal for finding profiles
      const emailUsername = email.split('@')[0];
      // Derive a searchable name from the email username
      const inferredSearchName = this.inferNameFromEmail(email);
      const displayName = (name && name.includes(' ')) ? name : inferredSearchName;

      prompt = `Search for the following and compile all results:

1. BUSINESS RECORDS: Search business registries, company filings, and CNPJ/company registration records for any businesses registered to "${displayName}". Report registration numbers, company names, addresses, and business activities.

2. DIGITAL FOOTPRINT: Search for the username "${emailUsername}" across GitHub, LinkedIn, Twitter/X, and any other platforms. Report what profiles exist and what content they contain.

3. EDUCATION: Search for "${displayName}" in university alumni directories, graduation records, or academic publications.

4. PROFESSIONAL PRESENCE: Search for any news articles, press mentions, conference talks, or professional directory listings mentioning "${displayName}" or "${emailUsername}".

5. SPORTS AND HOBBIES: Search for "${displayName}" in sports club memberships, competition results, race results, or hobby communities.

Compile ALL findings into a detailed report. Write in plain text, flowing prose. Include every verifiable fact you find.

IMPORTANT: The username "${emailUsername}" is the primary identifier for THIS specific individual. If multiple people share the surname, clearly distinguish the person associated with "${emailUsername}" from family members or other individuals with similar names. Do NOT attribute a family member's career, education, or achievements to this person.`;
    }

    // Try 1: Google AI with Search Grounding (direct API, uses business/entity framing)
    const googleAI = await getGoogleAI();
    if (googleAI) {
      console.log('[ProfileEnrichment] Trying Google AI with Search Grounding for:', { searchName, email });
      try {
        const result = await this.searchWithGoogleGrounding(googleAI, searchName, email, prompt);
        if (result) return result;
      } catch (error) {
        console.error('[ProfileEnrichment] Google AI grounding failed:', error.message);
      }
    }

    // Try 2: Perplexity Sonar Pro via OpenRouter (fallback)
    if (openRouterKey) {
      console.log('[ProfileEnrichment] Falling back to Perplexity Sonar Pro for:', { searchName, email });
      try {
        const result = await this.searchWithSonar(searchName, email, prompt, openRouterKey);
        if (result) return result;
      } catch (error) {
        console.error('[ProfileEnrichment] Sonar search failed:', error.message);
      }
    }

    // Try 3: Gemini via OpenRouter WITH web search plugin (last resort)
    if (openRouterKey) {
      console.log('[ProfileEnrichment] Falling back to Gemini + OpenRouter web search for:', { searchName, email });
      try {
        return await this.searchWithOpenRouter(searchName, email, prompt, openRouterKey);
      } catch (error) {
        console.error('[ProfileEnrichment] OpenRouter Gemini + web search failed:', error.message);
      }
    }

    console.log('[ProfileEnrichment] All search tiers exhausted — returning null');
    return null;
  }

  /**
   * Search using Perplexity Sonar Pro via OpenRouter — has proper built-in web search.
   * Note: base `perplexity/sonar` is lightweight and often skips web search.
   * `sonar-pro` does multi-step search and returns real results.
   */
  async searchWithSonar(name, email, prompt, apiKey) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://twinme.app'
      },
      body: JSON.stringify({
        model: 'perplexity/sonar-pro',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      console.log('[ProfileEnrichment] Sonar search failed:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log('[ProfileEnrichment] Sonar result length:', content.length);
    console.log('[ProfileEnrichment] Sonar preview:', content.substring(0, 500));

    if (content.length < 50) return null;
    return this.parseComprehensiveSearchResult(content);
  }

  /**
   * Search using Google AI with Google Search grounding (direct API)
   */
  async searchWithGoogleGrounding(googleAI, name, email, prompt) {
    console.log('[ProfileEnrichment] Running Google AI with grounding for:', name);

    // gemini-2.0-flash-lite has no content policy blocking for private individuals (100% reliable).
    // gemini-2.5-flash is higher quality but blocks ~33% of private individual queries.
    // Strategy: try 2.0-flash-lite first (fast, reliable), fall back to 2.5-flash if result is too short.
    const models = ['gemini-2.0-flash-lite', 'gemini-2.5-flash'];
    for (const model of models) {
      try {
        console.log(`[ProfileEnrichment] Trying ${model}...`);
        const result = await Promise.race([
          googleAI.models.generateContent({
            model,
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }],
              temperature: 0.1,
            }
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`${model} timeout after 50s`)), 50000))
        ]);

        const content = result.text;

        // Log grounding metadata
        const metadata = result.candidates?.[0]?.groundingMetadata;
        if (metadata) {
          console.log(`[ProfileEnrichment] [${model}] Grounding queries:`, metadata.webSearchQueries?.slice(0, 5));
        }

        console.log(`[ProfileEnrichment] [${model}] Result length:`, content?.length || 0);

        if (!content || content.length < 50) {
          console.log(`[ProfileEnrichment] [${model}] Empty/short response — trying next model`);
          continue;
        }

        console.log(`[ProfileEnrichment] [${model}] Preview:`, content.substring(0, 200));
        return this.parseComprehensiveSearchResult(content);
      } catch (err) {
        console.error(`[ProfileEnrichment] [${model}] Error:`, err.message);
        continue;
      }
    }
    return null;
  }

  /**
   * Fallback search using Gemini via OpenRouter WITH web search plugin.
   * OpenRouter's `web_search_options` adds web search to any model.
   */
  async searchWithOpenRouter(name, email, prompt, apiKey) {
    console.log('[ProfileEnrichment] Running Gemini via OpenRouter (with web search) for:', name);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://twinme.app'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
        web_search_options: {
          search_context_size: 'high'
        }
      })
    });

    if (!response.ok) {
      console.log('[ProfileEnrichment] OpenRouter search failed:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log('[ProfileEnrichment] OpenRouter result length:', content.length);

    if (content.length < 50) return null;
    return this.parseComprehensiveSearchResult(content);
  }

  /**
   * Parse the comprehensive search result into structured data.
   *
   * Since our prompt now asks for flowing prose, the response may not have
   * structured CAREER/EDUCATION sections. We handle both formats:
   *   1. If structured sections found → extract them
   *   2. If prose → clean it up and store as raw_comprehensive + career_timeline
   */
  parseComprehensiveSearchResult(content) {
    if (!content || content.length < 30) {
      return null;
    }

    // Detect refusal / "found nothing" responses — these are useless regardless of length
    const lower = content.toLowerCase();
    const refusalPatterns = [
      'no public information',
      'no information found',
      'no information matching',
      'no information available',
      'no information about',
      'no relevant information',
      'no specific information',
      'no detailed information',
      'no verifiable information',
      'could not find any information',
      'couldn\'t find any information',
      'could not find any specific',
      'couldn\'t find any specific',
      'cannot provide the information',
      'i cannot provide',
      'no results were found',
      'no results found',
      'no data found',
      'no matching results',
      'unable to find information',
      'unable to find any',
      'i was unable to find',
      'i could not find',
      'i couldn\'t find',
      'i did not find',
      'i didn\'t find',
      'none of which matched',
      'none matched the query',
      'raises privacy concerns',
      'privacy concerns',
      'not currently accessible',
      'cannot be comprehensively detailed',
      'details and achievements remain private',
      'career details remain private',
      'remain private at this time',
      'information is not publicly available',
      'not publicly available',
      'does not appear to have a significant public',
      'does not have a significant public',
      'no prominent public presence',
      'limited public presence',
      'minimal public presence',
      'no widely recognized public',
      'not a widely recognized public',
    ];
    const isRefusal = refusalPatterns.some(p => lower.includes(p));
    if (isRefusal) {
      console.log('[ProfileEnrichment] Detected refusal/no-data response, skipping');
      return null;
    }

    // Clean the raw content: strip markdown, citations, AI filler, and LLM preamble/planning
    const cleanContent = content
      .replace(/\*\*/g, '')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/^#+\s+.*$/gm, '')
      .replace(/^[•\-*]\s*/gm, '')
      .replace(/\[[\d,\s]+\]/g, '')
      .replace(/^(Note|Disclaimer|Important|Caveat|I hope this helps|Further Research|Please note)[:\s].*$/gim, '')
      .replace(/I hope this helps[.!]?\s*/gi, '')
      .replace(/Let me know if you need[^.]*\.\s*/gi, '')
      .replace(/Based on (?:the |my )(?:available |)(?:information|research|data)[,\s]*/gi, '')
      // Strip LLM planning/chain-of-thought preamble
      .replace(/^(?:Okay|Sure|Alright|Let me|I will|I'll|Here's (?:the|my) plan)[^.]*\.[^]*?(?=(?:[A-Z][a-z]+ (?:is|was|has|holds|serves|currently|works|founded|graduated|earned|studied|joined|started|received|became)))/i, '')
      .replace(/^(?:I (?:will|shall|am going to) (?:conduct|execute|search|run|perform|compile)[^.]*\.[\s\n]*)+/gi, '')
      .replace(/^(?:This report (?:compiles|summarizes|presents|covers|contains)[^.]*\.[\s\n]*)+/gi, '')
      .replace(/^(?:Below is|Here is|The following)[^.]*(?:compiled|detailed|comprehensive)[^.]*\.[\s\n]*/gi, '')
      .replace(/^(?:Based on (?:the |my )?search results)[^.]*\.[\s\n]*/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const result = {
      career_timeline: null,
      education: null,
      achievements: null,
      skills: null,
      languages: null,
      certifications: null,
      publications: null,
      raw_comprehensive: cleanContent
    };

    // Try structured section extraction (works if model used CAREER/EDUCATION headers)
    const careerMatch = cleanContent.match(/(?:CAREER HISTORY|Career|CAREER|Work Experience|Employment)[:\s]*\n?([\s\S]*?)(?=\n(?:EDUCATION|Education|ACHIEVEMENTS|Skills|SKILLS|CERTIFICATIONS|PUBLICATIONS|PERSONAL|LOCATION|$))/i);
    if (careerMatch && careerMatch[1] && !careerMatch[1].toLowerCase().includes('not found')) {
      result.career_timeline = careerMatch[1].trim();
    }

    const eduMatch = cleanContent.match(/(?:EDUCATION|Education)[:\s]*\n?([\s\S]*?)(?=\n(?:ACHIEVEMENTS|Skills|SKILLS|CERTIFICATIONS|PUBLICATIONS|PERSONAL|CAREER|LOCATION|$))/i);
    if (eduMatch && eduMatch[1] && !eduMatch[1].toLowerCase().includes('not found')) {
      result.education = eduMatch[1].trim();
    }

    const achieveMatch = cleanContent.match(/(?:ACHIEVEMENTS|Achievements|Accomplishments)[:\s]*\n?([\s\S]*?)(?=\n(?:SKILLS|Skills|CERTIFICATIONS|PUBLICATIONS|PERSONAL|EDUCATION|CAREER|$))/i);
    if (achieveMatch && achieveMatch[1] && !achieveMatch[1].toLowerCase().includes('not found')) {
      result.achievements = achieveMatch[1].trim();
    }

    const skillsMatch = cleanContent.match(/(?:SKILLS|Skills|Expertise|EXPERTISE)[:\s]*\n?([\s\S]*?)(?=\n(?:CERTIFICATIONS|PUBLICATIONS|PERSONAL|ACHIEVEMENTS|EDUCATION|CAREER|$))/i);
    if (skillsMatch && skillsMatch[1] && !skillsMatch[1].toLowerCase().includes('not found')) {
      result.skills = skillsMatch[1].trim();
    }

    const langMatch = cleanContent.match(/(?:languages?[:\s]+|fluent in[:\s]+)([\w\s,and]+)/i);
    if (langMatch) {
      result.languages = langMatch[1].trim();
    }

    // If structured parsing found nothing, the response is likely prose — use it directly
    const hasStructuredData = result.career_timeline || result.education || result.achievements || result.skills;
    if (!hasStructuredData && cleanContent.length > 100) {
      // Extract clean flowing sentences from the prose response
      const prose = cleanContent
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const sentences = prose.match(/[^.!?]+[.!?]+/g) || [];
      let summary = '';
      for (const s of sentences) {
        if (summary.length + s.length > 800) break;
        summary += s;
      }
      if (summary.length > 50) {
        result.career_timeline = summary.trim();
      }
    }

    // Must have at least something useful
    if (!result.career_timeline && !result.education && !result.achievements) {
      return null;
    }

    return result;
  }

  /**
   * Find LinkedIn URL via web search using Google Gemini (best for LinkedIn URL discovery)
   * This is the key to making enrichment work when email lookup fails
   */
  async findLinkedInUrlViaWebSearch(email, name) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.log('[ProfileEnrichment] No OpenRouter API key for web search');
      return null;
    }

    // Extract company from email domain for better matching
    const emailDomain = email?.split('@')[1] || '';
    const personalDomains = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'protonmail.com'];
    const companyHint = !personalDomains.includes(emailDomain.toLowerCase())
      ? emailDomain.split('.')[0] // e.g., "microsoft" from "microsoft.com"
      : '';

    // Build a Google site: search query - this format works best with Gemini
    const searchQuery = `site:linkedin.com/in "${name || email}"${companyHint ? ` ${companyHint}` : ''} Return ONLY the LinkedIn URL.`;
    console.log('[ProfileEnrichment] LinkedIn URL search query:', searchQuery);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://twinme.app'
        },
        body: JSON.stringify({
          // Google Gemini is best for finding LinkedIn URLs via web search
          model: 'google/gemini-2.0-flash-001',
          messages: [{ role: 'user', content: `Search Google for: ${searchQuery}` }],
          temperature: 0.1,
          max_tokens: 200
        })
      });

      if (!response.ok) {
        console.log('[ProfileEnrichment] LinkedIn URL search failed:', response.status);
        return null;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      console.log('[ProfileEnrichment] LinkedIn URL search result:', content.substring(0, 300));

      // Extract LinkedIn URL from response - handle both with and without protocol
      // First try full URL, then try without protocol
      let linkedInMatch = content.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w-]+/i);
      if (!linkedInMatch) {
        // Try matching without protocol (e.g., "linkedin.com/in/satyanadella")
        linkedInMatch = content.match(/(?:www\.)?linkedin\.com\/in\/([\w-]+)/i);
        if (linkedInMatch) {
          // Construct full URL from username
          const username = linkedInMatch[1];
          const fullUrl = `https://www.linkedin.com/in/${username}`;
          console.log('[ProfileEnrichment] Found LinkedIn URL (constructed):', fullUrl);
          return fullUrl;
        }
      }
      if (linkedInMatch) {
        console.log('[ProfileEnrichment] Found LinkedIn URL:', linkedInMatch[0]);
        return linkedInMatch[0];
      }

      console.log('[ProfileEnrichment] No LinkedIn URL found in response');
      return null;
    } catch (error) {
      console.error('[ProfileEnrichment] LinkedIn URL search error:', error);
      return null;
    }
  }

  /**
   * Search the web for career history and education using Perplexity Sonar
   * This is how cofounder.co does it - find career data from Wikipedia, news, company bios
   */
  async searchWebForCareerHistory(name, currentCompany = null) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.log('[ProfileEnrichment] No API key for career search');
      return null;
    }

    const companyHint = currentCompany ? ` (currently at ${currentCompany})` : '';
    const query = `Search for ${name}${companyHint}'s complete career history and education background.

Find information from Wikipedia, company bios, Crunchbase, Bloomberg, news articles, and other reliable sources.

I need their COMPLETE work history - every job they've had, not just their current position.

Format your response as:

CAREER:
- [Year-Year] Title at Company: Brief description
- [Year-Year] Title at Company: Brief description
(list ALL positions from earliest to most recent)

EDUCATION:
- School Name - Degree in Field (Year)
- School Name - Degree in Field (Year)

Be thorough and accurate. Only include information you can verify from sources.`;

    try {
      console.log('[ProfileEnrichment] Searching web for career history of:', name);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://twinme.app'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-001',
          messages: [{ role: 'user', content: query }],
          temperature: 0.1,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        console.log('[ProfileEnrichment] Career search failed:', response.status);
        return null;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      console.log('[ProfileEnrichment] Career search result length:', content.length);

      // Parse the response to extract career and education
      const careerTimeline = this.parseCareerFromWebSearch(content);
      const education = this.parseEducationFromWebSearch(content);

      if (!careerTimeline && !education) {
        console.log('[ProfileEnrichment] Could not parse career data from response');
        return null;
      }

      return {
        career_timeline: careerTimeline,
        education: education,
        raw_response: content
      };

    } catch (error) {
      console.error('[ProfileEnrichment] Career search error:', error);
      return null;
    }
  }

  /**
   * Parse career timeline from web search response
   */
  parseCareerFromWebSearch(content) {
    // Look for CAREER section
    const careerMatch = content.match(/CAREER:?\s*\n([\s\S]*?)(?=\n\s*EDUCATION:|$)/i);
    if (!careerMatch) {
      // Try to find any bullet points with job info
      const bulletPoints = content.match(/[-•]\s*\[?\d{4}.*?(?:at|@)\s+\w+.*$/gm);
      if (bulletPoints && bulletPoints.length > 0) {
        return bulletPoints.join('\n');
      }
      return null;
    }

    const careerText = careerMatch[1].trim();
    // Clean up and format
    const lines = careerText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 5 && (line.startsWith('-') || line.startsWith('•') || line.startsWith('*') || /^\*\*/.test(line)));

    if (lines.length === 0) return null;

    return lines.map(line => line.replace(/^[-•*]\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '')).join('\n\n');
  }

  /**
   * Parse education from web search response
   */
  parseEducationFromWebSearch(content) {
    // Look for EDUCATION section
    const eduMatch = content.match(/EDUCATION:?\s*\n([\s\S]*?)(?=\n\s*[A-Z]+:|$)/i);
    if (!eduMatch) {
      return null;
    }

    const eduText = eduMatch[1].trim();
    const lines = eduText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 5 && (line.startsWith('-') || line.startsWith('•') || line.startsWith('*') || /^\*\*/.test(line)));

    if (lines.length === 0) return null;

    return lines.map(line => line.replace(/^[-•*]\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '')).join('\n');
  }

  /**
   * Verify that a profile name matches the searched name
   * Handles variations like "Satya Nadella" vs "Satya N." or "S. Nadella"
   */
  verifyNameMatch(profileName, searchName) {
    if (!profileName || !searchName) return false;

    // Normalize names: lowercase, remove extra spaces
    const normalize = (name) => name.toLowerCase().trim().replace(/\s+/g, ' ');
    const profile = normalize(profileName);
    const search = normalize(searchName);

    // Exact match
    if (profile === search) return true;

    // Check if profile name contains all parts of search name
    const profileParts = profile.split(' ').filter(p => p.length > 1);
    const searchParts = search.split(' ').filter(p => p.length > 1);

    // If search has company/title (e.g., "Jensen Huang NVIDIA"), extract just the name
    const searchNameOnly = searchParts.filter(p =>
      !['ceo', 'cto', 'cfo', 'founder', 'president', 'chairman', 'director',
       'nvidia', 'apple', 'google', 'microsoft', 'meta', 'amazon', 'tesla'].includes(p)
    );

    // Check if first and last name match (allowing for middle names)
    if (searchNameOnly.length >= 2 && profileParts.length >= 2) {
      const firstNameMatch = profileParts[0] === searchNameOnly[0] ||
                             profileParts[0].startsWith(searchNameOnly[0].charAt(0));
      const lastNameMatch = profileParts[profileParts.length - 1] === searchNameOnly[searchNameOnly.length - 1];

      if (firstNameMatch && lastNameMatch) return true;
    }

    // Check if either name contains the other (handles "Tim Cook" matching "Timothy Cook")
    if (profile.includes(searchNameOnly.join(' ')) || searchNameOnly.join(' ').includes(profile)) {
      return true;
    }

    // Check first name and last name separately
    if (searchNameOnly.length >= 1 && profileParts.length >= 1) {
      const searchFirst = searchNameOnly[0];
      const searchLast = searchNameOnly[searchNameOnly.length - 1];
      const profileFirst = profileParts[0];
      const profileLast = profileParts[profileParts.length - 1];

      // First names match (or one is abbreviation of other)
      const firstMatch = profileFirst === searchFirst ||
                         profileFirst.startsWith(searchFirst) ||
                         searchFirst.startsWith(profileFirst);

      // Last names match
      const lastMatch = profileLast === searchLast;

      if (firstMatch && lastMatch) return true;
    }

    console.log(`[ProfileEnrichment] Name verification failed: "${profileName}" vs "${searchName}"`);
    return false;
  }

  /**
   * Convert PDL response format to our enrichment format
   */
  convertPDLToEnrichment(pdlData) {
    // Format experience/career timeline from PDL
    const careerTimeline = this.formatPDLExperience(pdlData.experience || []);
    const education = this.formatPDLEducation(pdlData.education || []);
    const skills = (pdlData.skills || []).join(', ');

    return {
      discovered_name: pdlData.discovered_name,
      discovered_company: pdlData.discovered_company,
      discovered_title: pdlData.discovered_title,
      discovered_location: pdlData.discovered_location,
      discovered_linkedin_url: pdlData.discovered_linkedin_url,
      discovered_twitter_url: pdlData.discovered_twitter_url,
      discovered_github_url: pdlData.discovered_github_url,
      discovered_bio: pdlData.discovered_bio,
      // Career data
      career_timeline: careerTimeline || null,
      education: education || null,
      skills: skills || null,
      // PDL-specific data
      pdl_id: pdlData.pdl_id,
      pdl_likelihood: pdlData.pdl_likelihood,
      industry: pdlData.industry
    };
  }

  /**
   * Format PDL experience array into readable career timeline
   */
  formatPDLExperience(experience) {
    if (!experience || experience.length === 0) return null;

    return experience.map(exp => {
      const company = exp.company?.name || 'Unknown Company';
      const title = exp.title?.name || 'Unknown Role';
      const startDate = exp.start_date || '';
      const endDate = exp.end_date || 'Present';
      const dateRange = startDate ? `${startDate} - ${endDate}` : '';
      const location = exp.location_names?.[0] ? ` (${exp.location_names[0]})` : '';

      return `${title} at ${company}${location}${dateRange ? ` [${dateRange}]` : ''}`;
    }).join('\n\n');
  }

  /**
   * Format PDL education array into readable format
   */
  formatPDLEducation(education) {
    if (!education || education.length === 0) return null;

    return education.map(edu => {
      const school = edu.school?.name || 'Unknown School';
      const degree = edu.degrees?.join(', ') || '';
      const major = edu.majors?.join(', ') || '';
      const degreeField = [degree, major].filter(Boolean).join(' in ');
      const startYear = edu.start_date?.split('-')[0] || '';
      const endYear = edu.end_date?.split('-')[0] || '';
      const dateRange = startYear ? `${startYear} - ${endYear || 'Present'}` : '';

      return `${school}${degreeField ? ` - ${degreeField}` : ''}${dateRange ? ` (${dateRange})` : ''}`;
    }).join('\n');
  }

  /**
   * Build an optimized search query for Perplexity
   * Returns a query that asks for BOTH a narrative summary AND structured data
   */
  buildSearchQuery(email, name, emailDomain) {
    // Check if email is from a company domain (not gmail, hotmail, etc.)
    const personalDomains = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'protonmail.com', 'aol.com', 'live.com', 'msn.com'];
    const isCompanyEmail = !personalDomains.includes(emailDomain.toLowerCase());

    // Build context for more accurate search
    const emailHint = isCompanyEmail
      ? `This person likely works at a company associated with the domain "${emailDomain}".`
      : `This person uses a personal email (${emailDomain}).`;

    if (name) {
      return `I need to find information about a specific person named "${name}" with email address "${email}".

${emailHint}

IMPORTANT: I need information about THIS SPECIFIC PERSON, not someone else with a similar name.
If you find multiple people with this name, look for clues that match the email domain or context.

Search thoroughly across:
- LinkedIn profiles
- Twitter/X accounts
- GitHub profiles
- Personal websites or portfolios
- Company team pages
- News articles or press mentions
- Conference speaker pages
- Published articles or blog posts

Please provide:
1. A detailed paragraph (3-5 sentences) summarizing who this person is, what they do, their background, and any interesting facts you found about them.
2. The structured data in JSON format.

Format your response as:
SUMMARY:
[Write a detailed 3-5 sentence paragraph about this person here]

JSON:
{
  "name": "Full Name",
  "company": "Current Company",
  "title": "Job Title",
  "location": "City, Country",
  "linkedin_url": "https://linkedin.com/in/...",
  "twitter_url": "https://twitter.com/...",
  "github_url": "https://github.com/...",
  "bio": "One-line professional headline"
}

If you cannot find reliable information about this specific person, say so clearly. Do not guess or provide information about a different person with a similar name.`;
    }

    // Fallback to email-only query
    return `Find information about the person who owns the email address: ${email}

${emailHint}

Search LinkedIn, Twitter/X, GitHub, professional directories, and any other public sources.

Please provide:
1. A detailed paragraph summarizing who this person is
2. Structured data in JSON format

If you cannot find information, say so clearly.`;
  }

  /**
   * Search the web for comprehensive career/life information about a person
   * Uses Perplexity Sonar API to find detailed professional history
   * @param {string} email - User's email
   * @param {string} name - User's name
   * @param {Object} linkedInData - Existing LinkedIn data (if any)
   * @returns {Promise<Object>} Web search results with career data
   */
  async searchWebForPerson(email, name, linkedInData) {
    console.log('[ProfileEnrichment] Starting comprehensive career search...');

    const apiKey = process.env.OPENROUTER_API_KEY || process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.log('[ProfileEnrichment] No API key for web search');
      return { success: false, webFindings: null };
    }

    // Build context from LinkedIn data if available
    const linkedInContext = linkedInData ? `
I already have basic information from LinkedIn:
- Name: ${linkedInData.discovered_name || 'Unknown'}
- Current role: ${linkedInData.discovered_title || 'Unknown'}
- Company: ${linkedInData.discovered_company || 'Unknown'}
- Location: ${linkedInData.discovered_location || 'Unknown'}

Now I need their COMPLETE CAREER HISTORY and life story.` : '';

    const searchQuery = `Research "${name || email}" thoroughly and create a COMPREHENSIVE PROFESSIONAL RESUME of this person.
${linkedInContext}

Search across ALL sources: LinkedIn, personal websites, company pages, news articles, press releases, university alumni pages, conference speaker bios, published papers, GitHub, Twitter/X, podcasts, interviews, blog posts, Medium/Substack, and any other relevant sources.

I need a COMPLETE CAREER TIMELINE - not just current role. Find:

1. **CAREER HISTORY** - Every job/role you can find with:
   - Company names
   - Job titles
   - Time periods (years or dates)
   - Key responsibilities or achievements in each role

2. **EDUCATION** - Schools, universities, degrees, certifications:
   - Institution names
   - Degrees/programs
   - Years attended
   - Notable achievements (honors, thesis topics, activities)

3. **NOTABLE PROJECTS & ACHIEVEMENTS**:
   - Companies founded or co-founded
   - Products launched
   - Awards or recognition
   - Publications or research papers
   - Patents
   - Speaking engagements
   - Open source contributions

4. **SKILLS & EXPERTISE**:
   - Technical skills
   - Industry expertise areas
   - Languages spoken

5. **PERSONAL BRAND**:
   - Topics they write or speak about
   - Communities they're part of
   - Causes they care about

Format your response as:

CAREER_TIMELINE:
[List each role chronologically from most recent to oldest, including company, title, dates, and what they did]

EDUCATION:
[List all educational background with institutions, degrees, and years]

ACHIEVEMENTS:
[List notable achievements, projects, publications, awards]

SKILLS:
[List technical and professional skills, expertise areas]

SUMMARY:
[Write a detailed 4-6 sentence biography that tells the story of this person's career journey - where they started, key milestones, what they're known for, and what drives them]

ADDITIONAL_PROFILES:
{
  "twitter_url": "URL if found",
  "github_url": "URL if found",
  "personal_website": "URL if found",
  "blog_url": "URL if found",
  "other_urls": ["array of other relevant URLs found"]
}`;

    try {
      const baseUrl = process.env.OPENROUTER_API_KEY
        ? 'https://openrouter.ai/api/v1'
        : 'https://api.perplexity.ai';

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(process.env.OPENROUTER_API_KEY ? { 'HTTP-Referer': 'https://twinme.ai' } : {})
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-001',
          messages: [
            {
              role: 'user',
              content: searchQuery
            }
          ],
          temperature: 0.3,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        console.error('[ProfileEnrichment] Web search API error:', response.status);
        return { success: false, webFindings: null };
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || '';

      console.log('[ProfileEnrichment] Web search response received, length:', content.length);

      // Parse the response
      const webFindings = this.parseWebSearchResponse(content);

      return {
        success: true,
        webFindings,
        rawContent: content
      };
    } catch (error) {
      console.error('[ProfileEnrichment] Web search failed:', error.message);
      return { success: false, webFindings: null };
    }
  }

  /**
   * Parse web search response into structured career data
   */
  parseWebSearchResponse(content) {
    const findings = {
      summary: null,
      career_timeline: null,
      education: null,
      achievements: null,
      skills: null,
      twitter_url: null,
      github_url: null,
      personal_website: null,
      blog_url: null,
      other_urls: [],
      interesting_facts: []
    };

    if (!content) return findings;

    // Extract CAREER_TIMELINE section
    const careerMatch = content.match(/CAREER_TIMELINE:\s*\n?([\s\S]*?)(?=\n\s*EDUCATION:|$)/i);
    if (careerMatch && careerMatch[1]) {
      findings.career_timeline = careerMatch[1].trim();
    }

    // Extract EDUCATION section
    const educationMatch = content.match(/EDUCATION:\s*\n?([\s\S]*?)(?=\n\s*ACHIEVEMENTS:|$)/i);
    if (educationMatch && educationMatch[1]) {
      findings.education = educationMatch[1].trim();
    }

    // Extract ACHIEVEMENTS section
    const achievementsMatch = content.match(/ACHIEVEMENTS:\s*\n?([\s\S]*?)(?=\n\s*SKILLS:|$)/i);
    if (achievementsMatch && achievementsMatch[1]) {
      findings.achievements = achievementsMatch[1].trim();
    }

    // Extract SKILLS section
    const skillsMatch = content.match(/SKILLS:\s*\n?([\s\S]*?)(?=\n\s*SUMMARY:|$)/i);
    if (skillsMatch && skillsMatch[1]) {
      findings.skills = skillsMatch[1].trim();
    }

    // Extract SUMMARY section
    const summaryMatch = content.match(/SUMMARY:\s*\n?([\s\S]*?)(?=\n\s*ADDITIONAL_PROFILES:|$)/i);
    if (summaryMatch && summaryMatch[1]) {
      findings.summary = summaryMatch[1].trim();
    }

    // Fallback: try old WEB_FINDINGS format
    if (!findings.summary) {
      const webFindingsMatch = content.match(/WEB_FINDINGS:\s*\n?([\s\S]*?)(?=\n\s*ADDITIONAL_PROFILES:|$)/i);
      if (webFindingsMatch && webFindingsMatch[1]) {
        findings.summary = webFindingsMatch[1].trim();
      }
    }

    // Extract ADDITIONAL_PROFILES JSON
    const profilesMatch = content.match(/ADDITIONAL_PROFILES:\s*\n?\{[\s\S]*?\}/i);
    if (profilesMatch) {
      try {
        const jsonStr = profilesMatch[0].replace(/ADDITIONAL_PROFILES:\s*\n?/i, '');
        const profiles = JSON.parse(jsonStr);
        findings.twitter_url = profiles.twitter_url || null;
        findings.github_url = profiles.github_url || null;
        findings.personal_website = profiles.personal_website || null;
        findings.blog_url = profiles.blog_url || null;
        findings.other_urls = profiles.other_urls || [];
      } catch (e) {
        console.log('[ProfileEnrichment] Could not parse ADDITIONAL_PROFILES JSON');
      }
    }

    // Extract INTERESTING_FACTS if present (old format fallback)
    const factsMatch = content.match(/INTERESTING_FACTS:\s*\n?([\s\S]*?)(?=\n\s*ADDITIONAL_PROFILES:|$)/i);
    if (factsMatch && factsMatch[1]) {
      const factsText = factsMatch[1].trim();
      const facts = factsText.split(/\n/).filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 10 && (trimmed.startsWith('-') || trimmed.startsWith('•') || /^\d+\./.test(trimmed));
      }).map(line => line.replace(/^[-•\d.]\s*/, '').trim());
      findings.interesting_facts = facts.slice(0, 5);
    }

    return findings;
  }

  /**
   * Combine data from LinkedIn and web search into unified enrichment data
   * PRIORITY: LinkedIn (Scrapin) data is real and trusted, web search is supplementary
   */
  combineEnrichmentSources(linkedInData, webSearchResult, email, name) {
    const combined = {
      email,
      discovered_name: linkedInData?.discovered_name || name || null,
      discovered_company: linkedInData?.discovered_company || null,
      discovered_title: linkedInData?.discovered_title || null,
      discovered_location: linkedInData?.discovered_location || null,
      discovered_linkedin_url: linkedInData?.discovered_linkedin_url || null,
      discovered_twitter_url: linkedInData?.discovered_twitter_url || null,
      discovered_github_url: linkedInData?.discovered_github_url || null,
      discovered_bio: linkedInData?.discovered_bio || null,

      // Career data from REAL LinkedIn profile (Scrapin full profile endpoint)
      career_timeline: linkedInData?.career_timeline || null,
      education: linkedInData?.education || null,
      skills: linkedInData?.skills || null,
      achievements: null, // Not available from LinkedIn API

      // Additional Scrapin data
      scrapin_summary: linkedInData?.scrapin_summary || null,
      scrapin_headline: linkedInData?.scrapin_headline || null,
      scrapin_industry: linkedInData?.scrapin_industry || null,
      scrapin_connection_count: linkedInData?.scrapin_connection_count || null,
      scrapin_follower_count: linkedInData?.scrapin_follower_count || null,
      scrapin_profile_picture_url: linkedInData?.scrapin_profile_picture_url || null,
      scrapin_background_url: linkedInData?.scrapin_background_url || null,
      discovered_photo: linkedInData?.discovered_photo || null,
      github_repos: linkedInData?.github_repos || null,
      github_followers: linkedInData?.github_followers || null,
      social_links: linkedInData?.social_links || null,
      languages: linkedInData?.languages || null,
      certifications: linkedInData?.certifications || null,
      publications: linkedInData?.publications || null,
      achievements: linkedInData?.achievements || null,
    };

    // Enhance with web search findings (ONLY for social profile URLs, not career data)
    if (webSearchResult?.success && webSearchResult.webFindings) {
      const web = webSearchResult.webFindings;

      // Fill in missing social URLs from web search
      if (!combined.discovered_twitter_url && web.twitter_url) {
        combined.discovered_twitter_url = web.twitter_url;
      }
      if (!combined.discovered_github_url && web.github_url) {
        combined.discovered_github_url = web.github_url;
      }

      // Store additional web findings (URLs only, not hallucinated career data)
      combined.personal_website = web.personal_website || null;
      combined.blog_url = web.blog_url || null;
      combined.other_urls = web.other_urls || [];
    }

    return combined;
  }

  /**
   * Generate a rich narrative summary from all collected career data
   */
  async generateRichSummary(combinedData, webFindings) {
    console.log('[ProfileEnrichment] Generating comprehensive career summary...');

    const apiKey = process.env.OPENROUTER_API_KEY || process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      return this.buildFallbackSummary(combinedData);
    }

    const name = combinedData.discovered_name || 'Unknown';
    const company = combinedData.discovered_company || '';
    const title = combinedData.discovered_title || '';
    const location = combinedData.discovered_location || '';
    const careerTimeline = combinedData.career_timeline || webFindings?.career_timeline || '';
    const education = combinedData.education || webFindings?.education || '';
    const achievements = combinedData.achievements || webFindings?.achievements || '';
    const skills = combinedData.skills || webFindings?.skills || '';
    const webSummary = webFindings?.summary || '';

    const prompt = `Based on the following comprehensive career data, write a detailed 5-7 sentence biography that tells this person's professional story. Make it read like a mini-resume narrative.

BASIC INFO:
- Name: ${name}
- Current Role: ${title}
- Company/Organization: ${company}
${location ? `- Location: ${location}` : ''}

${careerTimeline ? `CAREER HISTORY:\n${careerTimeline}\n` : ''}
${education ? `EDUCATION:\n${education}\n` : ''}
${achievements ? `ACHIEVEMENTS:\n${achievements}\n` : ''}
${skills ? `SKILLS:\n${skills}\n` : ''}
${webSummary ? `ADDITIONAL CONTEXT:\n${webSummary}` : ''}

Write a comprehensive biographical summary that:
1. Opens with who they are NOW (current role, company)
2. Tells their career journey - where they started, key transitions, growth
3. Highlights their education and how it shaped their path
4. Mentions notable achievements, projects, or companies they've built
5. Describes their expertise areas and what they're known for
6. Gives a sense of what drives them or their professional passions

The goal is to create a "resume in paragraph form" - comprehensive but readable.
Write 5-7 sentences that capture their full professional story.

IMPORTANT: Write ONLY the summary. No prefixes, no "Based on...", no meta-commentary. Just the biographical summary itself.`;

    try {
      const baseUrl = process.env.OPENROUTER_API_KEY
        ? 'https://openrouter.ai/api/v1'
        : 'https://api.perplexity.ai';

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(process.env.OPENROUTER_API_KEY ? { 'HTTP-Referer': 'https://twinme.ai' } : {})
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_API_KEY
            ? 'anthropic/claude-3.5-haiku'
            : 'sonar',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          max_tokens: 700
        })
      });

      if (!response.ok) {
        console.error('[ProfileEnrichment] Summary API error:', response.status);
        return this.buildFallbackSummary(combinedData);
      }

      const result = await response.json();
      let summary = result.choices?.[0]?.message?.content?.trim();

      if (summary && summary.length > 30) {
        // Clean up any prefixes
        const prefixPatterns = [
          /^here'?s?\s*(a|the)?\s*(?:draft|compelling)?\s*summary:?\s*/i,
          /^based on (?:the|this) (?:profile )?information[,:]?\s*/i,
          /^summary:?\s*/i
        ];
        for (const pattern of prefixPatterns) {
          summary = summary.replace(pattern, '');
        }
        console.log('[ProfileEnrichment] Generated rich summary:', summary.substring(0, 100) + '...');
        return summary.trim();
      }

      return this.buildFallbackSummary(combinedData);
    } catch (error) {
      console.error('[ProfileEnrichment] Rich summary generation failed:', error.message);
      return this.buildFallbackSummary(combinedData);
    }
  }

  /**
   * Build a simple fallback summary when API calls fail
   */
  buildFallbackSummary(data) {
    const name = data.discovered_name || 'This person';
    const title = data.discovered_title || '';
    const company = data.discovered_company || '';
    const location = data.discovered_location || '';

    let summary = name;
    if (title && company) {
      summary += ` is ${title} at ${company}`;
    } else if (title) {
      summary += ` works as ${title}`;
    } else if (company) {
      summary += ` works at ${company}`;
    }
    if (location) {
      summary += ` in ${location}`;
    }
    summary += '.';

    return summary;
  }

  /**
   * Call People Data Labs API for accurate profile enrichment
   * https://docs.peopledatalabs.com/docs/person-enrichment-api
   */
  async callPeopleDataLabsAPI(email, name, apiKey) {
    console.log('[ProfileEnrichment] Calling People Data Labs API...');

    try {
      // Build query parameters
      const params = new URLSearchParams({
        api_key: apiKey,
        email: email,
        pretty: 'true'
      });

      // Add name if provided for better matching
      if (name) {
        params.append('name', name);
      }

      const response = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[ProfileEnrichment] PDL API error: ${response.status} - ${errorText}`);

        // 404 means no match found - not an error
        if (response.status === 404) {
          return { success: false, data: null, error: 'No match found' };
        }

        return { success: false, data: null, error: `API error: ${response.status}` };
      }

      const result = await response.json();
      console.log('[ProfileEnrichment] PDL API response status:', result.status);

      // Check if we got a match
      if (result.status !== 200 || !result.data) {
        console.log('[ProfileEnrichment] PDL: No match found');
        return { success: false, data: null };
      }

      const person = result.data;
      console.log('[ProfileEnrichment] PDL found person:', person.full_name);

      // Map PDL response to our enrichment format
      const enrichmentData = {
        discovered_name: person.full_name || name,
        discovered_company: person.job_company_name || null,
        discovered_title: person.job_title || null,
        discovered_location: this.formatPDLLocation(person),
        discovered_linkedin_url: person.linkedin_url || null,
        discovered_twitter_url: person.twitter_url || null,
        discovered_github_url: person.github_url || null,
        discovered_bio: this.buildPDLBio(person),
        // Additional PDL data
        pdl_id: person.id,
        pdl_likelihood: result.likelihood,
        industry: person.industry || null,
        job_start_date: person.job_start_date || null,
        skills: person.skills || [],
        interests: person.interests || [],
        education: person.education || [],
        experience: person.experience || []
      };

      return {
        success: true,
        data: enrichmentData,
        raw: result
      };

    } catch (error) {
      console.error('[ProfileEnrichment] PDL API request failed:', error);
      return { success: false, data: null, error: error.message };
    }
  }

  /**
   * Format location from PDL response
   */
  formatPDLLocation(person) {
    const parts = [];
    if (person.location_locality) parts.push(person.location_locality);
    if (person.location_region) parts.push(person.location_region);
    if (person.location_country) parts.push(person.location_country);
    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * Build a bio from PDL data
   */
  buildPDLBio(person) {
    const parts = [];

    if (person.job_title && person.job_company_name) {
      parts.push(`${person.job_title} at ${person.job_company_name}`);
    } else if (person.job_title) {
      parts.push(person.job_title);
    }

    if (person.industry) {
      parts.push(`Works in ${person.industry}`);
    }

    if (person.summary) {
      parts.push(person.summary);
    }

    return parts.length > 0 ? parts.join('. ') + '.' : null;
  }

  /**
   * Call Scrapin.io API for email-to-profile resolution
   * https://docs.scrapin.io/endpoint/v1/person/email
   *
   * Returns LinkedIn profile data from email address
   * Cost: 1 credit per request (0.5 if cached)
   */
  async callScrapinAPI(email, name, apiKey) {
    console.log('[ProfileEnrichment] Calling Scrapin.io API...');

    try {
      // Build query parameters
      const params = new URLSearchParams({
        apikey: apiKey,
        email: email
      });

      const response = await fetch(`https://api.scrapin.io/v1/enrichment/resolve/email?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[ProfileEnrichment] Scrapin.io API error: ${response.status} - ${errorText}`);

        // Handle specific error codes
        if (response.status === 404) {
          return { success: false, data: null, error: 'No match found' };
        }
        if (response.status === 402 || response.status === 403) {
          console.warn('[ProfileEnrichment] Scrapin.io: Insufficient credits or access denied');
          return { success: false, data: null, error: 'Insufficient credits' };
        }

        return { success: false, data: null, error: `API error: ${response.status}` };
      }

      const result = await response.json();
      console.log('[ProfileEnrichment] Scrapin.io response:', JSON.stringify(result).substring(0, 500));

      // Check if we got a match
      if (!result.success || !result.person) {
        console.log('[ProfileEnrichment] Scrapin.io: No match found');
        return { success: false, data: null };
      }

      const person = result.person;

      // Email endpoint may return full profile data including positions/education
      const positionHistory = person.positions?.positionHistory || [];
      const educationHistory = person.schools?.educationHistory || [];

      console.log('[ProfileEnrichment] Scrapin.io found person:', {
        name: `${person.firstName} ${person.lastName}`,
        headline: person.headline,
        linkedInUrl: person.linkedInUrl,
        positionsCount: positionHistory.length,
        educationsCount: educationHistory.length,
        skillsCount: person.skills?.length || 0
      });

      // Format career data if available from email response
      const careerTimeline = this.formatScrapinPositions(positionHistory);
      const education = this.formatScrapinEducation(educationHistory);
      const skills = (person.skills || []).join(', ');

      // Map Scrapin response to our enrichment format
      const enrichmentData = {
        discovered_name: person.firstName && person.lastName
          ? `${person.firstName} ${person.lastName}`
          : name,
        discovered_company: this.extractScrapinCompany(person),
        discovered_title: person.headline || this.extractScrapinTitle(person),
        discovered_location: this.formatScrapinLocation(person.location),
        discovered_linkedin_url: person.linkedInUrl || null,
        discovered_twitter_url: null, // Scrapin doesn't provide Twitter
        discovered_github_url: null, // Scrapin doesn't provide GitHub
        discovered_bio: person.headline || null,
        // Career data from email response (if available)
        career_timeline: careerTimeline || null,
        education: education || null,
        skills: skills || null,
        // Additional data from Scrapin
        scrapin_photo_url: person.photoUrl || null,
        scrapin_background_url: person.backgroundUrl || null,
        scrapin_public_identifier: person.publicIdentifier || null,
        scrapin_linkedin_identifier: person.linkedInIdentifier || null,
        scrapin_open_to_work: person.openToWork || false,
        scrapin_premium: person.premium || false,
        scrapin_headline: person.headline || null,
        scrapin_summary: person.summary || null,
        scrapin_connection_count: person.connectionsCount || null,
        scrapin_follower_count: person.followerCount || null,
        scrapin_credits_left: result.credits_left,
        scrapin_credits_consumed: result.credits_consumed
      };

      return {
        success: true,
        data: enrichmentData,
        raw: result
      };

    } catch (error) {
      console.error('[ProfileEnrichment] Scrapin.io API request failed:', error);
      return { success: false, data: null, error: error.message };
    }
  }

  /**
   * Fetch full LinkedIn profile from Scrapin.io using profile URL
   * This returns detailed positions, education, skills, etc.
   * Endpoint: https://api.scrapin.io/v1/enrichment/profile
   */
  async fetchScrapinFullProfile(linkedInUrl, apiKey) {
    console.log('[ProfileEnrichment] Fetching full profile from Scrapin.io...');

    try {
      const params = new URLSearchParams({
        apikey: apiKey,
        linkedInUrl: linkedInUrl  // capital I and U per Scrapin API
      });

      // Endpoint: https://api.scrapin.io/v1/enrichment/profile
      const response = await fetch(`https://api.scrapin.io/v1/enrichment/profile?${params}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        console.log(`[ProfileEnrichment] Scrapin profile API error: ${response.status}`);
        return { success: false, data: null };
      }

      const result = await response.json();
      console.log('[ProfileEnrichment] Scrapin profile response keys:', Object.keys(result));

      if (!result.success || !result.person) {
        return { success: false, data: null };
      }

      const person = result.person;

      // Scrapin returns positions as { positionsCount, positionHistory[] }
      // and schools as { educationsCount, educationHistory[] }
      const positionHistory = person.positions?.positionHistory || [];
      const educationHistory = person.schools?.educationHistory || [];

      console.log('[ProfileEnrichment] Full profile data:', {
        headline: person.headline,
        hasPositions: positionHistory.length > 0,
        positionCount: positionHistory.length,
        hasEducation: educationHistory.length > 0,
        educationCount: educationHistory.length,
        hasSkills: !!person.skills?.length,
        location: person.location
      });

      // Format career timeline from real positions
      const careerTimeline = this.formatScrapinPositions(positionHistory);

      // Format education from real schools
      const education = this.formatScrapinEducation(educationHistory);

      // Format skills
      const skills = (person.skills || []).join(', ');

      // Parse headline to extract title and company if not in position history
      // e.g., "Chairman and CEO at Microsoft" -> title: "Chairman and CEO", company: "Microsoft"
      let extractedTitle = null;
      let extractedCompany = null;
      if (person.headline) {
        const headlineMatch = person.headline.match(/^(.+?)\s+at\s+(.+)$/i);
        if (headlineMatch) {
          extractedTitle = headlineMatch[1].trim();
          extractedCompany = headlineMatch[2].trim();
        }
      }

      // Format location
      const locationParts = [];
      if (person.location?.city) locationParts.push(person.location.city);
      if (person.location?.state) locationParts.push(person.location.state);
      if (person.location?.country) locationParts.push(person.location.country);
      const formattedLocation = locationParts.join(', ') || null;

      return {
        success: true,
        data: {
          // Basic profile info (extracted from headline if needed)
          discovered_name: `${person.firstName || ''} ${person.lastName || ''}`.trim() || null,
          discovered_title: extractedTitle || null,
          discovered_company: extractedCompany || null,
          discovered_location: formattedLocation,
          discovered_bio: person.summary || null,

          // Career data
          career_timeline: careerTimeline || null,
          education: education || null,
          skills: skills || null,
          achievements: null, // Scrapin doesn't provide this

          // Scrapin-specific metadata
          scrapin_headline: person.headline || null,
          scrapin_summary: person.summary || null,
          scrapin_industry: person.industryName || null,
          scrapin_connection_count: person.connectionsCount || null,
          scrapin_follower_count: person.followerCount || null,
          scrapin_profile_picture_url: person.photoUrl || null,
          scrapin_background_url: person.backgroundUrl || null,
          scrapin_raw_positions: positionHistory,
          scrapin_raw_education: educationHistory
        },
        raw: result
      };

    } catch (error) {
      console.error('[ProfileEnrichment] Scrapin profile fetch failed:', error);
      return { success: false, data: null, error: error.message };
    }
  }

  /**
   * Format Scrapin positions into readable career timeline
   */
  formatScrapinPositions(positions) {
    if (!positions || positions.length === 0) return null;

    return positions.map(pos => {
      const company = pos.companyName || 'Unknown Company';
      const title = pos.title || 'Unknown Role';
      const startDate = pos.startEndDate?.start
        ? `${pos.startEndDate.start.month || ''}/${pos.startEndDate.start.year || ''}`.replace(/^\//, '')
        : '';
      const endDate = pos.startEndDate?.end
        ? `${pos.startEndDate.end.month || ''}/${pos.startEndDate.end.year || ''}`.replace(/^\//, '')
        : 'Present';
      const dateRange = startDate ? `${startDate} - ${endDate}` : '';
      const description = pos.description ? `\n  ${pos.description}` : '';
      const location = pos.location ? ` (${pos.location})` : '';

      return `${title} at ${company}${location}${dateRange ? ` [${dateRange}]` : ''}${description}`;
    }).join('\n\n');
  }

  /**
   * Format Scrapin education into readable format
   */
  formatScrapinEducation(schools) {
    if (!schools || schools.length === 0) return null;

    return schools.map(school => {
      const name = school.schoolName || 'Unknown School';
      const degree = school.degreeName || '';
      const field = school.fieldOfStudy || '';
      const degreeField = [degree, field].filter(Boolean).join(' in ');
      const startYear = school.startEndDate?.start?.year || '';
      const endYear = school.startEndDate?.end?.year || '';
      const dateRange = startYear ? `${startYear} - ${endYear || 'Present'}` : '';

      return `${name}${degreeField ? ` - ${degreeField}` : ''}${dateRange ? ` (${dateRange})` : ''}`;
    }).join('\n');
  }

  /**
   * Search web ONLY for additional social profiles (Twitter, GitHub, etc.)
   * Does NOT hallucinate career data - only finds real social links
   */
  async searchWebForSocialProfiles(email, name, linkedInData) {
    console.log('[ProfileEnrichment] Searching for additional social profiles...');

    const apiKey = process.env.OPENROUTER_API_KEY || process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      return { success: false, webFindings: null };
    }

    const searchQuery = `Find social media profiles for "${name || email}".
${linkedInData ? `This person is: ${linkedInData.discovered_title || ''} at ${linkedInData.discovered_company || ''} in ${linkedInData.discovered_location || ''}.` : ''}

IMPORTANT: ONLY report profiles you ACTUALLY FIND with real URLs. Do NOT make up or guess any information.
If you cannot find a profile, say "NOT FOUND" - do not invent URLs.

Look for:
1. Twitter/X profile URL
2. GitHub profile URL
3. Personal website or blog URL
4. Other professional profiles (Medium, Substack, etc.)

Format your response as JSON ONLY:
{
  "twitter_url": "actual URL or NOT_FOUND",
  "github_url": "actual URL or NOT_FOUND",
  "personal_website": "actual URL or NOT_FOUND",
  "blog_url": "actual URL or NOT_FOUND",
  "other_urls": ["only real URLs found"]
}`;

    try {
      const baseUrl = process.env.OPENROUTER_API_KEY
        ? 'https://openrouter.ai/api/v1'
        : 'https://api.perplexity.ai';

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(process.env.OPENROUTER_API_KEY && { 'HTTP-Referer': 'https://twinme.app' })
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-001',
          messages: [{ role: 'user', content: searchQuery }],
          max_tokens: 300
        })
      });

      if (!response.ok) {
        console.log('[ProfileEnrichment] Social profile search failed:', response.status);
        return { success: false, webFindings: null };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      console.log('[ProfileEnrichment] Social profile search result:', content.substring(0, 200));

      // Parse JSON response
      const webFindings = this.parseSocialProfileResponse(content);

      return {
        success: true,
        webFindings,
        rawContent: content
      };

    } catch (error) {
      console.error('[ProfileEnrichment] Social profile search error:', error);
      return { success: false, webFindings: null };
    }
  }

  /**
   * Parse social profile search response
   */
  parseSocialProfileResponse(content) {
    const findings = {
      twitter_url: null,
      github_url: null,
      personal_website: null,
      blog_url: null,
      other_urls: []
    };

    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Only use URLs that are actually valid (not "NOT_FOUND" or empty)
        if (parsed.twitter_url && parsed.twitter_url !== 'NOT_FOUND' && parsed.twitter_url.startsWith('http')) {
          findings.twitter_url = parsed.twitter_url;
        }
        if (parsed.github_url && parsed.github_url !== 'NOT_FOUND' && parsed.github_url.startsWith('http')) {
          findings.github_url = parsed.github_url;
        }
        if (parsed.personal_website && parsed.personal_website !== 'NOT_FOUND' && parsed.personal_website.startsWith('http')) {
          findings.personal_website = parsed.personal_website;
        }
        if (parsed.blog_url && parsed.blog_url !== 'NOT_FOUND' && parsed.blog_url.startsWith('http')) {
          findings.blog_url = parsed.blog_url;
        }
        if (Array.isArray(parsed.other_urls)) {
          findings.other_urls = parsed.other_urls.filter(url => url && url.startsWith('http'));
        }
      }
    } catch (e) {
      console.log('[ProfileEnrichment] Could not parse social profile JSON:', e.message);
    }

    return findings;
  }

  /**
   * Build a factual summary ONLY from real data - NO hallucination
   */
  buildFactualSummary(data) {
    const name = data.discovered_name || 'This person';
    const title = data.discovered_title || '';
    const company = data.discovered_company || '';
    const location = data.discovered_location || '';
    const industry = data.scrapin_industry || '';
    const summary = data.scrapin_summary || '';
    const careerTimeline = data.career_timeline || '';

    // Start with LinkedIn summary if available (this is real user-written data)
    if (summary) {
      return summary;
    }

    // If we have career_timeline (from Perplexity), extract key info from it
    if (careerTimeline && careerTimeline.length > 100) {
      // Extract the first sentence or paragraph as the summary
      // Clean up markdown formatting
      let cleanCareer = careerTimeline
        .replace(/\*\*/g, '')  // Remove bold markers
        .replace(/\[[\d,]+\]/g, '')  // Remove citation markers like [1][2]
        .replace(/\n#+\s+/g, ' ')  // Remove markdown headers
        .replace(/\n-\s+/g, ' ')  // Remove list markers
        .replace(/\n+/g, ' ')  // Replace newlines with spaces
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .trim();

      // Get the first few sentences (up to ~400 chars)
      const sentences = cleanCareer.match(/[^.!?]+[.!?]+/g) || [cleanCareer];
      let bio = '';
      for (const sentence of sentences) {
        if (bio.length + sentence.length > 400) break;
        bio += sentence;
      }

      if (bio.length > 50) {
        return bio.trim();
      }
    }

    // Otherwise build from factual data only
    let bio = name;
    if (title && company) {
      bio += ` is ${title} at ${company}`;
    } else if (title) {
      bio += ` works as ${title}`;
    } else if (company) {
      bio += ` works at ${company}`;
    }
    if (location) {
      bio += ` based in ${location}`;
    }
    if (industry) {
      bio += `. Works in the ${industry} industry`;
    }
    bio += '.';

    return bio;
  }

  /**
   * Extract company from Scrapin person data
   */
  extractScrapinCompany(person) {
    // Scrapin returns headline which often contains company
    // Format is usually "Title at Company"
    if (person.headline) {
      const atMatch = person.headline.match(/\bat\s+(.+?)(?:\s*[|\-•]|$)/i);
      if (atMatch) {
        return atMatch[1].trim();
      }
    }
    return null;
  }

  /**
   * Extract title from Scrapin person data
   */
  extractScrapinTitle(person) {
    if (person.headline) {
      // Title is usually before "at Company"
      const titleMatch = person.headline.match(/^(.+?)\s+at\s+/i);
      if (titleMatch) {
        return titleMatch[1].trim();
      }
      // If no "at", return first part before any separator
      const parts = person.headline.split(/[|\-•]/);
      if (parts.length > 0) {
        return parts[0].trim();
      }
    }
    return null;
  }

  /**
   * Format location from Scrapin response
   */
  formatScrapinLocation(location) {
    if (!location) return null;

    // Handle object location
    if (typeof location === 'object') {
      const parts = [];
      if (location.city) parts.push(location.city);
      if (location.state) parts.push(location.state);
      if (location.country) parts.push(location.country);
      return parts.length > 0 ? parts.join(', ') : null;
    }

    // Handle string location
    return typeof location === 'string' ? location : null;
  }

  /**
   * Call Reverse Contact API for real-time OSINT enrichment
   * https://docs.reversecontact.com/endpoint/ReverseEmailLookup
   *
   * Returns person data (LinkedIn info, name, title, location, etc.)
   * and company data (website, name, logo, industry, size)
   */
  async callReverseContactAPI(email, name, apiKey) {
    console.log('[ProfileEnrichment] Calling Reverse Contact API...');

    try {
      // Build query parameters
      const params = new URLSearchParams({
        apikey: apiKey,
        email: email
      });

      // Add optional parameters for better matching
      if (name) {
        const nameParts = name.split(' ');
        if (nameParts.length >= 2) {
          params.append('firstName', nameParts[0]);
          params.append('lastName', nameParts.slice(1).join(' '));
        }
      }

      const response = await fetch(`https://api.reversecontact.com/enrichment?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[ProfileEnrichment] Reverse Contact API error: ${response.status} - ${errorText}`);

        // Handle specific error codes
        if (response.status === 404) {
          return { success: false, data: null, error: 'No match found' };
        }
        if (response.status === 402) {
          console.warn('[ProfileEnrichment] Reverse Contact: Insufficient credits');
          return { success: false, data: null, error: 'Insufficient credits' };
        }

        return { success: false, data: null, error: `API error: ${response.status}` };
      }

      const result = await response.json();
      console.log('[ProfileEnrichment] Reverse Contact response:', JSON.stringify(result).substring(0, 500));

      // Check if we got a match (person or company data)
      if (!result.success || (!result.person && !result.company)) {
        console.log('[ProfileEnrichment] Reverse Contact: No match found');
        return { success: false, data: null };
      }

      const person = result.person || {};
      const company = result.company || {};

      console.log('[ProfileEnrichment] Reverse Contact found:', {
        hasPerson: !!result.person,
        hasCompany: !!result.company,
        personName: person.firstName ? `${person.firstName} ${person.lastName}` : null
      });

      // Map Reverse Contact response to our enrichment format
      const enrichmentData = {
        discovered_name: person.firstName && person.lastName
          ? `${person.firstName} ${person.lastName}`
          : name,
        discovered_company: company.name || this.extractCompanyFromPerson(person),
        discovered_title: person.headline || person.positions?.[0]?.title || null,
        discovered_location: this.formatRCLocation(person.location),
        discovered_linkedin_url: person.linkedInUrl || null,
        discovered_twitter_url: null, // Reverse Contact doesn't provide Twitter
        discovered_github_url: null, // Reverse Contact doesn't provide GitHub
        discovered_bio: person.headline || null,
        // Additional data from Reverse Contact
        rc_photo_url: person.photoUrl || null,
        rc_company_logo: company.logo || null,
        rc_company_website: company.websiteUrl || null,
        rc_company_industry: company.industry || null,
        rc_company_size: company.employeeCountRange || null,
        rc_positions: person.positions || [],
        rc_education: person.schools || [],
        rc_skills: person.skills || [],
        rc_credits_left: result.credits_left,
        rc_email_type: result.emailType
      };

      return {
        success: true,
        data: enrichmentData,
        raw: result
      };

    } catch (error) {
      console.error('[ProfileEnrichment] Reverse Contact API request failed:', error);
      return { success: false, data: null, error: error.message };
    }
  }

  /**
   * Extract company name from person's current position
   */
  extractCompanyFromPerson(person) {
    if (person.positions && person.positions.length > 0) {
      // Find current position (no end date)
      const currentPosition = person.positions.find(p => !p.endDate);
      if (currentPosition && currentPosition.companyName) {
        return currentPosition.companyName;
      }
      // Fall back to first position
      return person.positions[0].companyName || null;
    }
    return null;
  }

  /**
   * Format location from Reverse Contact response
   */
  formatRCLocation(location) {
    if (!location) return null;

    // Handle string location
    if (typeof location === 'string') return location;

    // Handle object location
    const parts = [];
    if (location.city) parts.push(location.city);
    if (location.state) parts.push(location.state);
    if (location.country) parts.push(location.country);

    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * Enrich profile from a provided LinkedIn URL
   * Uses Perplexity to search for information about the person from their LinkedIn
   */
  async enrichFromLinkedIn(linkedinUrl, name = null) {
    console.log(`[ProfileEnrichment] Enriching from LinkedIn URL: ${linkedinUrl}`);

    // Extract username from LinkedIn URL
    const usernameMatch = linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/i);
    const linkedinUsername = usernameMatch ? usernameMatch[1] : null;

    if (!linkedinUsername) {
      return {
        success: false,
        error: 'Could not extract username from LinkedIn URL',
        data: null
      };
    }

    // Build a targeted search query using the LinkedIn URL
    const query = `Search for the LinkedIn profile at ${linkedinUrl}. The person's name is ${name || linkedinUsername}.

Find ONLY verified, factual information about THIS specific person at this LinkedIn URL:
- Full name
- Current job title and company
- Location (city, country)
- Professional summary or bio
- Twitter/X, GitHub, or personal website (if found)

CRITICAL RULES:
1. ONLY report facts you can verify from search results about the person at ${linkedinUrl}. Do NOT guess or fill gaps.
2. If you find multiple people with this name, ONLY describe the one matching this LinkedIn URL: ${linkedinUrl}. If unsure which person matches, return null for uncertain fields.
3. Do NOT invent universities, degrees, job titles, or companies. If you cannot find it, use null.
4. The LinkedIn username "${linkedinUsername}" is the primary identifier — all data must match THIS profile.

Return the findings in JSON format.`;

    try {
      const searchResponse = await this.callPerplexityAPI(query);

      if (!searchResponse.success) {
        console.error('[ProfileEnrichment] LinkedIn API call failed:', searchResponse.error);
        return {
          success: false,
          error: searchResponse.error,
          data: null
        };
      }

      // Parse the response
      const enrichmentData = this.parseEnrichmentResponse(
        searchResponse.content,
        null,
        name || linkedinUsername
      );

      // Ensure the LinkedIn URL is set
      enrichmentData.discovered_linkedin_url = linkedinUrl;

      console.log(`[ProfileEnrichment] LinkedIn enrichment complete:`, {
        hasCompany: !!enrichmentData.discovered_company,
        hasTitle: !!enrichmentData.discovered_title,
        hasLinkedIn: !!enrichmentData.discovered_linkedin_url
      });

      return {
        success: true,
        data: {
          ...enrichmentData,
          search_query: query,
          raw_search_response: searchResponse.raw,
          source: 'linkedin_url'
        }
      };
    } catch (error) {
      console.error('[ProfileEnrichment] LinkedIn enrichment error:', error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Call Perplexity Sonar API via OpenRouter
   * OpenRouter provides access to Perplexity models with a unified API
   */
  async callPerplexityAPI(query) {
    // Try OpenRouter first, fall back to direct Perplexity API
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const perplexityKey = process.env.PERPLEXITY_API_KEY;

    const apiKey = openRouterKey || perplexityKey;
    const useOpenRouter = !!openRouterKey;

    if (!apiKey) {
      console.warn('[ProfileEnrichment] No API key configured (OPENROUTER_API_KEY or PERPLEXITY_API_KEY)');
      return {
        success: false,
        error: 'API key not configured',
        content: null,
        raw: null
      };
    }

    const apiUrl = useOpenRouter
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.perplexity.ai/chat/completions';

    // Use Sonar Pro for web search (has native built-in search)
    const model = useOpenRouter ? 'perplexity/sonar-pro' : 'sonar';

    console.log(`[ProfileEnrichment] Using ${useOpenRouter ? 'OpenRouter (Sonar Pro)' : 'Perplexity'} API`);

    try {
      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };

      // OpenRouter requires additional headers
      if (useOpenRouter) {
        headers['HTTP-Referer'] = process.env.APP_URL || 'http://localhost:8086';
        headers['X-Title'] = 'Twin AI Learn';
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: `You are a professional research assistant. Search thoroughly to find publicly available information about a specific individual.

Search across LinkedIn, Twitter/X, GitHub, personal websites, company pages, and other public sources.

RULES:
1. Search thoroughly before concluding you cannot find information. Try multiple search queries.
2. If you find multiple people with similar names, report information about the specific person identified in the query. If unsure which person, use null for uncertain fields rather than guessing the wrong person.
3. Do NOT fabricate information. Only report what you find in search results.
4. Partial data is valuable — if you find even a LinkedIn URL or location, include it.

Return your findings as JSON with these exact fields:
{
  "name": "Full Name",
  "company": "Current Company or null",
  "title": "Job Title or null",
  "location": "City, Country or null",
  "linkedin_url": "LinkedIn URL or null",
  "twitter_url": "Twitter/X URL or null",
  "github_url": "GitHub URL or null",
  "bio": "Brief factual summary (1-2 sentences) or null"
}`
            },
            {
              role: 'user',
              content: query
            }
          ],
          temperature: 0.3,
          max_tokens: 4000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ProfileEnrichment] API error:', errorText);
        return {
          success: false,
          error: `API error: ${response.status}`,
          content: null,
          raw: null
        };
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || '';

      // Log the raw response for debugging
      console.log('[ProfileEnrichment] Raw API response:', JSON.stringify(result, null, 2).substring(0, 2000));
      console.log('[ProfileEnrichment] Extracted content:', content.substring(0, 1000));

      return {
        success: true,
        content,
        raw: result
      };
    } catch (error) {
      console.error('[ProfileEnrichment] API request failed:', error);
      return {
        success: false,
        error: error.message,
        content: null,
        raw: null
      };
    }
  }

  /**
   * Generate a narrative summary from structured profile data
   * Uses Perplexity Sonar to create a natural language description
   * @param {Object} profileData - Structured data from Scrapin.io or other providers
   * @returns {Promise<string|null>} Narrative summary or null if generation fails
   */
  async generateSummary(profileData) {
    console.log('[ProfileEnrichment] Generating narrative summary...');

    const name = profileData.discovered_name || 'Unknown';
    const company = profileData.discovered_company || 'Unknown company';
    const title = profileData.discovered_title || 'Unknown position';
    const location = profileData.discovered_location || '';
    const bio = profileData.discovered_bio || '';

    const prompt = `Based on the following profile information, write a brief 2-3 sentence summary about this person in a friendly, professional tone. Focus on who they are and what they do.

Profile Information:
- Name: ${name}
- Current Role: ${title}
- Company/Organization: ${company}
${location ? `- Location: ${location}` : ''}
${bio ? `- Bio: ${bio}` : ''}

Write a natural, conversational summary (2-3 sentences) that I can show to this person to confirm their identity. Start with their name and current role. Be concise but informative.

IMPORTANT: Write ONLY the summary paragraph. Do not include any prefixes like "Here's a summary" or "Based on the information". Just write the summary directly.`;

    try {
      const apiKey = process.env.OPENROUTER_API_KEY || process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        console.log('[ProfileEnrichment] No API key for summary generation');
        return null;
      }

      const baseUrl = process.env.OPENROUTER_API_KEY
        ? 'https://openrouter.ai/api/v1'
        : 'https://api.perplexity.ai';

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(process.env.OPENROUTER_API_KEY ? { 'HTTP-Referer': 'https://twinme.ai' } : {})
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_API_KEY
            ? 'anthropic/claude-3.5-haiku'
            : 'sonar',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.5,
          max_tokens: 300
        })
      });

      if (!response.ok) {
        console.error('[ProfileEnrichment] Summary generation API error:', response.status);
        return null;
      }

      const result = await response.json();
      let summary = result.choices?.[0]?.message?.content?.trim();

      if (summary && summary.length > 20) {
        // Clean up any prefixes the model might add
        const prefixPatterns = [
          /^here'?s?\s*(a|the)?\s*(?:draft)?\s*summary:?\s*/i,
          /^based on (?:the|this) (?:profile )?information[,:]?\s*/i,
          /^summary:?\s*/i
        ];
        for (const pattern of prefixPatterns) {
          summary = summary.replace(pattern, '');
        }
        summary = summary.trim();

        console.log('[ProfileEnrichment] Generated summary:', summary);
        return summary;
      }

      return null;
    } catch (error) {
      console.error('[ProfileEnrichment] Summary generation failed:', error.message);
      return null;
    }
  }

  /**
   * Parse Perplexity response into structured enrichment data
   * Extracts both the narrative summary AND structured fields
   */
  parseEnrichmentResponse(content, email, providedName) {
    const enrichment = {
      email,
      discovered_name: providedName || null,
      discovered_company: null,
      discovered_title: null,
      discovered_location: null,
      discovered_linkedin_url: null,
      discovered_twitter_url: null,
      discovered_github_url: null,
      discovered_bio: null,
      discovered_summary: null  // NEW: Detailed narrative paragraph
    };

    if (!content) {
      return enrichment;
    }

    // Check if the response indicates no information was found
    const notFoundIndicators = [
      'could not find',
      'no information',
      'not found',
      'no results',
      'do not contain information',
      'cannot find',
      'unable to find',
      'unable to retrieve',
      'unable to locate',
      'could not be accessed',
      'was unable to',
      'don\'t have',
      'doesn\'t contain',
      'no publicly available',
      'I recommend',
      'search directly',
      'I would need to perform',
      'search limitations',
      'search attempts'
    ];

    const lowerContent = content.toLowerCase();
    const isNotFound = notFoundIndicators.some(indicator => lowerContent.includes(indicator));

    // Extract the SUMMARY section if present
    const summaryMatch = content.match(/SUMMARY:\s*\n?([\s\S]*?)(?=\n\s*JSON:|$)/i);
    if (summaryMatch && summaryMatch[1]) {
      const summary = summaryMatch[1].trim();
      // Only use if it's a meaningful summary (not just "could not find")
      if (summary.length > 50 && !notFoundIndicators.some(ind => summary.toLowerCase().includes(ind))) {
        enrichment.discovered_summary = summary;
      }
    }

    // If no SUMMARY section, try to extract a narrative from the beginning of the response
    if (!enrichment.discovered_summary && !isNotFound) {
      // Look for the first paragraph that's not JSON
      const paragraphs = content.split(/\n\n+/);
      for (const para of paragraphs) {
        const trimmed = para.trim();
        // Skip if it looks like JSON or is too short
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && trimmed.length > 100) {
          // Check if this looks like a summary paragraph
          if (!trimmed.toLowerCase().startsWith('json') && !trimmed.toLowerCase().startsWith('summary')) {
            enrichment.discovered_summary = trimmed;
            break;
          }
        }
      }
    }

    // Even if "not found" indicators present, still try to parse JSON for partial info
    // The API might return "not found" for LinkedIn but still have a bio

    try {
      // Try to parse JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Validate parsed values - filter out obviously wrong data
        const validateValue = (val) => {
          if (!val || val === 'null' || val === 'undefined') return null;
          if (typeof val !== 'string') return null;

          const lowerVal = val.toLowerCase();
          // Filter out error messages and explanation text that got parsed as values
          const invalidPatterns = [
            'not found',
            'no information',
            'provided to me',
            'search results',
            'would help',
            'narrow down',
            'more context',
            'please provide',
            'unable to',
            'could not',
            'cannot find',
            'no publicly',
            'if you have',
            'help narrow',
            'or company',
            'affiliation',
            'limited public'
          ];

          if (invalidPatterns.some(pattern => lowerVal.includes(pattern))) return null;
          if (val.length < 2 || val.length > 200) return null;

          return val;
        };

        enrichment.discovered_name = validateValue(parsed.name) || providedName || null;
        enrichment.discovered_company = validateValue(parsed.company);
        enrichment.discovered_title = validateValue(parsed.title);
        enrichment.discovered_location = validateValue(parsed.location);
        enrichment.discovered_linkedin_url = this.validateUrl(parsed.linkedin_url, 'linkedin.com');
        enrichment.discovered_twitter_url = this.validateUrl(parsed.twitter_url, 'twitter.com') ||
                                            this.validateUrl(parsed.twitter_url, 'x.com');
        enrichment.discovered_github_url = this.validateUrl(parsed.github_url, 'github.com');

        // Bio validation is less strict - allow "limited public" since it might contain useful context
        const validateBio = (val) => {
          if (!val || val === 'null' || val === 'undefined') return null;
          if (typeof val !== 'string') return null;
          if (val.length < 10 || val.length > 500) return null;
          // Only filter out pure "no info" bios
          const lowerVal = val.toLowerCase();
          if (lowerVal === 'not found' || lowerVal === 'no information available') return null;
          return val;
        };
        enrichment.discovered_bio = validateBio(parsed.bio);
      } else {
        // Fallback: Extract info using regex patterns
        enrichment.discovered_linkedin_url = this.extractUrl(content, /https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w-]+/i);
        enrichment.discovered_twitter_url = this.extractUrl(content, /https?:\/\/(?:www\.)?(twitter|x)\.com\/[\w-]+/i);
        enrichment.discovered_github_url = this.extractUrl(content, /https?:\/\/(?:www\.)?github\.com\/[\w-]+/i);

        // Try to extract company and title from text (only if not a "not found" response)
        if (!isNotFound) {
          const companyMatch = content.match(/(?:works? at|employed by|at|CEO of|founder of)\s+([A-Z][A-Za-z0-9\s&]+?)(?:\.|,|\s+as|\s+where)/i);
          if (companyMatch && companyMatch[1].length > 2 && companyMatch[1].length < 50) {
            enrichment.discovered_company = companyMatch[1].trim();
          }

          const titleMatch = content.match(/(?:is a|works? as a?|position:?|title:?|serves as)\s+([A-Z][A-Za-z0-9\s&]+?)(?:\.|,|\s+at|\s+for)/i);
          if (titleMatch && titleMatch[1].length > 2 && titleMatch[1].length < 50) {
            enrichment.discovered_title = titleMatch[1].trim();
          }
        }
      }
    } catch (error) {
      console.warn('[ProfileEnrichment] Failed to parse response:', error.message);
    }

    return enrichment;
  }

  /**
   * Validate a URL belongs to expected domain
   */
  validateUrl(url, expectedDomain) {
    if (!url || typeof url !== 'string') return null;
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes(expectedDomain)) {
        return url;
      }
    } catch {
      // Invalid URL
    }
    return null;
  }

  /**
   * Extract URL using regex
   */
  extractUrl(text, pattern) {
    const match = text.match(pattern);
    return match ? match[0] : null;
  }

  /**
   * Save enrichment data to database
   */
  async saveEnrichment(userId, email, enrichmentData) {
    console.log(`[ProfileEnrichment] Saving enrichment for user ${userId}`);

    try {
      // Only save fields that exist in the database schema
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
        source: enrichmentData.source || 'unknown',
        raw_search_response: enrichmentData.raw || enrichmentData.raw_search_response || null,
        search_query: enrichmentData.search_query || null,
        enriched_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('enriched_profiles')
        .upsert(dbFields, {
          onConflict: 'user_id'
        })
        .select()
        .single();

      if (error) {
        console.error('[ProfileEnrichment] Failed to save enrichment:', error);
        throw error;
      }

      console.log(`[ProfileEnrichment] Enrichment saved successfully:`, data.id);
      return { success: true, data };
    } catch (error) {
      console.error('[ProfileEnrichment] Save error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get enrichment data for a user
   */
  async getEnrichment(userId) {
    try {
      const { data, error } = await supabase
        .from('enriched_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        throw error;
      }

      return { success: true, data: data || null };
    } catch (error) {
      console.error('[ProfileEnrichment] Get error:', error);
      return { success: false, error: error.message, data: null };
    }
  }

  /**
   * Confirm enrichment data with user corrections
   */
  async confirmEnrichment(userId, confirmedData, corrections = null) {
    console.log(`[ProfileEnrichment] Confirming enrichment for user ${userId}`);

    try {
      const { data, error } = await supabase
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
        console.error('[ProfileEnrichment] Failed to confirm enrichment:', error);
        throw error;
      }

      console.log(`[ProfileEnrichment] Enrichment confirmed for user ${userId}`);
      return { success: true, data };
    } catch (error) {
      console.error('[ProfileEnrichment] Confirm error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check enrichment status for a user
   */
  async getEnrichmentStatus(userId) {
    try {
      const { data, error } = await supabase
        .from('enriched_profiles')
        .select('id, enriched_at, user_confirmed, confirmed_at, discovered_company, discovered_title')
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
        hasTitle: !!data.discovered_title
      };
    } catch (error) {
      console.error('[ProfileEnrichment] Status error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reset confirmation status for testing
   */
  async resetConfirmation(userId) {
    console.log(`[ProfileEnrichment] Resetting confirmation for user ${userId}`);

    try {
      const { data, error } = await supabase
        .from('enriched_profiles')
        .update({
          user_confirmed: false,
          confirmed_at: null
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('[ProfileEnrichment] Reset error:', error);
        return { success: false, error: error.message };
      }

      return {
        success: true,
        message: 'Confirmation reset successfully',
        data
      };
    } catch (error) {
      console.error('[ProfileEnrichment] Reset error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
export const profileEnrichmentService = new ProfileEnrichmentService();
export default profileEnrichmentService;
