import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Profile Enrichment Service
 *
 * Waterfall enrichment strategy for accurate profile discovery:
 *
 * Providers (in order of preference):
 * 1. Scrapin.io - Real-time LinkedIn data, email-to-profile resolution
 * 2. People Data Labs - 3B+ profiles, accurate LinkedIn/company data
 * 3. Reverse Contact - Real-time OSINT, GDPR/CCPA compliant
 * 4. Perplexity Sonar - Web search for additional context
 *
 * Cost estimate:
 * - Scrapin.io: $30 trial (500 credits), then $0.02/credit
 * - People Data Labs: Free tier 100 req/month, then ~$0.10/lookup
 * - Reverse Contact: 20 free requests, then paid plans (1 credit/lookup)
 * - Perplexity Sonar API: ~$5/1000 searches + ~$1/M tokens
 */
class ProfileEnrichmentService {
  /**
   * Enrich a user profile from their email and name
   * @param {string} email - User's email address
   * @param {string} name - User's full name (optional)
   * @returns {Promise<Object>} Enrichment data with discovered fields
   */
  async enrichFromEmail(email, name = null) {
    console.log(`[ProfileEnrichment] Starting enrichment for: ${email}`);
    console.log(`[ProfileEnrichment] API keys loaded:`, {
      scrapin: !!process.env.SCRAPIN_API_KEY,
      pdl: !!process.env.PDL_API_KEY
    });

    // Try multiple providers in order of preference
    const scrapinKey = process.env.SCRAPIN_API_KEY;
    const pdlKey = process.env.PDL_API_KEY;
    let linkedInData = null;
    let fullProfileData = null;
    let enrichmentSource = 'none';

    // 1. Try People Data Labs first (3B profile database - best match rates)
    if (pdlKey && !linkedInData) {
      console.log('[ProfileEnrichment] Trying People Data Labs API (3B profiles)...');
      const pdlResult = await this.callPeopleDataLabsAPI(email, name, pdlKey);
      if (pdlResult.success && pdlResult.data) {
        console.log('[ProfileEnrichment] PDL found profile!');
        linkedInData = this.convertPDLToEnrichment(pdlResult.data);
        fullProfileData = linkedInData;
        enrichmentSource = 'pdl';
      } else {
        console.log('[ProfileEnrichment] PDL: no match found');
      }
    }

    // 2. Try Scrapin.io email lookup (real-time LinkedIn lookup)
    if (scrapinKey && !linkedInData) {
      console.log('[ProfileEnrichment] Trying Scrapin.io email lookup...');
      const scrapinResult = await this.callScrapinAPI(email, name, scrapinKey);
      if (scrapinResult.success && scrapinResult.data) {
        console.log('[ProfileEnrichment] Scrapin.io found LinkedIn data!');
        linkedInData = scrapinResult.data;
        enrichmentSource = 'scrapin';

        // Check if email response already has career data
        const hasCareerData = linkedInData.career_timeline || linkedInData.education || linkedInData.skills;

        if (!hasCareerData && linkedInData.discovered_linkedin_url) {
          console.log('[ProfileEnrichment] Fetching full profile from LinkedIn URL...');
          const fullProfile = await this.fetchScrapinFullProfile(linkedInData.discovered_linkedin_url, scrapinKey);
          if (fullProfile.success && fullProfile.data) {
            console.log('[ProfileEnrichment] Got full profile!');
            fullProfileData = fullProfile.data;
            linkedInData = { ...linkedInData, ...fullProfileData };
            enrichmentSource = 'scrapin_full';
          }
        } else if (hasCareerData) {
          fullProfileData = linkedInData;
        }
      } else {
        console.log('[ProfileEnrichment] Scrapin.io email lookup: no match');
      }
    }

    // 3. NEW: If no LinkedIn data yet, use web search to FIND LinkedIn URL, then fetch profile
    console.log('[ProfileEnrichment] Step 3 check:', {
      hasScrapinKey: !!scrapinKey,
      hasLinkedInData: !!linkedInData,
      hasName: !!name,
      hasEmail: !!email
    });
    if (scrapinKey && !linkedInData && (name || email)) {
      console.log('[ProfileEnrichment] Trying web search to find LinkedIn URL...');
      const linkedInUrl = await this.findLinkedInUrlViaWebSearch(email, name);

      if (linkedInUrl) {
        console.log('[ProfileEnrichment] Found LinkedIn URL via web search:', linkedInUrl);
        const fullProfile = await this.fetchScrapinFullProfile(linkedInUrl, scrapinKey);
        if (fullProfile.success && fullProfile.data) {
          // Verify the profile name matches what we're looking for
          const profileName = fullProfile.data.discovered_name || '';
          const searchName = name || '';
          console.log(`[ProfileEnrichment] NAME VERIFICATION: Profile="${profileName}" Search="${searchName}"`);
          const nameMatch = this.verifyNameMatch(profileName, searchName);
          console.log(`[ProfileEnrichment] NAME MATCH RESULT: ${nameMatch}`);

          if (nameMatch) {
            console.log('[ProfileEnrichment] Profile name matches! Using LinkedIn data.');
            fullProfileData = fullProfile.data;
            linkedInData = {
              discovered_name: name,
              discovered_linkedin_url: linkedInUrl,
              ...fullProfileData
            };
            enrichmentSource = 'websearch+scrapin';
          } else {
            console.log(`[ProfileEnrichment] Name mismatch! Profile: "${profileName}", Search: "${searchName}". Skipping LinkedIn data.`);
            // Keep the LinkedIn URL but don't use the profile data (wrong person)
            linkedInData = {
              discovered_name: name,
              discovered_linkedin_url: null // Don't include wrong profile URL
            };
          }
        }
      } else {
        console.log('[ProfileEnrichment] Could not find LinkedIn URL via web search');
      }
    }

    // 4. ALWAYS do a comprehensive Perplexity search to find EVERYTHING about the person
    // This is the key to cofounder.co-style detailed narratives
    console.log('[ProfileEnrichment] Running comprehensive person search with Perplexity...');
    const comprehensiveData = await this.comprehensivePersonSearch(name, email, linkedInData);
    if (comprehensiveData) {
      console.log('[ProfileEnrichment] Found comprehensive data from Perplexity!');
      linkedInData = {
        ...linkedInData,
        career_timeline: comprehensiveData.career_timeline || linkedInData?.career_timeline,
        education: comprehensiveData.education || linkedInData?.education,
        achievements: comprehensiveData.achievements,
        skills: comprehensiveData.skills,
        languages: comprehensiveData.languages,
        certifications: comprehensiveData.certifications,
        publications: comprehensiveData.publications,
        comprehensive_source: 'perplexity'
      };
      enrichmentSource = enrichmentSource !== 'none' ? enrichmentSource + '+comprehensive' : 'comprehensive';
    }

    // 5. Fallback: If still no career data, try basic career history search
    if (name && (!linkedInData?.career_timeline || linkedInData.career_timeline === null)) {
      console.log('[ProfileEnrichment] Still no career data, trying basic career history search...');
      const careerData = await this.searchWebForCareerHistory(name, linkedInData?.discovered_company);
      if (careerData) {
        console.log('[ProfileEnrichment] Found career data from web search!');
        linkedInData = {
          ...linkedInData,
          career_timeline: careerData.career_timeline,
          education: careerData.education,
          career_source: 'web_search'
        };
        if (enrichmentSource === 'websearch+scrapin') {
          enrichmentSource = 'websearch+scrapin+career';
        } else if (enrichmentSource !== 'none') {
          enrichmentSource = enrichmentSource + '+career';
        } else {
          enrichmentSource = 'web_career';
        }
      }
    }

    // Search web for additional social profiles (Twitter, GitHub, etc.)
    console.log('[ProfileEnrichment] Searching web for additional social profiles...');
    const webSearchResult = await this.searchWebForSocialProfiles(email, name, linkedInData);

    // Combine LinkedIn data with web search results
    const combinedData = this.combineEnrichmentSources(linkedInData, webSearchResult, email, name);

    // Generate a DETAILED narrative like cofounder.co using AI
    const detailedNarrative = await this.generateDetailedNarrative(combinedData, name);

    // Fall back to basic summary if AI narrative fails
    const summary = detailedNarrative || this.buildFactualSummary(combinedData);

    return {
      success: true,
      data: {
        ...combinedData,
        discovered_summary: summary,
        source: enrichmentSource !== 'none' ? enrichmentSource : 'web',
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

    // If we have raw comprehensive search data, include it
    if (data.raw_comprehensive && data.raw_comprehensive.length > 200) {
      dataPoints.push(`\nAdditional research findings:\n${data.raw_comprehensive}`);
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

    const prompt = `Write a comprehensive professional biography as ONE FLOWING PARAGRAPH. Use ALL the data provided.

DATA:
${filteredDataPoints.join('\n')}

STYLE GUIDE (follow this exactly):
Write like cofounder.co - a rich, detailed narrative covering:
1. Professional identity and years of experience
2. Current role with company name and start date
3. Previous roles in reverse chronological order with dates, companies, and specific achievements (include $ amounts, percentages, team sizes)
4. Any ventures founded/co-founded with dates and metrics
5. Areas of expertise
6. Education with degree names, schools, and years
7. Nationality and languages spoken
8. Certifications
9. Location and professional network size
10. End with personal values or what drives them (if available)

IMPORTANT: Do NOT mention "LinkedIn" anywhere in the output. Use phrases like "professional network" or "industry connections" instead.

EXAMPLE OUTPUT (PROFESSIONAL):
"Sebastián Izurieta is a finance-driven investment professional with over 11 years of experience in private investments, complex financial modeling, and long-term value strategy across global markets. Currently serving as Principal Financial Analyst at NextEra Energy Resources (since September 2025), he previously held the position of Vice President at Albright Capital (May 2023 - August 2025), where he led valuation analyses and strategic assessments on four portfolio investments totaling $125M in assets under management, achieving a +1.4x increase in value in two holdings. He holds an MBA from University of Virginia Darden School of Business (2021-2023) and a Bachelor's degree in Accounting and Financial Strategy from Instituto Tecnológico Autónomo de México (2011-2016). A dual U.S.-Mexico citizen fluent in English and Spanish, he holds certifications in Renewable Energy Project Finance Modeling. Based in Madrid, Spain, with an extensive professional network of over 500 connections, he is driven by analytical rigor and long-term value creation."

STRICT RULES (VIOLATION = FAILURE):
- ONE continuous paragraph, no line breaks
- Include EVERY date, number, and metric from the data
- NEVER FABRICATE OR INVENT any information not explicitly provided in the DATA section above
- If the data shows someone is a Professor, Co-founder, CEO, etc. - describe them as such, NOT as a student
- NEVER mention "LinkedIn" - use "professional network" or "industry connections" instead

**USING CAREER HISTORY DATA:**
If the data includes "Career history:" - this is REAL VERIFIED DATA that you MUST use!
Extract and include:
- All job titles and companies mentioned
- All education/specializations mentioned
- Any achievements (Forbes Under 30, etc.)
- Any company details (locations, focus areas)
This data came from verified sources like company websites, news, and public records.

**ANTI-FABRICATION RULES:**
- If someone is listed as "Professor" or "Co-founder" - they are NOT a student
- Do NOT assume someone is a student unless the data explicitly says "student"
- Do NOT invent institutions, dates, or achievements not in the data
- It is BETTER to write 3 accurate sentences from real data than 1 generic fabricated one

CRITICAL:
- Output ONLY the biography paragraph
- NEVER mention LinkedIn
- USE all the Career history data provided - it is verified
- Do NOT be overly cautious - if data says "Professor at SingularityU", write that

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

        // Remove "Note:" sections and anything after
        cleanNarrative = cleanNarrative.split(/\n\s*Note:/i)[0].trim();
        cleanNarrative = cleanNarrative.split(/\n\s*\(Note:/i)[0].trim();

        // Remove any lines that are clearly meta-commentary
        const lines = cleanNarrative.split('\n');
        const cleanLines = lines.filter(line => {
          const lower = line.toLowerCase();
          return !lower.startsWith('note:') &&
                 !lower.startsWith('i\'ve kept') &&
                 !lower.startsWith('following the') &&
                 !lower.includes('the provided data only') &&
                 !lower.includes('i cannot provide');
        });
        cleanNarrative = cleanLines.join(' ').replace(/\s+/g, ' ').trim();

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
   * Comprehensive person search using Perplexity Sonar Pro
   * This is the key to cofounder.co-style detailed narratives
   * Searches across LinkedIn, Wikipedia, Crunchbase, news, company bios, etc.
   */
  async comprehensivePersonSearch(name, email, existingData = {}) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || !name) {
      console.log('[ProfileEnrichment] Cannot do comprehensive search - no API key or name');
      return null;
    }

    // Detect if this is a student/early-career person from Scrapin headline
    const headline = existingData?.scrapin_headline || existingData?.discovered_title || '';
    const isStudent = /student|studying|university|college|pursuing|graduate|undergraduate|freshman|sophomore|junior|senior/i.test(headline);
    const schoolMatch = headline.match(/(?:student at|studying at|at)\s+([^,|]+)/i);
    const schoolName = schoolMatch ? schoolMatch[1].trim() : null;

    console.log('[ProfileEnrichment] Profile type detection:', { isStudent, schoolName, headline });

    // Build context from what we already know (including Scrapin data)
    const contextParts = [];
    if (existingData?.discovered_company) contextParts.push(`works at ${existingData.discovered_company}`);
    if (existingData?.discovered_title) contextParts.push(`role: ${existingData.discovered_title}`);
    if (existingData?.scrapin_headline && existingData.scrapin_headline !== existingData?.discovered_title) {
      contextParts.push(`LinkedIn headline: "${existingData.scrapin_headline}"`);
    }
    if (existingData?.discovered_location) contextParts.push(`based in ${existingData.discovered_location}`);
    if (existingData?.discovered_linkedin_url) contextParts.push(`LinkedIn: ${existingData.discovered_linkedin_url}`);
    if (existingData?.scrapin_connection_count) contextParts.push(`${existingData.scrapin_connection_count} LinkedIn connections`);
    if (existingData?.scrapin_follower_count) contextParts.push(`${existingData.scrapin_follower_count} LinkedIn followers`);
    if (existingData?.scrapin_summary) contextParts.push(`LinkedIn summary: "${existingData.scrapin_summary.substring(0, 200)}..."`);

    const emailDomain = email?.split('@')[1] || '';
    const personalDomains = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'protonmail.com'];
    const companyFromEmail = !personalDomains.includes(emailDomain.toLowerCase())
      ? emailDomain.split('.')[0]
      : '';

    const contextHint = contextParts.length > 0
      ? `\n\nContext I already know from their LinkedIn: ${contextParts.join(', ')}`
      : '';

    const companyHint = companyFromEmail && !existingData?.discovered_company
      ? `\nEmail domain suggests connection to: ${companyFromEmail}`
      : '';

    // Use different query for students vs professionals
    let query;
    if (isStudent) {
      // Student-specific search - AGGRESSIVE search across all public sources
      query = `IMPORTANT: I need you to do an EXHAUSTIVE web search to find ALL available information about "${name}"${schoolName ? ` who studies at ${schoolName}` : ''}.

${contextHint}${companyHint}

SEARCH THESE SOURCES IN ORDER:
1. The person's LinkedIn profile page at ${existingData?.discovered_linkedin_url || 'linkedin.com/in/' + (name?.toLowerCase().replace(/\s+/g, '-') || '')} - scrape EVERYTHING visible
2. University student directories and news (${schoolName || 'their university'})
3. GitHub profiles for ${name}
4. Personal websites, portfolios, blogs
5. Hackathon results (Devpost, MLH, Major League Hacking)
6. News articles mentioning ${name}
7. Company websites (for internship mentions)
8. Twitter/X profiles
9. Medium, Dev.to, or other blog platforms
10. Conference speaker pages
11. Crunchbase (for any startup involvement)

I MUST have these details - search EVERY source:

**EDUCATION** (search university websites, student directories):
- EXACT university name and campus location
- Degree type (Bachelor's/Master's/MBA/etc.)
- Major and minor fields of study
- Expected graduation year or class year
- Any honors, awards, scholarships
- Study abroad programs
- Notable courses or specializations

**INTERNSHIPS & WORK** (search company websites, press releases):
- ALL internships with company names, exact roles, and date ranges
- Part-time jobs, research assistant positions
- Any work mentioned in company blogs or press

**PROJECTS** (search GitHub, Devpost, personal sites):
- Project names and descriptions
- Technologies and programming languages used
- GitHub repositories
- Hackathon projects and any awards won
- Personal website or portfolio URL

**EXTRACURRICULARS** (search university clubs, organizations):
- Student organization memberships and leadership roles
- Sports teams
- Volunteer work
- Fraternity/sorority involvement

**SKILLS & LANGUAGES**:
- Programming languages
- Frameworks and tools
- Human languages spoken

**PERSONAL**:
- Nationality or country of origin
- Current city/country
- Any personal interests mentioned publicly

CRITICAL: Do NOT say "I couldn't find" - search HARDER. Look at the actual LinkedIn profile page. Check GitHub. Check university news. FIND THE DATA.`;
    } else {
      // Professional search - AGGRESSIVE search across all public sources
      query = `IMPORTANT: I need you to do an EXHAUSTIVE web search to find ALL available information about "${name}".

${contextHint}${companyHint}

SEARCH THESE SOURCES THOROUGHLY:
1. Their LinkedIn profile at ${existingData?.discovered_linkedin_url || 'linkedin.com'} - extract ALL visible positions and education
2. Company websites and team pages where they work/worked
3. Crunchbase for any startup or investment activity
4. Bloomberg, Reuters, or financial news for executives
5. News articles, press releases, interviews
6. University alumni directories
7. Conference speaker bios
8. Podcast guest appearances
9. GitHub for technical professionals
10. Personal websites or blogs
11. Twitter/X profile
12. Industry publications

I need EXACT DATA with SPECIFIC NUMBERS AND DATES:

**CAREER HISTORY** (EVERY position, most recent first):
For EACH role:
- Exact job title
- Company name
- Start month/year - End month/year
- Key achievements with NUMBERS: revenue, deal sizes, team size, growth percentages
- Example: "Vice President at Albright Capital (May 2023 - August 2025) - Led $125M in portfolio investments"

**EDUCATION**:
- Degree type (MBA, BS, BA, PhD, etc.)
- Major/field of study
- University name
- Years attended
- Any honors or distinctions

**COMPANIES FOUNDED**:
- Company names
- Role (Founder, Co-founder, etc.)
- Date ranges
- What the company does

**CERTIFICATIONS**:
- Certification names
- Issuing organizations
- Years obtained

**SKILLS**:
- Technical skills
- Industry expertise
- Languages spoken

**PERSONAL**:
- Nationality
- Current location
- Any board or advisory positions

CRITICAL: Search the ACTUAL LinkedIn profile page and extract the experience/education sections. Do NOT give up if the first search doesn't work - try alternative queries.`;
    }

    try {
      console.log('[ProfileEnrichment] Running comprehensive Perplexity search for:', name);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://twinme.app'
        },
        body: JSON.stringify({
          // Use sonar-pro for best web search results
          model: 'perplexity/sonar-pro',
          messages: [{ role: 'user', content: query }],
          temperature: 0.3,  // Slightly higher for more comprehensive search
          max_tokens: 8000   // Allow for very detailed response
        })
      });

      if (!response.ok) {
        console.log('[ProfileEnrichment] Comprehensive search failed:', response.status);
        return null;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      console.log('[ProfileEnrichment] Comprehensive search result length:', content.length);
      console.log('[ProfileEnrichment] Comprehensive search preview:', content.substring(0, 500));

      // Parse the structured response into data fields
      return this.parseComprehensiveSearchResult(content);

    } catch (error) {
      console.error('[ProfileEnrichment] Comprehensive search error:', error);
      return null;
    }
  }

