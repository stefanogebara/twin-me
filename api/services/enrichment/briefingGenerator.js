/**
 * Briefing Generator
 *
 * Generates a compelling "first impression" briefing from enrichment data.
 * This is what the user sees during onboarding: "Here's what we found about you."
 *
 * Uses TIER_ANALYSIS (DeepSeek) to synthesize raw enrichment data into a
 * structured narrative — headline, observations, gaps, and CTA.
 *
 * Cost: ~$0.001 per briefing (500 tokens max output)
 */

import { complete, TIER_ANALYSIS } from '../llmGateway.js';
import { createLogger } from '../logger.js';

const log = createLogger('BriefingGenerator');

/**
 * Build a flat summary of all enrichment data for the LLM prompt.
 * Filters out null/empty fields and formats arrays into readable strings.
 *
 * @param {Object} data - Merged enrichment data (quick + deep + PDL)
 * @returns {string} Human-readable summary of available data
 */
function summarizeEnrichmentData(data) {
  const lines = [];

  if (data.user_provided_linkedin_url) lines.push(`LinkedIn (user-provided): ${data.user_provided_linkedin_url}`);
  if (data.discovered_name) lines.push(`Name: ${data.discovered_name}`);
  if (data.discovered_company) lines.push(`Company: ${data.discovered_company}`);
  if (data.discovered_title) lines.push(`Title: ${data.discovered_title}`);
  if (data.discovered_location) lines.push(`Location: ${data.discovered_location}`);
  if (data.discovered_bio) lines.push(`Bio: ${data.discovered_bio}`);

  // GitHub
  if (data.github_languages?.length) {
    lines.push(`GitHub languages: ${data.github_languages.join(', ')}`);
  }
  if (data.github_top_repos?.length) {
    const repos = data.github_top_repos.map(r => {
      const desc = r.description ? ` — ${r.description}` : '';
      const lang = r.language ? ` [${r.language}]` : '';
      const stars = r.stars ? ` (${r.stars} stars)` : '';
      return `${r.name}${desc}${lang}${stars}`;
    });
    lines.push(`GitHub projects: ${repos.join('; ')}`);
  }
  if (data.github_repos != null) lines.push(`GitHub public repos: ${data.github_repos}`);
  if (data.github_followers != null) lines.push(`GitHub followers: ${data.github_followers}`);

  // Social
  if (data.social_links?.length) {
    const platforms = data.social_links.map(l => l.platform).join(', ');
    lines.push(`Found on platforms: ${platforms}`);
  }
  if (data.discovered_platforms?.length) {
    lines.push(`Discovered platforms (email registered): ${data.discovered_platforms.join(', ')}`);
  }

  // Twitter
  if (data.twitter_handle) lines.push(`Twitter/X: @${data.twitter_handle}`);
  if (data.twitter_bio) lines.push(`Twitter bio: ${data.twitter_bio}`);

  // Hacker News
  if (data.hn_topics?.length) lines.push(`Hacker News topics: ${data.hn_topics.join(', ')}`);
  if (data.hn_karma) lines.push(`Hacker News karma: ${data.hn_karma}`);
  if (data.hn_bio) lines.push(`Hacker News bio: ${data.hn_bio}`);

  // Reddit
  if (data.reddit_interests?.length) lines.push(`Reddit interests: ${data.reddit_interests.join(', ')}`);
  if (data.reddit_karma) {
    lines.push(`Reddit karma: link=${data.reddit_karma.link}, comment=${data.reddit_karma.comment}`);
  }
  if (data.reddit_bio) lines.push(`Reddit bio: ${data.reddit_bio}`);

  // Spotify
  if (data.spotify_exists) lines.push('Spotify: account found');

  // Hunter.io
  if (data.hunter_company) lines.push(`Hunter.io company: ${data.hunter_company}`);
  if (data.hunter_position) lines.push(`Hunter.io position: ${data.hunter_position}`);

  // PDL
  if (data.pdl_headline) lines.push(`Professional headline: ${data.pdl_headline}`);
  if (data.pdl_industry) lines.push(`Industry: ${data.pdl_industry}`);
  if (data.pdl_experience?.length) {
    const exp = data.pdl_experience.slice(0, 3).map(e =>
      `${e.title?.name || e.title || 'Role'} at ${e.company?.name || e.company || 'Company'}`
    );
    lines.push(`Experience: ${exp.join('; ')}`);
  }
  if (data.pdl_education?.length) {
    const edu = data.pdl_education.slice(0, 2).map(e =>
      `${e.degrees?.join(', ') || e.degree || 'Degree'} from ${e.school?.name || e.school || 'School'}`
    );
    lines.push(`Education: ${edu.join('; ')}`);
  }
  if (data.pdl_skills?.length) {
    lines.push(`Skills: ${data.pdl_skills.slice(0, 10).join(', ')}`);
  }
  if (data.pdl_interests?.length) {
    lines.push(`Interests: ${data.pdl_interests.slice(0, 10).join(', ')}`);
  }

  // Career / education from deep enrich
  if (data.career_timeline && !data.pdl_experience?.length) {
    lines.push(`Career: ${data.career_timeline.slice(0, 300)}`);
  }
  if (data.education && !data.pdl_education?.length) {
    lines.push(`Education: ${data.education.slice(0, 200)}`);
  }
  if (data.achievements) lines.push(`Achievements: ${data.achievements.slice(0, 200)}`);
  if (data.skills && !data.pdl_skills?.length) lines.push(`Skills: ${data.skills.slice(0, 200)}`);

  // Personal
  if (data.interests_and_hobbies) lines.push(`Hobbies: ${data.interests_and_hobbies.slice(0, 200)}`);
  if (data.personality_traits) lines.push(`Personality signals: ${data.personality_traits.slice(0, 200)}`);

  return lines.join('\n');
}

