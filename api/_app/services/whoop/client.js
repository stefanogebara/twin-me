/**
 * HTTP adapter that exposes the Whoop v2 API as the
 * `{ get(path): Promise<{records, next_token?}> }` shape that the
 * `analytics/` modules and `pagination.js` expect.
 *
 * Keeps a hard timeout per request (default 8s) so a stuck Whoop call
 * can't drag out twin context fan-out — the parent context builder has
 * a 10s circuit breaker and we want to fail well inside that.
 *
 * The token is captured once at factory time. Callers should mint a new
 * client when they get a fresh access token; we don't re-resolve on
 * 401 here (the analytics pipeline is a single-shot read path, not a
 * long-lived client).
 */

import axios from 'axios';
import { WHOOP_API_BASE_URL } from './endpoints.js';

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * @param {{ accessToken: string, timeoutMs?: number, baseUrl?: string }} opts
 * @returns {{ get: (path: string) => Promise<any> }}
 */
export function createWhoopClient({ accessToken, timeoutMs = DEFAULT_TIMEOUT_MS, baseUrl = WHOOP_API_BASE_URL }) {
  if (!accessToken) {
    throw new Error('createWhoopClient: accessToken is required');
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
