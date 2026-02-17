/**
 * Data Provider Functions
 *
 * Third-party database/API lookup functions for profile enrichment:
 * - People Data Labs (PDL) - professional database
 * - Scrapin.io - LinkedIn email-to-profile resolution & full profile fetch
 * - Reverse Contact - real-time OSINT enrichment
 */

// ============================================================
// People Data Labs
// ============================================================

/**
 * Call People Data Labs API for accurate profile enrichment
 */
export async function callPeopleDataLabsAPI(email, name, apiKey) {
  console.log('[ProfileEnrichment] Calling People Data Labs API...');

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      email: email,
      pretty: 'true'
    });

    if (name) {
      params.append('name', name);
    }

    const response = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[ProfileEnrichment] PDL API error: ${response.status} - ${errorText}`);
      if (response.status === 404) {
        return { success: false, data: null, error: 'No match found' };
      }
      return { success: false, data: null, error: `API error: ${response.status}` };
    }

    const result = await response.json();
    console.log('[ProfileEnrichment] PDL API response status:', result.status);

    if (result.status !== 200 || !result.data) {
      console.log('[ProfileEnrichment] PDL: No match found');
      return { success: false, data: null };
    }

    const person = result.data;
    console.log('[ProfileEnrichment] PDL found person:', person.full_name);

    const enrichmentData = {
      discovered_name: person.full_name || name,
      discovered_company: person.job_company_name || null,
      discovered_title: person.job_title || null,
      discovered_location: formatPDLLocation(person),
      discovered_linkedin_url: person.linkedin_url || null,
      discovered_twitter_url: person.twitter_url || null,
      discovered_github_url: person.github_url || null,
      discovered_bio: buildPDLBio(person),
      pdl_id: person.id,
      pdl_likelihood: result.likelihood,
      industry: person.industry || null,
      job_start_date: person.job_start_date || null,
      skills: person.skills || [],
      interests: person.interests || [],
      education: person.education || [],
      experience: person.experience || []
    };

    return { success: true, data: enrichmentData, raw: result };

  } catch (error) {
    console.error('[ProfileEnrichment] PDL API request failed:', error);
    return { success: false, data: null, error: error.message };
  }
}

/**
 * Convert PDL response format to our enrichment format
 */
export function convertPDLToEnrichment(pdlData) {
  const careerTimeline = formatPDLExperience(pdlData.experience || []);
  const education = formatPDLEducation(pdlData.education || []);
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
    career_timeline: careerTimeline || null,
    education: education || null,
    skills: skills || null,
    pdl_id: pdlData.pdl_id,
    pdl_likelihood: pdlData.pdl_likelihood,
    industry: pdlData.industry
  };
}

export function formatPDLLocation(person) {
  const parts = [];
  if (person.location_locality) parts.push(person.location_locality);
  if (person.location_region) parts.push(person.location_region);
  if (person.location_country) parts.push(person.location_country);
  return parts.length > 0 ? parts.join(', ') : null;
}

export function buildPDLBio(person) {
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

export function formatPDLExperience(experience) {
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

export function formatPDLEducation(education) {
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

// ============================================================
// Scrapin.io
// ============================================================

/**
 * Call Scrapin.io API for email-to-profile resolution
 */
export async function callScrapinAPI(email, name, apiKey) {
  console.log('[ProfileEnrichment] Calling Scrapin.io API...');

  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      email: email
    });

    const response = await fetch(`https://api.scrapin.io/v1/enrichment/resolve/email?${params}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[ProfileEnrichment] Scrapin.io API error: ${response.status} - ${errorText}`);
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

    if (!result.success || !result.person) {
      console.log('[ProfileEnrichment] Scrapin.io: No match found');
      return { success: false, data: null };
    }

    const person = result.person;
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

    const careerTimeline = formatScrapinPositions(positionHistory);
    const education = formatScrapinEducation(educationHistory);
    const skills = (person.skills || []).join(', ');

    const enrichmentData = {
      discovered_name: person.firstName && person.lastName
        ? `${person.firstName} ${person.lastName}`
        : name,
      discovered_company: extractScrapinCompany(person),
      discovered_title: person.headline || extractScrapinTitle(person),
      discovered_location: formatScrapinLocation(person.location),
      discovered_linkedin_url: person.linkedInUrl || null,
      discovered_twitter_url: null,
      discovered_github_url: null,
      discovered_bio: person.headline || null,
      career_timeline: careerTimeline || null,
      education: education || null,
      skills: skills || null,
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

    return { success: true, data: enrichmentData, raw: result };

  } catch (error) {
    console.error('[ProfileEnrichment] Scrapin.io API request failed:', error);
    return { success: false, data: null, error: error.message };
  }
}