/**
 * Count how many "substantial" data points we have.
 * Used to decide between LLM briefing vs fallback.
 */
function countDataPoints(data) {
  let count = 0;
  if (data.discovered_name) count++;
  if (data.discovered_company) count++;
  if (data.discovered_title) count++;
  if (data.discovered_location) count++;
  if (data.discovered_bio) count++;
  if (data.github_top_repos?.length) count++;
  if (data.github_languages?.length) count++;
  if (data.social_links?.length) count++;
  if (data.twitter_handle) count++;
  if (data.hn_topics?.length) count++;
  if (data.reddit_interests?.length) count++;
  if (data.spotify_exists) count++;
  if (data.pdl_headline) count++;
  if (data.pdl_experience?.length) count++;
  if (data.pdl_education?.length) count++;
  if (data.career_timeline) count++;
  if (data.discovered_platforms?.length) count++;
  return count;
}

/**
 * Build a minimal fallback briefing when data is too sparse for LLM.
 */
function buildFallbackBriefing(data) {
  const name = data.discovered_name || 'there';
  const observations = [];

  if (data.discovered_company && data.discovered_title) {
    observations.push(`You work as ${data.discovered_title} at ${data.discovered_company}`);
  } else if (data.discovered_company) {
    observations.push(`You're at ${data.discovered_company}`);
  }

  if (data.github_languages?.length) {
    observations.push(`You code in ${data.github_languages.join(' and ')}`);
  }

  if (data.social_links?.length > 1) {
    const platforms = data.social_links.map(l => l.platform).join(', ');
    observations.push(`We found you on ${platforms}`);
  }

  if (data.spotify_exists) {
    observations.push('You have a Spotify account — connecting it would reveal a lot about you');
  }

  return {
    headline: observations.length > 0
      ? `Welcome, ${name.split(' ')[0]} — we're starting to see who you are.`
      : `Welcome, ${name.split(' ')[0]} — let's discover who you are.`,
    observations: observations.length > 0
      ? observations
      : ["We're just getting to know you — connect some platforms to unlock your portrait"],
    gaps: [
      'Connect your Spotify, calendar, or other platforms to build a richer picture',
    ],
    cta: 'Connect a platform to unlock your full portrait',
  };
}

/**
 * Parse the LLM JSON response, with fallback for malformed output.
 */
