/**
 * Garmin Connect Direct Service
 *
 * Reverse-engineered integration using Garmin's web SSO flow.
 * The official Garmin Connect Developer Program requires business approval,
 * so this service authenticates via the same flow the web app uses.
 *
 * Auth flow:
 *   1. GET /sso/signin         -> SESSION cookie
 *   2. POST /sso/signin        -> redirect with ticket (302) or 401 + new CSRF
 *   3. If 401: re-POST with CSRF from body
 *   4. Follow redirect to connect.garmin.com -> SESSIONID cookie
 *
 * Storage: platform_connections table
 *   access_token_encrypted  = encrypted SESSIONID
 *   refresh_token_encrypted = encrypted JSON { email, password }
 *   expires_at              = session expiry (~24h from login)
 */

import { createLogger } from './logger.js';
import { encryptToken, decryptToken } from './encryption.js';
import { getSupabase } from './observationUtils.js';

const log = createLogger('GarminDirect');

const SSO_BASE = 'https://sso.garmin.com';
const CONNECT_BASE = 'https://connect.garmin.com';
const API_BASE = `${CONNECT_BASE}/modern/proxy`;

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Helpers ────────────────────────────────────────────────────────────────

function parseCookies(headers) {
  const cookies = [];
  headers.forEach((v, k) => {
    if (k.toLowerCase() === 'set-cookie') {
      cookies.push(v.split(';')[0]);
    }
  });
  return cookies;
}

function cookieString(arr) {
  return arr.join('; ');
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Authentication ─────────────────────────────────────────────────────────

/**
 * Authenticate with Garmin Connect and return the SESSIONID cookie value.
 * Handles 2-step flow: initial POST may fail with CSRF, retry with CSRF.
 */
async function authenticate(email, password) {
  const signinUrl = `${SSO_BASE}/sso/signin`;

  // Step 1: GET signin page -> SESSION cookie
  log.info('Garmin auth: fetching signin page');
  const r1 = await fetch(signinUrl, {
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml',
      'NK': 'NT',
    },
  });

  const cookies1 = parseCookies(r1.headers);
  const sessionCookie = cookies1.find(c => c.startsWith('SESSION='));
  if (!sessionCookie) {
    throw new Error('Garmin: no SESSION cookie from signin page');
  }

  // Step 2: POST credentials
  async function postCredentials(extraCookies = [], csrf = '') {
    const form = new URLSearchParams({
      username: email,
      password,
      embed: 'false',
      _csrf: csrf,
      _eventId: 'submit',
      displayNameRequired: 'false',
    });

    const cookieJar = cookieString([sessionCookie, ...extraCookies]);

    return fetch(signinUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieJar,
        'User-Agent': DEFAULT_UA,
        Referer: signinUrl,
        Origin: SSO_BASE,
        'NK': 'NT',
      },
      body: form.toString(),
      redirect: 'manual',
    });
  }

  log.info('Garmin auth: posting credentials (attempt 1)');
  const r2 = await postCredentials();
  const status2 = r2.status;
  const location2 = r2.headers.get('location');

  let ticketUrl = null;

  if (status2 === 302 && location2) {
    ticketUrl = location2;
  } else if (status2 === 200 || status2 === 401) {
    // Extract CSRF from response body and retry
    const body2 = await r2.text();
    const csrfMatch = body2.match(/name="_csrf"[^>]*value="([^"]+)"/i);
    const csrf2 = csrfMatch ? csrfMatch[1] : '';

    if (!csrf2) {
      // Check for explicit error
      const errMatch = body2.match(/class="[^"]*error[^"]*"[^>]*>\s*([^<]+)/i);
      const errMsg = errMatch ? errMatch[1].trim() : 'Authentication failed';
      throw new Error(`Garmin: ${errMsg}`);
    }

    log.info('Garmin auth: retrying with CSRF token');
    const cookies2 = parseCookies(r2.headers);
    const r3 = await postCredentials(cookies2, csrf2);
    const status3 = r3.status;
    const location3 = r3.headers.get('location');

    if (status3 === 302 && location3) {
      ticketUrl = location3;
    } else {
      const body3 = await r3.text();
      const errMatch = body3.match(/class="[^"]*error[^"]*"[^>]*>\s*([^<]+)/i);
      const errMsg = errMatch ? errMatch[1].trim() : `Unexpected status ${status3}`;
      throw new Error(`Garmin auth failed: ${errMsg}`);
    }
  } else {
    throw new Error(`Garmin: unexpected signin status ${status2}`);
  }

  // Step 3: Exchange ticket for SESSIONID on connect.garmin.com
  log.info('Garmin auth: exchanging ticket');
  const ticketFullUrl = ticketUrl.startsWith('http') ? ticketUrl : `${CONNECT_BASE}${ticketUrl}`;

  const r4 = await fetch(ticketFullUrl, {
    headers: { 'User-Agent': DEFAULT_UA },
    redirect: 'follow',
  });

  const connectCookies = parseCookies(r4.headers);
  const sessionIdCookie = connectCookies.find(c => c.startsWith('SESSIONID='));

  if (!sessionIdCookie) {
    throw new Error('Garmin: no SESSIONID cookie after ticket exchange');
  }

  const sessionId = sessionIdCookie.replace('SESSIONID=', '');
  log.info('Garmin auth: success');
  return sessionId;
}

