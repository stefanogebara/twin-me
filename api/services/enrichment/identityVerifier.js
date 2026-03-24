/**
 * Identity Verifier
 *
 * Computes a confidence score that the Brave Search results actually describe
 * the same person who owns the email address. Pure heuristic scoring from
 * signal overlap -- zero extra LLM calls, zero extra API calls.
 *
 * Verified sources (Gravatar, GitHub) are ground truth.
 * Brave results are untrusted until cross-referenced.
 */

/**
 * Normalize a string for fuzzy comparison: lowercase, strip accents, collapse whitespace.
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two name strings refer to the same person.
 * Handles partial matches (first name only, last name only, reordered tokens).
 * @param {string} nameA
 * @param {string} nameB
 * @returns {{ match: boolean, partial: boolean }}
 */
function namesMatch(nameA, nameB) {
  const a = normalize(nameA);
  const b = normalize(nameB);
  if (!a || !b) return { match: false, partial: false };

  // Exact match
  if (a === b) return { match: true, partial: false };

  const tokensA = a.split(' ').filter(t => t.length > 1);
  const tokensB = b.split(' ').filter(t => t.length > 1);

  // All tokens from one name appear in the other (handles reordering)
  const allAInB = tokensA.every(t => tokensB.includes(t));
  const allBInA = tokensB.every(t => tokensA.includes(t));
  if (allAInB || allBInA) return { match: true, partial: false };

  // Partial: at least first AND last name token match
  if (tokensA.length >= 2 && tokensB.length >= 2) {
    const firstMatch = tokensA[0] === tokensB[0];
    const lastMatch = tokensA[tokensA.length - 1] === tokensB[tokensB.length - 1];
    if (firstMatch && lastMatch) return { match: true, partial: true };
  }

  // Single token overlap (weak signal)
  const overlap = tokensA.filter(t => tokensB.includes(t));
  if (overlap.length > 0) return { match: false, partial: true };

  return { match: false, partial: false };
}

/**
 * Check if a text block contains a string (case-insensitive, accent-insensitive).
 * @param {string} haystack
 * @param {string} needle
 * @returns {boolean}
 */
function containsNormalized(haystack, needle) {
  if (!haystack || !needle) return false;
  return normalize(haystack).includes(normalize(needle));
}

/**
 * Compute identity confidence score for enrichment results.
 *
 * @param {Object} params
 * @param {Object|null} params.quickData - Data from quickEnrich (Gravatar + GitHub)
 * @param {Object|null} params.braveData - Data from comprehensivePersonSearch (Brave path)
 * @param {string} params.email - User's email address
 * @param {string} params.searchName - Name used for search
 * @returns {{ score: number, signals: Object, flags: string[] }}
 */
