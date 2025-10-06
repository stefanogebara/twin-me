/**
 * Comprehensive Platform API Mappings
 *
 * As per the vision: "Everything public about a person can be digitized into a twin.
 * We search in the branches for what we only find in the roots - the person's originality."
 *
 * This maps all entertainment and lifestyle platforms that reveal a person's soul signature.
 */

export const platformAPIMappings = {
  // Entertainment Streaming Platforms
  entertainment: {
    spotify: {
      name: 'Spotify',
      category: 'Music Streaming',
      apiAvailable: true,
      authType: 'OAuth2',
      scopes: [
        'user-top-read',
        'user-read-recently-played',
        'playlist-read-private',
        'user-library-read'
      ],
      insights: ['musical taste', 'mood patterns', 'discovery behavior', 'emotional landscape'],
      apiDocs: 'https://developer.spotify.com/documentation/web-api'
    },

    appleMusic: {
      name: 'Apple Music',
      category: 'Music Streaming',
      apiAvailable: true,
      authType: 'MusicKit JS',
      scopes: ['music-library', 'user-preferences'],
      insights: ['curated tastes', 'premium preferences', 'artist loyalty'],
      apiDocs: 'https://developer.apple.com/documentation/applemusicapi'
    },

    netflix: {
      name: 'Netflix',
      category: 'Video Streaming',
      apiAvailable: false,
      authType: 'Browser Extension',
      alternativeMethod: 'Chrome Extension with viewing history export',
      insights: ['narrative preferences', 'binge patterns', 'genre evolution', 'emotional journeys'],
      note: 'Netflix discontinued public API - use browser extension approach'
    },

    hboMax: {
      name: 'HBO Max',
      category: 'Video Streaming',
      apiAvailable: false,
      authType: 'Screen Scraping',
      alternativeMethod: 'User uploads viewing history CSV',
      insights: ['premium content preferences', 'series commitment', 'quality over quantity']
    },

    disneyPlus: {
      name: 'Disney+',
      category: 'Video Streaming',
      apiAvailable: false,
      authType: 'Manual Import',
      insights: ['nostalgia factor', 'family values', 'franchise loyalty']
    },

    primeVideo: {
      name: 'Amazon Prime Video',
      category: 'Video Streaming',
      apiAvailable: 'partial',
      authType: 'Amazon API',
      insights: ['viewing diversity', 'international content', 'documentary interests'],
      apiDocs: 'https://developer.amazon.com/docs/prime-video'
    },

    youtube: {
      name: 'YouTube',
      category: 'Video Platform',
      apiAvailable: true,
      authType: 'Google OAuth2',
      scopes: [
        'youtube.readonly',
        'youtube.force-ssl'
      ],
      insights: ['learning interests', 'entertainment mix', 'creator loyalty', 'comment engagement'],
      apiDocs: 'https://developers.google.com/youtube/v3'
    },

    twitch: {
      name: 'Twitch',
      category: 'Live Streaming',
      apiAvailable: true,
      authType: 'OAuth2',
      scopes: ['user:read:follows', 'user:read:subscriptions'],
      insights: ['live engagement', 'community participation', 'gaming interests'],
      apiDocs: 'https://dev.twitch.tv/docs/api'
    },

    tiktok: {
      name: 'TikTok',
      category: 'Short Video',
      apiAvailable: 'limited',
      authType: 'TikTok Login Kit',
      scopes: ['user.info.basic', 'video.list'],
      insights: ['trend participation', 'attention patterns', 'viral interests'],
      apiDocs: 'https://developers.tiktok.com'
    }
  },

  // Gaming Platforms
  gaming: {
    steam: {
      name: 'Steam',
      category: 'Gaming Platform',
      apiAvailable: true,
      authType: 'Steam Web API',
      requiresSteamId: true,
      insights: ['game genres', 'playtime patterns', 'achievement hunting', 'social gaming'],
      apiDocs: 'https://steamcommunity.com/dev'
    },

    xbox: {
      name: 'Xbox Live',
      category: 'Gaming Platform',
      apiAvailable: true,
      authType: 'Microsoft OAuth2',
      insights: ['gaming achievements', 'multiplayer preferences', 'competitive spirit'],
      apiDocs: 'https://docs.microsoft.com/gaming/xbox-live/api-ref/xbox-live-rest/atoc-xboxlivews-reference'
    },

    playstation: {
      name: 'PlayStation Network',
      category: 'Gaming Platform',
      apiAvailable: 'unofficial',
      authType: 'PSN API (Unofficial)',
      insights: ['exclusive preferences', 'trophy hunting', 'story-driven gaming'],
      note: 'No official API - community solutions available'
    },

    epicGames: {
      name: 'Epic Games',
      category: 'Gaming Platform',
      apiAvailable: false,
      authType: 'Manual Entry',
      insights: ['free game collection', 'Fortnite engagement', 'exclusive choices']
    },

    discord: {
      name: 'Discord',
      category: 'Gaming Communication',
      apiAvailable: true,
      authType: 'OAuth2',
      scopes: ['identify', 'guilds', 'activities.read'],
      insights: ['community involvement', 'gaming circles', 'communication style'],
      apiDocs: 'https://discord.com/developers/docs'
    }
  },

  // Reading & Literature
  reading: {
    goodreads: {
      name: 'Goodreads',
      category: 'Book Platform',
      apiAvailable: true,
      authType: 'OAuth1',
      insights: ['reading preferences', 'intellectual interests', 'review style', 'reading pace'],
      apiDocs: 'https://www.goodreads.com/api',
      note: 'API being deprecated - transitioning to Amazon integration'
    },

    kindle: {
      name: 'Kindle',
      category: 'E-Reader',
      apiAvailable: 'indirect',
      authType: 'Amazon API',
      insights: ['reading habits', 'highlight patterns', 'genre preferences', 'completion rates']
    },

    audible: {
      name: 'Audible',
      category: 'Audiobooks',
      apiAvailable: 'indirect',
      authType: 'Amazon API',
      insights: ['listening preferences', 'multitasking reading', 'narrator preferences']
    },

    medium: {
      name: 'Medium',
      category: 'Articles',
      apiAvailable: true,
      authType: 'OAuth2',
      scopes: ['basicProfile', 'listPublications'],
      insights: ['thought leadership', 'professional interests', 'writing style'],
      apiDocs: 'https://github.com/Medium/medium-api-docs'
    }
  },

  // Social Media (for personality insights)
  social: {
    twitter: {
      name: 'Twitter/X',
      category: 'Social Media',
      apiAvailable: true,
      authType: 'OAuth2',
      tier: 'paid',
      insights: ['thought patterns', 'engagement style', 'interest topics', 'influence network'],
      apiDocs: 'https://developer.twitter.com/en/docs'
    },

    instagram: {
      name: 'Instagram',
      category: 'Social Media',
      apiAvailable: true,
      authType: 'Instagram Basic Display API',
      insights: ['visual aesthetics', 'lifestyle portrayal', 'social connections'],
      apiDocs: 'https://developers.facebook.com/docs/instagram-basic-display-api'
    },

    linkedin: {
      name: 'LinkedIn',
      category: 'Professional Network',
      apiAvailable: true,
      authType: 'OAuth2',
      insights: ['professional identity', 'career trajectory', 'skill endorsements'],
      apiDocs: 'https://docs.microsoft.com/linkedin/shared/authentication/authentication'
    },

    reddit: {
      name: 'Reddit',
      category: 'Forum Platform',
      apiAvailable: true,
      authType: 'OAuth2',
      insights: ['community interests', 'discussion style', 'expertise areas'],
      apiDocs: 'https://www.reddit.com/dev/api'
    },

    pinterest: {
      name: 'Pinterest',
      category: 'Visual Discovery',
      apiAvailable: true,
      authType: 'OAuth2',
      insights: ['aspirations', 'aesthetic preferences', 'project interests'],
      apiDocs: 'https://developers.pinterest.com'
    }
  },

  // Productivity & Professional
  productivity: {
    github: {
      name: 'GitHub',
      category: 'Code Repository',
      apiAvailable: true,
      authType: 'OAuth2',
      scopes: ['read:user', 'repo', 'read:org'],
      insights: ['technical skills', 'collaboration style', 'project interests', 'coding patterns'],
      apiDocs: 'https://docs.github.com/rest'
    },

    notion: {
      name: 'Notion',
      category: 'Productivity',
      apiAvailable: true,
      authType: 'OAuth2',
      insights: ['organizational style', 'knowledge management', 'workflow preferences'],
      apiDocs: 'https://developers.notion.com'
    },

    slack: {
      name: 'Slack',
      category: 'Communication',
      apiAvailable: true,
      authType: 'OAuth2',
      scopes: ['users:read', 'channels:history', 'reactions:read'],
      insights: ['communication patterns', 'team dynamics', 'reaction usage'],
      apiDocs: 'https://api.slack.com'
    },

    microsoftTeams: {
      name: 'Microsoft Teams',
      category: 'Communication',
      apiAvailable: true,
      authType: 'Microsoft Graph API',
      insights: ['collaboration style', 'meeting patterns', 'work rhythms'],
      apiDocs: 'https://docs.microsoft.com/graph/teams-concept-overview'
    },

    gmail: {
      name: 'Gmail',
      category: 'Email Communication',
      apiAvailable: true,
      authType: 'Google OAuth2',
      scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.labels',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ],
      insights: ['communication frequency', 'email organization', 'response patterns', 'contact network'],
      apiDocs: 'https://developers.google.com/gmail/api'
    }
  },

  // Fitness & Health
  fitness: {
    strava: {
      name: 'Strava',
      category: 'Fitness Tracking',
      apiAvailable: true,
      authType: 'OAuth2',
      insights: ['fitness dedication', 'outdoor preferences', 'competitive nature'],
      apiDocs: 'https://developers.strava.com'
    },

    fitbit: {
      name: 'Fitbit',
      category: 'Health Tracking',
      apiAvailable: true,
      authType: 'OAuth2',
      insights: ['health consciousness', 'sleep patterns', 'activity levels'],
      apiDocs: 'https://dev.fitbit.com/build/reference/web-api'
    },

    myFitnessPal: {
      name: 'MyFitnessPal',
      category: 'Nutrition',
      apiAvailable: 'limited',
      authType: 'Partner API',
      insights: ['dietary preferences', 'health goals', 'consistency patterns']
    }
  },

  // Financial (for lifestyle insights)
  financial: {
    mint: {
      name: 'Mint',
      category: 'Financial Management',
      apiAvailable: false,
      authType: 'Screen Scraping',
      insights: ['spending patterns', 'financial priorities', 'saving behavior'],
      note: 'No public API - requires user consent for data export'
    },

    venmo: {
      name: 'Venmo',
      category: 'Payment',
      apiAvailable: 'limited',
      authType: 'OAuth2',
      insights: ['social spending', 'transaction patterns', 'social connections'],
      note: 'Limited to authorized merchants'
    }
  },

  // Travel & Lifestyle
  travel: {
    airbnb: {
      name: 'Airbnb',
      category: 'Travel',
      apiAvailable: 'partner',
      authType: 'Partner API',
      insights: ['travel style', 'adventure level', 'comfort preferences'],
      note: 'API restricted to partners'
    },

    uber: {
      name: 'Uber',
      category: 'Transportation',
      apiAvailable: true,
      authType: 'OAuth2',
      insights: ['mobility patterns', 'lifestyle choices', 'urban navigation'],
      apiDocs: 'https://developer.uber.com'
    }
  }
};