// ── API Calls ──────────────────────────────────────────────────────────────

async function garminGet(path, sessionId) {
  const url = `${API_BASE}/${path}`;
  const r = await fetch(url, {
    headers: {
      Cookie: `SESSIONID=${sessionId}`,
      'User-Agent': DEFAULT_UA,
      'NK': 'NT',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (!r.ok) {
    throw new Error(`Garmin API ${r.status} for ${path}`);
  }
  return r.json();
}

async function getDisplayName(sessionId) {
  const data = await garminGet('userprofile-service/socialProfile', sessionId);
  return data.displayName || data.userName || null;
}

// ── Session management ─────────────────────────────────────────────────────

async function getOrRefreshSession(userId) {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Supabase unavailable');

  const { data: conn } = await supabase
    .from('platform_connections')
    .select('id, access_token_encrypted, refresh_token_encrypted, expires_at')
    .eq('user_id', userId)
    .eq('platform', 'garmin')
    .eq('is_active', true)
    .single();

  if (!conn) throw new Error('Garmin: no credentials stored for user');

  // Check if session is still valid (with 10-min buffer)
  const expiresAt = conn.expires_at ? new Date(conn.expires_at) : null;
  const needsRefresh = !expiresAt || expiresAt <= new Date(Date.now() + 10 * 60 * 1000);

  if (!needsRefresh && conn.access_token_encrypted) {
    return decryptToken(conn.access_token_encrypted);
  }

  // Re-authenticate using stored credentials
  log.info('Garmin: refreshing session', { userId });
  const credsJson = decryptToken(conn.refresh_token_encrypted);
  const creds = JSON.parse(credsJson);

  const newSessionId = await authenticate(creds.email, creds.password);

  // Store new session (24h TTL)
  const newExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
  await supabase
    .from('platform_connections')
    .update({
      access_token_encrypted: encryptToken(newSessionId),
      expires_at: newExpiry,
      last_sync: new Date().toISOString(),
    })
    .eq('id', conn.id);

  return newSessionId;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Save Garmin credentials for a user.
 * Authenticates immediately to validate, then stores encrypted credentials.
 */
export async function saveCredentials(userId, email, password) {
  // Validate credentials first
  const sessionId = await authenticate(email, password);

  const supabase = await getSupabase();
  if (!supabase) throw new Error('Supabase unavailable');

  const encryptedCreds = encryptToken(JSON.stringify({ email, password }));
  const encryptedSession = encryptToken(sessionId);
  const expiry = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();

  await supabase.from('platform_connections').upsert(
    {
      user_id: userId,
      platform: 'garmin',
      access_token_encrypted: encryptedSession,
      refresh_token_encrypted: encryptedCreds,
      expires_at: expiry,
      is_active: true,
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,platform' }
  );

  return { success: true };
}

/**
 * Get daily summary (steps, calories, stress).
 */
export async function getDailySummary(userId, date = todayStr()) {
  try {
    const sessionId = await getOrRefreshSession(userId);
    const displayName = await getDisplayName(sessionId);
    if (!displayName) throw new Error('Could not resolve display name');

    const data = await garminGet(
      `usersummary-service/usersummary/daily/${encodeURIComponent(displayName)}?calendarDate=${date}`,
      sessionId
    );
    return { success: true, data };
  } catch (err) {
    log.warn('Garmin getDailySummary error', { userId, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Get sleep data.
 */
export async function getSleepData(userId, date = todayStr()) {
  try {
    const sessionId = await getOrRefreshSession(userId);
    const displayName = await getDisplayName(sessionId);
    if (!displayName) throw new Error('Could not resolve display name');

    const data = await garminGet(
      `wellness-service/wellness/dailySleepData/${encodeURIComponent(displayName)}?date=${date}`,
      sessionId
    );
    return { success: true, data };
  } catch (err) {
    log.warn('Garmin getSleepData error', { userId, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Get recent activities.
 */
export async function getActivities(userId, limit = 20) {
  try {
    const sessionId = await getOrRefreshSession(userId);
    const data = await garminGet(
      `activitylist-service/activities/search/activities?start=0&limit=${limit}`,
      sessionId
    );
    return { success: true, data };
  } catch (err) {
    log.warn('Garmin getActivities error', { userId, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Check if user has Garmin credentials stored.
 */
export async function hasCredentials(userId) {
  try {
    const supabase = await getSupabase();
    if (!supabase) return false;
    const { data } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', 'garmin')
      .eq('is_active', true)
      .single();
    return !!data;
  } catch {
    return false;
  }
}

export default { saveCredentials, getDailySummary, getSleepData, getActivities, hasCredentials };
