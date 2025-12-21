/**
 * Arctic OAuth Service
 * Clean OAuth implementation using Arctic library
 * Supports 65+ providers with minimal code
 */

import { Spotify, Discord, GitHub, Reddit, Twitch, Google } from 'arctic';

// Initialize Arctic OAuth providers
// Use APP_URL or VITE_APP_URL as fallback
const CLIENT_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086';

export const arcticProviders = {
  spotify: new Spotify(
    process.env.SPOTIFY_CLIENT_ID,
    process.env.SPOTIFY_CLIENT_SECRET,
    `${CLIENT_URL}/oauth/callback`
  ),

  discord: new Discord(
    process.env.DISCORD_CLIENT_ID,
    process.env.DISCORD_CLIENT_SECRET,
    `${CLIENT_URL}/oauth/callback`
  ),

  github: new GitHub(
    process.env.GITHUB_CLIENT_ID,
    process.env.GITHUB_CLIENT_SECRET,
    `${CLIENT_URL}/oauth/callback`
  ),

  reddit: new Reddit(
    process.env.REDDIT_CLIENT_ID,
    process.env.REDDIT_CLIENT_SECRET,
    `${CLIENT_URL}/oauth/callback`
  ),

  twitch: new Twitch(
    process.env.TWITCH_CLIENT_ID,
    process.env.TWITCH_CLIENT_SECRET,
    `${CLIENT_URL}/oauth/callback`
  ),

  google_youtube: new Google(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${CLIENT_URL}/oauth/callback`
  ),

  google_calendar: new Google(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${CLIENT_URL}/oauth/callback`
  )
};

/**
 * Generate OAuth authorization URL
 * @param {string} provider - Provider name (spotify, discord, etc.)
 * @param {string} userId - User ID to include in state
 * @param {Array<string>} scopes - OAuth scopes to request
 * @returns {Promise<{url: string, state: string, codeVerifier: string}>}
 */
export async function generateAuthorizationURL(provider, userId, scopes = []) {
  const arcticProvider = arcticProviders[provider];

  if (!arcticProvider) {
    throw new Error(`Provider ${provider} not supported by Arctic`);
  }

  console.log(`[Arctic] Generating authorization URL for ${provider}`);

  // Generate state with user information
  const stateData = {
    userId,
    provider,
    timestamp: Date.now()
  };
  const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

  console.log(`[Arctic] 🔐 Generated state for ${provider}:`, JSON.stringify(stateData, null, 2));
  console.log(`[Arctic] 📊 State base64: ${state.substring(0, 50)}...`);

  // Generate code verifier for PKCE (if supported)
  const codeVerifier = generateCodeVerifier();

  // Get scopes for this provider
  const providerScopes = scopes.length > 0 ? scopes : getDefaultScopes(provider);

  // Create authorization URL with scopes
  // Spotify requires: createAuthorizationURL(state, codeVerifier, scopes)
  // Most other providers: createAuthorizationURL(state, scopes)
  let url;
  if (provider === 'spotify' || provider === 'google_youtube' || provider === 'google_calendar') {
    // Spotify and Google use PKCE with 3 parameters: state, codeVerifier, scopes
    url = arcticProvider.createAuthorizationURL(state, codeVerifier, providerScopes);
  } else {
    // Most other providers use 2 parameters: state, scopes
    url = arcticProvider.createAuthorizationURL(state, providerScopes);
  }

  // CRITICAL: Google requires additional parameters to return refresh tokens
  // Without these, Google will only return an access token (which expires)
  if (provider === 'google_youtube' || provider === 'google_calendar') {
    url.searchParams.set('access_type', 'offline'); // Request offline access to get refresh token
    url.searchParams.set('prompt', 'consent'); // Force consent screen to always get refresh token
    console.log(`[Arctic] ✅ Added Google OAuth parameters: access_type=offline, prompt=consent`);
  }

  console.log(`[Arctic] 🔗 Authorization URL generated for ${provider}`);
  console.log(`[Arctic] 📍 Redirect URI: ${url.searchParams.get('redirect_uri')}`);
  console.log(`[Arctic] 🔐 State in URL: ${url.searchParams.get('state')?.substring(0, 50)}...`);
  console.log(`[Arctic] 🌐 Full URL: ${url.toString().substring(0, 150)}...`);

  return {
    url: url.toString(),
    state,
    codeVerifier
  };
}

