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
      'user-read-recently-played',
      'user-top-read',
      'user-library-read',
      'user-read-playback-state',
      'playlist-read-private'
    ],
    apiBaseUrl: 'https://api.spotify.com/v1',

    endpoints: {
      userProfile: '/me',
      recentTracks: '/me/player/recently-played',
      topTracks: '/me/top/tracks',
      topArtists: '/me/top/artists',
      savedTracks: '/me/tracks'
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
    scopes: ['identify', 'guilds', 'messages.read'],
    apiBaseUrl: 'https://discord.com/api/v10',

    endpoints: {
      userProfile: '/users/@me',
      guilds: '/users/@me/guilds',
      connections: '/users/@me/connections'
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
    scopes: ['user', 'repo:read'],
    apiBaseUrl: 'https://api.github.com',

    endpoints: {
      userProfile: '/user',
      repos: '/user/repos',
      events: '/users/{username}/events',
      commits: '/repos/{owner}/{repo}/commits'
    },

    tokenType: 'token', // GitHub uses 'token' instead of 'Bearer'
    refreshable: false, // GitHub tokens don't expire

    rateLimit: {
      requests: 5000,
      window: 3600 // per hour
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
  }
};

export default PLATFORM_CONFIGS;
