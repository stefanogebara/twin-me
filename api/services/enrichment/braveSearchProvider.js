/**
 * Brave Search Provider
 *
 * Brave Search API functions + LLM extraction + comprehensive person search orchestration.
 * Includes: Brave web search, page scraping, personal life extraction,
 * structured profile extraction, and the comprehensive search waterfall
 * (Brave -> Gemini -> Sonar -> OpenRouter).
 */

import { complete, TIER_ANALYSIS } from '../llmGateway.js';
import { inferNameFromEmail } from './enrichmentUtils.js';

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
 * Single Brave Search API call. Returns array of web results.
 */
export async function braveWebSearch(query, apiKey) {
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
 * Fetch and extract text content from a URL (for deep scraping top results).
 * Returns cleaned text, truncated to maxChars.
 */
export async function fetchPageText(url, maxChars = 5000) {
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

/**
 * Run 3-5 targeted Brave queries in parallel and collect all snippets.
 * Deep scrapes top results, prioritizing personal/interview content.
 */
export async function searchWithBrave(name, email) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;

  const emailUsername = email.split('@')[0];
  const emailDomain = email.split('@')[1] || '';
  const isGenericEmail = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'protonmail.com', 'aol.com', 'live.com'].includes(emailDomain.toLowerCase());

  const domainName = !isGenericEmail ? emailDomain.split('.')[0] : null;
  const nameQuery = domainName ? `"${name}" "${domainName}"` : `"${name}"`;

  const queries = [
    nameQuery,
    `"${emailUsername}" site:github.com OR site:linkedin.com OR site:twitter.com OR site:instagram.com`,
    `"${name}" site:linkedin.com/in`,
    `${nameQuery} (interview OR podcast OR TEDx OR personal OR profile OR biography)`,
    `"${name}" site:twitter.com OR site:instagram.com OR site:facebook.com OR site:medium.com`,
  ];

  const results = await Promise.allSettled(
    queries.map(q => braveWebSearch(q, apiKey))
  );

  const seen = new Set();
  const uniqueResults = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .flatMap(r => r.value)
    .filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });

  console.log(`[ProfileEnrichment] Brave: ${uniqueResults.length} unique results from ${queries.length} queries`);

  const allSnippets = uniqueResults
    .map(r => `[${r.title}] ${r.description}${r.extra_snippets ? ' ' + r.extra_snippets.join(' ') : ''}`)
    .join('\n');

  if (allSnippets.length < 10) return null;

  const blockedDomains = ['linkedin.com', 'facebook.com', 'instagram.com'];
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
      if (corporateBoilerplate.some(d => urlLower.includes(d))) score -= 3;
      if (personalGoldmine.some(d => urlLower.includes(d))) score += 3;
      interviewKeywords.forEach(kw => {
        if (titleLower.includes(kw)) score += 2;
        if (descLower.includes(kw)) score += 1;
      });
      return { ...r, _score: score };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 6);

  console.log(`[ProfileEnrichment] Deep scraping ${scoredResults.length} pages (scored, personal-first):`);
  scoredResults.forEach(r => console.log(`  [score:${r._score}] ${r.title} — ${r.url}`));
  const pageContents = await Promise.allSettled(
    scoredResults.map(r => fetchPageText(r.url))
  );

  const nameParts = name.toLowerCase().split(' ').filter(p => p.length > 2);
  const emailUsernameLower = emailUsername.toLowerCase();
  const scrapedPages = pageContents
    .map((r, i) => ({ result: r, target: scoredResults[i] }))
    .filter(({ result }) => result.status === 'fulfilled' && result.value)
    .filter(({ result }) => {
      const text = result.value.toLowerCase();
      return nameParts.some(part => text.includes(part));
    })
    .sort((a, b) => {
      // Prioritize pages that mention the email username
      const aHasEmail = a.result.value.toLowerCase().includes(emailUsernameLower) ? 1 : 0;
      const bHasEmail = b.result.value.toLowerCase().includes(emailUsernameLower) ? 1 : 0;
      return bHasEmail - aHasEmail;
    });

  const scrapedText = scrapedPages
    .map(({ result, target }) => `--- PAGE: ${target.title} (${target.url}) ---\n${result.value}`)
    .join('\n\n');

  console.log(`[ProfileEnrichment] Scraped ${scrapedPages.length} relevant pages out of ${pageContents.filter(r => r.status === 'fulfilled' && r.value).length} fetched (${scrapedText.length} chars)`);

  const combined = `=== SEARCH SNIPPETS ===\n${allSnippets}\n\n=== FULL PAGE CONTENT ===\n${scrapedText}`;
  const _emailUsernameFound = emailUsernameLower.length >= 3 && (
    allSnippets.toLowerCase().includes(emailUsernameLower) ||
    scrapedText.toLowerCase().includes(emailUsernameLower)
  );
  return { combined, snippetsOnly: allSnippets, scrapedOnly: scrapedText, _emailUsernameFound };
}

