/**
 * Breach-to-Integration Mapper
 * Maps HIBP/emailrep breach service names to TwinMe's active integrations.
 * Pure function — no I/O, no API calls.
 */

// HIBP breach names (case-insensitive) -> TwinMe integration slugs
const INTEGRATION_MAP = {
  // Direct TwinMe integrations (10 active)
  spotify: 'spotify',
  'google+': 'google_calendar',
  google: 'google_calendar',
  gmail: 'gmail',
  youtube: 'youtube',
  discord: 'discord',
  linkedin: 'linkedin',
  github: 'github',
  reddit: 'reddit',
  twitch: 'twitch',
  // WHOOP doesn't appear in breaches typically

  // Aliases and related services
  'linkedin.com': 'linkedin',
  'github.com': 'github',
  'discord.gg': 'discord',
  'reddit.com': 'reddit',
  'twitch.tv': 'twitch',
  'spotify.com': 'spotify',
};

// Broader social platforms (not integrated but signal-worthy)
const SOCIAL_MAP = {
  twitter: 'twitter',
  'x.com': 'twitter',
  instagram: 'instagram',
  facebook: 'facebook',
  snapchat: 'snapchat',
  tiktok: 'tiktok',
  pinterest: 'pinterest',
  tumblr: 'tumblr',
  myspace: 'myspace',
  'last.fm': 'lastfm',
  lastfm: 'lastfm',
  soundcloud: 'soundcloud',
  steam: 'steam',
  epicgames: 'epic_games',
  'epic games': 'epic_games',
  playstation: 'playstation',
  xbox: 'xbox',
  nintendo: 'nintendo',
  strava: 'strava',
  fitbit: 'fitbit',
  duolingo: 'duolingo',
  goodreads: 'goodreads',
  letterboxd: 'letterboxd',
  yelp: 'yelp',
  airbnb: 'airbnb',
  dropbox: 'dropbox',
  adobe: 'adobe',
  canva: 'canva',
  notion: 'notion',
  slack: 'slack',
  trello: 'trello',
};

/**
 * Map an array of breach service names to TwinMe integration slugs
 * and broader social platform presence.
 *
 * @param {string[]} breachServices — raw service names from HIBP/emailrep
 * @returns {{ integrations: string[], socialProfiles: string[], allPlatforms: string[], totalDigitalFootprint: number }}
 */
export function mapBreachesToIntegrations(breachServices) {
  if (!Array.isArray(breachServices) || breachServices.length === 0) {
    return { integrations: [], socialProfiles: [], allPlatforms: [], totalDigitalFootprint: 0 };
  }

  const integrations = new Set();
  const socialProfiles = new Set();
  const allPlatforms = new Set();

  for (const service of breachServices) {
    const lower = service.toLowerCase().trim();

    // Check TwinMe integrations first
    const integration = INTEGRATION_MAP[lower];
    if (integration) {
      integrations.add(integration);
      allPlatforms.add(integration);
      continue;
    }

    // Check social platforms
    const social = SOCIAL_MAP[lower];
    if (social) {
      socialProfiles.add(social);
      allPlatforms.add(social);
      continue;
    }

    // Everything else counts toward digital footprint
    allPlatforms.add(lower);
  }

  return {
    integrations: [...integrations],
    socialProfiles: [...socialProfiles],
    allPlatforms: [...allPlatforms],
    totalDigitalFootprint: allPlatforms.size,
  };
}
