/**
 * Narrative Generator Functions
 *
 * AI-powered narrative generation for profile enrichment:
 * - Detailed cofounder.co-style biographies
 * - Rich summary generation
 * - Factual summary fallback
 * - Short summary generation
 */

/**
 * Generate a detailed cofounder.co-style narrative using AI.
 * Creates a comprehensive paragraph covering career history, education, achievements, etc.
 */
export async function generateDetailedNarrative(data, name) {
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
  if (data.scrapin_connection_count) dataPoints.push(`Professional network connections: ${data.scrapin_connection_count}`);
  if (data.scrapin_follower_count) dataPoints.push(`Professional followers: ${data.scrapin_follower_count}`);

  // If we have raw comprehensive search data, include it (CLEANED)
  if (data.raw_comprehensive && data.raw_comprehensive.length > 200) {
    let cleanRaw = data.raw_comprehensive
      .replace(/\*\*/g, '')
      .replace(/^#+\s+.*$/gm, '')
      .replace(/^[•\-*]\s*/gm, '')
      .replace(/\[[\d,\s]+\]/g, '')
      .replace(/^(Note|Disclaimer|Important|Caveat|Further Research|I hope this helps)[:\s].*$/gim, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (cleanRaw.length > 100) {
      dataPoints.push(`\nAdditional research findings:\n${cleanRaw}`);
    }
  }

  // Check if we have ACTUAL career data
  const rawData = (data.raw_comprehensive || '') + ' ' + (data.career_timeline || '');
  console.error('[ProfileEnrichment] Data fields for check:', JSON.stringify({
    hasRawComprehensive: !!data.raw_comprehensive,
    rawComprehensiveLength: data.raw_comprehensive?.length || 0,
    hasCareerTimeline: !!data.career_timeline,
    careerTimelineLength: data.career_timeline?.length || 0
  }));
  const hasJobDates = /\b(19|20)\d{2}\s*[-–-]\s*(19|20)\d{2}\b/.test(rawData);
  const hasMoneyAmounts = /\$[\d,.]+[KMB]?|\$[\d,.]+ million|\d+ million|\d+ billion/i.test(rawData);
  const hasDegreeDetails = /\b(MBA|PhD|Master|Bachelor|MS|BS|BA|degree)\s+(from|in|at)\b/i.test(rawData);
  const hasCompanyPositions = /\b(CEO|CTO|CFO|COO|VP|Vice President|Director|President|Chairman|Founder|Co-founder)\b/i.test(rawData);

  const hasRichData = hasJobDates || hasMoneyAmounts || hasDegreeDetails || hasCompanyPositions;
  console.error('[ProfileEnrichment] Rich data check:', JSON.stringify({ hasJobDates, hasMoneyAmounts, hasDegreeDetails, hasCompanyPositions, hasRichData }));

  // Check if we have at least basic profile data worth narrating
  const hasBasicProfile = data.discovered_name && (data.discovered_title || data.discovered_company || data.discovered_location);

  if (!hasBasicProfile && dataPoints.length < 2) {
    console.log('[ProfileEnrichment] Not enough data for any narrative');
    return null;
  }

  // Filter out LinkedIn URL data points
  const filteredDataPoints = dataPoints.map(dp => {
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
    const dpLower = dp.toLowerCase();
    return !dpLower.startsWith('linkedin url:') &&
           !dpLower.startsWith('professional network:') &&
           !(dpLower.includes('linkedin.com/in/') && dpLower.length < 100);
  });

  // Debug logging
  console.log('[ProfileEnrichment] === DEBUG: Prompt Data ===');
  console.log('[ProfileEnrichment] Total dataPoints:', dataPoints.length);
  console.log('[ProfileEnrichment] Filtered dataPoints:', filteredDataPoints.length);
  console.log('[ProfileEnrichment] Data keys:', Object.keys(data).filter(k => data[k] != null));
  console.log('[ProfileEnrichment] Has career_timeline:', !!data.career_timeline);
  if (data.career_timeline) {
    console.log('[ProfileEnrichment] career_timeline length:', data.career_timeline.length);
  }
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

EXAMPLE: "Sebastian Izurieta is a finance professional currently serving as Principal Financial Analyst at NextEra Energy Resources. He holds an MBA from University of Virginia Darden School of Business and a Bachelor's from ITAM. Based in Madrid, Spain, he specializes in private investments and complex financial modeling."

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
      let cleanNarrative = narrative.trim();

      // Remove wrapping quotes
      if ((cleanNarrative.startsWith('"') && cleanNarrative.endsWith('"')) ||
          (cleanNarrative.startsWith("'") && cleanNarrative.endsWith("'"))) {
        cleanNarrative = cleanNarrative.slice(1, -1).trim();
      }

      // Remove "Note:" sections
      cleanNarrative = cleanNarrative.split(/\n\s*Note:/i)[0].trim();
      cleanNarrative = cleanNarrative.split(/\n\s*\(Note:/i)[0].trim();

      // Remove meta-commentary or refusals
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

      // If the entire narrative was a refusal, return null
      if (cleanNarrative.length < 30) {
        console.log('[ProfileEnrichment] Narrative was a refusal, falling back to factual summary');
        return null;
      }

      // Remove markdown formatting
      cleanNarrative = cleanNarrative
        .replace(/\*\*/g, '')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/^[•\-*]\s*/gm, '')
        .replace(/^#+\s+/gm, '')
        .replace(/\[[\d,\s]+\]/g, '');

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
      const lowerNarrative = cleanNarrative.toLowerCase();

      const hasStudentClaims =
        /pursuing\s+\w*\s*studies/.test(lowerNarrative) ||
        /currently\s+\w*\s*studying/.test(lowerNarrative) ||
        /\bas\s+a\s+student\b/.test(lowerNarrative) ||
        /\bis\s+a\s+student\b/.test(lowerNarrative) ||
        /\bstudies\s+at\b/.test(lowerNarrative) ||
        /\bstudent\s+at\b/.test(lowerNarrative) ||
        /\bie\s+university\b/.test(lowerNarrative);

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

      if (hasStudentClaims && hasProfessionalData) {
        console.log('[ProfileEnrichment] REJECTED: AI fabricated student content for a professional');
        return buildFactualSummary(data);
      }

      // Detect filler narratives
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
 * Generate a rich narrative summary from all collected career data
 */
export async function generateRichSummary(combinedData, webFindings) {
  console.log('[ProfileEnrichment] Generating comprehensive career summary...');

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return buildFallbackSummary(combinedData);
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
      return buildFallbackSummary(combinedData);
    }

    const result = await response.json();
    let summary = result.choices?.[0]?.message?.content?.trim();

    if (summary && summary.length > 30) {
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

    return buildFallbackSummary(combinedData);
  } catch (error) {
    console.error('[ProfileEnrichment] Rich summary generation failed:', error.message);
    return buildFallbackSummary(combinedData);
  }
}

/**
 * Generate a narrative summary from structured profile data
 */
export async function generateSummary(profileData) {
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
        messages: [{ role: 'user', content: prompt }],
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
 * Build a simple fallback summary when API calls fail
 */
export function buildFallbackSummary(data) {
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
 * Build a factual summary ONLY from real data -- NO hallucination
 */
export function buildFactualSummary(data) {
  const name = data.discovered_name || 'This person';
  const title = data.discovered_title || '';
  const company = data.discovered_company || '';
  const location = data.discovered_location || '';
  const industry = data.scrapin_industry || '';
  const summary = data.scrapin_summary || '';
  const careerTimeline = data.career_timeline || '';

  // Start with LinkedIn summary if available
  if (summary) {
    return summary;
  }

  // If we have career_timeline, extract key info
  if (careerTimeline && careerTimeline.length > 100) {
    let cleanCareer = careerTimeline
      .replace(/\*\*/g, '')
      .replace(/\[[\d,]+\]/g, '')
      .replace(/\n#+\s+/g, ' ')
      .replace(/\n-\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

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
