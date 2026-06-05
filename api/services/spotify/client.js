/**
 * Spotify Web API HTTP adapter — mirror of api/services/whoop/client.js
 * so the analytics modules can stay HTTP-agnostic and tests can stub
 * via vi.mock('axios').
 *
 * Honours a per-request timeout because Spotify's recently-played +
 * top-artists endpoints occasionally tail past 3s on cold Vercel
 * instances; 8s aligns with the Whoop client default so neither side
 * dominates the parent context build budget.
 */

import axios from 'axios';

const SPOTIFY_API_BASE_URL = 'https://api.spotify.com';
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * @param {{ accessToken: string, timeoutMs?: number, baseUrl?: string }} opts
 * @returns {{ get: (path: string) => Promise<any> }}
 */
export function createSpotifyClient({
  accessToken,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  baseUrl = SPOTIFY_API_BASE_URL,
}) {
  if (!accessToken) {
    throw new Error('createSpotifyClient: accessToken is required');
  }
  const headers = { Authorization: `Bearer ${accessToken}` };
  return {
    async get(path) {
      const url = `${baseUrl}${path}`;
      const response = await axios.get(url, { headers, timeout: timeoutMs });
      return response.data;
    },
  };
}