/**
 * Validate authorization code and get tokens
 * @param {string} provider - Provider name
 * @param {string} code - Authorization code from callback
 * @param {string} codeVerifier - Code verifier for PKCE
 * @returns {Promise<{accessToken: string, refreshToken: string, expiresAt: Date}>}
 */
export async function validateAuthorizationCode(provider, code, codeVerifier) {
  const arcticProvider = arcticProviders[provider];

  if (!arcticProvider) {
    throw new Error(`Provider ${provider} not supported by Arctic`);
  }

  console.log(`[Arctic] Validating authorization code for ${provider}`);

  try {
    // Exchange code for tokens
    const tokens = await arcticProvider.validateAuthorizationCode(code, codeVerifier);

    console.log(`[Arctic] ✅ Tokens obtained for ${provider}`);

    // CRITICAL DEBUGGING: Log the raw token data object to see what Google actually returns
    console.log(`[Arctic] 🔍 Raw token object type: ${typeof tokens}`);
    console.log(`[Arctic] 🔍 Token object keys:`, Object.keys(tokens));
    console.log(`[Arctic] 🔍 Token has data property:`, 'data' in tokens);

    // Arctic stores the raw response in tokens.data
    if (tokens.data) {
      console.log(`[Arctic] 🔍 Raw token data from Google:`, JSON.stringify(tokens.data, null, 2));
      console.log(`[Arctic] 🔍 Fields in token data:`, Object.keys(tokens.data));
      console.log(`[Arctic] 🔍 Has refresh_token field in data:`, 'refresh_token' in tokens.data);
    }

    // Use Arctic's hasRefreshToken() method to check BEFORE accessing
    console.log(`[Arctic] 🔍 hasRefreshToken() returns:`, tokens.hasRefreshToken());

    // Extract tokens safely using Arctic's methods
    const accessTokenValue = tokens.accessToken(); // This should always exist
    let refreshTokenValue = null;

    // Only try to access refresh token if it exists
    if (tokens.hasRefreshToken()) {
      refreshTokenValue = tokens.refreshToken();
      console.log(`[Arctic] ✅ Refresh token found, length: ${refreshTokenValue.length}`);
    } else {
      console.log(`[Arctic] ⚠️  NO REFRESH TOKEN in Google response!`);
      console.log(`[Arctic] 🔍 This means Google did NOT return a refresh_token despite our parameters`);
      console.log(`[Arctic] 🔍 Possible reasons:`);
      console.log(`[Arctic]     1. User has previously authorized this app (Google only returns refresh token on FIRST authorization)`);
      console.log(`[Arctic]     2. OAuth parameters not properly applied`);
      console.log(`[Arctic]     3. Google OAuth app settings require configuration`);
    }

    console.log(`[Arctic] 🔍 Extracted access token length: ${accessTokenValue?.length || 0}`);
    console.log(`[Arctic] 🔍 Extracted refresh token length: ${refreshTokenValue?.length || 0}`);

    // Calculate token expiration
    const expiresIn = tokens.expiresIn || tokens.expires_in || 3600; // Default 1 hour
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      accessToken: accessTokenValue,
      refreshToken: refreshTokenValue,
      expiresAt,
      tokenType: typeof tokens.tokenType === 'function' ? tokens.tokenType() : (tokens.tokenType || tokens.token_type || 'Bearer'),
      scope: tokens.scope
    };
  } catch (error) {
    console.error(`[Arctic] ❌ Token validation failed for ${provider}:`, error.message);
    throw error;
  }
}

/**
 * Refresh access token
 * @param {string} provider - Provider name
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<{accessToken: string, refreshToken: string, expiresAt: Date}>}
 */
export async function refreshAccessToken(provider, refreshToken) {
  const arcticProvider = arcticProviders[provider];

  if (!arcticProvider) {
    throw new Error(`Provider ${provider} not supported by Arctic`);
  }

  console.log(`[Arctic] Refreshing access token for ${provider}`);

  try {
    const tokens = await arcticProvider.refreshAccessToken(refreshToken);

    console.log(`[Arctic] ✅ Token refreshed for ${provider}`);

    const expiresIn = tokens.expiresIn || tokens.expires_in || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      accessToken: typeof tokens.accessToken === 'function' ? tokens.accessToken() : (tokens.accessToken || tokens.access_token),
      refreshToken: typeof tokens.refreshToken === 'function' ? tokens.refreshToken() : (tokens.refreshToken || tokens.refresh_token || refreshToken), // Some providers don't return new refresh token
      expiresAt,
      tokenType: typeof tokens.tokenType === 'function' ? tokens.tokenType() : (tokens.tokenType || tokens.token_type || 'Bearer')
    };
  } catch (error) {
    console.error(`[Arctic] ❌ Token refresh failed for ${provider}:`, error.message);
    throw error;
  }
}

