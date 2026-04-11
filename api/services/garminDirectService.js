/**
 * Garmin Connect Direct Service
 *
 * Reverse-engineered integration using Garmin's legacy SSO flow.
 * The official Garmin Connect Developer Program requires business approval,
 * so this service authenticates via the same flow the web app uses.
 *
 * Auth flow (confirmed via browser network capture):
 *   1. GET  sso.garmin.com/sso/signin   -> CSRF token + SESSION cookies
 *   2. POST sso.garmin.com/sso/signin   -> 200 "Success" page with `response_url`
 *                                           containing `?ticket=ST-...`
 *   3. GET  connect.garmin.com/modern/?ticket=ST-...
 *                                       -> 302 + SESSIONID cookie
 *   4. Follow until SESSIONID obtained
 *
 * Note: new portal (sso.garmin.com/portal/api/login) is Cloudflare-protected
 * in Node.js. The legacy sso/signin endpoint is NOT Cloudflare-protected and
 * works for all account types including Google-OAuth accounts.
 *
 * Storage: platform_connections table
 *   access_token_encrypted  = encrypted SESSIONID
 *   refresh_token_encrypted = encrypted JSON { email, password }
 *   expires_at              = session expiry (~23h from login)
 */

import { createLogger } from './logger.js';
import { encryptToken, decryptToken } from './encryption.js';
import { getSupabase } from './observationUtils.js';

const log = createLogger('GarminDirect');

const SSO_SIGNIN = 'https://sso.garmin.com/sso/signin';
const CONNECT_BASE = 'https://connect.garmin.com';
const API_BASE = `${CONNECT_BASE}/modern/proxy`;
const SERVICE_URL = `${CONNECT_BASE}/modern/`;

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ── Helpers ────────────────────────────────────────────────────────────────

function getSetCookies(headers) {
  const cookies = [];
  headers.forEach((v, k) => {
    if (k.toLowerCase() === 'set-cookie') cookies.push(v.split(';')[0]);
  });
  return cookies;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Authentication ─────────────────────────────────────────────────────────

/**
 * Authenticate via Garmin's legacy SSO and return the SESSIONID value.
 *
 * The flow returns a 200 "Success" page (not a 302) on the POST step.
 * The ticket URL lives in the JS variable `response_url` in that page.
 */
async function authenticate(email, password) {
  // Step 1: GET signin page to obtain CSRF token + session cookies
  log.info('Garmin auth: fetching signin page');
  const r1 = await fetch(`${SSO_SIGNIN}?service=${encodeURIComponent(SERVICE_URL)}&clientId=GarminConnect`, {
    headers: { 'User-Agent': DEFAULT_UA, Accept: 'text/html,application/xhtml+xml' },
  });

  if (!r1.ok) throw new Error(`Garmin signin page failed: HTTP ${r1.status}`);

  const initCookies = getSetCookies(r1.headers);
  const html1 = await r1.text();
  const csrf = html1.match(/name="_csrf"\s+value="([^"]+)"/)?.[1] || '';

  // Step 2: POST credentials (CSRF from step 1)
  log.info('Garmin auth: posting credentials');
  const r2 = await fetch(SSO_SIGNIN, {
    method: 'POST',
    headers: {
      'User-Agent': DEFAULT_UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: initCookies.join('; '),
      Origin: 'https://sso.garmin.com',
      Referer: SSO_SIGNIN,
    },
    body: new URLSearchParams({
      username: email,
      password,
      _csrf: csrf,
      embed: 'false',
      service: SERVICE_URL,
    }).toString(),
    redirect: 'manual',
  });

  const body2 = await r2.text();

  // On success: 200 with <title>Success</title> and JS var `response_url`
  // On error:  200 with error text or 429 rate-limit
  if (r2.status === 429) {
    throw new Error('Garmin: too many login attempts — wait a few minutes and try again');
  }

  // Extract the ticket URL from the JS variable in the success page
  const responseUrlMatch = body2.match(/var\s+response_url\s*=\s*"([^"]+)"/);
  if (!responseUrlMatch) {
    // Look for an inline error message
    const errMatch = body2.match(/class="[^"]*error[^"]*"[^>]*>\s*([^<]+)/i)
      || body2.match(/<p[^>]*class="[^"]*alert[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const errMsg = errMatch
      ? errMatch[1].replace(/<[^>]+>/g, '').trim().substring(0, 120)
      : 'Credentials rejected or account requires Garmin-native password';
    throw new Error(`Garmin auth failed: ${errMsg}`);
  }

  // Unescape the \/ sequences Garmin puts in the JS string
  const ticketUrl = responseUrlMatch[1].replace(/\\\//g, '/');
  log.info('Garmin auth: ticket obtained, exchanging');

  // Step 3: Exchange ticket for SESSIONID — follow redirects, collect cookies
  let currentUrl = ticketUrl;
  let connectCookies = [];
  let sessionId = null;

  for (let hop = 0; hop < 8; hop++) {
    const r = await fetch(currentUrl, {
      headers: { 'User-Agent': DEFAULT_UA, Cookie: connectCookies.join('; ') },
      redirect: 'manual',
    });

    const newCookies = getSetCookies(r.headers);
    connectCookies.push(...newCookies);

    const sid = newCookies.find(c => c.startsWith('SESSIONID='));
    if (sid) {
      sessionId = sid.replace('SESSIONID=', '');
      break;
    }

    if ((r.status === 301 || r.status === 302) && r.headers.get('location')) {
      let loc = r.headers.get('location');
      if (loc.startsWith('/')) loc = CONNECT_BASE + loc;
      currentUrl = loc;
    } else {
      break;
    }
  }

  if (!sessionId) {
    throw new Error('Garmin: no SESSIONID cookie after ticket exchange');
  }

  log.info('Garmin auth: session established');
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
      'x-app-ver': '4.69.2.0',
    },
  });

  if (r.status === 401 || r.status === 403) {
    throw new Error(`Garmin session expired (${r.status}) for ${path}`);
  }
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

async function getOrRefreshSession(userId, { forceRefresh = false } = {}) {
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
  const isExpired = !expiresAt || expiresAt <= new Date(Date.now() + 10 * 60 * 1000);

  if (!forceRefresh && !isExpired && conn.access_token_encrypted) {
    return decryptToken(conn.access_token_encrypted);
  }

  // Re-authenticate using stored credentials
  log.info('Garmin: refreshing session', { userId, forceRefresh });
  const credsJson = decryptToken(conn.refresh_token_encrypted);
  const creds = JSON.parse(credsJson);

  const newSessionId = await authenticate(creds.email, creds.password);

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

/** Run an API call with automatic session refresh on 401/403. */
async function garminGetWithRetry(path, userId) {
  const sessionId = await getOrRefreshSession(userId);
  try {
    return await garminGet(path, sessionId);
  } catch (err) {
    if (err.message.includes('session expired')) {
      // One retry with a fresh session
      const freshSession = await getOrRefreshSession(userId, { forceRefresh: true });
      return garminGet(path, freshSession);
    }
    throw err;
  }
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

    const data = await garminGetWithRetry(
      `usersummary-service/usersummary/daily/${encodeURIComponent(displayName)}?calendarDate=${date}`,
      userId
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

    const data = await garminGetWithRetry(
      `wellness-service/wellness/dailySleepData/${encodeURIComponent(displayName)}?date=${date}`,
      userId
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
    const data = await garminGetWithRetry(
      `activitylist-service/activities/search/activities?start=0&limit=${limit}`,
      userId
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
