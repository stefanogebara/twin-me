/**
 * GitHub REST API HTTP adapter. Default base is api.github.com; for
 * authenticated requests the bearer token belongs to a GitHub OAuth
 * grant if the platform is connected. For PUBLIC user activity reads
 * (/users/:user/events/public) no auth is required — but rate limits
 * are tighter (60/hr unauthenticated vs 5000/hr authenticated).
 */

import axios from 'axios';

const GITHUB_API_BASE_URL = 'https://api.github.com';
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * @param {{ accessToken?: string, timeoutMs?: number, baseUrl?: string }} opts
 * @returns {{ get: (path: string) => Promise<any> }}
 */
export function createGithubClient({
  accessToken,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  baseUrl = GITHUB_API_BASE_URL,
} = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return {
    async get(path) {
      const url = `${baseUrl}${path}`;
      const response = await axios.get(url, { headers, timeout: timeoutMs });
      return response.data;
    },
  };
}
