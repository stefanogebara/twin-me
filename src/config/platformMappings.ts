// Frontend platform mappings configuration
// This is a simplified version of the backend platformAPIMappings for frontend use

export interface PlatformConfig {
  name: string;
  category: 'personal' | 'professional' | 'creative';
  apiAvailable: 'Full API' | 'Limited API' | 'No API';
  icon?: string;
  description?: string;
  docsUrl?: string;
}

export const platformMappings: Record<string, PlatformConfig> = {
  // Personal Universe
  netflix: {
    name: 'Netflix',
    category: 'personal',
    apiAvailable: 'No API',
    description: 'Narrative preferences, binge patterns, emotional journeys',
    docsUrl: '#'
  },
  spotify: {
    name: 'Spotify',
    category: 'personal',
    apiAvailable: 'Full API',
    description: 'Musical taste, mood patterns, discovery behavior',
    docsUrl: 'https://developer.spotify.com/documentation/web-api'
  },
  youtube: {
    name: 'YouTube',
    category: 'personal',
    apiAvailable: 'Full API',
    description: 'Learning interests, curiosity profile, creator loyalty',
    docsUrl: 'https://developers.google.com/youtube/v3'
  },
  prime: {
    name: 'Prime Video',
    category: 'personal',
    apiAvailable: 'No API',
    description: 'Content preferences across platforms',
    docsUrl: '#'
  },
  hbo: {
    name: 'HBO Max',
    category: 'personal',
    apiAvailable: 'No API',
    description: 'Premium content preferences',
    docsUrl: '#'
  },
  disney: {
    name: 'Disney+',
    category: 'personal',
    apiAvailable: 'No API',
    description: 'Family-friendly content preferences',
    docsUrl: '#'
  },
  apple_music: {
    name: 'Apple Music',
    category: 'personal',
    apiAvailable: 'Limited API',
    description: 'Curated tastes, premium preferences',
    docsUrl: 'https://developer.apple.com/documentation/applemusicapi'
  },
  twitch: {
    name: 'Twitch',
    category: 'personal',
    apiAvailable: 'Full API',
    description: 'Live engagement, community participation',
    docsUrl: 'https://dev.twitch.tv/docs/api'
  },
  tiktok: {
    name: 'TikTok',
    category: 'personal',
    apiAvailable: 'Limited API',
    description: 'Trend participation, attention patterns',
    docsUrl: 'https://developers.tiktok.com'
  },
  discord: {
    name: 'Discord',
    category: 'personal',
    apiAvailable: 'Full API',
    description: 'Community involvement, gaming circles',
    docsUrl: 'https://discord.com/developers/docs'
  },
  steam: {
    name: 'Steam',
    category: 'personal',
    apiAvailable: 'Full API',
    description: 'Game genres, playtime patterns',
    docsUrl: 'https://steamcommunity.com/dev'
  },
  reddit: {
    name: 'Reddit',
    category: 'personal',
    apiAvailable: 'Full API',
    description: 'Discussion style, expertise areas',
    docsUrl: 'https://www.reddit.com/dev/api'
  },
  goodreads: {
    name: 'Goodreads',
    category: 'personal',
    apiAvailable: 'Limited API',
    description: 'Reading preferences, intellectual interests',
    docsUrl: 'https://www.goodreads.com/api'
  },

  // Professional Universe
  gmail: {
    name: 'Gmail',
    category: 'professional',
    apiAvailable: 'Full API',
    description: 'Communication style, response patterns',
    docsUrl: 'https://developers.google.com/gmail/api'
  },
  teams: {
    name: 'Microsoft Teams',
    category: 'professional',
    apiAvailable: 'Full API',
    description: 'Collaboration dynamics, meeting participation',
    docsUrl: 'https://docs.microsoft.com/en-us/graph/teams-concept-overview'
  },
  calendar: {
    name: 'Google Calendar',
    category: 'professional',
    apiAvailable: 'Full API',
    description: 'Schedule preferences, work-life balance',
    docsUrl: 'https://developers.google.com/calendar'
  },
  github: {
    name: 'GitHub',
    category: 'professional',
    apiAvailable: 'Full API',
    description: 'Technical skills, contribution patterns',
    docsUrl: 'https://docs.github.com/en/rest'
  },
  linkedin: {
    name: 'LinkedIn',
    category: 'professional',
    apiAvailable: 'Limited API',
    description: 'Professional trajectory, skill endorsements',
    docsUrl: 'https://developer.linkedin.com'
  },
  slack: {
    name: 'Slack',
    category: 'professional',
    apiAvailable: 'Full API',
    description: 'Team dynamics, communication patterns',
    docsUrl: 'https://api.slack.com'
  },
  workspace: {
    name: 'Google Workspace',
    category: 'professional',
    apiAvailable: 'Full API',
    description: 'Document creation, organization style',
    docsUrl: 'https://developers.google.com/workspace'
  },

  // Creative Universe
  instagram: {
    name: 'Instagram',
    category: 'creative',
    apiAvailable: 'Limited API',
    description: 'Visual expression, aesthetic preferences',
    docsUrl: 'https://developers.facebook.com/docs/instagram-api'
  },
  pinterest: {
    name: 'Pinterest',
    category: 'creative',
    apiAvailable: 'Limited API',
    description: 'Creative inspiration, project planning',
    docsUrl: 'https://developers.pinterest.com'
  },
  behance: {
    name: 'Behance',
    category: 'creative',
    apiAvailable: 'No API',
    description: 'Portfolio showcase, creative work',
    docsUrl: '#'
  },
  dribbble: {
    name: 'Dribbble',
    category: 'creative',
    apiAvailable: 'Limited API',
    description: 'Design work, creative community',
    docsUrl: 'https://developer.dribbble.com'
  },
  medium: {
    name: 'Medium',
    category: 'creative',
    apiAvailable: 'Limited API',
    description: 'Writing style, thought leadership',
    docsUrl: 'https://github.com/Medium/medium-api-docs'
  },
  substack: {
    name: 'Substack',
    category: 'creative',
    apiAvailable: 'No API',
    description: 'Newsletter writing, subscriber engagement',
    docsUrl: '#'
  }
};

// Helper function to get all platforms as an array
export function getAllPlatforms(): PlatformConfig[] {
  return Object.entries(platformMappings).map(([key, config]) => ({
    ...config,
    id: key
  }));
}

// Helper function to get platforms by category
export function getPlatformsByCategory(category: 'personal' | 'professional' | 'creative'): PlatformConfig[] {
  return Object.entries(platformMappings)
    .filter(([_, config]) => config.category === category)
    .map(([key, config]) => ({
      ...config,
      id: key
    }));
}

// Helper function to get platform by id
export function getPlatformById(id: string): PlatformConfig | undefined {
  return platformMappings[id];
}