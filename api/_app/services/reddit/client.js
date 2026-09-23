/**
 * Reddit OAuth API HTTP adapter. When using OAuth bearer tokens the
 * base host is `oauth.reddit.com` (not the public `reddit.com`) — the
 * authenticated endpoints live there, return JSON with the wrapper
 * removed, and apply per-user rate limits (100/min for free apps).
 *
 * Reddit also requires a descriptive User-Agent on every request —
 * cookie-cutter user-agents get throttled hard. We tag ours.
 */

import axios from 'axios';

const REDDIT_API_BASE_URL = 'https://oauth.reddit.com';
const DEFAULT_TIMEOUT_MS = 8000;
const USER_AGENT = 'TwinMe/1.0 (analytics)';

export function createRedditClient({
  accessToken,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  baseUrl = REDDIT_API_BASE_URL,
}) {
  if (!accessToken) {
    throw new Error('createRedditClient: accessToken is required');
  }
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': USER_AGENT,
  };
  return {
    async get(path) {
      const url = `${baseUrl}${path}`;
      const response = await axios.get(url, { headers, timeout: timeoutMs });
      return response.data;
    },
  };
}
