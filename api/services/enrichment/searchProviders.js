/**
 * Search Provider Functions
 *
 * Web-search-based enrichment functions:
 * - LinkedIn URL discovery via web search
 * - Career history web search
 * - Perplexity Sonar API
 * - LinkedIn URL enrichment
 * - Social profile search
 * - Comprehensive web search for person
 * - Response parsers (enrichment, web search, social profiles, career, education)
 * - Search query builders
 * - Source combination utilities
 */

import { validateUrl, extractUrl } from './enrichmentUtils.js';

// ============================================================
// LinkedIn URL Discovery & Career History Web Search
// ============================================================

/**
 * Find LinkedIn URL via web search using Google Gemini
 */
export async function findLinkedInUrlViaWebSearch(email, name) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log('[ProfileEnrichment] No OpenRouter API key for web search');
    return null;
  }

  const emailDomain = email?.split('@')[1] || '';
  const personalDomains = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'protonmail.com'];
  const companyHint = !personalDomains.includes(emailDomain.toLowerCase())
    ? emailDomain.split('.')[0]
    : '';

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

    let linkedInMatch = content.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w-]+/i);
    if (!linkedInMatch) {
      linkedInMatch = content.match(/(?:www\.)?linkedin\.com\/in\/([\w-]+)/i);
      if (linkedInMatch) {
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
 */
export async function searchWebForCareerHistory(name, currentCompany = null) {
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

    const careerTimeline = parseCareerFromWebSearch(content);
    const education = parseEducationFromWebSearch(content);

    if (!careerTimeline && !education) {
      console.log('[ProfileEnrichment] Could not parse career data from response');
      return null;
    }

    return { career_timeline: careerTimeline, education: education, raw_response: content };

  } catch (error) {
    console.error('[ProfileEnrichment] Career search error:', error);
    return null;
  }
}

export function parseCareerFromWebSearch(content) {
  const careerMatch = content.match(/CAREER:?\s*\n([\s\S]*?)(?=\n\s*EDUCATION:|$)/i);
  if (!careerMatch) {
    const bulletPoints = content.match(/[-•]\s*\[?\d{4}.*?(?:at|@)\s+\w+.*$/gm);
    if (bulletPoints && bulletPoints.length > 0) {
      return bulletPoints.join('\n');
    }
    return null;
  }

  const careerText = careerMatch[1].trim();
  const lines = careerText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 5 && (line.startsWith('-') || line.startsWith('•') || line.startsWith('*') || /^\*\*/.test(line)));

  if (lines.length === 0) return null;

  return lines.map(line => line.replace(/^[-•*]\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '')).join('\n\n');
}

export function parseEducationFromWebSearch(content) {
  const eduMatch = content.match(/EDUCATION:?\s*\n([\s\S]*?)(?=\n\s*[A-Z]+:|$)/i);
  if (!eduMatch) return null;

  const eduText = eduMatch[1].trim();
  const lines = eduText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 5 && (line.startsWith('-') || line.startsWith('•') || line.startsWith('*') || /^\*\*/.test(line)));

  if (lines.length === 0) return null;

  return lines.map(line => line.replace(/^[-•*]\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '')).join('\n');
}

// ============================================================
// Perplexity API & LinkedIn enrichment
// ============================================================

/**
 * Call Perplexity Sonar API via OpenRouter
 */
export async function callPerplexityAPI(query) {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const perplexityKey = process.env.PERPLEXITY_API_KEY;

  const apiKey = openRouterKey || perplexityKey;
  const useOpenRouter = !!openRouterKey;

  if (!apiKey) {
    console.warn('[ProfileEnrichment] No API key configured (OPENROUTER_API_KEY or PERPLEXITY_API_KEY)');
    return { success: false, error: 'API key not configured', content: null, raw: null };
  }

  const apiUrl = useOpenRouter
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : 'https://api.perplexity.ai/chat/completions';

  const model = useOpenRouter ? 'perplexity/sonar-pro' : 'sonar';

  console.log(`[ProfileEnrichment] Using ${useOpenRouter ? 'OpenRouter (Sonar Pro)' : 'Perplexity'} API`);

  try {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

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
          { role: 'user', content: query }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ProfileEnrichment] API error:', errorText);
      return { success: false, error: `API error: ${response.status}`, content: null, raw: null };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '';

    console.log('[ProfileEnrichment] Raw API response:', JSON.stringify(result, null, 2).substring(0, 2000));
    console.log('[ProfileEnrichment] Extracted content:', content.substring(0, 1000));

    return { success: true, content, raw: result };
  } catch (error) {
    console.error('[ProfileEnrichment] API request failed:', error);
    return { success: false, error: error.message, content: null, raw: null };
  }
}