/**
 * Fetch full LinkedIn profile from Scrapin.io using profile URL
 */
export async function fetchScrapinFullProfile(linkedInUrl, apiKey) {
  console.log('[ProfileEnrichment] Fetching full profile from Scrapin.io...');

  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      linkedInUrl: linkedInUrl
    });

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

    const careerTimeline = formatScrapinPositions(positionHistory);
    const education = formatScrapinEducation(educationHistory);
    const skills = (person.skills || []).join(', ');

    let extractedTitle = null;
    let extractedCompany = null;
    if (person.headline) {
      const headlineMatch = person.headline.match(/^(.+?)\s+at\s+(.+)$/i);
      if (headlineMatch) {
        extractedTitle = headlineMatch[1].trim();
        extractedCompany = headlineMatch[2].trim();
      }
    }

    const locationParts = [];
    if (person.location?.city) locationParts.push(person.location.city);
    if (person.location?.state) locationParts.push(person.location.state);
    if (person.location?.country) locationParts.push(person.location.country);
    const formattedLocation = locationParts.join(', ') || null;

    return {
      success: true,
      data: {
        discovered_name: `${person.firstName || ''} ${person.lastName || ''}`.trim() || null,
        discovered_title: extractedTitle || null,
        discovered_company: extractedCompany || null,
        discovered_location: formattedLocation,
        discovered_bio: person.summary || null,
        career_timeline: careerTimeline || null,
        education: education || null,
        skills: skills || null,
        achievements: null,
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

export function formatScrapinPositions(positions) {
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

export function formatScrapinEducation(schools) {
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

export function extractScrapinCompany(person) {
  if (person.headline) {
    const atMatch = person.headline.match(/\bat\s+(.+?)(?:\s*[|\-•]|$)/i);
    if (atMatch) {
      return atMatch[1].trim();
    }
  }
  return null;
}

export function extractScrapinTitle(person) {
  if (person.headline) {
    const titleMatch = person.headline.match(/^(.+?)\s+at\s+/i);
    if (titleMatch) {
      return titleMatch[1].trim();
    }
    const parts = person.headline.split(/[|\-•]/);
    if (parts.length > 0) {
      return parts[0].trim();
    }
  }
  return null;
}

export function formatScrapinLocation(location) {
  if (!location) return null;
  if (typeof location === 'object') {
    const parts = [];
    if (location.city) parts.push(location.city);
    if (location.state) parts.push(location.state);
    if (location.country) parts.push(location.country);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  return typeof location === 'string' ? location : null;
}

// ============================================================
// Reverse Contact
// ============================================================

/**
 * Call Reverse Contact API for real-time OSINT enrichment
 */
export async function callReverseContactAPI(email, name, apiKey) {
  console.log('[ProfileEnrichment] Calling Reverse Contact API...');

  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      email: email
    });

    if (name) {
      const nameParts = name.split(' ');
      if (nameParts.length >= 2) {
        params.append('firstName', nameParts[0]);
        params.append('lastName', nameParts.slice(1).join(' '));
      }
    }

    const response = await fetch(`https://api.reversecontact.com/enrichment?${params}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[ProfileEnrichment] Reverse Contact API error: ${response.status} - ${errorText}`);
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

    const enrichmentData = {
      discovered_name: person.firstName && person.lastName
        ? `${person.firstName} ${person.lastName}`
        : name,
      discovered_company: company.name || extractCompanyFromPerson(person),
      discovered_title: person.headline || person.positions?.[0]?.title || null,
      discovered_location: formatRCLocation(person.location),
      discovered_linkedin_url: person.linkedInUrl || null,
      discovered_twitter_url: null,
      discovered_github_url: null,
      discovered_bio: person.headline || null,
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

    return { success: true, data: enrichmentData, raw: result };

  } catch (error) {
    console.error('[ProfileEnrichment] Reverse Contact API request failed:', error);
    return { success: false, data: null, error: error.message };
  }
}

export function extractCompanyFromPerson(person) {
  if (person.positions && person.positions.length > 0) {
    const currentPosition = person.positions.find(p => !p.endDate);
    if (currentPosition && currentPosition.companyName) {
      return currentPosition.companyName;
    }
    return person.positions[0].companyName || null;
  }
  return null;
}

export function formatRCLocation(location) {
  if (!location) return null;
  if (typeof location === 'string') return location;
  const parts = [];
  if (location.city) parts.push(location.city);
  if (location.state) parts.push(location.state);
  if (location.country) parts.push(location.country);
  return parts.length > 0 ? parts.join(', ') : null;
}
