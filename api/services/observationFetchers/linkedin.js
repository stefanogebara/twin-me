/**
 * LinkedIn observation fetcher.
 * Extracted from observationIngestion.js — do not change function signatures.
 */

import axios from 'axios';
import { getValidAccessToken } from '../tokenRefreshService.js';
import { createLogger } from '../logger.js';
import { sanitizeExternal, getSupabase } from '../observationUtils.js';

const log = createLogger('ObservationIngestion');

/**
 * Fetch LinkedIn data and return natural-language observations.
 * Uses the LinkedIn REST API + OpenID Connect userinfo endpoint.
 */
async function fetchLinkedInObservations(userId) {
  const observations = [];

  const tokenResult = await getValidAccessToken(userId, 'linkedin');
  if (!tokenResult.success || !tokenResult.accessToken) {
    log.warn('LinkedIn: no valid token', { userId });
    return observations;
  }

  const headers = {
    Authorization: `Bearer ${tokenResult.accessToken}`,
    'LinkedIn-Version': '202304',
  };

  // Try richer LinkedIn v2 profile first (r_liteprofile scope)
  let headline = null;
  let industry = null;
  try {
    const profileRes = await axios.get(
      'https://api.linkedin.com/v2/me?projection=(localizedFirstName,localizedLastName,localizedHeadline,industryName)',
      { headers, timeout: 10000 }
    );
    headline = sanitizeExternal(profileRes.data?.localizedHeadline, 120) || null;
    industry = sanitizeExternal(profileRes.data?.industryName, 80) || null;
  } catch {
    // Scope may not cover this endpoint — fall through to userinfo
  }

  // OpenID Connect userinfo fallback (works with `profile` scope)
  let locale = null;
  try {
    const userInfoRes = await axios.get(
      'https://api.linkedin.com/v2/userinfo',
      { headers, timeout: 10000 }
    );
    const data = userInfoRes.data || {};
    if (!headline && data.name) {
      headline = sanitizeExternal(data.name, 120);
    }
    // locale is an object {country, language} or a string like "en_US"
    if (data.locale) {
      const country = typeof data.locale === 'object' ? data.locale.country : null;
      if (country) locale = country;
    }
  } catch (e) {
    log.warn('LinkedIn userinfo error', { error: e });
  }

  // Emit observations only for fields that have real signal
  if (headline) {
    observations.push({
      content: `LinkedIn professional headline: "${headline}"`,
      contentType: 'weekly_summary',
    });

    // Headline depth analysis: detect role seniority signals
    const seniorityPatterns = {
      executive: /\b(CEO|CTO|CFO|COO|CMO|VP|Vice President|Director|Head of|Chief|Partner|Founder|Co-founder)\b/i,
      senior: /\b(Senior|Lead|Principal|Staff|Architect|Manager)\b/i,
      mid: /\b(Engineer|Developer|Designer|Analyst|Consultant|Specialist|Coordinator)\b/i,
      entry: /\b(Junior|Associate|Intern|Trainee|Entry|Graduate|Apprentice)\b/i,
    };
    for (const [level, pattern] of Object.entries(seniorityPatterns)) {
      if (pattern.test(headline)) {
        const labels = { executive: 'executive/leadership', senior: 'senior-level', mid: 'mid-career', entry: 'early-career' };
        observations.push({
          content: `LinkedIn headline suggests ${labels[level]} professional positioning`,
          contentType: 'weekly_summary',
        });
        break;
      }
    }
  }
  if (industry) {
    observations.push({
      content: `Works in the ${industry} industry (from LinkedIn)`,
      contentType: 'weekly_summary',
    });
  }
  if (locale && !industry && !headline) {
    // Only emit locale if we have nothing else
    observations.push({
      content: `LinkedIn profile located in ${locale}`,
      contentType: 'weekly_summary',
    });
  }

  // Connection count (if available via v2 API)
  let connectionCount = null;
  try {
    const connectionsRes = await axios.get(
      'https://api.linkedin.com/v2/connections?q=viewer&count=0',
      { headers, timeout: 10000 }
    );
    connectionCount = connectionsRes.data?.paging?.total ?? null;
    if (connectionCount !== null && connectionCount > 0) {
      const networkLabel = connectionCount > 500 ? 'extensive' : connectionCount > 100 ? 'solid' : 'growing';
      observations.push({
        content: `LinkedIn network: ${connectionCount}+ connections (${networkLabel} professional network)`,
        contentType: 'weekly_summary',
      });
    }
  } catch {
    // Connection count requires specific scope — non-fatal
  }

  // ── Store structured LinkedIn data in user_platform_data ──
  // The feature extractor (linkedinExtractor.js) reads from user_platform_data
  // with data_type='profile'. Without this, all feature calculations return null.
  log.info('LinkedIn upsert check', { userId: userId.slice(0, 8), hasHeadline: !!headline, hasIndustry: !!industry, hasConnections: connectionCount !== null });
  try {
    const supabase = await getSupabase();
    if (supabase && (headline || industry || connectionCount)) {
      // Extract skills from headline (LinkedIn API skills endpoint requires special scope)
      const headlineSkills = [];
      if (headline) {
        const skillPatterns = /\b(python|javascript|typescript|react|node|aws|cloud|devops|ai|ml|machine learning|data science|product|design|ux|marketing|sales|finance|consulting|engineering|developer|architect)\b/gi;
        const matches = headline.match(skillPatterns) || [];
        matches.forEach(s => headlineSkills.push(s.toLowerCase()));
      }

      const profileData = {
        headline: headline || null,
        industry: industry || null,
        connections: connectionCount,
        locale: locale || null,
        skills: headlineSkills.length > 0 ? headlineSkills : undefined,
        profilePicture: true, // assume exists (we got profile data)
      };

      const today = new Date().toISOString().slice(0, 10);
      const { error: upsertErr } = await supabase.from('user_platform_data').upsert({
        user_id: userId,
        platform: 'linkedin',
        data_type: 'profile',
        source_url: `linkedin:profile:${today}`,
        raw_data: profileData,
        extracted_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform,data_type,source_url' });
      if (upsertErr) {
        log.warn('LinkedIn user_platform_data upsert error', { error: upsertErr.message });
      } else {
        log.info('LinkedIn structured data stored', { userId: userId.slice(0, 8), hasHeadline: !!headline, hasIndustry: !!industry, connections: connectionCount });
      }
    }
  } catch (e) {
    log.warn('LinkedIn structured data storage failed (non-fatal)', { error: e.message });
  }

  return observations;
}

export default fetchLinkedInObservations;
export { fetchLinkedInObservations };