/**
 * Enrich profile from a provided LinkedIn URL
 */
export async function enrichFromLinkedIn(linkedinUrl, name = null) {
  console.log(`[ProfileEnrichment] Enriching from LinkedIn URL: ${linkedinUrl}`);

  const usernameMatch = linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/i);
  const linkedinUsername = usernameMatch ? usernameMatch[1] : null;

  if (!linkedinUsername) {
    return { success: false, error: 'Could not extract username from LinkedIn URL', data: null };
  }

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
    const searchResponse = await callPerplexityAPI(query);

    if (!searchResponse.success) {
      console.error('[ProfileEnrichment] LinkedIn API call failed:', searchResponse.error);
      return { success: false, error: searchResponse.error, data: null };
    }

    const enrichmentData = parseEnrichmentResponse(
      searchResponse.content,
      null,
      name || linkedinUsername
    );

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
    return { success: false, error: error.message, data: null };
  }
}

/**
 * Parse Perplexity response into structured enrichment data
 */
export function parseEnrichmentResponse(content, email, providedName) {
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
    discovered_summary: null
  };

  if (!content) return enrichment;

  const notFoundIndicators = [
    'could not find', 'no information', 'not found', 'no results',
    'do not contain information', 'cannot find', 'unable to find',
    'unable to retrieve', 'unable to locate', 'could not be accessed',
    'was unable to', 'don\'t have', 'doesn\'t contain',
    'no publicly available', 'I recommend', 'search directly',
    'I would need to perform', 'search limitations', 'search attempts'
  ];

  const lowerContent = content.toLowerCase();
  const isNotFound = notFoundIndicators.some(indicator => lowerContent.includes(indicator));

  // Extract SUMMARY section
  const summaryMatch = content.match(/SUMMARY:\s*\n?([\s\S]*?)(?=\n\s*JSON:|$)/i);
  if (summaryMatch && summaryMatch[1]) {
    const summary = summaryMatch[1].trim();
    if (summary.length > 50 && !notFoundIndicators.some(ind => summary.toLowerCase().includes(ind))) {
      enrichment.discovered_summary = summary;
    }
  }

  // If no SUMMARY section, try to extract a narrative
  if (!enrichment.discovered_summary && !isNotFound) {
    const paragraphs = content.split(/\n\n+/);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && trimmed.length > 100) {
        if (!trimmed.toLowerCase().startsWith('json') && !trimmed.toLowerCase().startsWith('summary')) {
          enrichment.discovered_summary = trimmed;
          break;
        }
      }
    }
  }

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      const validateValue = (val) => {
        if (!val || val === 'null' || val === 'undefined') return null;
        if (typeof val !== 'string') return null;
        const lowerVal = val.toLowerCase();
        const invalidPatterns = [
          'not found', 'no information', 'provided to me', 'search results',
          'would help', 'narrow down', 'more context', 'please provide',
          'unable to', 'could not', 'cannot find', 'no publicly',
          'if you have', 'help narrow', 'or company', 'affiliation', 'limited public'
        ];
        if (invalidPatterns.some(pattern => lowerVal.includes(pattern))) return null;
        if (val.length < 2 || val.length > 200) return null;
        return val;
      };

      enrichment.discovered_name = validateValue(parsed.name) || providedName || null;
      enrichment.discovered_company = validateValue(parsed.company);
      enrichment.discovered_title = validateValue(parsed.title);
      enrichment.discovered_location = validateValue(parsed.location);
      enrichment.discovered_linkedin_url = validateUrl(parsed.linkedin_url, 'linkedin.com');
      enrichment.discovered_twitter_url = validateUrl(parsed.twitter_url, 'twitter.com') ||
                                          validateUrl(parsed.twitter_url, 'x.com');
      enrichment.discovered_github_url = validateUrl(parsed.github_url, 'github.com');

      const validateBio = (val) => {
        if (!val || val === 'null' || val === 'undefined') return null;
        if (typeof val !== 'string') return null;
        if (val.length < 10 || val.length > 500) return null;
        const lowerVal = val.toLowerCase();
        if (lowerVal === 'not found' || lowerVal === 'no information available') return null;
        return val;
      };
      enrichment.discovered_bio = validateBio(parsed.bio);
    } else {
      enrichment.discovered_linkedin_url = extractUrl(content, /https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w-]+/i);
      enrichment.discovered_twitter_url = extractUrl(content, /https?:\/\/(?:www\.)?(twitter|x)\.com\/[\w-]+/i);
      enrichment.discovered_github_url = extractUrl(content, /https?:\/\/(?:www\.)?github\.com\/[\w-]+/i);

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

