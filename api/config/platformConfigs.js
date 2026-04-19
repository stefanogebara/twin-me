/**
 * Platform OAuth Configurations
 *
 * Complete OAuth configurations for all integrated platforms.
 * Based on skills/oauth-platform-integration/oauth-config-examples.md
 */

/**
 * Valid platform names for demo/validation routes (URL-facing names, not DB names).
 * Single source of truth — import this instead of defining inline arrays.
 */
export const VALID_DEMO_PLATFORMS = [
  'spotify', 'youtube', 'discord', 'twitch', 'linkedin',
  'whoop', 'calendar', 'reddit', 'github', 'gmail', 'notion',
];

export const PLATFORM_CONFIGS = {
  spotify: {
    name: 'Spotify',
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    scopes: [
      'user-read-email',
      'user-read-private',
      'user-read-recently-played',
      'user-top-read',
      'user-library-read',
      'user-read-playback-state',
      'user-read-currently-playing',
      'playlist-read-private',
      'playlist-read-collaborative'
    ],
    apiBaseUrl: 'https://api.spotify.com/v1',

    endpoints: {
      userProfile: '/me',
      recentTracks: '/me/player/recently-played',
      topTracks: '/me/top/tracks',
      topArtists: '/me/top/artists',
      savedTracks: '/me/tracks',
      playlists: '/me/playlists',
      player: '/me/player',
      play: '/me/player/play',
      pause: '/me/player/pause'
    },

    tokenType: 'Bearer',
    refreshable: true,

    rateLimit: {
      requests: 180,
      window: 60 // per minute
    }
  },

  youtube: {
    name: 'YouTube',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.profile'
    ],
    apiBaseUrl: 'https://www.googleapis.com/youtube/v3',

    endpoints: {
      channels: '/channels',
      subscriptions: '/subscriptions',
      playlistItems: '/playlistItems',
      videos: '/videos'
    },

    tokenType: 'Bearer',
    refreshable: true,

    rateLimit: {
      requests: 10000,
      window: 86400 // per day (quota units)
    }
  },

  discord: {
    name: 'Discord',
    authUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    scopes: ['identify', 'guilds', 'connections', 'email'],
    apiBaseUrl: 'https://discord.com/api/v10',

    endpoints: {
      userProfile: '/users/@me',
      guilds: '/users/@me/guilds'
    },

    tokenType: 'Bearer',
    refreshable: true,

    rateLimit: {
      requests: 50,
      window: 1 // per second (global)
    }
  },

  github: {
    name: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['read:user', 'public_repo', 'read:org'], // User profile, public repos (read-only), org membership
    apiBaseUrl: 'https://api.github.com',

    endpoints: {
      userProfile: '/user',
      repos: '/user/repos',
      pullRequests: '/search/issues?q=author:{username}+type:pr',
      issues: '/search/issues?q=author:{username}+type:issue',
      events: '/users/{username}/events/public'
    },

    tokenType: 'Bearer', // GitHub OAuth apps use Bearer tokens
    refreshable: false, // GitHub OAuth tokens don't expire by default

    rateLimit: {
      requests: 5000,
      window: 3600 // per hour (authenticated)
    }
  },

  reddit: {
    name: 'Reddit',
    authUrl: 'https://www.reddit.com/api/v1/authorize',
    tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    scopes: ['identity', 'history', 'read', 'mysubreddits'],
    apiBaseUrl: 'https://oauth.reddit.com',

    endpoints: {
      userProfile: '/api/v1/me',
      subreddits: '/subreddits/mine/subscriber',
      posts: '/user/me/submitted',
      comments: '/user/me/comments',
      saved: '/user/me/saved',
      upvoted: '/user/me/upvoted'
    },

    tokenType: 'Bearer',
    refreshable: true,

    rateLimit: {
      requests: 60,
      window: 60 // per minute
    }
  },

  slack: {
    name: 'Slack',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: ['users:read', 'channels:history', 'reactions:read'],
    apiBaseUrl: 'https://slack.com/api',

    endpoints: {
      userProfile: '/users.profile.get',
      conversations: '/conversations.list',
      messages: '/conversations.history'
    },

    tokenType: 'Bearer',
    refreshable: false,

    rateLimit: {
      requests: 20,
      window: 60 // tier 2
    }
  },

  linkedin: {
    name: 'LinkedIn',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['openid', 'profile', 'email'],
    apiBaseUrl: 'https://api.linkedin.com/v2',

    endpoints: {
      userProfile: '/userinfo',
      posts: '/ugcPosts',
      shares: '/shares'
    },

    tokenType: 'Bearer',
    refreshable: true,

    rateLimit: {
      requests: 100,
      window: 60 // per minute
    }
  },

  // Health & Fitness Platforms
  whoop: {
    name: 'Whoop',
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    scopes: ['read:recovery', 'read:sleep', 'read:workout', 'read:profile', 'read:body_measurement', 'offline'],
    apiBaseUrl: 'https://api.prod.whoop.com/developer/v2',

    endpoints: {
      recovery: '/recovery',
      sleep: '/activity/sleep',
      workout: '/activity/workout',
      cycle: '/cycle',
      bodyMeasurement: '/body_measurement',
      profile: '/user/profile/basic',
    },

    tokenType: 'Bearer',
    refreshable: true,

    rateLimit: {
      requests: 100,
      window: 60 // per minute
    },

    personalityCorrelations: {
      conscientiousness: ['recovery score consistency', 'sleep schedule adherence', 'strain management'],
      neuroticism: ['HRV variability', 'resting heart rate trends', 'sleep disturbances'],
      openness: ['workout variety', 'new activity exploration']
    }
  },

  notion: {
    name: 'Notion',
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    // Notion does not use traditional OAuth scopes — users grant access on a
    // per-page/per-database basis at auth time via Notion's consent screen.
    scopes: [],
    apiBaseUrl: 'https://api.notion.com/v1',

    endpoints: {
      search: '/search',                 // POST — list pages/databases shared with integration
      blockChildren: '/blocks/:id/children', // GET — fetch a page's block content
      userProfile: '/users/me',          // GET — bot/integration profile
      databaseQuery: '/databases/:id/query', // POST — query rows of a database
    },

    tokenType: 'Bearer',
    // Notion access tokens do not expire and cannot be refreshed.
    refreshable: false,

    // Notion rate limit: ~3 requests/second averaged over time.
    rateLimit: {
      requests: 3,
      window: 1, // per second (average)
    },

    // API version pinned in request header
    notionVersion: '2022-06-28',
  },

  oura: {
    name: 'Oura',
    authUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    scopes: [
      'personal',
      'daily',
      'heartrate',
      'workout',
      'tag',
      'session'
    ],
    apiBaseUrl: 'https://api.ouraring.com/v2',

    endpoints: {
      personalInfo: '/usercollection/personal_info',
      dailyActivity: '/usercollection/daily_activity',
      dailySleep: '/usercollection/daily_sleep',
      dailyReadiness: '/usercollection/daily_readiness',
      heartRate: '/usercollection/heartrate',
      sessions: '/usercollection/session',
      tags: '/usercollection/tag',
      workouts: '/usercollection/workout'
    },

    tokenType: 'Bearer',
    refreshable: true,

    rateLimit: {
      requests: 5000,
      window: 300 // 5 minutes
    },

    // Personality correlations for soul signature extraction
    personalityCorrelations: {
      conscientiousness: ['sleep schedule consistency', 'bedtime regularity', 'rest day compliance'],
      neuroticism: ['HRV patterns', 'stress recovery time', 'sleep disturbances'],
      openness: ['activity variety', 'new workout exploration']
    }
  }
};

export default PLATFORM_CONFIGS;
