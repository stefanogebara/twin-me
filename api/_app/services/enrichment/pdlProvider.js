/**
 * People Data Labs enrichment provider
 * Email -> professional profile (experience, education, skills, social URLs)
 * Free: 100 records/month. Paid: ~$0.28/record
 *
 * This provider uses the PDL SDK for the quick enrichment pipeline.
 * Distinct from the raw HTTP callPeopleDataLabsAPI in dataProviders.js
 * (which is used in the full enrichment waterfall).
 */
import PDLJS from 'peopledatalabs';
import { createLogger } from '../logger.js';

const log = createLogger('PDLProvider');
const PDL_API_KEY = process.env.PDL_API_KEY;

/**
 * Enrich a user profile from PDL by email.
 * Returns structured professional data or null if unavailable.
 *
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
export async function enrichFromPDL(email) {
  if (!PDL_API_KEY) {
    log.debug('PDL_API_KEY not set — skipping');
    return null;
  }

  try {
    const PDL = new PDLJS({ apiKey: PDL_API_KEY });
    const { data } = await PDL.person.enrichment({ email });

    if (!data) return null;

    return {
      source: 'pdl',
      name: data.full_name || null,
      headline: data.job_title || null,
      company: data.job_company_name || null,
      industry: data.industry || null,
      location: data.location_name || null,
      experience: (data.experience || []).map(e => ({
        title: e.title?.name || null,
        company: e.company?.name || null,
        startDate: e.start_date || null,
        endDate: e.end_date || null,
        isCurrent: e.is_primary || false,
      })).slice(0, 5),
      education: (data.education || []).map(e => ({
        school: e.school?.name || null,
        degree: (e.degrees || []).join(', ') || null,
        field: (e.majors || []).join(', ') || null,
      })).slice(0, 3),
      skills: (data.skills || []).slice(0, 15),
      interests: (data.interests || []).slice(0, 10),
      linkedin_url: data.linkedin_url || null,
      github_url: data.github_url || null,
      twitter_url: data.twitter_url || null,
      facebook_url: data.facebook_url || null,
    };
  } catch (err) {
    if (err?.status === 404) return null;
    log.warn('PDL enrichment failed', { error: err.message });
    return null;
  }
}