/**
 * Second-pass extraction: focus ONLY on personal life details from scraped content.
 */
export async function extractPersonalLife(scrapedContent, name, email = null) {
  if (!scrapedContent || scrapedContent.length < 50) return null;

  const emailUsername = email ? email.split('@')[0] : null;
  const disambiguationNote = emailUsername
    ? `\nCRITICAL: The name "${name}" may match multiple people. Only extract details about the "${name}" associated with email username "${emailUsername}". If the content describes a different person with the same name, return all fields as null.\n`
    : '';

  const prompt = `You are analyzing web content about "${name}" to understand them as a PERSON, not as an employee.${disambiguationNote}
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
 * Brave Search snippets + scraped page content.
 */
export async function extractStructuredProfile(snippets, name, email) {
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
- Even small personal details matter: favorite books, sports they play, cities they love, languages they speak.
- CRITICAL: The name "${name}" may match multiple people. Only extract information about the person associated with email "${email}" (username: "${email.split('@')[0]}"). If uncertain which person matches, set fields to null.`;

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

// ============================================================
// Comprehensive Person Search Orchestrator
// ============================================================

/**
 * Comprehensive person search using web-search-capable models.
 *
 * Strategy:
 *   0. Brave Search API (most reliable)
 *   1. Google Gemini with Search Grounding
 *   2. Perplexity Sonar Pro via OpenRouter
 *   3. Gemini via OpenRouter with web search plugin
 */
export async function comprehensivePersonSearch(name, email, existingData = {}) {
  if (!name) {
    console.log('[ProfileEnrichment] Cannot do comprehensive search - no name provided');
    return null;
  }

  // Tier 0: Brave Search API
  if (process.env.BRAVE_SEARCH_API_KEY) {
    console.log('[ProfileEnrichment] Trying Brave Search API for:', { name, hasEmail: !!email });
    try {
      const braveResult = await searchWithBrave(name, email);
      if (braveResult) {
        const hasScrapedContent = braveResult.scrapedOnly && braveResult.scrapedOnly.length > 100;
        console.log(`[ProfileEnrichment] Running extraction: Pass 1 (career) + ${hasScrapedContent ? 'Pass 2 (personal)' : 'no Pass 2 (no scraped content)'}`);

        const [pass1Result, pass2Result] = await Promise.allSettled([
          extractStructuredProfile(braveResult.snippetsOnly, name, email),
          hasScrapedContent ? extractPersonalLife(braveResult.scrapedOnly, name, email) : Promise.resolve(null),
        ]);

        const extracted = pass1Result.status === 'fulfilled' ? pass1Result.value : null;
        const personal = pass2Result.status === 'fulfilled' ? pass2Result.value : null;

        if (pass1Result.status === 'rejected') console.error('[ProfileEnrichment] Pass 1 failed:', pass1Result.reason?.message);
        if (pass2Result.status === 'rejected') console.error('[ProfileEnrichment] Pass 2 failed:', pass2Result.reason?.message);

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

    console.log('[ProfileEnrichment] Brave returned no usable results, skipping LLM-based search');
    return null;
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const inferredName = inferNameFromEmail(email);
  const searchName = (name && name.includes(' ')) ? name : inferredName;
  const emailDomain = email.split('@')[1] || '';
  const isGenericEmail = ['gmail', 'hotmail', 'yahoo', 'outlook', 'icloud', 'protonmail', 'aol'].some(d => emailDomain.includes(d));

  let prompt;
  if (!isGenericEmail) {
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
    const emailUsername = email.split('@')[0];
    const displayName = (name && name.includes(' ')) ? name : inferredName;

    prompt = `Search for the following and compile all results:

1. BUSINESS RECORDS: Search business registries, company filings, and CNPJ/company registration records for any businesses registered to "${displayName}". Report registration numbers, company names, addresses, and business activities.

2. DIGITAL FOOTPRINT: Search for the username "${emailUsername}" across GitHub, LinkedIn, Twitter/X, and any other platforms. Report what profiles exist and what content they contain.

3. EDUCATION: Search for "${displayName}" in university alumni directories, graduation records, or academic publications.

4. PROFESSIONAL PRESENCE: Search for any news articles, press mentions, conference talks, or professional directory listings mentioning "${displayName}" or "${emailUsername}".

5. SPORTS AND HOBBIES: Search for "${displayName}" in sports club memberships, competition results, race results, or hobby communities.

Compile ALL findings into a detailed report. Write in plain text, flowing prose. Include every verifiable fact you find.

IMPORTANT: The username "${emailUsername}" is the primary identifier for THIS specific individual. If multiple people share the surname, clearly distinguish the person associated with "${emailUsername}" from family members or other individuals with similar names. Do NOT attribute a family member's career, education, or achievements to this person.`;
  }

  // Try 1: Google AI with Search Grounding
  const googleAI = await getGoogleAI();
  if (googleAI) {
    console.log('[ProfileEnrichment] Trying Google AI with Search Grounding for:', { searchName, hasEmail: !!email });
    try {
      const result = await searchWithGoogleGrounding(googleAI, searchName, email, prompt);
      if (result) return result;
    } catch (error) {
      console.error('[ProfileEnrichment] Google AI grounding failed:', error.message);
    }
  }

  // Try 2: Perplexity Sonar Pro via OpenRouter
  if (openRouterKey) {
    console.log('[ProfileEnrichment] Falling back to Perplexity Sonar Pro for:', { searchName, hasEmail: !!email });
    try {
      const result = await searchWithSonar(searchName, email, prompt, openRouterKey);
      if (result) return result;
    } catch (error) {
      console.error('[ProfileEnrichment] Sonar search failed:', error.message);
    }
  }

  // Try 3: Gemini via OpenRouter WITH web search plugin
  if (openRouterKey) {
    console.log('[ProfileEnrichment] Falling back to Gemini + OpenRouter web search for:', { searchName, hasEmail: !!email });
    try {
      return await searchWithOpenRouter(searchName, email, prompt, openRouterKey);
    } catch (error) {
      console.error('[ProfileEnrichment] OpenRouter Gemini + web search failed:', error.message);
    }
  }

  console.log('[ProfileEnrichment] All search tiers exhausted — returning null');
  return null;
}

/**
 * Search using Perplexity Sonar Pro via OpenRouter
 */
export async function searchWithSonar(name, email, prompt, apiKey) {
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
  return parseComprehensiveSearchResult(content);
}

/**
 * Search using Google AI with Google Search grounding (direct API)
 */
export async function searchWithGoogleGrounding(googleAI, name, email, prompt) {
  console.log('[ProfileEnrichment] Running Google AI with grounding for:', name);

  const models = ['gemini-2.0-flash-lite', 'gemini-2.5-flash'];
  for (const model of models) {
    try {
      console.log(`[ProfileEnrichment] Trying ${model}...`);
      const result = await Promise.race([
        googleAI.models.generateContent({
          model,
          contents: prompt,
          config: { tools: [{ googleSearch: {} }], temperature: 0.1 }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${model} timeout after 50s`)), 50000))
      ]);

      const content = result.text;
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
      return parseComprehensiveSearchResult(content);
    } catch (err) {
      console.error(`[ProfileEnrichment] [${model}] Error:`, err.message);
      continue;
    }
  }
  return null;
}

/**
 * Fallback search using Gemini via OpenRouter WITH web search plugin.
 */
export async function searchWithOpenRouter(name, email, prompt, apiKey) {
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
      web_search_options: { search_context_size: 'high' }
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
  return parseComprehensiveSearchResult(content);
}

/**
 * Parse the comprehensive search result into structured data.
 */
export function parseComprehensiveSearchResult(content) {
  if (!content || content.length < 30) return null;

  const lower = content.toLowerCase();
  const refusalPatterns = [
    'no public information', 'no information found', 'no information matching',
    'no information available', 'no information about', 'no relevant information',
    'no specific information', 'no detailed information', 'no verifiable information',
    'could not find any information', 'couldn\'t find any information',
    'could not find any specific', 'couldn\'t find any specific',
    'cannot provide the information', 'i cannot provide',
    'no results were found', 'no results found', 'no data found',
    'no matching results', 'unable to find information', 'unable to find any',
    'i was unable to find', 'i could not find', 'i couldn\'t find',
    'i did not find', 'i didn\'t find', 'none of which matched',
    'none matched the query', 'raises privacy concerns', 'privacy concerns',
    'not currently accessible', 'cannot be comprehensively detailed',
    'details and achievements remain private', 'career details remain private',
    'remain private at this time', 'information is not publicly available',
    'not publicly available', 'does not appear to have a significant public',
    'does not have a significant public', 'no prominent public presence',
    'limited public presence', 'minimal public presence',
    'no widely recognized public', 'not a widely recognized public',
  ];
  if (refusalPatterns.some(p => lower.includes(p))) {
    console.log('[ProfileEnrichment] Detected refusal/no-data response, skipping');
    return null;
  }

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
    .replace(/^(?:Okay|Sure|Alright|Let me|I will|I'll|Here's (?:the|my) plan)[^.]*\.[^]*?(?=(?:[A-Z][a-z]+ (?:is|was|has|holds|serves|currently|works|founded|graduated|earned|studied|joined|started|received|became)))/i, '')
    .replace(/^(?:I (?:will|shall|am going to) (?:conduct|execute|search|run|perform|compile)[^.]*\.[\s\n]*)+/gi, '')
    .replace(/^(?:This report (?:compiles|summarizes|presents|covers|contains)[^.]*\.[\s\n]*)+/gi, '')
    .replace(/^(?:Below is|Here is|The following)[^.]*(?:compiled|detailed|comprehensive)[^.]*\.[\s\n]*/gi, '')
    .replace(/^(?:Based on (?:the |my )?search results)[^.]*\.[\s\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const result = {
    career_timeline: null, education: null, achievements: null, skills: null,
    languages: null, certifications: null, publications: null, raw_comprehensive: cleanContent
  };

  const careerMatch = cleanContent.match(/(?:CAREER HISTORY|Career|CAREER|Work Experience|Employment)[:\s]*\n?([\s\S]*?)(?=\n(?:EDUCATION|Education|ACHIEVEMENTS|Skills|SKILLS|CERTIFICATIONS|PUBLICATIONS|PERSONAL|LOCATION|$))/i);
  if (careerMatch?.[1] && !careerMatch[1].toLowerCase().includes('not found')) result.career_timeline = careerMatch[1].trim();

  const eduMatch = cleanContent.match(/(?:EDUCATION|Education)[:\s]*\n?([\s\S]*?)(?=\n(?:ACHIEVEMENTS|Skills|SKILLS|CERTIFICATIONS|PUBLICATIONS|PERSONAL|CAREER|LOCATION|$))/i);
  if (eduMatch?.[1] && !eduMatch[1].toLowerCase().includes('not found')) result.education = eduMatch[1].trim();

  const achieveMatch = cleanContent.match(/(?:ACHIEVEMENTS|Achievements|Accomplishments)[:\s]*\n?([\s\S]*?)(?=\n(?:SKILLS|Skills|CERTIFICATIONS|PUBLICATIONS|PERSONAL|EDUCATION|CAREER|$))/i);
  if (achieveMatch?.[1] && !achieveMatch[1].toLowerCase().includes('not found')) result.achievements = achieveMatch[1].trim();

  const skillsMatch = cleanContent.match(/(?:SKILLS|Skills|Expertise|EXPERTISE)[:\s]*\n?([\s\S]*?)(?=\n(?:CERTIFICATIONS|PUBLICATIONS|PERSONAL|ACHIEVEMENTS|EDUCATION|CAREER|$))/i);
  if (skillsMatch?.[1] && !skillsMatch[1].toLowerCase().includes('not found')) result.skills = skillsMatch[1].trim();

  const langMatch = cleanContent.match(/(?:languages?[:\s]+|fluent in[:\s]+)([\w\s,and]+)/i);
  if (langMatch) result.languages = langMatch[1].trim();

  const hasStructuredData = result.career_timeline || result.education || result.achievements || result.skills;
  if (!hasStructuredData && cleanContent.length > 100) {
    const prose = cleanContent.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    const sentences = prose.match(/[^.!?]+[.!?]+/g) || [];
    let summary = '';
    for (const s of sentences) {
      if (summary.length + s.length > 800) break;
      summary += s;
    }
    if (summary.length > 50) result.career_timeline = summary.trim();
  }

  if (!result.career_timeline && !result.education && !result.achievements) return null;
  return result;
}