function parseBriefingResponse(content) {
  // Try to extract JSON from the response (handles markdown code blocks)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!parsed.headline || !Array.isArray(parsed.observations)) {
      return null;
    }

    return {
      headline: String(parsed.headline).trim(),
      observations: parsed.observations
        .filter(o => o && typeof o === 'string')
        .map(o => o.trim())
        .slice(0, 5),
      gaps: Array.isArray(parsed.gaps)
        ? parsed.gaps.filter(g => g && typeof g === 'string').map(g => g.trim()).slice(0, 3)
        : [],
      cta: parsed.cta ? String(parsed.cta).trim() : 'Connect more platforms to deepen your portrait',
    };
  } catch {
    return null;
  }
}

/**
 * Generate a compelling first-impression briefing from enrichment data.
 *
 * This is what the user sees during onboarding: "Here's what we found about you."
 * Uses DeepSeek (TIER_ANALYSIS) to synthesize raw enrichment data into narrative.
 *
 * @param {Object} enrichmentData - All merged enrichment data (quick + deep + PDL)
 * @param {Object} [options]
 * @param {string} [options.userId] - For cost tracking
 * @returns {Promise<Object>} Structured briefing: { headline, observations, gaps, cta }
 */
export async function generateOnboardingBriefing(enrichmentData, options = {}) {
  const startTime = Date.now();

  if (!enrichmentData || typeof enrichmentData !== 'object') {
    log.warn('No enrichment data provided');
    return buildFallbackBriefing({});
  }

  const dataPointCount = countDataPoints(enrichmentData);
  log.info(`Generating briefing from ${dataPointCount} data points`);

  // If we have very little data, skip the LLM call entirely
  if (dataPointCount < 2) {
    log.info('Sparse data — using fallback briefing');
    return buildFallbackBriefing(enrichmentData);
  }

  const dataSummary = summarizeEnrichmentData(enrichmentData);

  const linkedInNote = enrichmentData.user_provided_linkedin_url
    ? `\nIMPORTANT: The user confirmed their LinkedIn profile is ${enrichmentData.user_provided_linkedin_url}. ALL observations MUST be about the person at that LinkedIn profile. Do not mix in details from other people with similar names.\n`
    : '';

  const system = `You are generating a "first impression" briefing for a new user of TwinMe, a digital twin platform. Based on the data provided, write a compelling briefing that makes the user feel understood.
${linkedInNote}
Rules:
- The headline should be 1 sentence that captures their essence as a person
- Each observation should be SPECIFIC — cite actual data (repo names, platforms, story titles, languages)
- Sound like a perceptive friend, not a stalker. Warm and impressed, not clinical.
- If the person is a developer, mention their tech stack and projects
- If the person is NOT a developer (chef, student, artist, etc.), focus on their creative/social/professional presence
- NEVER make up information not in the data
- If data is sparse, be honest: "We're just getting to know you" — and focus on what we DID find
- List 1-2 gaps — things we couldn't find — as motivation to connect more platforms
- Keep it SHORT — headline + 3-5 observations + 1-2 gaps + 1 CTA
- Respond ONLY in valid JSON, no markdown, no commentary`;

  const userMessage = `Here is everything we discovered about this user:

${dataSummary}

Respond in this exact JSON format:
{
  "headline": "One sentence that captures who this person is",
  "observations": ["Specific observation 1", "Specific observation 2", "..."],
  "gaps": ["What we don't know yet — motivation to connect more", "..."],
  "cta": "Suggested next action"
}`;

  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 500,
      temperature: 0.6,
      userId: options.userId,
      serviceName: 'onboarding-briefing',
    });

    const parsed = parseBriefingResponse(result.content);
    const elapsed = Date.now() - startTime;

    if (!parsed) {
      log.warn(`Failed to parse LLM briefing response (${elapsed}ms), using fallback`);
      return buildFallbackBriefing(enrichmentData);
    }

    log.info(`Briefing generated in ${elapsed}ms: "${parsed.headline.slice(0, 60)}..." (${parsed.observations.length} observations)`);
    return parsed;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    log.error(`Briefing generation failed (${elapsed}ms):`, error.message);
    return buildFallbackBriefing(enrichmentData);
  }
}
