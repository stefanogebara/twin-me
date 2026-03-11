/**
 * Apple Music Service
 * ===================
 * Fetches user library data from Apple Music API using MusicKit.
 *
 * Requires:
 * - APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, APPLE_MUSIC_PRIVATE_KEY (env vars)
 * - User must provide their Apple Music User Token via frontend MusicKit.js
 *
 * Apple Music API uses a developer token (JWT signed with MusicKit key) + user token.
 */

import jwt from 'jsonwebtoken';
import axios from 'axios';

const APPLE_MUSIC_BASE = 'https://api.music.apple.com/v1';

/**
 * Generate an Apple Music developer token (JWT).
 * Valid for up to 6 months.
 */
export function generateDeveloperToken() {
  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const privateKey = process.env.APPLE_MUSIC_PRIVATE_KEY;

  if (!teamId || !keyId || !privateKey) {
    return null;
  }

  // Replace escaped newlines from env var
  const key = privateKey.replace(/\\n/g, '\n');

  const token = jwt.sign({}, key, {
    algorithm: 'ES256',
    expiresIn: '180d',
    issuer: teamId,
    header: {
      alg: 'ES256',
      kid: keyId,
    },
  });

  return token;
}

/**
 * Create authenticated headers for Apple Music API calls.
 */
function getHeaders(userToken) {
  const devToken = generateDeveloperToken();
  if (!devToken) {
    throw new Error('Apple Music developer token not configured');
  }

  return {
    Authorization: `Bearer ${devToken}`,
    'Music-User-Token': userToken,
  };
}

/**
 * Fetch recently played tracks.
 * @param {string} userToken - Apple Music user token
 * @param {number} [limit=10]
 */
export async function getRecentlyPlayed(userToken, limit = 10) {
  const headers = getHeaders(userToken);
  const res = await axios.get(`${APPLE_MUSIC_BASE}/me/recent/played/tracks`, {
    headers,
    params: { limit },
    timeout: 10000,
  });
  return res.data?.data || [];
}

/**
 * Fetch user's library playlists.
 * @param {string} userToken
 * @param {number} [limit=10]
 */
export async function getLibraryPlaylists(userToken, limit = 10) {
  const headers = getHeaders(userToken);
  const res = await axios.get(`${APPLE_MUSIC_BASE}/me/library/playlists`, {
    headers,
    params: { limit },
    timeout: 10000,
  });
  return res.data?.data || [];
}

/**
 * Fetch user's library songs (heavy — returns catalogued songs).
 * @param {string} userToken
 * @param {number} [limit=25]
 */
export async function getLibrarySongs(userToken, limit = 25) {
  const headers = getHeaders(userToken);
  const res = await axios.get(`${APPLE_MUSIC_BASE}/me/library/songs`, {
    headers,
    params: { limit },
    timeout: 10000,
  });
  return res.data?.data || [];
}

export default { generateDeveloperToken, getRecentlyPlayed, getLibraryPlaylists, getLibrarySongs };