/**
 * Get platforms by availability status
 */
export function getPlatformsByAvailability(available = true) {
  const result = [];

  Object.values(platformAPIMappings).forEach(category => {
    Object.entries(category).forEach(([key, platform]) => {
      if ((available && platform.apiAvailable === true) ||
          (!available && platform.apiAvailable !== true)) {
        result.push({ ...platform, key, category: category.name });
      }
    });
  });

  return result;
}

/**
 * Get all platforms that can provide personality insights
 */
export function getPersonalityPlatforms() {
  const personalityRich = [];

  Object.values(platformAPIMappings).forEach(category => {
    Object.entries(category).forEach(([key, platform]) => {
      if (platform.insights && platform.insights.length > 2) {
        personalityRich.push({
          ...platform,
          key,
          insightCount: platform.insights.length
        });
      }
    });
  });

  return personalityRich.sort((a, b) => b.insightCount - a.insightCount);
}

/**
 * Get implementation strategy for a platform
 */
export function getImplementationStrategy(platformKey) {
  for (const category of Object.values(platformAPIMappings)) {
    if (category[platformKey]) {
      const platform = category[platformKey];

      if (platform.apiAvailable === true) {
        return {
          method: 'direct-api',
          authType: platform.authType,
          documentation: platform.apiDocs,
          complexity: 'low'
        };
      } else if (platform.alternativeMethod) {
        return {
          method: 'alternative',
          approach: platform.alternativeMethod,
          complexity: 'medium'
        };
      } else {
        return {
          method: 'manual',
          approach: 'User data upload or manual entry',
          complexity: 'high'
        };
      }
    }
  }

  return null;
}

/**
 * Calculate platform priority based on insights and availability
 */
export function calculatePlatformPriority() {
  const priorities = [];

  Object.values(platformAPIMappings).forEach(category => {
    Object.entries(category).forEach(([key, platform]) => {
      let score = 0;

      // API availability scores
      if (platform.apiAvailable === true) score += 5;
      else if (platform.apiAvailable === 'partial') score += 3;
      else if (platform.apiAvailable === 'limited') score += 2;

      // Insight richness
      if (platform.insights) {
        score += platform.insights.length;
      }

      // Documentation availability
      if (platform.apiDocs) score += 2;

      priorities.push({
        platform: platform.name,
        key,
        score,
        category: platform.category,
        implementable: platform.apiAvailable === true
      });
    });
  });

  return priorities.sort((a, b) => b.score - a.score);
}

export default platformAPIMappings;