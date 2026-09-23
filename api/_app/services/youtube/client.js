/**
 * YouTube Data API v3 HTTP adapter. Same shape as the other platform
 * clients.
 */

import axios from 'axios';

const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const DEFAULT_TIMEOUT_MS = 8000;

export function createYoutubeClient({
  accessToken,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  baseUrl = YOUTUBE_API_BASE_URL,
}) {
  if (!accessToken) {
    throw new Error('createYoutubeClient: accessToken is required');
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