export function computeIdentityConfidence({ quickData, braveData, email, searchName, userProvidedLinkedInUrl = null }) {
  const signals = {};
  const flags = [];

  if (!braveData) {
    return { score: 1.0, signals: { no_brave_data: true }, flags: [] };
  }

  const emailLocal = (email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const emailDomain = (email || '').split('@')[1] || '';
  const isGenericEmail = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'protonmail.com', 'aol.com', 'live.com']
    .includes(emailDomain.toLowerCase());

  const rawContent = normalize(braveData.raw_comprehensive || '');

  // --- Signal 1: Email username in results (weight 0.30) ---
  const emailInResults = emailLocal.length >= 3 && rawContent.includes(emailLocal);
  signals.email_username_in_results = emailInResults;
  const emailScore = emailInResults ? 0.30 : 0;

  if (!emailInResults && emailLocal.length >= 3) {
    flags.push('no_email_signal');
  }

  // --- Signal 2: Name cross-reference (weight 0.25) ---
  const braveDiscoveredName = braveData.discovered_name || '';
  const quickDiscoveredName = quickData?.discovered_name || '';

  // Compare Brave's discovered name against: search name, quick enrich name
  const braveVsSearch = namesMatch(braveDiscoveredName, searchName);
  const braveVsQuick = quickDiscoveredName
    ? namesMatch(braveDiscoveredName, quickDiscoveredName)
    : { match: false, partial: false };

  const nameMatches = braveVsSearch.match || braveVsQuick.match;
  const namePartial = braveVsSearch.partial || braveVsQuick.partial;
  signals.name_match = nameMatches ? 'full' : namePartial ? 'partial' : 'none';

  let nameScore = 0;
  if (nameMatches) nameScore = 0.25;
  else if (namePartial) nameScore = 0.10;

  if (!nameMatches && !namePartial && braveDiscoveredName) {
    flags.push('name_mismatch');
  }

  // --- Signal 3: GitHub URL match (weight 0.15) ---
  const quickGithub = normalize(quickData?.discovered_github_url || '');
  const braveGithub = normalize(braveData.discovered_github_url || '');
  const githubMatch = quickGithub && braveGithub && (
    quickGithub === braveGithub ||
    quickGithub.includes(braveGithub.split('/').pop()) ||
    braveGithub.includes(quickGithub.split('/').pop())
  );
  signals.github_url_match = !!githubMatch;
  const githubScore = githubMatch ? 0.15 : 0;

  // --- Signal 4: Company / domain match (weight 0.15) ---
  let companyScore = 0;
  if (!isGenericEmail && emailDomain) {
    const domainName = emailDomain.split('.')[0].toLowerCase();
    const braveCompany = normalize(braveData.discovered_company || '');
    const companyMatch = braveCompany && domainName.length >= 3 && (
      braveCompany.includes(domainName) || containsNormalized(domainName, braveCompany)
    );
    signals.company_domain_match = !!companyMatch;
    companyScore = companyMatch ? 0.15 : 0;
  } else {
    signals.company_domain_match = null; // N/A for generic emails
  }

  // --- Signal 5: Location match (weight 0.10) ---
  const quickLocation = normalize(quickData?.discovered_location || '');
  const braveLocation = normalize(braveData.discovered_location || '');
  const locationMatch = quickLocation && braveLocation && (
    quickLocation.includes(braveLocation) ||
    braveLocation.includes(quickLocation) ||
    // Check city-level overlap
    quickLocation.split(' ').some(token => token.length > 3 && braveLocation.includes(token))
  );
  signals.location_match = !!locationMatch;
  const locationScore = locationMatch ? 0.10 : 0;

  // --- Signal 6: Social URL overlap (weight 0.05) ---
  const quickSocialLinks = (quickData?.social_links || []).map(l => normalize(l.url || ''));
  const braveSocials = [
    braveData.discovered_twitter_url,
    braveData.discovered_linkedin_url,
    braveData.discovered_instagram_url,
    braveData.discovered_personal_website,
  ].filter(Boolean).map(normalize);

  const socialOverlap = quickSocialLinks.some(qUrl =>
    qUrl && braveSocials.some(bUrl => bUrl && (qUrl.includes(bUrl) || bUrl.includes(qUrl)))
  );
  signals.social_url_overlap = socialOverlap;
  const socialScore = socialOverlap ? 0.05 : 0;

  // --- Signal 7: User-provided LinkedIn URL match (weight 0.30) ---
  let linkedInScore = 0;
  if (userProvidedLinkedInUrl) {
    // Extract username from user-provided URL
    const userLiMatch = userProvidedLinkedInUrl.match(/linkedin\.com\/in\/([\w-]+)/i);
    const userLiUsername = userLiMatch ? userLiMatch[1].toLowerCase() : null;

    // Extract username from discovered LinkedIn URL
    const discoveredLiUrl = braveData.discovered_linkedin_url || '';
    const discoveredLiMatch = discoveredLiUrl.match(/linkedin\.com\/in\/([\w-]+)/i);
    const discoveredLiUsername = discoveredLiMatch ? discoveredLiMatch[1].toLowerCase() : null;

    if (userLiUsername && discoveredLiUsername) {
      if (userLiUsername === discoveredLiUsername) {
        // Strong match: user's LinkedIn matches what Brave found
        linkedInScore = 0.30;
        signals.linkedin_url_match = true;
      } else {
        // Mismatch: Brave found a DIFFERENT LinkedIn profile — likely wrong person
        linkedInScore = 0;
        signals.linkedin_url_match = false;
        flags.push('linkedin_url_mismatch');
      }
    } else if (userLiUsername && rawContent.includes(userLiUsername)) {
      // LinkedIn username appears somewhere in results (weaker signal)
      linkedInScore = 0.15;
      signals.linkedin_url_match = 'partial';
    } else if (userLiUsername) {
      // User provided LinkedIn but it doesn't appear anywhere in results
      signals.linkedin_url_match = false;
      flags.push('linkedin_url_not_found');
    }
  } else {
    signals.linkedin_url_match = null; // N/A — not provided
  }

  // --- Compute raw score ---
  let score = emailScore + nameScore + githubScore + companyScore + locationScore + socialScore + linkedInScore;

  // --- Apply penalties ---
  if (flags.includes('no_email_signal')) {
    score = Math.max(0, score - 0.20);
  }
  if (flags.includes('name_mismatch')) {
    score = Math.max(0, score - 0.30);
  }
  if (flags.includes('linkedin_url_mismatch')) {
    score = Math.max(0, score - 0.25);
  }

  // Clamp to [0, 1]
  score = Math.min(1.0, Math.max(0, score));

  // Round to 2 decimal places
  score = Math.round(score * 100) / 100;

  return { score, signals, flags };
}