/**
 * Get default OAuth scopes for each provider
 * @param {string} provider - Provider name
 * @returns {Array<string>}
 */
function getDefaultScopes(provider) {
  const scopeMap = {
    spotify: [
      'user-read-email',
      'user-read-private',
      'user-top-read',
      'user-read-recently-played',
      'user-library-read',
      'playlist-read-private',
      'user-read-playback-state'
    ],
    discord: [
      'identify',
      'email',
      'guilds',
      'connections'
    ],
    github: [
      'user',
      'read:user',
      'user:email',
      'repo'
    ],
    reddit: [
      'identity',
      'read',
      'history',
      'mysubreddits'
    ],
    twitch: [
      'user:read:email',
      'user:read:subscriptions',
      'user:read:follows'
    ],
    google_youtube: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ],
    google_calendar: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ]
  };

  return scopeMap[provider] || [];
}

/**
 * Generate random code verifier for PKCE
 * @returns {string}
 */
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get provider-specific user info
 * @param {string} provider - Provider name
 * @param {string} accessToken - Access token
 * @returns {Promise<Object>}
 */
export async function getUserInfo(provider, accessToken) {
  const endpoints = {
    spotify: 'https://api.spotify.com/v1/me',
    discord: 'https://discord.com/api/users/@me',
    github: 'https://api.github.com/user',
    reddit: 'https://oauth.reddit.com/api/v1/me',
    twitch: 'https://api.twitch.tv/helix/users',
    google_youtube: 'https://www.googleapis.com/oauth2/v2/userinfo',
    google_calendar: 'https://www.googleapis.com/oauth2/v2/userinfo'
  };

  const endpoint = endpoints[provider];
  if (!endpoint) {
    throw new Error(`User info endpoint not configured for ${provider}`);
  }

  console.log(`[Arctic] Fetching user info from ${provider}`);

  const headers = {
    'Authorization': `Bearer ${accessToken}`
  };

  // Twitch requires Client-ID header
  if (provider === 'twitch') {
    headers['Client-ID'] = process.env.TWITCH_CLIENT_ID;
  }

  const response = await fetch(endpoint, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info from ${provider}: ${response.statusText}`);
  }

  const data = await response.json();

  console.log(`[Arctic] ✅ User info retrieved from ${provider}`);

  return normalizeUserInfo(provider, data);
}

/**
 * Normalize user info across providers
 * @param {string} provider - Provider name
 * @param {Object} data - Raw user data from provider
 * @returns {Object}
 */
function normalizeUserInfo(provider, data) {
  const normalizers = {
    spotify: (d) => ({
      id: d.id,
      email: d.email,
      name: d.display_name,
      image: d.images?.[0]?.url,
      raw: d
    }),
    discord: (d) => ({
      id: d.id,
      email: d.email,
      name: d.username,
      image: d.avatar ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png` : null,
      raw: d
    }),
    github: (d) => ({
      id: d.id.toString(),
      email: d.email,
      name: d.name || d.login,
      image: d.avatar_url,
      raw: d
    }),
    reddit: (d) => ({
      id: d.id,
      email: null, // Reddit doesn't provide email via API
      name: d.name,
      image: d.icon_img?.split('?')[0], // Remove query params
      raw: d
    }),
    twitch: (d) => ({
      id: d.data[0].id,
      email: d.data[0].email,
      name: d.data[0].display_name,
      image: d.data[0].profile_image_url,
      raw: d
    }),
    google_youtube: (d) => ({
      id: d.id,
      email: d.email,
      name: d.name,
      image: d.picture,
      raw: d
    }),
    google_calendar: (d) => ({
      id: d.id,
      email: d.email,
      name: d.name,
      image: d.picture,
      raw: d
    })
  };

  const normalizer = normalizers[provider];
  return normalizer ? normalizer(data) : data;
}

export default {
  arcticProviders,
  generateAuthorizationURL,
  validateAuthorizationCode,
  refreshAccessToken,
  getUserInfo
};