// ============================================================
// Web Search for Social Profiles & Person
// ============================================================

/**
 * Search web ONLY for additional social profiles
 */
export async function searchWebForSocialProfiles(email, name, linkedInData) {
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

    const webFindings = parseSocialProfileResponse(content);
    return { success: true, webFindings, rawContent: content };

  } catch (error) {
    console.error('[ProfileEnrichment] Social profile search error:', error);
    return { success: false, webFindings: null };
  }
}

export function parseSocialProfileResponse(content) {
  const findings = {
    twitter_url: null,
    github_url: null,
    personal_website: null,
    blog_url: null,
    other_urls: []
  };

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

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
 * Search the web for comprehensive career/life information about a person
 */
export async function searchWebForPerson(email, name, linkedInData) {
  console.log('[ProfileEnrichment] Starting comprehensive career search...');

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.log('[ProfileEnrichment] No API key for web search');
    return { success: false, webFindings: null };
  }

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
        messages: [{ role: 'user', content: searchQuery }],
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

    const webFindings = parseWebSearchResponse(content);

    return { success: true, webFindings, rawContent: content };
  } catch (error) {
    console.error('[ProfileEnrichment] Web search failed:', error.message);
    return { success: false, webFindings: null };
  }
}

/**
 * Parse web search response into structured career data
 */
export function parseWebSearchResponse(content) {
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

  const careerMatch = content.match(/CAREER_TIMELINE:\s*\n?([\s\S]*?)(?=\n\s*EDUCATION:|$)/i);
  if (careerMatch && careerMatch[1]) {
    findings.career_timeline = careerMatch[1].trim();
  }

  const educationMatch = content.match(/EDUCATION:\s*\n?([\s\S]*?)(?=\n\s*ACHIEVEMENTS:|$)/i);
  if (educationMatch && educationMatch[1]) {
    findings.education = educationMatch[1].trim();
  }

  const achievementsMatch = content.match(/ACHIEVEMENTS:\s*\n?([\s\S]*?)(?=\n\s*SKILLS:|$)/i);
  if (achievementsMatch && achievementsMatch[1]) {
    findings.achievements = achievementsMatch[1].trim();
  }

  const skillsMatch = content.match(/SKILLS:\s*\n?([\s\S]*?)(?=\n\s*SUMMARY:|$)/i);
  if (skillsMatch && skillsMatch[1]) {
    findings.skills = skillsMatch[1].trim();
  }

  const summaryMatch = content.match(/SUMMARY:\s*\n?([\s\S]*?)(?=\n\s*ADDITIONAL_PROFILES:|$)/i);
  if (summaryMatch && summaryMatch[1]) {
    findings.summary = summaryMatch[1].trim();
  }

  if (!findings.summary) {
    const webFindingsMatch = content.match(/WEB_FINDINGS:\s*\n?([\s\S]*?)(?=\n\s*ADDITIONAL_PROFILES:|$)/i);
    if (webFindingsMatch && webFindingsMatch[1]) {
      findings.summary = webFindingsMatch[1].trim();
    }
  }

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
 * Build an optimized search query for Perplexity
 */
export function buildSearchQuery(email, name, emailDomain) {
  const personalDomains = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'protonmail.com', 'aol.com', 'live.com', 'msn.com'];
  const isCompanyEmail = !personalDomains.includes(emailDomain.toLowerCase());

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

  return `Find information about the person who owns the email address: ${email}

${emailHint}

Search LinkedIn, Twitter/X, GitHub, professional directories, and any other public sources.

Please provide:
1. A detailed paragraph summarizing who this person is
2. Structured data in JSON format

If you cannot find information, say so clearly.`;
}

/**
 * Combine data from LinkedIn and web search into unified enrichment data
 */
export function combineEnrichmentSources(linkedInData, webSearchResult, email, name) {
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
    career_timeline: linkedInData?.career_timeline || null,
    education: linkedInData?.education || null,
    skills: linkedInData?.skills || null,
    achievements: null,
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
  };

  // Override the first `achievements: null` with linkedInData value
  combined.achievements = linkedInData?.achievements || null;

  if (webSearchResult?.success && webSearchResult.webFindings) {
    const web = webSearchResult.webFindings;

    if (!combined.discovered_twitter_url && web.twitter_url) {
      combined.discovered_twitter_url = web.twitter_url;
    }
    if (!combined.discovered_github_url && web.github_url) {
      combined.discovered_github_url = web.github_url;
    }

    combined.personal_website = web.personal_website || null;
    combined.blog_url = web.blog_url || null;
    combined.other_urls = web.other_urls || [];
  }

  return combined;
}
