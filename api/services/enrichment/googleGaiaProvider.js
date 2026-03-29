/**
 * Google Gaia ID Enrichment Provider
 * Extracts Gaia ID from Google People API after OAuth.
 * Queries Maps contributions and linked YouTube channel.
 *
 * Runs as fire-and-forget after Google OAuth callback —
 * does NOT block the OAuth redirect flow.
 */
import { createLogger } from '../logger.js';

const log = createLogger('GoogleGaiaProvider');

/**
 * Extract Google profile data using the People API.
 * Uses the existing userinfo.profile scope (already requested).
 *
 * @param {string} accessToken — Google OAuth access token
 * @returns {Promise<Object|null>}
 */
export async function enrichFromGoogleProfile(accessToken) {
  if (!accessToken) {
    log.debug('No access token — skipping Google profile enrichment');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    // People API — get profile with metadata (includes Gaia ID)
    const res = await fetch(
      'https://people.googleapis.com/v1/people/me?personFields=metadata,names,photos,urls,biographies,emailAddresses,phoneNumbers,organizations,locations',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);

    if (!res.ok) {
      // Fall back to userinfo endpoint (simpler, always works with profile scope)
      return await fallbackUserInfo(accessToken);
    }

    const person = await res.json();

    // Extract Gaia ID from metadata sources
    const gaiaId = person.metadata?.sources
      ?.find(s => s.type === 'PROFILE')?.id || null;

    // Extract fields
    const name = person.names?.[0]?.displayName || null;
    const photo = person.photos?.[0]?.url || null;
    const bio = person.biographies?.[0]?.value || null;
    const org = person.organizations?.[0];
    const location = person.locations?.[0]?.value || null;

    // Extract URLs (may include YouTube, blog, etc.)
    const urls = (person.urls || []).map(u => ({
      value: u.value,
      type: u.type || 'other',
      label: u.formattedType || u.type || 'link',
    }));

    const linkedYoutube = urls.find(u =>
      u.value?.includes('youtube.com') || u.value?.includes('youtu.be')
    )?.value || null;

    // Try to get Maps contributions if we have a Gaia ID
    const mapsData = gaiaId ? await fetchMapsContributions(gaiaId) : null;

    return {
      source: 'google_people',
      gaiaId,
      name,
      photo,
      bio,
      company: org?.name || null,
      title: org?.title || null,
      location,
      linkedYoutube,
      urls,
      mapsContributions: mapsData,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      log.warn('Google People API timed out');
    } else {
      log.warn('Google People API failed', { error: err.message });
    }
    return await fallbackUserInfo(accessToken);
  }
}

/**
 * Fallback: use the simpler userinfo endpoint.
 */
async function fallbackUserInfo(accessToken) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const info = await res.json();

    return {
      source: 'google_userinfo',
      gaiaId: info.id || null,
      name: info.name || null,
      photo: info.picture || null,
      bio: null,
      company: null,
      title: null,
      location: info.locale || null,
      linkedYoutube: null,
      urls: [],
      mapsContributions: null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch Google Maps contribution stats from the public contributor page.
 * This is HTML scraping — fragile but free.
 *
 * @param {string} gaiaId
 * @returns {Promise<{reviewCount: number, photoCount: number}|null>}
 */
async function fetchMapsContributions(gaiaId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `https://www.google.com/maps/contrib/${gaiaId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TwinMe/1.0)',
          'Accept': 'text/html',
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);

    if (!res.ok) return null;

    const html = await res.text();

    // Extract review count — look for patterns like "123 reviews"
    const reviewMatch = html.match(/(\d+)\s*review/i);
    const photoMatch = html.match(/(\d+)\s*photo/i);

    const reviewCount = reviewMatch ? parseInt(reviewMatch[1], 10) : 0;
    const photoCount = photoMatch ? parseInt(photoMatch[1], 10) : 0;

    if (reviewCount === 0 && photoCount === 0) return null;

    return { reviewCount, photoCount };
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget enrichment after Google OAuth.
 * Called from oauth-callback.js — does NOT block the redirect.
 *
 * @param {string} userId
 * @param {string} provider — 'youtube', 'google_calendar', 'google_gmail'
 * @param {string} accessToken
 */
export async function enrichGoogleProfileInBackground(userId, provider, accessToken) {
  // Only run for Google providers
  if (!['youtube', 'google_calendar', 'google_gmail'].includes(provider)) return;

  try {
    const profile = await enrichFromGoogleProfile(accessToken);
    if (!profile) return;

    // Lazy import to avoid circular deps
    const { saveEnrichment } = await import('./enrichmentStore.js');
    const { getEnrichment } = await import('./enrichmentStore.js');

    // Merge with existing enrichment data (don't overwrite)
    const existing = await getEnrichment(userId);
    const existingData = existing?.data || {};

    const mergedData = {
      ...existingData,
      // Only fill in fields that are currently empty
      discovered_name: existingData.discovered_name || profile.name,
      discovered_photo: existingData.discovered_photo || profile.photo,
      discovered_bio: existingData.discovered_bio || profile.bio,
      discovered_company: existingData.discovered_company || profile.company,
      discovered_title: existingData.discovered_title || profile.title,
      discovered_location: existingData.discovered_location || profile.location,
      // Always update Google-specific fields
      google_gaia_id: profile.gaiaId,
      google_maps_contributions: profile.mapsContributions,
      google_linked_youtube: profile.linkedYoutube,
      source: existingData.source
        ? `${existingData.source}+google_people`
        : 'google_people',
    };

    const email = existingData.email || null;
    await saveEnrichment(userId, email, mergedData);

    log.info(`Google profile enrichment saved for user ${userId}`, {
      gaiaId: !!profile.gaiaId,
      maps: !!profile.mapsContributions,
      youtube: !!profile.linkedYoutube,
    });
  } catch (err) {
    log.warn('Background Google enrichment failed', { error: err.message, userId });
  }
}
