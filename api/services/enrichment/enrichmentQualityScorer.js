/**
 * Enrichment Quality Scorer
 * Scores how much useful data the free enrichment sources returned.
 * If score < threshold, triggers paid fallback (PDL).
 * Pure function — no I/O, no API calls.
 */

/**
 * Score the quality of free enrichment results.
 *
 * @param {Object} data — merged enrichment data from free sources
 * @returns {{ score: number, isMinimal: boolean, missingFields: string[] }}
 */
export function scoreEnrichmentQuality(data) {
  if (!data) return { score: 0, isMinimal: true, missingFields: ['everything'] };

  let score = 0;
  const missingFields = [];

  // Identity fields (most valuable)
  if (data.discovered_name) { score += 2; } else { missingFields.push('name'); }
  if (data.discovered_photo) { score += 1; } else { missingFields.push('photo'); }
  if (data.discovered_bio) { score += 2; } else { missingFields.push('bio'); }
  if (data.discovered_company) { score += 2; } else { missingFields.push('company'); }
  if (data.discovered_location) { score += 1; } else { missingFields.push('location'); }

  // Social presence (1 point per link, max 5)
  const socialCount = data.social_links?.length || 0;
  score += Math.min(socialCount, 5);
  if (socialCount === 0) missingFields.push('social_links');

  // Platform data
  if (data.github_repos) score += 2;
  if (data.reddit_interests?.length) score += 1;
  if (data.hn_karma) score += 1;

  // Breach/reputation data
  if (data.breach_services?.length) score += 1;
  if (data.email_reputation) score += 1;

  // WMN platforms
  if (data.wmn_count > 0) score += 1;

  // Total possible: ~18
  // Threshold: if score < 5, free sources returned "minimal data"
  const MINIMAL_THRESHOLD = 5;

  return {
    score,
    isMinimal: score < MINIMAL_THRESHOLD,
    missingFields,
  };
}
