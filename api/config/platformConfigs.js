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
// replan-2026-06-10 Track C portfolio cut: twitch, linkedin, reddit, notion,
// pinterest, steam, soundcloud removed from the demo/validation allowlist.
export const VALID_DEMO_PLATFORMS = [
  'spotify', 'youtube', 'discord', 'whoop', 'calendar', 'github', 'gmail',
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

};

export default PLATFORM_CONFIGS;