  /**
   * Parse the comprehensive search result into structured data
   */
  parseComprehensiveSearchResult(content) {
    if (!content || content.toLowerCase().includes('no information found') && content.length < 200) {
      return null;
    }

    const result = {
      career_timeline: null,
      education: null,
      achievements: null,
      skills: null,
      languages: null,
      certifications: null,
      publications: null,
      raw_comprehensive: content
    };

    // Extract career section
    const careerMatch = content.match(/(?:CAREER HISTORY|Career|CAREER|Work Experience|Employment)[:\s]*\n?([\s\S]*?)(?=\n(?:EDUCATION|Education|ACHIEVEMENTS|Skills|SKILLS|CERTIFICATIONS|PUBLICATIONS|PERSONAL|$))/i);
    if (careerMatch && careerMatch[1] && !careerMatch[1].toLowerCase().includes('no information found')) {
      result.career_timeline = careerMatch[1].trim();
    }

    // Extract education section
    const eduMatch = content.match(/(?:EDUCATION|Education)[:\s]*\n?([\s\S]*?)(?=\n(?:ACHIEVEMENTS|Skills|SKILLS|CERTIFICATIONS|PUBLICATIONS|PERSONAL|CAREER|$))/i);
    if (eduMatch && eduMatch[1] && !eduMatch[1].toLowerCase().includes('no information found')) {
      result.education = eduMatch[1].trim();
    }

    // Extract achievements
    const achieveMatch = content.match(/(?:ACHIEVEMENTS|Achievements|Accomplishments)[:\s]*\n?([\s\S]*?)(?=\n(?:SKILLS|Skills|CERTIFICATIONS|PUBLICATIONS|PERSONAL|EDUCATION|CAREER|$))/i);
    if (achieveMatch && achieveMatch[1] && !achieveMatch[1].toLowerCase().includes('no information found')) {
      result.achievements = achieveMatch[1].trim();
    }

    // Extract skills
    const skillsMatch = content.match(/(?:SKILLS|Skills|Expertise|EXPERTISE)[:\s]*\n?([\s\S]*?)(?=\n(?:CERTIFICATIONS|PUBLICATIONS|PERSONAL|ACHIEVEMENTS|EDUCATION|CAREER|$))/i);
    if (skillsMatch && skillsMatch[1] && !skillsMatch[1].toLowerCase().includes('no information found')) {
      result.skills = skillsMatch[1].trim();
    }

    // Extract certifications
    const certMatch = content.match(/(?:CERTIFICATIONS|Certifications)[:\s]*\n?([\s\S]*?)(?=\n(?:PUBLICATIONS|PERSONAL|SKILLS|ACHIEVEMENTS|EDUCATION|CAREER|$))/i);
    if (certMatch && certMatch[1] && !certMatch[1].toLowerCase().includes('no information found')) {
      result.certifications = certMatch[1].trim();
    }

    // Extract publications
    const pubMatch = content.match(/(?:PUBLICATIONS|Publications)[:\s]*\n?([\s\S]*?)(?=\n(?:PERSONAL|CERTIFICATIONS|SKILLS|ACHIEVEMENTS|EDUCATION|CAREER|$))/i);
    if (pubMatch && pubMatch[1] && !pubMatch[1].toLowerCase().includes('no information found')) {
      result.publications = pubMatch[1].trim();
    }

    // Extract languages from personal or skills
    const langMatch = content.match(/(?:languages?[:\s]+|fluent in[:\s]+)([\w\s,and]+)/i);
    if (langMatch) {
      result.languages = langMatch[1].trim();
    }

    // Check if we found anything useful
    const hasData = result.career_timeline || result.education || result.achievements || result.skills;
    if (!hasData) {
      // If structured parsing failed, store the raw content for narrative generation
      if (content.length > 200) {
        result.career_timeline = content; // Use entire response as career data
      } else {
        return null;
      }
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
          model: 'perplexity/sonar-pro',
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
          model: process.env.OPENROUTER_API_KEY
            ? 'perplexity/sonar-pro'
            : 'sonar-pro',
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
      scrapin_background_url: linkedInData?.scrapin_background_url || null
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
          model: process.env.OPENROUTER_API_KEY ? 'perplexity/sonar' : 'sonar',
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
    const query = `Search for the LinkedIn profile at ${linkedinUrl}.
Extract the following information about this person:
- Full name
- Current job title
- Current company
- Location (city, country)
- Professional summary or bio

Also search for any additional information about "${name || linkedinUsername}" including their Twitter/X, GitHub, and any other professional presence.

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

    // Use Perplexity Sonar Pro Search - most advanced agentic search system
    const model = useOpenRouter ? 'perplexity/sonar-pro-search' : 'sonar';

    console.log(`[ProfileEnrichment] Using ${useOpenRouter ? 'OpenRouter (Sonar Pro Search)' : 'Perplexity'} API`);

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
              content: `You are an expert people finder and professional research assistant. Your task is to find publicly available information about individuals by searching the web thoroughly.

IMPORTANT: Search across multiple platforms including:
- LinkedIn profiles
- Twitter/X accounts
- GitHub profiles
- Personal websites and portfolios
- Company websites and team pages
- Professional directories
- News articles and press releases
- Conference speaker pages
- University/school alumni pages

Return your findings as JSON with these exact fields:
{
  "name": "Full Name",
  "company": "Current Company Name or most recent employer",
  "title": "Job Title or Role",
  "location": "City, Country or Region",
  "linkedin_url": "https://linkedin.com/in/username",
  "twitter_url": "https://twitter.com/username or https://x.com/username",
  "github_url": "https://github.com/username",
  "bio": "Brief professional summary (1-2 sentences based on what you found)"
}

Guidelines:
- Search thoroughly before saying you can't find information
- Include partial information - even just a location or bio is valuable
- If you find their LinkedIn username but not full URL, construct it
- Use null ONLY for fields you truly cannot find after thorough search
- Do not fabricate information, but do search comprehensively`
            },
            {
              role: 'user',
              content: query
            }
          ],
          temperature: 0.3,
          max_tokens: 1500
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
        discovered_summary: enrichmentData.discovered_summary || null,
        // Career data fields
        career_timeline: enrichmentData.career_timeline || null,
        education: enrichmentData.education || null,
        achievements: enrichmentData.achievements || null,
        skills: enrichmentData.skills || null,
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
