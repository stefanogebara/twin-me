/**
 * Gmail API HTTP adapter — same shape as the other platform clients.
 * Base URL targets the v1 users/me endpoint so paths can be
 * `/messages?…`, `/labels/INBOX` etc. without rebuilding the prefix
 * everywhere.
 */

import axios from 'axios';

const GMAIL_API_BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const DEFAULT_TIMEOUT_MS = 8000;

export function createGmailClient({
  accessToken,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  baseUrl = GMAIL_API_BASE_URL,
}) {
  if (!accessToken) {
    throw new Error('createGmailClient: accessToken is required');
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
