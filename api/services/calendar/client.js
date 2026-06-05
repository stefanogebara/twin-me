/**
 * Google Calendar API HTTP adapter. Same shape as the Whoop / Spotify
 * clients — accepts a bearer token, returns a { get(path) } object,
 * 8s default timeout, so the analytics modules stay HTTP-agnostic for
 * testing.
 */

import axios from 'axios';

const CALENDAR_API_BASE_URL = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * @param {{ accessToken: string, timeoutMs?: number, baseUrl?: string }} opts
 * @returns {{ get: (path: string) => Promise<any> }}
 */
export function createCalendarClient({
  accessToken,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  baseUrl = CALENDAR_API_BASE_URL,
}) {
  if (!accessToken) {
    throw new Error('createCalendarClient: accessToken is required');
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
