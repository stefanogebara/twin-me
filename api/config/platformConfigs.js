/**
 * Platform OAuth Configurations
 *
 * Complete OAuth configurations for all integrated platforms.
 * Based on skills/oauth-platform-integration/oauth-config-examples.md
 */

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
      'user-modify-playback-state',
      'user-read-currently-playing',
      'playlist-read-private',
      'playlist-read-collaborative',
      'streaming'
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
    scopes: ['identify', 'guilds', 'guilds.members.read', 'email'],
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
    scopes: ['read:user', 'repo', 'read:org'], // User profile, repositories, organization membership
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
    scopes: [
      'offline',         // Required for refresh tokens
      'read:profile',
      'read:recovery',
      'read:cycles',
      'read:workout',
      'read:sleep',
      'read:body_measurement'
    ],
    apiBaseUrl: 'https://api.prod.whoop.com/developer/v1',

    endpoints: {
      userProfile: '/user/profile/basic',
      recovery: '/recovery',
      cycles: '/cycle',
      workouts: '/activity/workout',
      sleep: '/activity/sleep',
      bodyMeasurements: '/user/measurement/body'
    },

    tokenType: 'Bearer',
    refreshable: true,

    rateLimit: {
      requests: 100,
      window: 60 // per minute
    },

    // Personality correlations for soul signature extraction
    personalityCorrelations: {
      conscientiousness: ['sleep consistency', 'workout regularity', 'recovery adherence'],
      neuroticism: ['HRV variability', 'stress indicators', 'recovery fluctuations'],
      extraversion: ['workout frequency', 'strain levels', 'activity diversity']
    }
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
