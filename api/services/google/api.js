/**
 * Google Calendar and Gmail over plain HTTP.
 * =========================================
 * The `googleapis` package is 31,4 MB and 889 files of the serverless bundle Vercel traces
 * on every deploy - 42 per cent of it - and five call sites used exactly four of its methods:
 * list the calendars, list a calendar's events, list the inbox, read one message. Measured
 * 2026-09-22: `vite build` takes 14,5 s and the function bundling takes 17,5 minutes.
 *
 * So: the same four calls, by fetch, returning `{ data }` exactly as the client library did,
 * so the call sites keep their bodies. A failed call throws an Error carrying `code` (the
 * HTTP status), which is what `calendar-oauth.js` reads to tell a dead token from a fault.
 *
 * Money's own calendar reads go through `services/calendar/client.js` and never came here.
 */
import { createLogger } from '../logger.js';

const log = createLogger('google-api');

export const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
export const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1';
export const DEFAULT_TIMEOUT_MS = 10000;

/** Google repeats a list parameter rather than joining it, and wants plain `true`/`false`. */
export function toQuery(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) { for (const one of value) if (one !== undefined && one !== null) query.append(key, String(one)); continue; }
    query.append(key, typeof value === 'boolean' ? String(value) : String(value));
  }
  return query;
}

async function call(accessToken, url, params, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!accessToken) throw new Error('google api: an access token is required');
  const query = toQuery(params);
  const full = query.toString() ? `${url}?${query}` : url;
  const response = await fetchImpl(full, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    /* googleapis threw with `code` set to the status, and one route reads it to tell a dead
       token (401) from anything else. Keep that. */
    const error = new Error(body?.error?.message || `google api ${response.status}`);
    error.code = response.status;
    error.status = response.status;
    error.errors = body?.error?.errors || null;
    log.warn('google api call failed', { status: response.status, url: url.replace(/\/[^/]*$/, '/...') });
    throw error;
  }
  return { data: body || {} };
}

/** The two calendar calls used here, shaped as `google.calendar({version:'v3'})` was. */
export function calendarClient(accessToken, options = {}) {
  const get = (path, params) => call(accessToken, `${CALENDAR_BASE}${path}`, params, options);
  return {
    calendarList: {
      list: (params = {}) => get('/users/me/calendarList', params),
    },
    events: {
      list: ({ calendarId = 'primary', ...params } = {}) =>
        get(`/calendars/${encodeURIComponent(calendarId)}/events`, params),
    },
  };
}

/** The two Gmail calls used here, shaped as `google.gmail({version:'v1'})` was. */
export function gmailClient(accessToken, options = {}) {
  const get = (path, params) => call(accessToken, `${GMAIL_BASE}${path}`, params, options);
  return {
    users: {
      messages: {
        list: ({ userId = 'me', ...params } = {}) => get(`/users/${encodeURIComponent(userId)}/messages`, params),
        get: ({ userId = 'me', id, ...params } = {}) => get(`/users/${encodeURIComponent(userId)}/messages/${encodeURIComponent(id)}`, params),
      },
    },
  };
}
